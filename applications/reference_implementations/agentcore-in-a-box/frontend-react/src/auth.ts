/**
 * Cognito Hosted UI auth using the OAuth2 authorization-code flow with PKCE
 * (public SPA client, no secret). Ported ~verbatim from the original frontend/auth.js.
 *
 * Why Hosted UI (not direct USER_PASSWORD_AUTH): logging in through the Hosted UI
 * establishes a Cognito session cookie on the auth domain, which the 3-legged (3LO)
 * consent step reuses — so the user signs in once and the positions/trade
 * authorization is seamless, with consistent token/identity binding.
 */
export interface AppConfig {
  REGION: string;
  USER_POOL_ID: string;
  USER_POOL_CLIENT_ID: string;
  API_URL: string;
  WS_URL: string;
  AGUI_URL: string;
  IDENTITY_POOL_ID: string;
  COGNITO_DOMAIN: string;
  REDIRECT_URI: string;
  /** The AWS account the stack is deployed in — with REGION, all a console deep-link needs. */
  ACCOUNT_ID?: string;
  /** Resolved AgentCore resource ids (deploy.sh injects these). Optional so an older config.js —
   * or a dev build without them — degrades gracefully: the rail just won't deep-link. */
  AGENTCORE?: Partial<Record<
    'runtime_id' | 'runtime_version' | 'gateway_id' | 'memory_id' | 'policy_engine_id' | 'browser_id'
    | 'code_interpreter_id' | 'evaluator_id' | 'registry_id' | 'harness_id', string
  >>;
}

declare global {
  interface Window {
    APP_CONFIG: AppConfig;
  }
}

export class Auth {
  region: string;
  clientId: string;
  domain: string;
  redirectUri: string;
  scopes = 'openid email profile';
  idToken: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  user: any;

  constructor(config: AppConfig) {
    this.region = config.REGION;
    this.clientId = config.USER_POOL_CLIENT_ID;
    this.domain = config.COGNITO_DOMAIN; // e.g. https://xxx.auth.us-west-2.amazoncognito.com
    this.redirectUri = config.REDIRECT_URI; // e.g. https://dxxxx.cloudfront.net/
    this.idToken = localStorage.getItem('idToken');
    this.accessToken = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');
    this.user = this.idToken ? this.parseToken(this.idToken) : null;
  }

  // ---- PKCE helpers ----
  private _b64url(bytes: ArrayBuffer | Uint8Array): string {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    return btoa(String.fromCharCode(...arr))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
  private async _sha256(str: string): Promise<string> {
    return this._b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)));
  }
  private _randomString(len = 64): string {
    const a = new Uint8Array(len);
    crypto.getRandomValues(a);
    return this._b64url(a).slice(0, len);
  }

  /**
   * Redirect the browser to the Hosted UI login page.
   *
   * Optional loginHint pre-fills the Cognito Hosted UI's email/username field
   * (the standard OIDC `login_hint` parameter). The password field still has
   * to be typed/pasted by the user — no OAuth parameter can pre-fill it, and
   * the Hosted UI runs on a different origin so we can't inject it from JS.
   *
   * Used by the AVA persona picker: click a card → email is pre-filled → user
   * pastes the shared demo password → Cognito sets the session cookie → 3-legged
   * consent (positions_view / trade_execute) silently reuses that cookie on
   * subsequent restricted-tool calls.
   */
  async login(loginHint?: string): Promise<void> {
    const verifier = this._randomString();
    const challenge = await this._sha256(verifier);
    sessionStorage.setItem('pkce_verifier', verifier);
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      scope: this.scopes,
      redirect_uri: this.redirectUri,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    if (loginHint) params.set('login_hint', loginHint);
    window.location.href = `${this.domain}/oauth2/authorize?${params}`;
  }

  /** If we returned from Hosted UI with ?code=, exchange it for tokens. */
  async handleRedirect(): Promise<boolean> {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    if (!code) return false;

    const verifier = sessionStorage.getItem('pkce_verifier');
    // Clear the code from the address bar regardless of outcome.
    window.history.replaceState({}, document.title, this.redirectUri);

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      code,
      redirect_uri: this.redirectUri,
      code_verifier: verifier || '',
    });
    const resp = await fetch(`${this.domain}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await resp.json();
    if (!resp.ok || data.error) {
      throw new Error(data.error_description || data.error || 'Token exchange failed');
    }
    sessionStorage.removeItem('pkce_verifier');
    this.setTokens({ IdToken: data.id_token, AccessToken: data.access_token, RefreshToken: data.refresh_token });
    this.user = this.idToken ? this.parseToken(this.idToken) : null;
    return true;
  }

  setTokens(result: { IdToken: string; AccessToken: string; RefreshToken?: string }): void {
    this.idToken = result.IdToken;
    this.accessToken = result.AccessToken;
    this.refreshToken = result.RefreshToken || null;
    localStorage.setItem('idToken', this.idToken);
    localStorage.setItem('accessToken', this.accessToken);
    if (this.refreshToken) localStorage.setItem('refreshToken', this.refreshToken);
  }

  parseToken(token: string): any {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  }

  getIdToken(): string | null {
    return this.idToken;
  }

  getAccessToken(): string | null {
    // The runtime's customJWTAuthorizer validates the ACCESS token's client_id
    // against its allowedClients, so the bridge/bearer path uses this token.
    return this.accessToken;
  }

  getUser(): any {
    return this.user;
  }

  /** Clear local tokens AND the Hosted UI session cookie (full logout). */
  signOut(): void {
    this.idToken = null;
    this.accessToken = null;
    this.refreshToken = null;
    this.user = null;
    localStorage.removeItem('idToken');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    // Demo reset: a logout marks the end of a demo. Force the NEXT positions/trade
    // request (next login) to re-run the 3LO consent so the link is shown fresh for
    // the next customer. Cleared once the consent prompt fires, so it never
    // re-triggers mid-demo. (AgentCore has no vault-revoke API; the agent honors this
    // by passing force_authentication=True on the vend.)
    localStorage.setItem('forceReauthGrades', '1');
    const params = new URLSearchParams({ client_id: this.clientId, logout_uri: this.redirectUri });
    window.location.href = `${this.domain}/logout?${params}`;
  }

  isAuthenticated(): boolean {
    if (!this.idToken) return false;
    try {
      const payload = this.parseToken(this.idToken);
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }
}
