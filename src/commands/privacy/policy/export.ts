import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, SfError } from '@salesforce/core';
import { listPolicies } from '../../../shared/policies.js';
import { ImportExportPage } from '../../../shared/importExportPage.js';
import { decodeExport, sanitize, toFileContent } from '../../../shared/policyFile.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('sf-plugin-privacy-policy', 'privacy.policy.export');

export type ExportedPolicy = { developerName: string; type: string; status: string; path: string };

export default class PolicyExport extends SfCommand<ExportedPolicy[]> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    'api-version': Flags.orgApiVersion(),
    policy: Flags.string({
      char: 'p',
      summary: messages.getMessage('flags.policy.summary'),
      multiple: true,
      exactlyOne: ['policy', 'all'],
    }),
    all: Flags.boolean({
      summary: messages.getMessage('flags.all.summary'),
      exactlyOne: ['policy', 'all'],
    }),
    'output-dir': Flags.directory({
      char: 'd',
      summary: messages.getMessage('flags.output-dir.summary'),
      default: join('privacy', 'policies'),
    }),
  };

  public async run(): Promise<ExportedPolicy[]> {
    const { flags } = await this.parse(PolicyExport);
    const org = flags['target-org'];
    const available = await listPolicies(org.getConnection(flags['api-version']));

    const wanted = flags.all
      ? available
      : (flags.policy ?? []).map((name) => {
          const match = available.find((p) => p.developerName === name);
          if (!match) {
            throw new SfError(messages.getMessage('error.notFound', [name, org.getUsername()]), 'PolicyNotFound', [
              messages.getMessage('error.notFound.action'),
            ]);
          }
          return match;
        });
    if (!wanted.length) {
      this.log(messages.getMessage('info.none'));
      return [];
    }

    this.spinner.start(messages.getMessage('info.connecting'));
    const page = await ImportExportPage.open(org);
    await mkdir(flags['output-dir'], { recursive: true });

    const results: ExportedPolicy[] = [];
    for (const policy of wanted) {
      this.spinner.status = policy.developerName;
      // Sequential on purpose: each POST carries the ViewState returned by the previous one.
      // eslint-disable-next-line no-await-in-loop
      const doc = sanitize(decodeExport(await page.exportPolicy(policy.id)));
      const path = join(flags['output-dir'], `${doc.developerName}.json`);
      // eslint-disable-next-line no-await-in-loop
      await writeFile(path, toFileContent(doc));
      results.push({ developerName: doc.developerName, type: doc.type, status: doc.status, path });
    }
    this.spinner.stop();

    this.table({
      data: results,
      columns: [
        { key: 'developerName', name: 'API Name' },
        { key: 'type', name: 'Type' },
        { key: 'status', name: 'Status in Source' },
        { key: 'path', name: 'File' },
      ],
    });
    return results;
  }
}
