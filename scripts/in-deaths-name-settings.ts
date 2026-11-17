/**
 * @fileoverview 查看或修改当前插件的规则加载间隔。
 */
import { readFileSync, writeFileSync } from 'node:fs';

interface Settings {
  compactInterval?: unknown;
  [key: string]: unknown;
}

const CONFIG_FILE = new URL('../config.json', import.meta.url);

/**
 * 确认压缩次数为 0 或正整数。
 * @param value 待设置或已保存的值。
 * @returns 有效的压缩次数。
 */
function readInterval(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('次数请填写 0 或正整数，null 无效。');
  }
  return value;
}

/** 读取配置内容，修改时保留其他已有字段。 */
function readSettings(): Settings {
  const settings: unknown = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
    throw new Error('config.json 的内容需要是一个 JSON 对象。');
  }
  return settings as Settings;
}

/** 无参数时查看当前值，有参数时保存用户指定的值。 */
function main(): void {
  const args = process.argv.slice(2);
  if (args.length > 1) {
    throw new Error('请只填写一个次数，例如：3。');
  }

  const settings = readSettings();
  if (args.length === 0) {
    const interval = readInterval(settings.compactInterval);
    console.log(interval === 0
      ? '当前已关闭压缩后的自动重载，首次会话仍会加载规则。'
      : `当前设置：每 ${interval} 次上下文压缩重新加载规则。`);
    return;
  }

  const interval = readInterval(Number(args[0]));
  settings.compactInterval = interval;
  writeFileSync(CONFIG_FILE, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  console.log(interval === 0
    ? '已关闭压缩后的自动重载，首次会话仍会加载规则。'
    : `已设置为每 ${interval} 次上下文压缩重新加载规则。`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`设置失败：${message}\n`);
  process.exitCode = 1;
}
