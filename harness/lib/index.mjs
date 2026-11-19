// extensions/deepseek-harness.ts
import { randomUUID } from "node:crypto";

// scripts/rule-content.ts
import { readFileSync as readFileSync2 } from "node:fs";

// scripts/settings-store.ts
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
var PLUGIN_ROOT = fileURLToPath(new URL("../", import.meta.url));
function resolveClient(value) {
  const client = value ?? (process.env.CODEX_THREAD_ID || process.env.PLUGIN_DATA ? "codex" : "claude");
  if (client !== "claude" && client !== "codex" && client !== "pi" && client !== "omp" && client !== "dsh" && client !== "agy") {
    throw new Error("Client must be claude, codex, pi, omp, dsh, or agy.");
  }
  return client;
}
function settingsFile(client) {
  return join(homedir(), ".config", "in-deaths-name", client, "config.json");
}
function pluginVersion() {
  const manifest = JSON.parse(readFileSync(join(PLUGIN_ROOT, "package.json"), "utf8"));
  if (typeof manifest.version !== "string" || !manifest.version) {
    throw new Error("Missing plugin version in package.json.");
  }
  return manifest.version;
}
function readObject(path) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Settings must contain a JSON object: ${path}`);
  }
  return value;
}
function legacySettingsFile() {
  const current = basename(PLUGIN_ROOT);
  const parent = dirname(PLUGIN_ROOT);
  if (basename(parent) === "in-deaths-name" && /^\d+\.\d+\.\d+$/.test(current)) {
    const compare = (left, right) => {
      const a = left.split(".").map(Number);
      const b = right.split(".").map(Number);
      return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    };
    const previous = readdirSync(parent, { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^\d+\.\d+\.\d+$/.test(entry.name)).map((entry) => entry.name).filter((version) => compare(version, current) < 0).sort((a, b) => compare(b, a));
    for (const version of previous) {
      const path = join(parent, version, "config.json");
      if (existsSync(path))
        return path;
    }
  }
  return join(PLUGIN_ROOT, "config.json");
}
function saveStoredSettings(client, settings) {
  const path = settingsFile(client);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}
`, "utf8");
}
function readStoredSettings(client) {
  const path = settingsFile(client);
  if (existsSync(path))
    return readObject(path);
  const settings = readObject(legacySettingsFile());
  saveStoredSettings(client, settings);
  return settings;
}

// scripts/rule-content.ts
var RULE_FILES = ["in-deaths-name.md", "in-deaths-name-answer.md"];
var DEFAULT_COMPACT_INTERVAL = 3;
function readLanguage(value) {
  if (value === undefined || value === null || value === "") {
    return "en";
  }
  if (value !== "en" && value !== "zh") {
    throw new Error('language must be "en" or "zh".');
  }
  return value;
}
function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function readRuleSettings(reportError, client = resolveClient()) {
  const settings = { language: "en", compactInterval: DEFAULT_COMPACT_INTERVAL };
  let config;
  try {
    config = readStoredSettings(client);
  } catch (error) {
    reportError(`Could not read settings; using English and a compaction interval of ${DEFAULT_COMPACT_INTERVAL}. Reason: ${getErrorMessage(error)}`);
    return settings;
  }
  try {
    settings.language = readLanguage(config.language);
  } catch (error) {
    reportError(`Could not read the rule language; using English. Reason: ${getErrorMessage(error)}`);
  }
  const interval = config.compactInterval === undefined ? DEFAULT_COMPACT_INTERVAL : config.compactInterval;
  if (typeof interval === "number" && Number.isSafeInteger(interval) && interval >= 0) {
    settings.compactInterval = interval;
  } else {
    reportError(`compactInterval must be 0 or a positive integer; null is invalid. Using ${DEFAULT_COMPACT_INTERVAL}.`);
  }
  return settings;
}
function readRuleContent(language, reportError) {
  const directory = `rules/${language}`;
  const sections = [];
  for (const name of RULE_FILES) {
    const path = `${directory}/${name}`;
    try {
      const text = readFileSync2(new URL(`../${path}`, import.meta.url), "utf8");
      sections.push(`【${path}】
${text}`);
    } catch (error) {
      reportError(`Could not read ${path}: ${getErrorMessage(error)}`);
    }
  }
  const reminder = language === "zh" ? `下面是用户定下的两份规则，请记住并遵守。回答时不用重复规则原文。

` : `The following two sets of rules were set by the user. Remember and follow them. Do not repeat the rules in your answers.

`;
  return {
    content: sections.length > 0 ? reminder + sections.join(`

`) : "",
    complete: sections.length === RULE_FILES.length
  };
}
function changeRuleSetting(client, value) {
  const settings = readStoredSettings(client);
  if (value === "en" || value === "zh") {
    settings.language = value;
  } else {
    const interval = value.trim() === "" ? NaN : Number(value);
    if (!Number.isSafeInteger(interval) || interval < 0) {
      throw new Error("Provide en, zh, 0, or a positive integer; null is invalid.");
    }
    settings.compactInterval = interval;
  }
  saveStoredSettings(client, settings);
}
function describeRuleSettings(settings) {
  if (settings.language === "zh") {
    const interval = settings.compactInterval === 0 ? "已关闭压缩后的自动重载，首次加载和手动加载保留。" : `每 ${settings.compactInterval} 次上下文压缩重新加载规则。`;
    return `当前规则语言：中文（zh）。${interval}`;
  }
  const interval = settings.compactInterval === 0 ? "Automatic reloading after compaction is disabled; initial and manual loading remain enabled." : `Reload rules every ${settings.compactInterval} context compactions.`;
  return `Rule language: English (en). ${interval}`;
}

// extensions/deepseek-harness.ts
var name = "in-deaths-name";
var inject = ["agents", "commands"];
function apply(ctx) {
  const version = pluginVersion();
  const states = new WeakMap;
  function sync(session, force = false, report = (message) => ctx.logger.warn(message)) {
    const state = states.get(session) ?? { cursor: session.inheritedEventCount, compactions: 0 };
    states.set(session, state);
    let compacted = false;
    while (state.cursor < session.seq) {
      const event = session.eventAt(state.cursor++);
      if (event?.type === "compaction/end" && event.data.error === undefined) {
        state.compactions++;
        compacted = true;
      } else if (event?.type === "user/message" && event.data.source?.kind === name) {
        state.loaded = event.data.source;
        if (state.loaded.complete) {
          state.compactions = 0;
          compacted = false;
        }
      }
    }
    const { language, compactInterval } = readRuleSettings(report, "dsh");
    if (!force && state.loaded?.complete && state.loaded.language === language && state.loaded.version === version && !(compacted && compactInterval > 0 && state.compactions >= compactInterval))
      return true;
    const { content, complete } = readRuleContent(language, report);
    if (content) {
      const source = { kind: name, language, version, complete };
      session.append("user/message", { id: randomUUID(), role: "user", source, content: [{ type: "text", text: content }] }, { surfaceOp: "append" });
    }
    return complete;
  }
  ctx.on("agent/created", ({ agent }) => {
    sync(agent.session);
  });
  ctx.on("session/event", (session, event) => {
    if (event.type === "compaction/end" && event.data.error === undefined && states.has(session)) {
      queueMicrotask(() => {
        try {
          sync(session);
        } catch (error) {
          ctx.logger.warn(getErrorMessage(error));
        }
      });
    }
  });
  ctx.on("agent/pre-step", async ({ agent }, next) => {
    const decision = await next();
    sync(agent.session);
    return decision;
  });
  for (const action of ["reload", "settings"]) {
    const command = `${name}-${action}`;
    ctx.commands.register({
      definitionId: `${name}/${action}`,
      name: command,
      description: action === "reload" ? "Load both rule files now" : "View or change the rule language and compaction interval",
      ...action === "settings" ? { input: { hint: "[en | zh | 0 | positive integer]" } } : {},
      handler({ agent, rawInput }) {
        const errors = [];
        const report = (message) => {
          errors.push(message);
        };
        const value = rawInput.trim();
        try {
          if (action === "reload" && value)
            throw new Error("Reload takes no arguments.");
          if (action === "settings" && value)
            changeRuleSetting("dsh", value);
          if (action === "reload" || value === "en" || value === "zh")
            sync(agent.session, true, report);
          const settings = readRuleSettings(report, "dsh");
          if (!errors.length)
            return { kind: "success", text: action === "settings" ? describeRuleSettings(settings) : settings.language === "zh" ? "已加载两份中文规则全文。" : "Both English rule files are loaded." };
        } catch (error) {
          report(getErrorMessage(error));
        }
        return { kind: "error", text: errors.join(`
`) };
      }
    });
  }
}
export {
  apply,
  inject,
  name
};
