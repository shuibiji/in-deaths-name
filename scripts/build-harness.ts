/** 维护者打包：复用项目版本、默认配置和规则原文，用户安装时不编译、不运行脚本。 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const bundle = new URL('harness/', root);
const { name, version, description, license, repository } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
mkdirSync(new URL('lib/', bundle), { recursive: true });
execFileSync(process.execPath, ['build', './extensions/deepseek-harness.ts', '--target=node', '--format=esm', '--outfile=harness/lib/index.mjs'], {
  cwd: fileURLToPath(root), stdio: 'inherit',
});
cpSync(new URL('rules/', root), new URL('rules/', bundle), { recursive: true });
for (const file of ['config.json', 'LICENSE']) copyFileSync(new URL(file, root), new URL(file, bundle));
writeFileSync(new URL('package.json', bundle), JSON.stringify({
  name, version, description, license, repository: { ...repository, directory: 'harness' },
  type: 'module', main: './lib/index.mjs', dsh: { bundle: { patch: './cordis.patch.yml' } },
}, null, 2) + '\n');
