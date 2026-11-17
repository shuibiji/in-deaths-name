---
name: settings
description: View or set the rule language and reload interval for In Death's Name. Use only when explicitly invoked by the user.
argument-hint: "[en | zh | 0 | positive integer]"
disable-model-invocation: true
---

# Rule Settings

- If this turn's Hook includes `[in-deaths-name:settings handled]`, report that result, including any error. Do not execute the settings script again.
- Otherwise locate `../../scripts/in-deaths-name-settings.ts` relative to this file. Run it through `../../scripts/run-bun.cmd`, passing the quoted absolute settings-script path as its first argument. Use quoted absolute paths for both files; in PowerShell, prefix the launcher with `&`. The launcher selects or installs Bun automatically. Pass `--client claude` for Claude Code CLI or Claude Desktop, or `--client codex` for Codex CLI or Codex Desktop. In Pi and oh-my-pi, use the native `/in-deaths-name-settings` command.
- Pass the user's setting as one separate argument after the client argument, without changing or guessing it. With no setting, display the current values.
- `en` selects English; `zh` selects Chinese. The reload interval is preserved. The Hook adds the selected rules to the current session immediately. If the Hook did not supply both files after a successful language change, read both complete rule files from `../../rules/en/` or `../../rules/zh/` as selected. Do not defer this load to a later conversation.
- `0` disables automatic reloading after compaction while retaining initial and manual loads. A positive integer sets the number of context compactions between reloads. Changing the interval preserves the language and existing count; the next compaction uses the new threshold. Invalid values such as `null` report an error and preserve the existing setting.
- Settings are stored outside the installation cache and survive upgrades. Report the actual result; do not modify rule text or Hook configuration, clear the conversation, or start an extra model turn. Keep errors in English.
