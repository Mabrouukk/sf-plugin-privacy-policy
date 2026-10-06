import { expect } from 'chai';
import {
  allObjects,
  decodeExport,
  encodeForImport,
  PolicyDocument,
  referencedSchema,
  sanitize,
  toFileContent,
  toId18,
  withPlaceholderIds,
} from '../../src/shared/policyFile.js';
import { diffPolicies } from '../../src/shared/compare.js';

// Shaped like a real RTBF export: a parent object with a child reached through a lookup field.
// All values are invented; no real customer data.
function sampleExport(): PolicyDocument {
  return {
    name: 'Sample RTBF',
    developerName: 'Sample_RTBF',
    type: 'rtbf',
    status: 'active',
    apiVersion: 67.0,
    policyId: '8skXX0000000001AAA',
    policyVersionId: '8snXX0000000001AAA',
    rtbfRequestId: null,
    objects: [
      {
        objectReference: 'Account',
        privacyPolicyObjectId: '8slXX0000000001AAA',
        privacyPolicyVersion: '8snXX0000000001AAA',
        fields: [{ id: '8smXX0000000001AAA', fieldReference: 'Phone', maskingCategory: 'delete' }],
        rawFilterCriteria: {
          objectReference: 'Account',
          filters: [{ objectReference: 'Account', fieldReference: 'Industry', filterValue: 'Retail' }],
        },
        objects: [
          {
            objectReference: 'Order',
            fieldReference: 'AccountId',
            parentObject: '8slXX0000000001AAA',
            privacyPolicyObjectId: '8slXX0000000002AAA',
            privacyPolicyVersion: '8snXX0000000001AAA',
            fields: [{ id: '8smXX0000000002AAA', fieldReference: 'BillingStreet', maskingCategory: 'replaceRandom' }],
          },
        ],
      },
    ],
  };
}

describe('policyFile', () => {
  it('round-trips through base64 like the Export page', () => {
    const doc = sampleExport();
    expect(decodeExport(encodeForImport(doc))).to.deep.equal(doc);
  });

  it('rejects text that is not a base64 policy', () => {
    expect(() => decodeExport('not base64 json')).to.throw(/not base64-encoded JSON/);
    expect(() => decodeExport(Buffer.from('{"foo":1}').toString('base64'))).to.throw(/not a Privacy Center policy/);
  });

  it('removes every org-specific ID, including in nested child objects', () => {
    const clean = sanitize(sampleExport());
    expect(toFileContent(clean)).to.not.match(/8s[klmn]XX/);
    expect(allObjects(clean).map((o) => o.objectReference)).to.deep.equal(['Account', 'Order']);
    expect(allObjects(clean)[1].fieldReference).to.equal('AccountId');
  });

  it('fails loudly when a filter targets a specific record', () => {
    const doc = sampleExport();
    doc.objects[0].rawFilterCriteria!.filters![0].filterValue = '001XX000003DHPhAAO';
    expect(() => sanitize(doc)).to.throw(/look like record IDs/);
  });

  it('writes sorted keys so the same policy always produces the same file', () => {
    const a = toFileContent(sanitize(sampleExport()));
    const shuffled = Object.fromEntries(Object.entries(sampleExport()).reverse()) as PolicyDocument;
    expect(toFileContent(sanitize(shuffled))).to.equal(a);
    expect(a.endsWith('\n')).to.equal(true);
  });

  it('lists every referenced object and field, including lookups and filters', () => {
    const refs = referencedSchema(sanitize(sampleExport()));
    expect([...refs.get('Account')!].sort()).to.deep.equal(['Industry', 'Phone']);
    expect([...refs.get('Order')!].sort()).to.deep.equal(['AccountId', 'BillingStreet']);
  });

  it('restores consistent placeholder IDs for import, linking each child to its parent', () => {
    const withIds = withPlaceholderIds(sanitize(sampleExport()));
    const [parent, child] = allObjects(withIds);
    expect(parent.privacyPolicyObjectId).to.match(/^8sl\w{15}$/);
    expect(child.parentObject).to.equal(parent.privacyPolicyObjectId);
    expect(child.privacyPolicyVersion).to.equal(withIds.policyVersionId);
    expect(withIds.policyId).to.match(/^8sk/);
  });

  it('computes 18-character IDs the way Salesforce does', () => {
    expect(toId18('8slXA0000000C7d')).to.equal('8slXA0000000C7dYAE');
    expect(toId18('ABCDE00000abcde')).to.equal('ABCDE00000abcde5AA');
    expect(toId18('001000000000000')).to.equal('001000000000000AAA');
  });
});

describe('diffPolicies', () => {
  it('treats policies that differ only in status, release, or IDs as the same', () => {
    const a = sanitize(sampleExport());
    const b = sanitize({ ...sampleExport(), status: 'inactive', apiVersion: 66.0 });
    expect(diffPolicies(a, b)).to.deep.equal([]);
  });

  it('reports the path of a real difference', () => {
    const a = sanitize(sampleExport());
    const b = sanitize(sampleExport());
    b.objects[0].objects![0].fields![0].maskingCategory = 'delete';
    expect(diffPolicies(a, b)).to.deep.equal(['objects[0].objects[0].fields[0].maskingCategory']);
  });
});
