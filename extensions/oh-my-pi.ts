/** oh-my-pi 在清空上下文后也重新加载规则。 */
import { registerRules, type RuleExtensionAPI } from './in-deaths-name.ts';

export default function inDeathsName(api: RuleExtensionAPI): void {
  registerRules(api, 'omp');
}
