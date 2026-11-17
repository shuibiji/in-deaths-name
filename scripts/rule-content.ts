/** 读取规则语言、压缩间隔及对应的完整原文，供各客户端共用。 */
import { readFileSync } from 'node:fs';
import { readStoredSettings, resolveClient, saveStoredSettings, type RuleClient } from './settings-store.ts';

export type RuleLanguage = 'en' | 'zh';

export interface RuleSettings {
  language: RuleLanguage;
  compactInterval: number;
}

const RULE_FILES = ['in-deaths-name.md', 'in-deaths-name-answer.md'] as const;
const DEFAULT_COMPACT_INTERVAL = 3;

/** 语言未填写或为空时使用英文；其他值必须明确为 en 或 zh。 */
export function readLanguage(value: unknown): RuleLanguage {
  if (value === undefined || value === null || value === '') {
    return 'en';
  }
  if (value !== 'en' && value !== 'zh') {
    throw new Error('language must be "en" or "zh".');
  }
  return value;
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 无效配置报告具体错误，并为出错的配置项使用默认值。 */
export function readRuleSettings(reportError: (message: string) => void, client: RuleClient = resolveClient()): RuleSettings {
  const settings: RuleSettings = { language: 'en', compactInterval: DEFAULT_COMPACT_INTERVAL };
  let config: { language?: unknown; compactInterval?: unknown };
  try {
    config = readStoredSettings(client);
  } catch (error) {
    reportError(`Could not read settings; using English and a compaction interval of ${DEFAULT_COMPACT_INTERVAL}. Reason: ${getErrorMessage(error)}`);
    return settings;
  }
  try {
    settings.language = readLanguage(config.language);
  } catch (error) {
    reportError(`Could not read the rule language; using English. Reason: ${getErrorMessage(error)}`);
  }
  const interval = config.compactInterval === undefined ? DEFAULT_COMPACT_INTERVAL : config.compactInterval;
  if (typeof interval === 'number' && Number.isSafeInteger(interval) && interval >= 0) {
    settings.compactInterval = interval;
  } else {
    reportError(`compactInterval must be 0 or a positive integer; null is invalid. Using ${DEFAULT_COMPACT_INTERVAL}.`);
  }
  return settings;
}

/** 保留文件原文及顺序；读取失败时保留已经读到的内容，不跨语言补齐。 */
export function readRuleContent(
  language: RuleLanguage,
  reportError: (message: string) => void,
): { content: string; complete: boolean } {
  const directory = `rules/${language}`;
  const sections: string[] = [];
  for (const name of RULE_FILES) {
    const path = `${directory}/${name}`;
    try {
      const text = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
      sections.push(`【${path}】\n${text}`);
    } catch (error) {
      reportError(`Could not read ${path}: ${getErrorMessage(error)}`);
    }
  }
  const reminder = language === 'zh'
    ? '下面是用户定下的两份规则，请记住并遵守。回答时不用重复规则原文。\n\n'
    : 'The following two sets of rules were set by the user. Remember and follow them. Do not repeat the rules in your answers.\n\n';
  return {
    content: sections.length > 0 ? reminder + sections.join('\n\n') : '',
    complete: sections.length === RULE_FILES.length,
  };
}

/** 仅保存用户明确提供的一个设置值，保留另一项及其他已有字段。 */
export function changeRuleSetting(client: RuleClient, value: string): void {
  const settings = readStoredSettings(client);
  if (value === 'en' || value === 'zh') {
    settings.language = value;
  } else {
    const interval = value.trim() === '' ? NaN : Number(value);
    if (!Number.isSafeInteger(interval) || interval < 0) {
      throw new Error('Provide en, zh, 0, or a positive integer; null is invalid.');
    }
    settings.compactInterval = interval;
  }
  saveStoredSettings(client, settings);
}

/** 同时显示语言与阈值，避免将重载阈值误认为模型的压缩频率。 */
export function describeRuleSettings(settings: RuleSettings): string {
  if (settings.language === 'zh') {
    const interval = settings.compactInterval === 0
      ? '已关闭压缩后的自动重载，首次加载和手动加载保留。'
      : `每 ${settings.compactInterval} 次上下文压缩重新加载规则。`;
    return `当前规则语言：中文（zh）。${interval}`;
  }
  const interval = settings.compactInterval === 0
    ? 'Automatic reloading after compaction is disabled; initial and manual loading remain enabled.'
    : `Reload rules every ${settings.compactInterval} context compactions.`;
  return `Rule language: English (en). ${interval}`;
}
