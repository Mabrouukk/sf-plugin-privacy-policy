import { Connection, Org } from '@salesforce/core';
import { PolicyDocument, referencedSchema } from './policyFile.js';
import { PolicySummary } from './policies.js';

export type ValidationIssue = { policy: string; problem: string };

/**
 * Read-only checks that a policy can be imported into the target org:
 * every referenced object and field exists, and the policy's release is not newer than the org's.
 */
export async function validatePolicies(org: Org, conn: Connection, docs: PolicyDocument[]): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const orgApiVersion = Number(await org.retrieveMaxApiVersion());
  // Schema existence via FieldDefinition/EntityDefinition, not describe: describe hides fields the
  // running user has no field-level access to, which would report real fields as missing.
  const cache = new Map<string, Promise<Set<string> | null>>();
  const fieldsOf = (object: string): Promise<Set<string> | null> => {
    const key = object.toLowerCase();
    if (!cache.has(key)) cache.set(key, schemaFields(conn, object));
    return cache.get(key)!;
  };

  for (const doc of docs) {
    const policy = doc.developerName;
    if (Number(doc.apiVersion) > orgApiVersion) {
      issues.push({
        policy,
        problem: `Policy was exported from API version ${doc.apiVersion}, but the target org is on ${orgApiVersion}. Wait until the target org is on the same release.`,
      });
    }
    for (const [object, fields] of referencedSchema(doc)) {
      // eslint-disable-next-line no-await-in-loop
      const existing = await fieldsOf(object);
      if (!existing) {
        issues.push({ policy, problem: `Object ${object} does not exist in the target org.` });
        continue;
      }
      for (const field of fields) {
        if (!existing.has(field.toLowerCase())) {
          issues.push({ policy, problem: `Field ${object}.${field} does not exist in the target org.` });
        }
      }
    }
  }
  return issues;
}

async function schemaFields(conn: Connection, object: string): Promise<Set<string> | null> {
  if (!/^[A-Za-z0-9_]+$/.test(object)) return null;
  const entity = await conn.query<{ QualifiedApiName: string }>(
    `SELECT QualifiedApiName FROM EntityDefinition WHERE QualifiedApiName = '${object}'`
  );
  if (!entity.records.length) return null;
  // FieldDefinition misses compound-field parts (FirstName, BillingStreet); EntityParticle has them
  // but skips fields the user can't see. Together they cover every field.
  const names = new Set<string>();
  // FieldDefinition goes through the Tooling API: the data API version is filtered by field-level security.
  const soql = (sobject: string): string =>
    `SELECT QualifiedApiName FROM ${sobject} WHERE EntityDefinition.QualifiedApiName = '${object}'`;
  const results = await Promise.all([
    conn.tooling.query<{ QualifiedApiName: string }>(soql('FieldDefinition'), { autoFetch: true, maxFetch: 10_000 }),
    conn.query<{ QualifiedApiName: string }>(soql('EntityParticle'), { autoFetch: true, maxFetch: 10_000 }),
  ]);
  for (const res of results) for (const f of res.records) names.add(f.QualifiedApiName.toLowerCase());
  return names;
}

export type PlannedAction = 'create' | 'unchanged' | 'conflict';

/** Decides what import would do for one policy, given whether it already exists and how it differs. */
export function planAction(existing: PolicySummary | undefined, differences: string[] | undefined): PlannedAction {
  if (!existing) return 'create';
  return differences?.length === 0 ? 'unchanged' : 'conflict';
}
