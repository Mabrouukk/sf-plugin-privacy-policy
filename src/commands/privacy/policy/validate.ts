import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, SfError } from '@salesforce/core';
import { readPolicyDir } from '../../../shared/policyDir.js';
import { validatePolicies, ValidationIssue } from '../../../shared/validate.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('sf-plugin-privacy-policy', 'privacy.policy.validate');

export type ValidateResult = { valid: boolean; policies: string[]; issues: ValidationIssue[] };

export default class PolicyValidate extends SfCommand<ValidateResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    'api-version': Flags.orgApiVersion(),
    'source-dir': Flags.directory({
      char: 'd',
      summary: messages.getMessage('flags.source-dir.summary'),
      default: 'privacy/policies',
      exists: true,
    }),
  };

  public async run(): Promise<ValidateResult> {
    const { flags } = await this.parse(PolicyValidate);
    const org = flags['target-org'];
    const files = await readPolicyDir(flags['source-dir']);
    const docs = files.map((f) => f.doc);
    const issues = await validatePolicies(org, org.getConnection(flags['api-version']), docs);
    const result = { valid: issues.length === 0, policies: docs.map((d) => d.developerName), issues };

    if (issues.length) {
      this.table({
        data: issues,
        columns: [
          { key: 'policy', name: 'Policy' },
          { key: 'problem', name: 'Problem' },
        ],
      });
      throw new SfError(
        messages.getMessage('error.invalid', [issues.length]),
        'ValidationFailed',
        [],
        1,
        undefined
      ).setData(result);
    }
    this.logSuccess(messages.getMessage('info.valid', [docs.length, org.getUsername()]));
    return result;
  }
}
