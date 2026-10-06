import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, Org } from '@salesforce/core';
import { readPolicyDir } from '../../../shared/policyDir.js';
import { OrgPolicies } from '../../../shared/orgPolicies.js';
import { diffPolicies } from '../../../shared/compare.js';
import { PolicyDocument } from '../../../shared/policyFile.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('sf-plugin-privacy-policy', 'privacy.policy.diff');

type DiffRow = {
  policy: string;
  state: 'same' | 'different' | 'only in source' | 'only in target';
  sourceStatus: string;
  targetStatus: string;
  differences: string[];
};

export default class PolicyDiff extends SfCommand<DiffRow[]> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'source-org': Flags.string({
      char: 's',
      summary: messages.getMessage('flags.source-org.summary'),
      exactlyOne: ['source-org', 'source-dir'],
    }),
    'source-dir': Flags.directory({
      char: 'd',
      summary: messages.getMessage('flags.source-dir.summary'),
      exists: true,
      exactlyOne: ['source-org', 'source-dir'],
    }),
    'target-org': Flags.requiredOrg(),
    'api-version': Flags.orgApiVersion(),
  };

  public async run(): Promise<DiffRow[]> {
    const { flags } = await this.parse(PolicyDiff);
    this.spinner.start(messages.getMessage('info.comparing'));

    const target = await OrgPolicies.load(flags['target-org'], flags['api-version']);
    const source = new Map<string, { status: string; load: () => Promise<PolicyDocument> }>();
    if (flags['source-dir']) {
      for (const f of await readPolicyDir(flags['source-dir'])) {
        source.set(f.doc.developerName, { status: f.doc.status, load: () => Promise.resolve(f.doc) });
      }
    } else {
      const src = await OrgPolicies.load(await Org.create({ aliasOrUsername: flags['source-org'] }), flags['api-version']);
      for (const s of src.summaries) source.set(s.developerName, { status: s.status, load: () => src.export(s) });
    }

    const rows: DiffRow[] = [];
    const names = [...new Set([...source.keys(), ...target.summaries.map((t) => t.developerName)])].sort();
    for (const name of names) {
      const s = source.get(name);
      const t = target.find(name);
      if (!t) {
        rows.push({ policy: name, state: 'only in source', sourceStatus: s!.status, targetStatus: '', differences: [] });
      } else if (!s) {
        rows.push({ policy: name, state: 'only in target', sourceStatus: '', targetStatus: t.status, differences: [] });
      } else {
        // Sequential: each org's export page carries ViewState from its previous request.
        // eslint-disable-next-line no-await-in-loop
        const differences = diffPolicies(await s.load(), await target.export(t));
        rows.push({
          policy: name,
          state: differences.length ? 'different' : 'same',
          sourceStatus: s.status,
          targetStatus: t.status,
          differences,
        });
      }
    }
    this.spinner.stop();

    this.table({
      data: rows.map((r) => ({ ...r, differences: r.differences.slice(0, 5).join(', ') + (r.differences.length > 5 ? ', …' : '') })),
      columns: [
        { key: 'policy', name: 'Policy' },
        { key: 'state', name: 'State' },
        { key: 'sourceStatus', name: 'Source Status' },
        { key: 'targetStatus', name: 'Target Status' },
        { key: 'differences', name: 'Differences' },
      ],
    });
    return rows;
  }
}
