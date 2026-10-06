import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { listPolicies, PolicySummary } from '../../../shared/policies.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('sf-plugin-privacy-policy', 'privacy.policy.list');

export default class PolicyList extends SfCommand<PolicySummary[]> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    'api-version': Flags.orgApiVersion(),
  };

  public async run(): Promise<PolicySummary[]> {
    const { flags } = await this.parse(PolicyList);
    const policies = await listPolicies(flags['target-org'].getConnection(flags['api-version']));
    if (!policies.length) {
      this.log(messages.getMessage('info.none'));
      return policies;
    }
    this.table({
      data: policies,
      columns: [
        { key: 'developerName', name: 'API Name' },
        { key: 'name', name: 'Label' },
        { key: 'type', name: 'Type' },
        { key: 'status', name: 'Status' },
        { key: 'runFrequency', name: 'Run Frequency' },
      ],
    });
    return policies;
  }
}
