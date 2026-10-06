import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SfError } from '@salesforce/core';
import { parseFile, PolicyDocument } from './policyFile.js';

export type PolicyFile = { path: string; doc: PolicyDocument };

/** Reads every *.json policy file in a directory, sorted by file name. */
export async function readPolicyDir(dir: string): Promise<PolicyFile[]> {
  let names: string[];
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith('.json')).sort();
  } catch {
    throw new SfError(`Cannot read directory ${dir}.`, 'SourceDirNotFound');
  }
  if (!names.length) throw new SfError(`No policy files (*.json) found in ${dir}.`, 'NoPolicyFiles');
  const files = await Promise.all(
    names.map(async (n) => {
      const path = join(dir, n);
      return { path, doc: parseFile(await readFile(path, 'utf8'), path) };
    })
  );
  const seen = new Map<string, string>();
  for (const f of files) {
    const other = seen.get(f.doc.developerName);
    if (other) throw new SfError(`Policy ${f.doc.developerName} is defined twice: ${other} and ${f.path}.`, 'DuplicatePolicy');
    seen.set(f.doc.developerName, f.path);
  }
  return files;
}
