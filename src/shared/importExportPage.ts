import { Org, SfError } from '@salesforce/core';
import { UiSession } from './uiSession.js';

/**
 * Client for Privacy Center's "Policy Export / Import Tool" page (/policies/importExport.apexp).
 *
 * This is an internal Visualforce page with no documented API. Fields are located by their
 * label/button text, never by their generated j_id names, and anything unexpected fails loudly.
 */
export const IMPORT_EXPORT_PATH = '/policies/importExport.apexp';

type ParsedForm = {
  action: string;
  hidden: URLSearchParams;
  policyIdField: string;
  exportButton: string;
  importButton: string;
  importTextarea: string;
};

export type ImportResult = { success: boolean; message: string };

export class ImportExportPage {
  private constructor(private readonly session: UiSession, private url: string, private html: string) {}

  public static async open(org: Org): Promise<ImportExportPage> {
    const { session, url, html } = await UiSession.open(org, IMPORT_EXPORT_PATH);
    return new ImportExportPage(session, url, html);
  }

  /** Returns the raw export text (base64) for a PrivacyPolicy record Id (8so...). */
  public async exportPolicy(privacyPolicyId: string): Promise<string> {
    const form = parseForm(this.html);
    const body = new URLSearchParams(form.hidden);
    body.set('thePage:theForm:theTabPanel', 'exportTab');
    body.set(form.policyIdField, privacyPolicyId);
    body.set(form.exportButton, 'Export');
    body.set(form.importTextarea, '');
    const { url, html } = await this.session.postForm(new URL(form.action, this.url).toString(), body);
    this.url = url;
    this.html = html;
    const text = decodeEntities(html.match(/id="thePage:theForm:exportedPolicyText"[^>]*>([^<]*)</)?.[1] ?? '').replace(
      /\s/g,
      ''
    );
    if (!text) {
      throw new SfError(
        `Export of policy ${privacyPolicyId} returned no text. Salesforce said: ${pageMessage(html) ?? '(no message)'}`,
        'ExportEmpty'
      );
    }
    return text;
  }

  /** Submits export text (base64) on the Import tab. Callers must validate first. */
  public async importPolicy(policyText: string): Promise<ImportResult> {
    const form = parseForm(this.html);
    const body = new URLSearchParams(form.hidden);
    body.set('thePage:theForm:theTabPanel', 'importTab');
    body.set(form.policyIdField, '');
    body.set(form.importTextarea, policyText);
    body.set(form.importButton, 'Import');
    const { url, html } = await this.session.postForm(new URL(form.action, this.url).toString(), body);
    this.url = url;
    this.html = html;
    const message = pageMessage(html);
    return { success: /^Success/i.test(message ?? ''), message: message ?? '(Salesforce returned no message)' };
  }
}

export function parseForm(html: string): ParsedForm {
  const formTag = html.match(/<form\b[^>]*id="thePage:theForm"[^>]*>/)?.[0];
  if (!formTag) {
    throw new SfError(
      'The Policy Export / Import page did not load as expected. Salesforce may have changed it, or your user lacks the "Manage Privacy Center Policies" permission.',
      'PageChanged'
    );
  }
  const inputs = [...html.matchAll(/<input\b[^>]*>/g)].map((m) => m[0]);
  const hidden = new URLSearchParams();
  for (const tag of inputs) {
    const name = attr(tag, 'name');
    if (name && attr(tag, 'type') === 'hidden') hidden.set(name, attr(tag, 'value') ?? '');
  }
  if (!hidden.has('com.salesforce.visualforce.ViewState')) {
    throw new SfError(
      'The Policy Export / Import page has no ViewState. Salesforce may have changed it.',
      'PageChanged'
    );
  }
  const submit = (label: string): string => {
    const tag = inputs.find((t) => attr(t, 'type') === 'submit' && attr(t, 'value') === label);
    const name = tag && attr(tag, 'name');
    if (!name)
      throw new SfError(`The "${label}" button was not found on the Policy Export / Import page.`, 'PageChanged');
    return name;
  };
  const policyIdField = inputs.map((t) => (attr(t, 'type') === 'text' ? attr(t, 'name') : null)).find(Boolean);
  const importTextarea = html.match(/<textarea\b[^>]*name="([^"]+)"/)?.[1];
  if (!policyIdField || !importTextarea) {
    throw new SfError('The Policy Id box or the import text box was not found on the page.', 'PageChanged');
  }
  return {
    action: attr(formTag, 'action') ?? IMPORT_EXPORT_PATH,
    hidden,
    policyIdField,
    exportButton: submit('Export'),
    importButton: submit('Import'),
    importTextarea,
  };
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? decodeEntities(m[1]) : null;
}

/**
 * Reads the page's message box(es). Salesforce renders them as
 * <div class="messageText"><span><h4>Error:</h4></span>the actual reason<br/></div>,
 * so the whole box is read, not just the heading.
 */
export function pageMessage(html: string): string | undefined {
  const boxes = [...html.matchAll(/<div[^>]*class="messageText"[^>]*>([\s\S]*?)<\/div>/g)].map((m) =>
    decodeEntities(m[1].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .replace(/^(Success|Error|Warning|Info)\s*:\s*/i, '$1: ')
      .trim()
  );
  return boxes.filter(Boolean).join(' | ') || undefined;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
