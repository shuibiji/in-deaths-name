// @bun
// extensions/antigravity.ts
import { closeSync, existsSync as existsSync2, fstatSync, mkdirSync as mkdirSync2, openSync, readFileSync as readFileSync3, readSync, writeFileSync as writeFileSync2 } from "fs";
import { dirname as dirname2, join as join2 } from "path";

// scripts/rule-content.ts
import { readFileSync as readFileSync2 } from "fs";

// scripts/settings-store.ts
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { basename, dirname, join } from "path";
import { fileURLToPath } from "url";
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
      sections.push(`\u3010${path}\u3011
${text}`);
    } catch (error) {
      reportError(`Could not read ${path}: ${getErrorMessage(error)}`);
    }
  }
  const reminder = language === "zh" ? `\u4E0B\u9762\u662F\u7528\u6237\u5B9A\u4E0B\u7684\u4E24\u4EFD\u89C4\u5219\uFF0C\u8BF7\u8BB0\u4F4F\u5E76\u9075\u5B88\u3002\u56DE\u7B54\u65F6\u4E0D\u7528\u91CD\u590D\u89C4\u5219\u539F\u6587\u3002

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
    const interval = settings.compactInterval === 0 ? "\u5DF2\u5173\u95ED\u538B\u7F29\u540E\u7684\u81EA\u52A8\u91CD\u8F7D\uFF0C\u9996\u6B21\u52A0\u8F7D\u548C\u624B\u52A8\u52A0\u8F7D\u4FDD\u7559\u3002" : `\u6BCF ${settings.compactInterval} \u6B21\u4E0A\u4E0B\u6587\u538B\u7F29\u91CD\u65B0\u52A0\u8F7D\u89C4\u5219\u3002`;
    return `\u5F53\u524D\u89C4\u5219\u8BED\u8A00\uFF1A\u4E2D\u6587\uFF08zh\uFF09\u3002${interval}`;
  }
  const interval = settings.compactInterval === 0 ? "Automatic reloading after compaction is disabled; initial and manual loading remain enabled." : `Reload rules every ${settings.compactInterval} context compactions.`;
  return `Rule language: English (en). ${interval}`;
}

// extensions/antigravity.ts
var fresh = () => ({ through: -1, compactions: 0, userStep: -1 });
function* latestSteps(path) {
  const fd = openSync(path, "r");
  try {
    let end = fstatSync(fd).size;
    let tail = Buffer.alloc(0);
    while (end > 0) {
      const size = Math.min(end, 32768);
      end -= size;
      const block = Buffer.allocUnsafe(size);
      const count = readSync(fd, block, 0, size, end);
      const data = Buffer.concat([block.subarray(0, count), tail]);
      let right = data.length;
      while (right > 0) {
        const left = data.lastIndexOf(10, right - 1);
        if (left < 0 && end !== 0)
          break;
        const line = data.toString("utf8", left + 1, right).trim();
        right = left + 1;
        if (line)
          yield JSON.parse(line);
        if (left < 0)
          break;
        right = left;
      }
      tail = data.subarray(0, right);
    }
  } finally {
    closeSync(fd);
  }
}
function main() {
  const input = JSON.parse(readFileSync3(0, "utf8"));
  if (input.hookEventName !== "PreInvocation")
    return;
  if (typeof input.conversationId !== "string" || !input.conversationId || typeof input.transcriptPath !== "string")
    throw new Error("Missing conversation ID or transcript path.");
  const path = join2(dirname2(settingsFile("agy")), "sessions", `${encodeURIComponent(input.conversationId)}.json`);
  let state = existsSync2(path) ? JSON.parse(readFileSync3(path, "utf8")) : fresh();
  let frontier = state.through;
  let checkpoints = 0;
  let started = false;
  if (existsSync2(input.transcriptPath)) {
    for (const step of latestSteps(input.transcriptPath)) {
      if (!Number.isSafeInteger(step.step_index))
        throw new Error("Invalid transcript step index.");
      if (!started) {
        if (step.step_index < frontier) {
          state = fresh();
          frontier = -1;
        }
        started = true;
        state.through = step.step_index;
      }
      if (step.step_index <= frontier)
        break;
      if (step.type === "CHECKPOINT") {
        if (step.status === "DONE")
          checkpoints++;
        else if (step.status !== "ERROR" && step.status !== "CANCELED" && step.status !== "CANCELLED") {
          state.through = step.step_index - 1;
          checkpoints = 0;
        }
      }
      if (step.type === "USER_INPUT" && step.source === "USER_EXPLICIT")
        state.userStep = Math.max(state.userStep, step.step_index);
    }
  }
  state.compactions += checkpoints;
  const prompt = typeof input.lastUserInput === "string" ? input.lastUserInput.trim() : "";
  const match = /^\/(?:in-deaths-name:)?in-deaths-name-(reload|settings)(?:\s+([\s\S]+))?$/.exec(prompt);
  const manualText = prompt === "\u7ACB\u5373\u52A0\u8F7D\u4EE5\u6B7B\u4E4B\u540D\u89C4\u5219" || prompt === "Load the in-deaths-name rules now";
  const context = [];
  const report = (error) => {
    context.push(error);
  };
  let force = false;
  if ((match || manualText) && state.handled !== state.userStep) {
    state.handled = state.userStep;
    const value = match?.[2];
    try {
      if (match?.[1] === "settings") {
        if (value !== undefined)
          changeRuleSetting("agy", value);
        context.push(describeRuleSettings(readRuleSettings(report, "agy")));
        force = value === "en" || value === "zh";
      } else if (value)
        throw new Error("Reload takes no arguments.");
      else
        force = true;
    } catch (error) {
      report(getErrorMessage(error));
    }
  }
  const settings = readRuleSettings(report, "agy");
  const version = pluginVersion();
  if (force || state.language !== settings.language || state.version !== version || checkpoints > 0 && settings.compactInterval > 0 && state.compactions >= settings.compactInterval) {
    const result = readRuleContent(settings.language, report);
    if (result.content)
      context.push(result.content);
    if (result.complete) {
      state.language = settings.language;
      state.version = version;
      state.compactions = 0;
    } else {
      delete state.version;
    }
  }
  mkdirSync2(dirname2(path), { recursive: true });
  writeFileSync2(path, JSON.stringify(state), "utf8");
  console.log(JSON.stringify(context.length ? { injectSteps: [{ userMessage: context.join(`

`) }] } : {}));
}
try {
  main();
} catch (error) {
  console.error(`in-deaths-name: ${getErrorMessage(error)}`);
  process.exitCode = 1;
}
