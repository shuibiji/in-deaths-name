---
name: reload-rules
description: Load the complete behavior and answer rules for In Death's Name now. Use only when explicitly invoked by the user.
disable-model-invocation: true
---

# Reload Rules Now

When the user invokes this skill, immediately read and follow both rule files in full, without waiting for context compaction.

- If this turn's Hook has already supplied both complete rule files in the configured language, use that content without reading them again.
- Otherwise, use the independent settings at `~/.config/in-deaths-name/<client>/config.json`: `claude` for Claude Code CLI/Desktop, `codex` for Codex CLI/Desktop, `pi` for Pi, and `omp` for oh-my-pi. If that file is absent, run `../../scripts/run-bun.cmd` with the absolute path to `../../scripts/in-deaths-name-settings.ts` as its first argument, followed by `--client <client>`; quote both absolute paths and prefix the launcher with `&` in PowerShell. The launcher prepares Bun automatically. Use this to load the saved or legacy settings without changing their values. Resolve the following rule paths relative to this skill file. `language: "en"` selects `../../rules/en/in-deaths-name.md` and `../../rules/en/in-deaths-name-answer.md`; `language: "zh"` selects the unchanged Chinese originals at `../../rules/zh/in-deaths-name.md` and `../../rules/zh/in-deaths-name-answer.md`. A missing or empty language field (`null` or `""`) defaults to English. Report an invalid language value in English and use English rules.
- Read both selected files completely. Keep their full text; do not substitute summaries or file paths for the contents.
- If a read fails, report the specific file and error in English, retaining any content already read.
- Briefly report the result without reciting the rules or changing any rules or settings.
