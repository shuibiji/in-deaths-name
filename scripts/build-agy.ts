/** 生成可直接由 agy 安装的独立目录；运行时规则不放入 agy 自动发现的 rules/。 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const bundle = new URL('agy/', root);
const runtime = new URL('runtime/', bundle);
const { name, version, description } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
mkdirSync(new URL('scripts/', runtime), { recursive: true });
execFileSync(process.execPath, ['build', './extensions/antigravity.ts', '--target=bun', '--format=esm', '--outfile=agy/runtime/lib/hook.mjs'], { cwd: fileURLToPath(root), stdio: 'inherit' });
cpSync(new URL('rules/', root), new URL('rules/', runtime), { recursive: true });
for (const file of ['config.json', 'scripts/run-bun.cmd', 'scripts/setup-bun.sh', 'scripts/setup-bun.ps1']) {
  copyFileSync(new URL(file, root), new URL(file, runtime));
}
copyFileSync(new URL('LICENSE', root), new URL('LICENSE', bundle));
writeFileSync(new URL('package.json', runtime), JSON.stringify({ name, version }, null, 2) + '\n');
writeFileSync(new URL('plugin.json', bundle), JSON.stringify({ name, version, description }, null, 2) + '\n');
