/** 查看或修改独立保存的用户配置；由 Hook 或原生扩展负责把新规则载入当前会话。 */
import { changeRuleSetting, describeRuleSettings, getErrorMessage, readRuleSettings } from './rule-content.ts';
import { resolveClient, settingsFile } from './settings-store.ts';

function main(): void {
  const args = process.argv.slice(2);
  let client;
  if (args[0] === '--client') {
    if (!args[1]) throw new Error('Missing client after --client.');
    client = resolveClient(args[1]);
    args.splice(0, 2);
  } else {
    client = resolveClient();
  }
  if (args.length > 1) throw new Error('Provide one setting: en, zh, 0, or a positive integer.');
  if (args[0] !== undefined) changeRuleSetting(client, args[0]);
  const settings = readRuleSettings(message => { throw new Error(message); }, client);
  console.log(describeRuleSettings(settings));
  console.log(`Settings file: ${settingsFile(client)}`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`Settings failed: ${getErrorMessage(error)}\n`);
  process.exitCode = 1;
}
