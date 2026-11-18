/** DeepSeek Harness 原生插件。命令和上下文写入都在宿主内完成，不发起模型请求。 */
import { randomUUID } from 'node:crypto';
import { changeRuleSetting, describeRuleSettings, getErrorMessage, readRuleContent, readRuleSettings } from '../scripts/rule-content.ts';
import { pluginVersion } from '../scripts/settings-store.ts';

export const name = 'in-deaths-name';
export const inject = ['agents', 'commands'];

interface Source { kind: string; language: string; version: string; complete: boolean }
interface Event { type: string; data: { source?: Source; error?: string } }
interface Session {
  seq: number;
  inheritedEventCount: number;
  eventAt(seq: number): Event | undefined;
  append(type: 'user/message', data: { id: string; role: 'user'; source: Source; content: { type: 'text'; text: string }[] }, options: { surfaceOp: 'append' }): unknown;
}
interface Agent { session: Session }
interface Context {
  logger: { warn(message: string): void };
  on(event: 'session/event', fn: (session: Session, event: Event) => void): void;
  on(event: 'agent/created', fn: (input: { agent: Agent }) => void): void;
  on<T>(event: 'agent/pre-step', fn: (input: { agent: Agent }, next: () => Promise<T>) => Promise<T>): void;
  commands: { register(command: {
    definitionId: string; name: string; description: string; input?: { hint: string };
    handler(input: { agent: Agent; rawInput: string }): { kind: 'error' | 'success'; text: string };
  }): unknown };
}
interface State { cursor: number; compactions: number; loaded?: Source }

export function apply(ctx: Context): void {
  const version = pluginVersion();
  const states = new WeakMap<Session, State>();

  function sync(session: Session, force = false, report = (message: string) => ctx.logger.warn(message)): boolean {
    const state: State = states.get(session) ?? { cursor: session.inheritedEventCount, compactions: 0 };
    states.set(session, state);
    let compacted = false;
    // 重开会话时从已提交的记录恢复；之后只处理新增事件，分支从自己的记录开始。
    while (state.cursor < session.seq) {
      const event = session.eventAt(state.cursor++);
      if (event?.type === 'compaction/end' && event.data.error === undefined) {
        state.compactions++;
        compacted = true;
      } else if (event?.type === 'user/message' && event.data.source?.kind === name) {
        state.loaded = event.data.source;
        if (state.loaded.complete) { state.compactions = 0; compacted = false; }
      }
    }
    const { language, compactInterval } = readRuleSettings(report, 'dsh');
    if (!force && state.loaded?.complete && state.loaded.language === language && state.loaded.version === version
      && !(compacted && compactInterval > 0 && state.compactions >= compactInterval)) return true;
    const { content, complete } = readRuleContent(language, report);
    if (content) {
      const source = { kind: name, language, version, complete };
      // 写入模型实际读取的会话历史，不走仅供界面显示的命令结果，也不启动新回合。
      session.append('user/message', { id: randomUUID(), role: 'user', source, content: [{ type: 'text', text: content }] }, { surfaceOp: 'append' });
    }
    return complete;
  }

  ctx.on('agent/created', ({ agent }) => { sync(agent.session); });
  ctx.on('session/event', (session, event) => {
    if (event.type === 'compaction/end' && event.data.error === undefined && states.has(session)) {
      // 宿主发布事件期间禁止重入写入；等当前提交结束后再追加规则，不唤醒模型。
      queueMicrotask(() => { try { sync(session); } catch (error) { ctx.logger.warn(getErrorMessage(error)); } });
    }
  });
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    const decision = await next();
    sync(agent.session);
    return decision;
  });

  for (const action of ['reload', 'settings'] as const) {
    const command = `${name}-${action}`;
    ctx.commands.register({
      definitionId: `${name}/${action}`, name: command,
      description: action === 'reload' ? 'Load both rule files now' : 'View or change the rule language and compaction interval',
      ...(action === 'settings' ? { input: { hint: '[en | zh | 0 | positive integer]' } } : {}),
      handler({ agent, rawInput }) {
        const errors: string[] = [];
        const report = (message: string) => { errors.push(message); };
        const value = rawInput.trim();
        try {
          if (action === 'reload' && value) throw new Error('Reload takes no arguments.');
          if (action === 'settings' && value) changeRuleSetting('dsh', value);
          if (action === 'reload' || value === 'en' || value === 'zh') sync(agent.session, true, report);
          const settings = readRuleSettings(report, 'dsh');
          if (!errors.length) return { kind: 'success', text: action === 'settings' ? describeRuleSettings(settings)
            : settings.language === 'zh' ? '已加载两份中文规则全文。' : 'Both English rule files are loaded.' };
        } catch (error) { report(getErrorMessage(error)); }
        return { kind: 'error', text: errors.join('\n') };
      },
    });
  }
}
