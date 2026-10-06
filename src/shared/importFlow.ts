import { SfCommand } from '@salesforce/sf-plugins-core';
import { Connection, Messages, Org, SfError } from '@salesforce/core';
import { OrgPolicies } from './orgPolicies.js';
import { diffPolicies } from './compare.js';
import { encodeForImport, PolicyDocument, withPlaceholderIds } from './policyFile.js';
import { planAction, PlannedAction, validatePolicies, ValidationIssue } from './validate.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('sf-plugin-privacy-policy', 'privacy.policy.import');

export type PolicyOutcome = {
  policy: string;
  action: PlannedAction;
  status: 'active' | 'inactive';
  result: 'would create' | 'created' | 'unchanged' | 'conflict' | 'failed';
  detail: string;
};
export type ImportResult = { dryRun: boolean; policies: PolicyOutcome[]; issues: ValidationIssue[] };

export type ImportOptions = {
  org: Org;
  apiVersion?: string;
  docs: PolicyDocument[];
  dryRun: boolean;
  activate: boolean;
  noPrompt: boolean;
};

/**
 * Validate → plan → (confirm) → import → verify. Shared by "import" (policies from files)
 * and "copy" (policies straight from another org), so both behave identically.
 */
export async function importPolicies(cmd: SfCommand<unknown>, opts: ImportOptions): Promise<ImportResult> {
  const { org, docs, dryRun } = opts;
  const conn = org.getConnection(opts.apiVersion);

  // 1. Validate first, always. Any problem stops everything before a single policy is sent.
  cmd.spinner.start(messages.getMessage('info.validating'));
  const issues = await validatePolicies(org, conn, docs);
  cmd.spinner.stop();
  if (issues.length) {
    cmd.table({
      data: issues,
      columns: [
        { key: 'policy', name: 'Policy' },
        { key: 'problem', name: 'Problem' },
      ],
    });
    throw new SfError(messages.getMessage('error.invalid', [issues.length]), 'ValidationFailed').setData({
      dryRun,
      policies: [],
      issues,
    });
  }

  // 2. Plan what happens to each policy.
  cmd.spinner.start(messages.getMessage('info.planning'));
  const target = await OrgPolicies.load(org, opts.apiVersion);
  const status = opts.activate ? 'active' : 'inactive';
  const outcomes = await planOutcomes(target, docs, status);
  cmd.spinner.stop();

  const conflicts = outcomes.filter((o) => o.action === 'conflict');
  const toCreate = outcomes.filter((o) => o.action === 'create');

  if (conflicts.length) {
    printPlan(cmd, outcomes);
    throw new SfError(
      messages.getMessage('error.conflict', [conflicts.map((c) => c.policy).join(', ')]),
      'PolicyConflict',
      [messages.getMessage('error.conflict.action')]
    ).setData({ dryRun, policies: outcomes.map(strip), issues });
  }

  if (dryRun || !toCreate.length) {
    printPlan(cmd, outcomes);
    cmd.log(dryRun ? messages.getMessage('info.dryRun') : messages.getMessage('info.nothingToDo'));
    return { dryRun, policies: outcomes.map(strip), issues };
  }

  // 3. Activation on production needs an explicit yes.
  if (opts.activate) await confirmActivation(cmd, org, conn, toCreate.length, opts.noPrompt);

  // 4. Import, one at a time, stopping at the first failure.
  const page = await target.getPage();
  for (const outcome of toCreate) {
    cmd.spinner.start(messages.getMessage('info.importing', [outcome.policy]));
    const payload = withPlaceholderIds({ ...outcome.doc, status });
    // eslint-disable-next-line no-await-in-loop
    const res = await page.importPolicy(encodeForImport(payload));
    cmd.spinner.stop();
    outcome.result = res.success ? 'created' : 'failed';
    outcome.detail = res.message;
    if (!res.success) {
      printPlan(cmd, outcomes);
      throw new SfError(
        messages.getMessage('error.importFailed', [outcome.policy, res.message.replace(/\.+$/, '')]),
        'ImportFailed'
      ).setData({
        dryRun,
        policies: outcomes.map(strip),
        issues,
      });
    }
  }

  // 5. Confirm through the API that each created policy now exists.
  const after = await OrgPolicies.load(org, opts.apiVersion);
  for (const outcome of toCreate) {
    const created = after.find(outcome.policy);
    if (!created) {
      outcome.result = 'failed';
      outcome.detail = messages.getMessage('error.notVisible');
    } else if (created.status !== status) {
      outcome.detail = messages.getMessage('info.statusMismatch', [created.status, status]);
    }
  }
  printPlan(cmd, outcomes);
  if (outcomes.some((o) => o.result === 'failed'))
    throw new SfError(messages.getMessage('error.verifyFailed'), 'VerifyFailed');
  return { dryRun, policies: outcomes.map(strip), issues };
}

async function confirmActivation(
  cmd: SfCommand<unknown>,
  org: Org,
  conn: Connection,
  count: number,
  noPrompt: boolean
): Promise<void> {
  const { IsSandbox } = await conn.singleRecordQuery<{ IsSandbox: boolean }>('SELECT IsSandbox FROM Organization');
  if (IsSandbox || noPrompt) return;
  const ok = await cmd.confirm({
    message: messages.getMessage('prompt.activateProd', [count, org.getUsername()]),
    defaultAnswer: false,
  });
  if (!ok) throw new SfError(messages.getMessage('error.cancelled'), 'Cancelled');
}

function printPlan(cmd: SfCommand<unknown>, outcomes: PolicyOutcome[]): void {
  cmd.table({
    data: outcomes.map(strip),
    columns: [
      { key: 'policy', name: 'Policy' },
      { key: 'result', name: 'Result' },
      { key: 'status', name: 'Imported As' },
      { key: 'detail', name: 'Detail' },
    ],
  });
}

function strip({ policy, action, status, result, detail }: PolicyOutcome): PolicyOutcome {
  return { policy, action, status, result, detail };
}

/** Create new policies; existing ones must match exactly (Salesforce can't update a policy in place). */
async function planOutcomes(
  target: OrgPolicies,
  docs: PolicyDocument[],
  status: PolicyOutcome['status']
): Promise<Array<PolicyOutcome & { doc: PolicyDocument }>> {
  const outcomes: Array<PolicyOutcome & { doc: PolicyDocument }> = [];
  for (const doc of docs) {
    const existing = target.find(doc.developerName);
    // eslint-disable-next-line no-await-in-loop
    const differences = existing ? diffPolicies(doc, await target.export(existing)) : undefined;
    const action = planAction(existing, differences);
    outcomes.push({
      doc,
      policy: doc.developerName,
      action,
      status,
      result: action === 'create' ? 'would create' : action,
      detail:
        action === 'conflict'
          ? messages.getMessage('info.conflict', [differences!.slice(0, 5).join(', ')])
          : action === 'unchanged'
          ? messages.getMessage('info.unchanged', [existing!.status])
          : '',
    });
  }
  return outcomes;
}
