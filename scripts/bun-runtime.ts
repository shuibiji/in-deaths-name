/** 原生扩展沿用宿主加载方式；启动时为插件脚本准备 Bun。 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function ensureBun(): Promise<void> {
  const windows = process.platform === 'win32';
  const script = fileURLToPath(new URL(windows ? './setup-bun.ps1' : './setup-bun.sh', import.meta.url));
  const args = windows
    ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '--run', '--version']
    : [script, '--run', '--version'];
  return new Promise((resolve, reject) => {
    // 只准备运行时，不占用用户输入，也不触发模型调用。
    const child = spawn(windows ? 'powershell.exe' : 'bash', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let errors = '';
    child.stderr.on('data', chunk => { errors += String(chunk); });
    child.once('error', reject);
    child.once('close', code => {
      if (code === 0) resolve();
      else reject(new Error(errors.trim() || `Bun setup exited with code ${code}.`));
    });
  });
}
