/** Pi 与 oh-my-pi 共用的规则加载逻辑。 */
import { changeRuleSetting, describeRuleSettings, getErrorMessage, readRuleContent, readRuleSettings, type RuleLanguage } from '../scripts/rule-content.ts';
import { pluginVersion, type RuleClient } from '../scripts/settings-store.ts';
import { ensureBun } from '../scripts/bun-runtime.ts';

interface RuleMessage {
  customType: string;
  content: string;
  display: false;
}

interface SessionEntry {
  type: string;
  customType?: string;
  data?: unknown;
}

interface RuleContext {
  sessionManager: {
    getBranch(): SessionEntry[];
  };
  ui: {
    notify(message: string, level: 'info' | 'warning' | 'error'): void;
  };
}

type EventHandler = (
  event: unknown,
  context: RuleContext,
) => void | { message: RuleMessage } | Promise<void | { message: RuleMessage }>;

/** 只使用两个客户端共有的扩展接口，无需安装客户端 SDK。 */
export interface RuleExtensionAPI {
  on(event: 'session_start' | 'session_compact' | 'before_agent_start' | 'session_clear', handler: EventHandler): void;
  sendMessage(message: RuleMessage, options: { deliverAs: 'steer' }): void;
  appendEntry(customType: string, data: { compactions: number; language: RuleLanguage; version: string }): void;
  registerCommand(name: string, options: {
    description: string;
    handler(args: string, context: RuleContext): void | Promise<void>;
  }): void;
}

const STATE_TYPE = 'in-deaths-name-state';

/** 只读取当前分支的记录，切换会话或分支时不会串用计数。 */
function readCompactions(context: RuleContext, language: RuleLanguage, version: string): number | undefined {
  const entries = context.sessionManager.getBranch();
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.type !== 'custom' || entry.customType !== STATE_TYPE) {
      continue;
    }
    const state = entry.data as { compactions?: unknown; language?: unknown; version?: unknown } | null;
    const compactions = state?.compactions;
    if (typeof compactions === 'number' && Number.isSafeInteger(compactions) && compactions >= 0) {
      return state?.language === language && state.version === version ? compactions : undefined;
    }
    context.ui.notify('Invalid compaction count in the session; reloading rules now.', 'error');
    return undefined;
  }
  return undefined;
}

/** 把所选语言的完整原文包装为客户端的上下文消息。 */
function readRules(context: RuleContext, language: RuleLanguage): { message: RuleMessage; complete: boolean } | undefined {
  const result = readRuleContent(language, message => context.ui.notify(message, 'error'));
  if (!result.content) {
    return undefined;
  }
  return {
    message: {
      customType: 'in-deaths-name-rules',
      content: result.content,
      display: false,
    },
    complete: result.complete,
  };
}

/** 注册自动加载、即时语言切换及独立保存的设置。 */
export function registerRules(api: RuleExtensionAPI, client: Extract<RuleClient, 'pi' | 'omp'> = 'pi'): void {
  const getSettings = (context: RuleContext) => readRuleSettings(message => context.ui.notify(message, 'error'), client);

  function loadRules(context: RuleContext, language: RuleLanguage, version: string): boolean {
    const result = readRules(context, language);
    if (!result) return false;
    // 空闲时写入会话；运行中排入下一次模型请求，不额外发起模型调用。
    api.sendMessage(result.message, { deliverAs: 'steer' });
    if (result.complete) api.appendEntry(STATE_TYPE, { compactions: 0, language, version });
    return result.complete;
  }

  api.on('session_start', async (_event, context) => {
    try {
      await ensureBun();
    } catch (error) {
      context.ui.notify(`Bun setup failed: ${getErrorMessage(error)}`, 'error');
      return;
    }
    const { language } = getSettings(context);
    const version = pluginVersion();
    if (readCompactions(context, language, version) === undefined) loadRules(context, language, version);
  });

  api.on('session_compact', (_event, context) => {
    const { language, compactInterval } = getSettings(context);
    const version = pluginVersion();
    const previous = readCompactions(context, language, version);
    if (previous === undefined) {
      loadRules(context, language, version);
      return;
    }
    const compactions = previous + 1;
    if (compactInterval > 0 && compactions >= compactInterval) {
      loadRules(context, language, version);
    } else {
      api.appendEntry(STATE_TYPE, { compactions, language, version });
    }
  });

  api.on('before_agent_start', (_event, context) => {
    // 延迟加载、外部设置变更或新版本激活后，在请求前补上规则全文。
    const { language } = getSettings(context);
    const version = pluginVersion();
    if (readCompactions(context, language, version) !== undefined) return;
    const result = readRules(context, language);
    if (result) {
      if (result.complete) api.appendEntry(STATE_TYPE, { compactions: 0, language, version });
      return { message: result.message };
    }
  });

  if (client === 'omp') {
    api.on('session_clear', (_event, context) => {
      loadRules(context, getSettings(context).language, pluginVersion());
    });
  }

  api.registerCommand('in-deaths-name-reload', {
    description: 'Reload both rule files / 立即加载以死之名的两份规则原文',
    handler(_args, context) {
      const { language } = getSettings(context);
      if (loadRules(context, language, pluginVersion())) {
        context.ui.notify(language === 'zh'
          ? '已加载两份规则原文，下次模型请求会带上这些内容。'
          : 'Both rule files are loaded and will be included in the next model request.', 'info');
      }
    },
  });

  api.registerCommand('in-deaths-name-settings', {
    description: 'Rule settings: en, zh, or a reload interval / 规则设置：语言或重载次数',
    handler(args, context) {
      const value = args.trim();
      try {
        if (value) changeRuleSetting(client, value);
        const settings = getSettings(context);
        context.ui.notify(describeRuleSettings(settings), 'info');
        if (value === 'en' || value === 'zh') {
          if (loadRules(context, settings.language, pluginVersion())) {
            context.ui.notify(settings.language === 'zh'
              ? '所选语言的两份规则原文已加入当前会话。'
              : 'Both rule files in the selected language have been added to this session.', 'info');
          }
        }
      } catch (error) {
        context.ui.notify(`Settings failed: ${getErrorMessage(error)}`, 'error');
      }
    },
  });
}

export default function inDeathsName(api: RuleExtensionAPI): void {
  registerRules(api, 'pi');
}
