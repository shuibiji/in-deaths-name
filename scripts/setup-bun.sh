#!/usr/bin/env bash
# 安装及更新共用入口：复用达标的 Bun，否则安装官方最新稳定版。
set -euo pipefail

supports_bun() {
  local version
  version=$("$1" --version 2>/dev/null) || return 1
  [[ "$version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)(\+.*)?$ ]] || return 1
  (( BASH_REMATCH[1] > 1 || (BASH_REMATCH[1] == 1 && BASH_REMATCH[2] >= 1) ))
}

bun_path=''
for candidate in "$(command -v bun || true)" "${BUN_INSTALL:-$HOME/.bun}/bin/bun" "$HOME/.bun/bin/bun"; do
  if [[ -n "$candidate" && -x "$candidate" ]] && supports_bun "$candidate"; then
    bun_path="$candidate"
    break
  fi
done

if [[ -z "$bun_path" ]]; then
  printf '%s\n' 'Bun >= 1.1.0 is required. Installing the latest stable release...' >&2
  installer_dir=$(mktemp -d)
  trap 'rm -rf "$installer_dir"' EXIT
  curl -fsSL https://bun.com/install -o "$installer_dir/install.sh"
  # 安装日志走 stderr，保留 Hook 的 stdin 和 JSON stdout。
  BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}" bash "$installer_dir/install.sh" </dev/null >&2
  bun_path="${BUN_INSTALL:-$HOME/.bun}/bin/bun"
  supports_bun "$bun_path" || { printf '%s\n' 'Bun installation failed: version 1.1.0 or later is required.' >&2; exit 1; }
  rm -rf "$installer_dir"
  trap - EXIT
fi

if [[ "${1:-}" == '--run' ]]; then
  shift
  exec "$bun_path" "$@"
fi

printf 'Using Bun %s (%s)\n' "$("$bun_path" --version)" "$bun_path" >&2
if (( $# )); then
  # 远程安装前即可选定语言；已有的压缩间隔和其他字段保持原样。
  "$bun_path" -e '
const fs = require("node:fs"), path = require("node:path");
const [client, language, ...extra] = process.argv.slice(1);
if (extra.length || !["claude", "codex", "pi", "omp", "dsh"].includes(client) || !["en", "zh"].includes(language)) throw new Error("Provide a client (claude, codex, pi, omp, dsh) and a language (en, zh).");
const file = path.join(require("node:os").homedir(), ".config", "in-deaths-name", client, "config.json");
const settings = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("Settings must contain a JSON object.");
fs.mkdirSync(path.dirname(file), {recursive: true});
fs.writeFileSync(file, JSON.stringify({compactInterval: 3, ...settings, language}, null, 2) + "\n");
console.log("Settings file: " + file);
' "$@"
fi
