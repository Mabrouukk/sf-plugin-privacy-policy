import { Org } from '@salesforce/core';
import { ImportExportPage } from './importExportPage.js';
import { listPolicies, PolicySummary } from './policies.js';
import { decodeExport, PolicyDocument, sanitize } from './policyFile.js';

/** Lazily exports policies from an org (read-only), opening the export page only when first needed. */
export class OrgPolicies {
  private page?: Promise<ImportExportPage>;

  private constructor(public readonly org: Org, public readonly summaries: PolicySummary[]) {}

  public static async load(org: Org, apiVersion?: string): Promise<OrgPolicies> {
    return new OrgPolicies(org, await listPolicies(org.getConnection(apiVersion)));
  }

  public find(developerName: string): PolicySummary | undefined {
    return this.summaries.find((p) => p.developerName === developerName);
  }

  public async export(summary: PolicySummary): Promise<PolicyDocument> {
    this.page ??= ImportExportPage.open(this.org);
    return sanitize(decodeExport(await (await this.page).exportPolicy(summary.id)));
  }

  public async getPage(): Promise<ImportExportPage> {
    this.page ??= ImportExportPage.open(this.org);
    return this.page;
  }
}
