/** agy 的 PreInvocation Hook：只按宿主已完成的检查点计数，不根据命令或模型回答猜测压缩。 */
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { changeRuleSetting, describeRuleSettings, getErrorMessage, readRuleContent, readRuleSettings } from '../scripts/rule-content.ts';
import { pluginVersion, settingsFile } from '../scripts/settings-store.ts';

interface State {
  through: number;
  compactions: number;
  userStep: number;
  handled?: number;
  version?: string;
  language?: string;
}
const fresh = (): State => ({ through: -1, compactions: 0, userStep: -1 });

/** JSONL 按字节从尾部读取，只解析上次处理位置之后的行，避免每次重读长会话。 */
function* latestSteps(path: string) {
  const fd = openSync(path, 'r');
  try {
    let end = fstatSync(fd).size;
    let tail = Buffer.alloc(0);
    while (end > 0) {
      const size = Math.min(end, 32768);
      end -= size;
      const block = Buffer.allocUnsafe(size);
      const count = readSync(fd, block, 0, size, end);
      const data = Buffer.concat([block.subarray(0, count), tail]);
      let right = data.length;
      while (right > 0) {
        const left = data.lastIndexOf(10, right - 1);
        if (left < 0 && end !== 0) break;
        const line = data.toString('utf8', left + 1, right).trim();
        right = left + 1;
        if (line) yield JSON.parse(line) as { step_index: number; type: string; status: string; source?: string };
        if (left < 0) break;
        right = left;
      }
      tail = data.subarray(0, right);
    }
  } finally { closeSync(fd); }
}

function main(): void {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  if (input.hookEventName !== 'PreInvocation') return;
  if (typeof input.conversationId !== 'string' || !input.conversationId || typeof input.transcriptPath !== 'string') throw new Error('Missing conversation ID or transcript path.');
  const path = join(dirname(settingsFile('agy')), 'sessions', `${encodeURIComponent(input.conversationId)}.json`);
  let state: State = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fresh();
  let frontier = state.through;
  let checkpoints = 0;
  let started = false;
  if (existsSync(input.transcriptPath)) {
    for (const step of latestSteps(input.transcriptPath)) {
      if (!Number.isSafeInteger(step.step_index)) throw new Error('Invalid transcript step index.');
      if (!started) {
        if (step.step_index < frontier) { state = fresh(); frontier = -1; }
        started = true;
        state.through = step.step_index;
      }
      if (step.step_index <= frontier) break;
      if (step.type === 'CHECKPOINT') {
        if (step.status === 'DONE') checkpoints++;
        else if (step.status !== 'ERROR' && step.status !== 'CANCELED' && step.status !== 'CANCELLED') {
          // 尚未结束的检查点留到下次调用；它之后的记录也在下次一并结算。
          state.through = step.step_index - 1;
          checkpoints = 0;
        }
      }
      if (step.type === 'USER_INPUT' && step.source === 'USER_EXPLICIT') state.userStep = Math.max(state.userStep, step.step_index);
    }
  }
  state.compactions += checkpoints;
  const prompt = typeof input.lastUserInput === 'string' ? input.lastUserInput.trim() : '';
  // 交互式补全会加上插件命名空间，print 模式也接受不带前缀的技能名。
  const match = /^\/(?:in-deaths-name:)?in-deaths-name-(reload|settings)(?:\s+([\s\S]+))?$/.exec(prompt);
  const manualText = prompt === '立即加载以死之名规则' || prompt === 'Load the in-deaths-name rules now';
  const context: string[] = [];
  const report = (error: string): void => { context.push(error); };
  let force = false;
  if ((match || manualText) && state.handled !== state.userStep) {
    state.handled = state.userStep;
    const value = match?.[2];
    try {
      if (match?.[1] === 'settings') {
        if (value !== undefined) changeRuleSetting('agy', value);
        context.push(describeRuleSettings(readRuleSettings(report, 'agy')));
        force = value === 'en' || value === 'zh';
      } else if (value) throw new Error('Reload takes no arguments.');
      else force = true;
    } catch (error) { report(getErrorMessage(error)); }
  }
  const settings = readRuleSettings(report, 'agy');
  const version = pluginVersion();
  if (force || state.language !== settings.language || state.version !== version ||
      (checkpoints > 0 && settings.compactInterval > 0 && state.compactions >= settings.compactInterval)) {
    const result = readRuleContent(settings.language, report);
    if (result.content) context.push(result.content);
    if (result.complete) {
      state.language = settings.language;
      state.version = version;
      state.compactions = 0;
    } else { delete state.version; }
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state), 'utf8');
  console.log(JSON.stringify(context.length ? { injectSteps: [{ userMessage: context.join('\n\n') }] } : {}));
}

try { main(); } catch (error) {
  console.error(`in-deaths-name: ${getErrorMessage(error)}`);
  process.exitCode = 1;
}
