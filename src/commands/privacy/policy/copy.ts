import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, Org, SfError } from '@salesforce/core';
import { OrgPolicies } from '../../../shared/orgPolicies.js';
import { importPolicies, ImportResult } from '../../../shared/importFlow.js';
import { toFileContent } from '../../../shared/policyFile.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('sf-plugin-privacy-policy', 'privacy.policy.copy');

export default class PolicyCopy extends SfCommand<ImportResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'source-org': Flags.string({
      char: 's',
      summary: messages.getMessage('flags.source-org.summary'),
      required: true,
    }),
    'target-org': Flags.requiredOrg(),
    'api-version': Flags.orgApiVersion(),
    policy: Flags.string({
      char: 'p',
      summary: messages.getMessage('flags.policy.summary'),
      multiple: true,
      exactlyOne: ['policy', 'all'],
    }),
    all: Flags.boolean({ summary: messages.getMessage('flags.all.summary'), exactlyOne: ['policy', 'all'] }),
    'dry-run': Flags.boolean({ summary: messages.getMessage('flags.dry-run.summary') }),
    activate: Flags.boolean({ summary: messages.getMessage('flags.activate.summary') }),
    'no-prompt': Flags.boolean({ summary: messages.getMessage('flags.no-prompt.summary') }),
    'output-dir': Flags.directory({ char: 'd', summary: messages.getMessage('flags.output-dir.summary') }),
  };

  public async run(): Promise<ImportResult> {
    const { flags } = await this.parse(PolicyCopy);
    const sourceOrg = await Org.create({ aliasOrUsername: flags['source-org'] });
    const targetOrg = flags['target-org'];
    if (sourceOrg.getOrgId() === targetOrg.getOrgId()) {
      throw new SfError(messages.getMessage('error.sameOrg'), 'SameOrg');
    }

    // 1. Read the policies from the source org (read-only), the same way "export" does.
    this.spinner.start(messages.getMessage('info.reading', [flags['source-org']]));
    const source = await OrgPolicies.load(sourceOrg, flags['api-version']);
    const wanted = flags.all
      ? source.summaries
      : (flags.policy ?? []).map((name) => {
          const match = source.find(name);
          if (!match) {
            throw new SfError(messages.getMessage('error.notFound', [name, flags['source-org']]), 'PolicyNotFound', [
              messages.getMessage('error.notFound.action', [flags['source-org']]),
            ]);
          }
          return match;
        });
    const docs = [];
    for (const summary of wanted) {
      this.spinner.status = summary.developerName;
      // Sequential: each export carries the page state from the previous one.
      // eslint-disable-next-line no-await-in-loop
      docs.push(await source.export(summary));
    }
    this.spinner.stop();
    if (!docs.length) {
      this.log(messages.getMessage('info.none'));
      return { dryRun: flags['dry-run'], policies: [], issues: [] };
    }

    // 2. Optionally keep a copy of the files, e.g. to commit them to Git.
    if (flags['output-dir']) {
      await mkdir(flags['output-dir'], { recursive: true });
      await Promise.all(
        docs.map((d) => writeFile(join(flags['output-dir']!, `${d.developerName}.json`), toFileContent(d)))
      );
    }

    // 3. Import into the target org with exactly the same checks as "import".
    return importPolicies(this, {
      org: targetOrg,
      apiVersion: flags['api-version'],
      docs,
      dryRun: flags['dry-run'],
      activate: flags.activate,
      noPrompt: flags['no-prompt'],
    });
  }
}
