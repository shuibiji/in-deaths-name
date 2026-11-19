/** 用户设置独立于安装缓存保存，升级时保留；各客户端分别使用一份配置。 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type RuleClient = 'claude' | 'codex' | 'pi' | 'omp' | 'dsh' | 'agy';
export interface StoredSettings {
  language?: unknown;
  compactInterval?: unknown;
  [key: string]: unknown;
}

const PLUGIN_ROOT = fileURLToPath(new URL('../', import.meta.url));

/** Hook 和原生扩展显式传入客户端；直接调用脚本时兼容已有 Claude/Codex 环境。 */
export function resolveClient(value?: string): RuleClient {
  const client = value ?? (process.env.CODEX_THREAD_ID || process.env.PLUGIN_DATA ? 'codex' : 'claude');
  if (client !== 'claude' && client !== 'codex' && client !== 'pi' && client !== 'omp' && client !== 'dsh' && client !== 'agy') {
    throw new Error('Client must be claude, codex, pi, omp, dsh, or agy.');
  }
  return client;
}

export function settingsFile(client: RuleClient): string {
  return join(homedir(), '.config', 'in-deaths-name', client, 'config.json');
}

export function pluginVersion(): string {
  const manifest = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8')) as { version?: unknown };
  if (typeof manifest.version !== 'string' || !manifest.version) {
    throw new Error('Missing plugin version in package.json.');
  }
  return manifest.version;
}

function readObject(path: string): StoredSettings {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Settings must contain a JSON object: ${path}`);
  }
  return value as StoredSettings;
}

/** 只读取本插件保留下来的旧版本配置，不扫描其他插件或认证目录。 */
function legacySettingsFile(): string {
  const current = basename(PLUGIN_ROOT);
  const parent = dirname(PLUGIN_ROOT);
  if (basename(parent) === 'in-deaths-name' && /^\d+\.\d+\.\d+$/.test(current)) {
    const compare = (left: string, right: string): number => {
      const a = left.split('.').map(Number);
      const b = right.split('.').map(Number);
      return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    };
    const previous = readdirSync(parent, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && /^\d+\.\d+\.\d+$/.test(entry.name))
      .map(entry => entry.name)
      .filter(version => compare(version, current) < 0)
      .sort((a, b) => compare(b, a));
    for (const version of previous) {
      const path = join(parent, version, 'config.json');
      if (existsSync(path)) return path;
    }
  }
  return join(PLUGIN_ROOT, 'config.json');
}

export function saveStoredSettings(client: RuleClient, settings: StoredSettings): void {
  const path = settingsFile(client);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
}

/** 首次使用导入旧设置；已有独立配置时，安装包中的默认值不覆盖用户选择。 */
export function readStoredSettings(client: RuleClient): StoredSettings {
  const path = settingsFile(client);
  if (existsSync(path)) return readObject(path);
  const settings = readObject(legacySettingsFile());
  saveStoredSettings(client, settings);
  return settings;
}
