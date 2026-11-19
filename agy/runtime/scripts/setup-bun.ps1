# 安装及更新共用入口：复用达标的 Bun，否则安装官方最新稳定版。
$ErrorActionPreference = 'Stop'
# 保留中英文规则的 UTF-8 字节，避免 Windows 控制台编码改变 Hook 内容。
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding

function Test-BunVersion([string] $Path) {
    if (-not $Path -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    try {
        $version = (& $Path --version 2>$null | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or $version -notmatch '^(\d+)\.(\d+)\.(\d+)(\+.*)?$') { return $false }
        return [version]($version.Split('+')[0]) -ge [version]'1.1.0'
    } catch { return $false }
}

$bunRoot = if ($env:BUN_INSTALL) { $env:BUN_INSTALL } else { Join-Path $HOME '.bun' }
$bunCommand = Get-Command bun -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
$bunPath = $null
foreach ($candidate in @($bunCommand.Source, (Join-Path $bunRoot 'bin/bun.exe'), (Join-Path $HOME '.bun/bin/bun.exe'))) {
    if (Test-BunVersion $candidate) { $bunPath = $candidate; break }
}

if (-not $bunPath) {
    [Console]::Error.WriteLine('Bun >= 1.1.0 is required. Installing the latest stable release...')
    $installerDir = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName())
    New-Item -ItemType Directory -Path $installerDir | Out-Null
    try {
        $installer = Join-Path $installerDir 'install.ps1'
        Invoke-WebRequest -UseBasicParsing 'https://bun.sh/install.ps1' -OutFile $installer
        $env:BUN_INSTALL = $bunRoot
        # 安装器单独运行，全部日志送往 stderr，保留 Hook 的 JSON stdout。
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer *>&1 | ForEach-Object { [Console]::Error.WriteLine($_) }
        if ($LASTEXITCODE -ne 0) { throw 'Bun installer failed.' }
        $bunPath = Join-Path $bunRoot 'bin/bun.exe'
        if (-not (Test-BunVersion $bunPath)) { throw 'Bun installation failed: version 1.1.0 or later is required.' }
    } finally {
        Remove-Item -LiteralPath $installerDir -Recurse -Force
    }
}

if ($args.Count -gt 0 -and $args[0] -eq '--run') {
    $runArgs = @($args | Select-Object -Skip 1)
    & $bunPath @runArgs
    exit $LASTEXITCODE
}

[Console]::Error.WriteLine("Using Bun $(& $bunPath --version) ($bunPath)")
if ($args.Count -gt 0) {
    # 通过环境变量传递代码，避免 Windows PowerShell 改写 JavaScript 引号。
    $configScript = @'
const fs = require("node:fs"), path = require("node:path");
const [client, language, ...extra] = process.argv.slice(1);
if (extra.length || !["claude", "codex", "pi", "omp", "dsh", "agy"].includes(client) || !["en", "zh"].includes(language)) throw new Error("Provide a client (claude, codex, pi, omp, dsh, agy) and a language (en, zh).");
const file = path.join(require("node:os").homedir(), ".config", "in-deaths-name", client, "config.json");
const settings = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("Settings must contain a JSON object.");
fs.mkdirSync(path.dirname(file), {recursive: true});
fs.writeFileSync(file, JSON.stringify({compactInterval: 3, ...settings, language}, null, 2) + "\n");
console.log("Settings file: " + file);
'@
    $previousScript = $env:IN_DEATHS_NAME_SETUP
    try {
        $env:IN_DEATHS_NAME_SETUP = $configScript
        & $bunPath -e 'eval(process.env.IN_DEATHS_NAME_SETUP)' @args
        if ($LASTEXITCODE -ne 0) { throw 'Initial language configuration failed.' }
    } finally {
        $env:IN_DEATHS_NAME_SETUP = $previousScript
    }
}
