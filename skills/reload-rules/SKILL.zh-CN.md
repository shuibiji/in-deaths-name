---
name: reload-rules
description: 立即加载以死之名的行为规则和回答规则原文，只在用户主动调用时使用。
disable-model-invocation: true
---

# 立即加载规则

用户调用本技能时，立即读取并遵守两份规则的完整原文，无需等待上下文压缩。

- 本轮 Hook 已提供当前配置语言的两份完整规则时，直接使用这些内容，不重复读取。
- 本轮上下文尚未包含两份完整规则时，读取独立配置 `~/.config/in-deaths-name/<client>/config.json`：Claude Code CLI/Desktop 对应 `claude`，Codex CLI/Desktop 对应 `codex`，Pi 对应 `pi`，oh-my-pi 对应 `omp`。该文件尚不存在时，通过 `../../scripts/run-bun.cmd` 执行 `../../scripts/in-deaths-name-settings.ts`，将设置脚本的绝对路径作为第一个参数，再传入 `--client <client>`；两个路径均使用加引号的绝对路径，PowerShell 中在启动入口前加 `&`。启动入口自动准备 Bun，并读取已有或旧版设置，不改变设置值。下列规则路径均以本技能文件所在目录为基准。`language: "en"` 选择 `../../rules/en/in-deaths-name.md` 和 `../../rules/en/in-deaths-name-answer.md`；`language: "zh"` 选择 `../../rules/zh/in-deaths-name.md` 和 `../../rules/zh/in-deaths-name-answer.md`。语言未填写或为空（`null`、`""`）时使用英文；其他无效语言值报英文错误，并使用英文规则。
- 完整读取所选语言的两份文件。保留全文，不用摘要或文件路径代替正文。
- 读取失败时用英文说明具体文件和错误，保留已经读到的内容。
- 加载后只简短说明结果，不复述整套规则，不修改规则或配置。
