import { Connection } from '@salesforce/core';

export type PolicySummary = {
  id: string;
  name: string;
  developerName: string;
  type: string;
  status: string;
  runFrequency: string;
};

type PrivacyPolicyRecord = {
  Id: string;
  Name: string;
  DefinitionDeveloperName: string;
  Type: string;
  Status: string;
  RunFrequency: string;
};

export async function listPolicies(conn: Connection): Promise<PolicySummary[]> {
  const result = await conn.query<PrivacyPolicyRecord>(
    'SELECT Id, Name, DefinitionDeveloperName, Type, Status, RunFrequency FROM PrivacyPolicy ORDER BY DefinitionDeveloperName'
  );
  return result.records.map((r) => ({
    id: r.Id,
    name: r.Name,
    developerName: r.DefinitionDeveloperName,
    type: r.Type,
    status: r.Status,
    runFrequency: r.RunFrequency,
  }));
}
