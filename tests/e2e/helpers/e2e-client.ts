/**
 * Opaque-Box E2E HTTP Client for AssetPulse
 * 
 * Simulates an independent user agent / browser session:
 * - Maintains cookie jar (including `assetpulse_session`)
 * - Transparently handles JSON serialization / deserialization
 * - Captures status codes, response headers, and bodies
 * - Supports multi-user session isolation (User A vs User B)
 */

export interface HttpResponse<T = any> {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  data: T;
  rawText: string;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean>;
  body?: any;
}

export class E2EClient {
  public baseUrl: string;
  public cookies: Map<string, string> = new Map();

  constructor(baseUrl: string = process.env.APP_URL || process.env.BASE_URL || 'http://localhost:3000') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Set or overwrite a cookie in the client's cookie jar
   */
  public setCookie(name: string, value: string): void {
    this.cookies.set(name, value);
  }

  /**
   * Clear all cookies (simulate logout or new browser)
   */
  public clearCookies(): void {
    this.cookies.clear();
  }

  /**
   * Get formatted Cookie header string
   */
  public getCookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  /**
   * Ingest Set-Cookie headers from server responses
   */
  private ingestSetCookie(setCookieHeader: string | string[] | null | undefined): void {
    if (!setCookieHeader) return;
    const headersList = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    for (const h of headersList) {
      const parts = h.split(';')[0].split('=');
      if (parts.length >= 2) {
        const name = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        if (value === '' || h.toLowerCase().includes('max-age=0')) {
          this.cookies.delete(name);
        } else {
          this.cookies.set(name, value);
        }
      }
    }
  }

  /**
   * Core request dispatcher
   */
  public async request<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<HttpResponse<T>> {
    const urlObj = new URL(endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`);
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined && v !== null) {
          urlObj.searchParams.set(k, String(v));
        }
      }
    }

    const headers: Record<string, string> = {
      Accept: 'application/json, text/plain, */*',
      ...options.headers,
    };

    const cookieHeader = this.getCookieHeader();
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    let bodyStr: string | undefined = undefined;
    if (options.body !== undefined) {
      if (typeof options.body === 'object') {
        headers['Content-Type'] = 'application/json';
        bodyStr = JSON.stringify(options.body);
      } else {
        bodyStr = String(options.body);
      }
    }

    try {
      const res = await fetch(urlObj.toString(), {
        method,
        headers,
        body: bodyStr,
        redirect: 'manual',
      });

      const rawText = await res.text();
      let data: any = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        data = rawText;
      }

      // Collect response headers
      const resHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        resHeaders[k.toLowerCase()] = v;
      });

      // Handle Set-Cookie
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) {
        this.ingestSetCookie(setCookie);
      }

      return {
        status: res.status,
        ok: res.ok,
        headers: resHeaders,
        data,
        rawText,
      };
    } catch (err: any) {
      // In environment where server is offline or connection fails, return synthetic network error
      return {
        status: 503,
        ok: false,
        headers: {},
        data: { error: 'Network Connection Refused or Server Offline', details: err.message } as any,
        rawText: err.message,
      };
    }
  }

  public get<T = any>(endpoint: string, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>('GET', endpoint, options);
  }

  public post<T = any>(endpoint: string, body?: any, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>('POST', endpoint, { ...options, body });
  }

  public put<T = any>(endpoint: string, body?: any, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>('PUT', endpoint, { ...options, body });
  }

  public patch<T = any>(endpoint: string, body?: any, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>('PATCH', endpoint, { ...options, body });
  }

  public delete<T = any>(endpoint: string, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>('DELETE', endpoint, options);
  }
}
