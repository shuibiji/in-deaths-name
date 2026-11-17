/**
 * @fileoverview 首次启动时读取规则，之后按设置的压缩次数重新读取，并将全文加入模型上下文。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

interface HookInput {
  hook_event_name?: unknown;
  session_id?: unknown;
  source?: unknown;
}

interface InjectionSchedule {
  filePath: string;
  compactions: number;
  shouldInject: boolean;
}

interface HookOutput {
  hookSpecificOutput?: {
    hookEventName: 'SessionStart';
    additionalContext: string;
  };
  systemMessage?: string;
}

const DEFAULT_COMPACT_INTERVAL = 3;
const RULE_FILES = ['in-deaths-name.md', 'in-deaths-name-answer.md'] as const;
const CONTEXT_REMINDER = '下面是用户定下的两份规则，请记住并遵守。回答时不用重复规则原文。\n\n';

/**
 * 取出错误原因，供提示信息使用。
 * @param error 捕获的异常。
 * @returns 错误信息。
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 读取设置中的压缩次数间隔。 */
function readCompactInterval(): number {
  const config = JSON.parse(
    readFileSync(new URL('../config.json', import.meta.url), 'utf8'),
  ) as { compactInterval?: unknown } | null;
  const interval = config?.compactInterval;

  if (typeof interval !== 'number' || !Number.isSafeInteger(interval) || interval < 0) {
    throw new Error('compactInterval 请填写 0 或正整数，null 无效');
  }
  return interval;
}

/**
 * 根据会话记录和本次通知，判断是否需要重新加载规则。
 * @param sessionId 本次会话的 ID。
 * @param source 本次通知的来源，如启动、恢复或压缩。
 * @param interval 每隔多少次压缩加载规则。
 * @returns 本次是否加载，以及对应的压缩次数和记录路径。
 */
function createInjectionSchedule(
  sessionId: unknown,
  source: unknown,
  interval: number,
): InjectionSchedule {
  const dataRoot = process.env.CLAUDE_PLUGIN_DATA || process.env.PLUGIN_DATA;
  if (!dataRoot) {
    throw new Error('缺少插件数据目录（CLAUDE_PLUGIN_DATA 或 PLUGIN_DATA）');
  }
  if (typeof sessionId !== 'string' || !sessionId) {
    throw new Error('缺少有效的会话 ID（session_id）');
  }

  const filePath = join(dataRoot, 'sessions', `${encodeURIComponent(sessionId)}.json`);
  let first = true;
  let compactions: unknown = 0;
  try {
    const state = JSON.parse(readFileSync(filePath, 'utf8')) as { compactions?: unknown };
    compactions = state.compactions;
    first = false;
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
      throw error;
    }
  }
  if (typeof compactions !== 'number' || !Number.isSafeInteger(compactions) || compactions < 0) {
    throw new Error(`压缩次数记录有误：${filePath}`);
  }

  if (source === 'compact') {
    compactions += 1;
  }
  return {
    filePath,
    compactions,
    shouldInject:
      first ||
      source === 'clear' ||
      (interval > 0 && source === 'compact' && compactions >= interval),
  };
}

/** 处理会话启动或压缩后的通知，输出要加入模型上下文的规则。 */
function main(): void {
  const input = JSON.parse(readFileSync(0, 'utf8')) as HookInput;
  if (input.hook_event_name !== 'SessionStart') {
    return;
  }

  const errors: string[] = [];
  let interval = DEFAULT_COMPACT_INTERVAL;
  try {
    interval = readCompactInterval();
  } catch (error) {
    errors.push(`设置读取失败，本次按每压缩 ${DEFAULT_COMPACT_INTERVAL} 次加载规则。原因：${getErrorMessage(error)}`);
  }

  let schedule: InjectionSchedule | undefined;
  try {
    schedule = createInjectionSchedule(input.session_id, input.source, interval);
  } catch (error) {
    errors.push(`读取压缩次数失败，本次直接加载规则。原因：${getErrorMessage(error)}`);
  }

  const output: HookOutput = {};
  let loadedAll = false;
  if (!schedule || schedule.shouldInject) {
    const sections: string[] = [];
    for (const name of RULE_FILES) {
      try {
        const text = readFileSync(new URL(`../rules/${name}`, import.meta.url), 'utf8');
        sections.push(`【rules/${name}】\n${text}`);
      } catch (error) {
        errors.push(`读取 ${name} 时出错：${getErrorMessage(error)}`);
      }
    }
    loadedAll = sections.length === RULE_FILES.length;
    if (sections.length > 0) {
      output.hookSpecificOutput = {
        hookEventName: 'SessionStart',
        additionalContext: CONTEXT_REMINDER + sections.join('\n\n'),
      };
    }
  }

  if (schedule && (!schedule.shouldInject || loadedAll)) {
    try {
      const state = { compactions: loadedAll ? 0 : schedule.compactions };
      mkdirSync(dirname(schedule.filePath), { recursive: true });
      writeFileSync(schedule.filePath, JSON.stringify(state), 'utf8');
    } catch (error) {
      errors.push(`保存压缩次数时出错：${getErrorMessage(error)}`);
    }
  }
  if (errors.length > 0) {
    output.systemMessage = errors.join('\n');
  }
  if (Object.keys(output).length > 0) {
    process.stdout.write(`${JSON.stringify(output)}\n`);
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`in-deaths-name：${getErrorMessage(error)}\n`);
  process.exitCode = 1;
}
