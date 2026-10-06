import { Org, SfError } from '@salesforce/core';

/**
 * A browser-like HTTP session (cookie jar) for Salesforce UI pages that have no API.
 * Logs in through the org's frontdoor URL, using the auth the user already has in `sf`.
 * Never sees or stores a password.
 */
export class UiSession {
  private readonly jar = new Map<string, string>();

  private constructor(public baseUrl: string) {}

  public static async open(org: Org, path: string): Promise<{ session: UiSession; url: string; html: string }> {
    const frontDoorUrl = await org.getFrontDoorUrl(path);
    const session = new UiSession(new URL(frontDoorUrl).origin);
    const { url } = await session.request(frontDoorUrl);
    // Frontdoor can answer 200 with a client-side redirect, so request the page explicitly.
    const target = new URL(path, url).toString();
    const page = await session.request(target);
    const jsRedirect = page.html.match(/window\.location\.replace\('([^']+)'\)/)?.[1];
    if (jsRedirect && !page.html.includes('<form')) {
      const where = new URL(jsRedirect, page.url).pathname;
      throw new SfError(`Salesforce sent this user to ${where} instead of ${path}.`, 'UiInterstitial', [
        where.includes('ChangePassword')
          ? 'This user must change their password first. Run "sf org open" for this org, set a new password, then try again.'
          : 'Run "sf org open" for this org, complete what Salesforce asks for, then try again.',
      ]);
    }
    if (!session.jar.has('sid')) {
      throw new SfError('Could not open a UI session for this org (no session cookie returned).', 'UiLoginFailed', [
        'Run "sf org open" against the same org to check that browser login works.',
      ]);
    }
    return { session, ...page };
  }

  public async get(url: string): Promise<{ url: string; html: string }> {
    return this.request(url);
  }

  public async postForm(url: string, form: URLSearchParams): Promise<{ url: string; html: string }> {
    return this.request(url, {
      method: 'POST',
      body: form,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
  }

  private async request(startUrl: string, init: RequestInit = {}): Promise<{ url: string; html: string }> {
    let url = startUrl;
    let options = init;
    for (let hop = 0; hop < 10; hop++) {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(url, {
        ...options,
        redirect: 'manual',
        headers: { ...(options.headers as Record<string, string> | undefined), cookie: this.cookieHeader() },
      });
      this.storeCookies(res);
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        url = new URL(location, url).toString();
        options = {};
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const html = await res.text();
      if (!res.ok) {
        throw new SfError(`Salesforce returned HTTP ${res.status} for ${new URL(url).pathname}.`, 'UiHttpError');
      }
      return { url, html };
    }
    throw new SfError(`Too many redirects while loading ${new URL(startUrl).pathname}.`, 'UiTooManyRedirects');
  }

  private storeCookies(res: Response): void {
    for (const cookie of res.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) this.jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
    }
  }

  private cookieHeader(): string {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}
