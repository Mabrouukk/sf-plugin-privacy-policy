import { PolicyDocument } from './policyFile.js';

/**
 * Keys ignored when deciding whether two policies are "the same":
 * - status: handled separately (imports are inactive unless --activate)
 * - apiVersion: release stamp of the exporting org, not policy content
 */
const IGNORED_KEYS = new Set(['status', 'apiVersion']);

/** Paths (e.g. "objects[0].fields[2].maskingCategory") whose values differ. Empty = same policy. */
export function diffPolicies(a: PolicyDocument, b: PolicyDocument): string[] {
  return diffValues(a, b, '', true);
}

function diffValues(a: unknown, b: unknown, path: string, topLevel = false): string[] {
  if (Array.isArray(a) && Array.isArray(b)) {
    const out: string[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) out.push(...diffValues(a[i], b[i], `${path}[${i}]`));
    return out;
  }
  if (isObject(a) && isObject(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    return keys
      .filter((k) => !(topLevel && IGNORED_KEYS.has(k)))
      .flatMap((k) => diffValues(a[k], b[k], path ? `${path}.${k}` : k));
  }
  return a === b || (a == null && b == null) ? [] : [path || '(root)'];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
