import { SfError } from '@salesforce/core';

/**
 * The policy as stored in Git: the decoded export JSON with org-specific record IDs removed,
 * keys sorted, 2-space indent, trailing newline, so diffs stay clean.
 */
export type PolicyDocument = {
  name: string;
  developerName: string;
  type: string;
  status: string;
  apiVersion: number;
  objects: PolicyObject[];
  [key: string]: unknown;
};

export type PolicyObject = {
  objectReference: string;
  /** On a child object: its lookup field to the parent object. */
  fieldReference?: string | null;
  /** Child objects (e.g. in RTBF policies), processed through their lookup to this object. */
  objects?: PolicyObject[];
  fields?: Array<{ fieldReference: string; [key: string]: unknown }>;
  rawFilterCriteria?: FilterCriteria | null;
  [key: string]: unknown;
};

export type FilterCriteria = {
  objectReference?: string | null;
  fieldReference?: string | null;
  filters?: FilterCriteria[];
  [key: string]: unknown;
};

/** Source-org record IDs present in Salesforce's export. They mean nothing in another org. */
const TOP_LEVEL_ID_KEYS = ['policyId', 'policyVersionId', 'rtbfRequestId'];
const OBJECT_ID_KEYS = ['privacyPolicyObjectId', 'privacyPolicyVersion', 'parentObject'];
const FIELD_ID_KEYS = ['id', 'privacyPolicyVersion'];

const SALESFORCE_ID = /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/;

export function decodeExport(base64: string): PolicyDocument {
  let doc: unknown;
  try {
    doc = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  } catch {
    throw new SfError(
      'The exported policy text is not base64-encoded JSON. Salesforce may have changed the format.',
      'BadExportFormat'
    );
  }
  assertPolicy(doc);
  return doc;
}

export function encodeForImport(doc: PolicyDocument): string {
  return Buffer.from(JSON.stringify(doc), 'utf8').toString('base64');
}

/** Removes org-specific IDs and fails if any record-ID-looking value is left (e.g. in a filter). */
export function sanitize(doc: PolicyDocument): PolicyDocument {
  const clean = structuredClone(doc);
  for (const key of TOP_LEVEL_ID_KEYS) delete clean[key];
  for (const obj of allObjects(clean)) {
    for (const key of OBJECT_ID_KEYS) delete obj[key];
    for (const field of obj.fields ?? []) for (const key of FIELD_ID_KEYS) delete field[key];
  }
  const leftovers = findRecordIds(clean);
  if (leftovers.length) {
    throw new SfError(
      `Policy "${doc.developerName}" contains values that look like record IDs: ${leftovers.join(', ')}. ` +
        'Record IDs differ between orgs, so this policy cannot be migrated as-is.',
      'RecordIdInPolicy',
      ['Remove filters that target specific records or record types, then export again.']
    );
  }
  return clean;
}

/**
 * Puts back the record IDs that Salesforce's own export carries, as consistent placeholders:
 * one per object, field, and version, with each child's parentObject pointing at its parent's.
 * The manual Export/Import flow already sends foreign IDs into the target org, so this mirrors it.
 */
export function withPlaceholderIds(doc: PolicyDocument): PolicyDocument {
  const out = structuredClone(doc);
  let counter = 0;
  const next = (prefix: string): string => toId18(prefix + String(++counter).padStart(12, '0'));
  const versionId = next('8sn');
  out.policyId = next('8sk');
  out.policyVersionId = versionId;
  out.rtbfRequestId = null;
  const visit = (objects: PolicyObject[] | undefined, parentId: string | null): void => {
    for (const obj of objects ?? []) {
      const id = next('8sl');
      obj.privacyPolicyObjectId = id;
      obj.privacyPolicyVersion = versionId;
      if (parentId) obj.parentObject = parentId;
      for (const field of obj.fields ?? []) {
        field.id = next('8sm');
        field.privacyPolicyVersion = null;
      }
      visit(obj.objects, id);
    }
  };
  visit(out.objects, null);
  return out;
}

/** Every object in the policy, including nested child objects. */
export function allObjects(doc: PolicyDocument): PolicyObject[] {
  const out: PolicyObject[] = [];
  const visit = (objects: PolicyObject[] | undefined): void => {
    for (const o of objects ?? []) {
      out.push(o);
      visit(o.objects);
    }
  };
  visit(doc.objects);
  return out;
}

/** Converts a 15-character Salesforce ID to its 18-character case-safe form. */
export function toId18(id15: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
  let suffix = '';
  for (let chunk = 0; chunk < 3; chunk++) {
    let bits = 0;
    for (let i = 0; i < 5; i++) if (/[A-Z]/.test(id15[chunk * 5 + i])) bits |= 1 << i;
    suffix += chars[bits];
  }
  return id15 + suffix;
}

export function toFileContent(doc: PolicyDocument): string {
  return JSON.stringify(sortKeys(doc), null, 2) + '\n';
}

export function parseFile(content: string, fileName: string): PolicyDocument {
  let doc: unknown;
  try {
    doc = JSON.parse(content);
  } catch (e) {
    throw new SfError(`${fileName} is not valid JSON: ${(e as Error).message}`, 'BadPolicyFile');
  }
  assertPolicy(doc, fileName);
  return doc;
}

/** Every object and field API name the policy references, including in filters. */
export function referencedSchema(doc: PolicyDocument): Map<string, Set<string>> {
  const refs = new Map<string, Set<string>>();
  const add = (object?: string | null, field?: string | null): void => {
    if (!object) return;
    if (!refs.has(object)) refs.set(object, new Set());
    if (field) refs.get(object)!.add(field);
  };
  const walk = (c: FilterCriteria | null | undefined, fallbackObject: string): void => {
    if (!c) return;
    add(c.objectReference ?? fallbackObject, c.fieldReference);
    for (const f of c.filters ?? []) walk(f, c.objectReference ?? fallbackObject);
  };
  for (const obj of allObjects(doc)) {
    add(obj.objectReference, obj.fieldReference);
    for (const f of obj.fields ?? []) add(obj.objectReference, f.fieldReference);
    walk(obj.rawFilterCriteria, obj.objectReference);
  }
  return refs;
}

function findRecordIds(value: unknown, path = '$'): string[] {
  if (typeof value === 'string') {
    return SALESFORCE_ID.test(value) && /\d/.test(value) && /[A-Z]/.test(value) ? [`${path}=${value}`] : [];
  }
  if (Array.isArray(value)) return value.flatMap((v, i) => findRecordIds(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => findRecordIds(v, `${path}.${k}`));
  }
  return [];
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])])
    );
  }
  return value;
}

function assertPolicy(doc: unknown, source = 'Exported policy'): asserts doc is PolicyDocument {
  const d = doc as Partial<PolicyDocument> | null;
  if (!d || typeof d !== 'object' || typeof d.developerName !== 'string' || !Array.isArray(d.objects)) {
    throw new SfError(
      `${source} is missing developerName or objects; it is not a Privacy Center policy.`,
      'BadPolicyFile'
    );
  }
}
