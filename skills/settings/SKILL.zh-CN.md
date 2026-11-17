---
name: settings
description: 查看或设置以死之名的规则语言和加载间隔，只在用户主动调用时使用。
argument-hint: "[en | zh | 0 | 正整数]"
disable-model-invocation: true
---

# 规则加载设置

- 本轮 Hook 已提供 `[in-deaths-name:settings handled]` 时，直接报告该结果及其中的错误，不重复执行设置脚本。
- 否则，以本文件所在目录为基准定位 `../../scripts/in-deaths-name-settings.ts`，通过 `../../scripts/run-bun.cmd` 执行，将设置脚本的绝对路径作为第一个参数。两个路径均使用加引号的绝对路径；PowerShell 中在启动入口前加 `&`。启动入口会自动选择或安装 Bun。Claude Code CLI、Claude Desktop 传入 `--client claude`；Codex CLI、Codex Desktop 传入 `--client codex`。Pi、oh-my-pi 使用原生命令 `/in-deaths-name-settings`。
- 将用户提供的设置值放在客户端参数之后，作为单独的参数传入，不改写或猜测。未提供设置值时，只查看当前值。
- `en` 选择英文，`zh` 选择中文，压缩间隔保留。Hook 会立即将所选规则加入当前会话。语言设置成功后，如果 Hook 未提供两份全文，就完整读取所选 `../../rules/en/` 或 `../../rules/zh/` 目录中的两份规则，不推迟到下一轮对话。
- `0` 关闭压缩后的自动重载，首次和手动加载保留；正整数设置每隔多少次上下文压缩重载。修改间隔保留语言和已累计次数，下次压缩按新阈值判断。`null` 等无效值报错，原设置保留。
- 设置独立于安装缓存保存，升级后保留。报告实际结果；不改规则正文或 Hook 配置，不清空会话，不额外发起模型回合。错误信息保留英文。
