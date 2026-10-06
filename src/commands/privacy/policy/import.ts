import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { readPolicyDir } from '../../../shared/policyDir.js';
import { importPolicies, ImportResult } from '../../../shared/importFlow.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('sf-plugin-privacy-policy', 'privacy.policy.import');

export type { ImportResult };

export default class PolicyImport extends SfCommand<ImportResult> {
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
    'dry-run': Flags.boolean({ summary: messages.getMessage('flags.dry-run.summary') }),
    activate: Flags.boolean({ summary: messages.getMessage('flags.activate.summary') }),
    'no-prompt': Flags.boolean({ summary: messages.getMessage('flags.no-prompt.summary') }),
  };

  public async run(): Promise<ImportResult> {
    const { flags } = await this.parse(PolicyImport);
    return importPolicies(this, {
      org: flags['target-org'],
      apiVersion: flags['api-version'],
      docs: (await readPolicyDir(flags['source-dir'])).map((f) => f.doc),
      dryRun: flags['dry-run'],
      activate: flags.activate,
      noPrompt: flags['no-prompt'],
    });
  }
}
