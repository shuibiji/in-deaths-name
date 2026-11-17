/** 会话首次加载、语言切换、版本更新和压缩到期时，将所选规则全文加入模型上下文。 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { changeRuleSetting, describeRuleSettings, getErrorMessage, readRuleContent, readRuleSettings } from './rule-content.ts';
import { pluginVersion, resolveClient, settingsFile } from './settings-store.ts';

interface HookInput {
  hook_event_name?: unknown;
  session_id?: unknown;
  source?: unknown;
  prompt?: unknown;
}
interface SessionState {
  compactions: number;
  language?: unknown;
  version?: unknown;
}

/** 只识别完整的设置命令，不把一般对话当作修改配置的请求。 */
function settingsArgument(prompt: string): string | undefined | false {
  const match = /^(?:\/in-deaths-name:settings|\$settings)(?:\s+([^\s]+))?\s*$/.exec(prompt);
  return match ? match[1] : false;
}

function main(): void {
  const input = JSON.parse(readFileSync(0, 'utf8')) as HookInput;
  const event = input.hook_event_name;
  if (event !== 'SessionStart' && event !== 'UserPromptSubmit' && event !== 'PostToolUse') return;
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--client')) {
    throw new Error('Expected --client claude or --client codex.');
  }
  const client = resolveClient(args[1]);
  const errors: string[] = [];
  const reportError = (message: string): void => { errors.push(message); };
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  const setting = event === 'UserPromptSubmit' ? settingsArgument(prompt) : false;
  let settingHandled = false;
  let languageSelected = false;
  if (setting !== false) {
    settingHandled = true;
    try {
      if (setting !== undefined) changeRuleSetting(client, setting);
      languageSelected = setting === 'en' || setting === 'zh';
    } catch (error) {
      reportError(`Settings failed: ${getErrorMessage(error)}`);
    }
  }
  const settings = readRuleSettings(reportError, client);
  const version = pluginVersion();
  const manualReload = event === 'UserPromptSubmit' && (
    prompt === '立即加载以死之名规则' || prompt === 'Load the in-deaths-name rules now'
    || /^(?:\/in-deaths-name:reload-rules|\$reload-rules)(?:\s|$)/.test(prompt)
  );
  const compacted = event === 'SessionStart' && input.source === 'compact';
  const cleared = event === 'SessionStart' && input.source === 'clear';
  const dataRoot = process.env.CLAUDE_PLUGIN_DATA || process.env.PLUGIN_DATA
    || join(dirname(settingsFile(client)), 'data');
  let path: string | undefined;
  let previous: SessionState | undefined;
  try {
    if (typeof input.session_id !== 'string' || !input.session_id) throw new Error('Missing or invalid session_id.');
    path = join(dataRoot, 'sessions', `${encodeURIComponent(input.session_id)}.json`);
    try {
      previous = JSON.parse(readFileSync(path, 'utf8')) as SessionState;
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    }
    if (previous && (!Number.isSafeInteger(previous.compactions) || previous.compactions < 0)) {
      throw new Error(`Invalid compaction count in ${path}.`);
    }
  } catch (error) {
    previous = undefined;
    reportError(`Could not read session state; loading rules now. Reason: ${getErrorMessage(error)}`);
  }
  const compactions = (previous?.compactions ?? 0) + (compacted ? 1 : 0);
  const due = !previous || previous.language !== settings.language || previous.version !== version
    || cleared || manualReload || languageSelected
    || (compacted && settings.compactInterval > 0 && compactions >= settings.compactInterval);
  const context: string[] = [];
  if (settingHandled) {
    context.push(`[in-deaths-name:settings handled]\n${describeRuleSettings(settings)}\nSettings file: ${settingsFile(client)}\nThe Hook has handled this settings command. Report this result without running the settings script again.`);
  }
  let complete = false;
  if (due) {
    const result = readRuleContent(settings.language, reportError);
    complete = result.complete;
    if (result.content) context.push(result.content);
  }
  if (path && (complete || (!due && compacted))) {
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify({ compactions: complete ? 0 : compactions, language: settings.language, version }), 'utf8');
    } catch (error) {
      reportError(`Could not save session state: ${getErrorMessage(error)}`);
    }
  }
  const output: {
    hookSpecificOutput?: { hookEventName: string; additionalContext: string };
    systemMessage?: string;
  } = {};
  if (context.length) output.hookSpecificOutput = { hookEventName: event, additionalContext: context.join('\n\n') };
  if (errors.length) output.systemMessage = errors.join('\n');
  if (Object.keys(output).length) process.stdout.write(`${JSON.stringify(output)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`in-deaths-name: ${getErrorMessage(error)}\n`);
  process.exitCode = 1;
}
