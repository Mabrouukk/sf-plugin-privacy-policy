import { readFileSync } from 'node:fs';
import { expect } from 'chai';
import { pageMessage, parseForm } from '../../src/shared/importExportPage.js';
import { findInterstitial } from '../../src/shared/uiSession.js';

const page = readFileSync(new URL('../fixtures/importExportPage.html', import.meta.url), 'utf8');

describe('Policy Export / Import page parsing', () => {
  it('finds the form fields by label and button text, not by generated ids', () => {
    const renamed = page
      .replace(/j_id32/g, 'j_id90')
      .replace(/j_id33/g, 'j_id91')
      .replace(/j_id41/g, 'j_id92');
    const form = parseForm(renamed);
    expect(form.policyIdField).to.equal('thePage:theForm:j_id90');
    expect(form.exportButton).to.equal('thePage:theForm:j_id91');
    expect(form.importButton).to.equal('thePage:theForm:j_id92');
    expect(form.importTextarea).to.equal('thePage:theForm:j_id39');
    expect(form.action).to.equal('/policies/importExport.apexp');
  });

  it('collects the ViewState, which sits after the closing form tag, and decodes entities', () => {
    const { hidden } = parseForm(page);
    expect(hidden.get('com.salesforce.visualforce.ViewState')).to.equal('i:INVENTEDVIEWSTATE&=');
    expect(hidden.get('com.salesforce.visualforce.ViewStateCSRF')).to.equal('INVENTEDCSRF');
  });

  it('fails clearly when the page no longer looks like the Export / Import page', () => {
    expect(() => parseForm('<html><body>Something else</body></html>')).to.throw(/did not load as expected/);
    expect(() => parseForm(page.replace(/com\.salesforce\.visualforce\.ViewState"/g, 'x"'))).to.throw(/no ViewState/);
    expect(() => parseForm(page.replace('value="Import"', 'value="Upload"'))).to.throw(/"Import" button was not found/);
  });

  it("reads Salesforce's whole message, not just its heading", () => {
    expect(pageMessage(page)).to.equal(
      'Error: We couldn’t save your policy because it doesn’t include any objects. Add an object and try again.'
    );
    expect(pageMessage('<html><body><form></form></body></html>')).to.equal(undefined);
  });

  it('recognises a change-password redirect instead of the page', () => {
    const redirect =
      "<html><head><script>function redirectOnLoad(){ window.location.replace('/_ui/system/security/ChangePassword?retURL=%2Fpolicies'); }</script></head></html>";
    expect(findInterstitial(redirect, 'https://example.my.salesforce.com/policies/importExport.apexp')).to.equal(
      '/_ui/system/security/ChangePassword'
    );
    expect(findInterstitial(page, 'https://example.my.salesforce.com/policies/importExport.apexp')).to.equal(undefined);
  });
});
