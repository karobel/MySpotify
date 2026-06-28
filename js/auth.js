const Auth = {
  async login() {
    const verifier = this._generateVerifier();
    const challenge = await this._generateChallenge(verifier);
    sessionStorage.setItem('pkce_verifier', verifier);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CONFIG.CLIENT_ID,
      scope: CONFIG.SCOPES,
      redirect_uri: CONFIG.REDIRECT_URI,
      code_challenge_method: 'S256',
      code_challenge: challenge,
    });

    window.location.href = `https://accounts.spotify.com/authorize?${params}`;
  },

  async handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (error) throw new Error(`Spotify: ${error}`);
    if (!code) return false;

    const verifier = sessionStorage.getItem('pkce_verifier');
    sessionStorage.removeItem('pkce_verifier');

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: CONFIG.REDIRECT_URI,
        client_id: CONFIG.CLIENT_ID,
        code_verifier: verifier,
      }),
    });

    if (!res.ok) throw new Error('Échange de token échoué — vérifie le Client ID et le Redirect URI');
    const data = await res.json();
    this._saveTokens(data);
    history.replaceState(null, '', location.pathname);
    return true;
  },

  async getToken() {
    const expiry = Number(localStorage.getItem('sp_expiry') || 0);
    if (Date.now() > expiry - 60_000) {
      const ok = await this._refresh();
      if (!ok) { this.logout(); return null; }
    }
    return localStorage.getItem('sp_token');
  },

  isLoggedIn() {
    return !!localStorage.getItem('sp_token');
  },

  logout() {
    ['sp_token', 'sp_refresh', 'sp_expiry'].forEach(k => localStorage.removeItem(k));
    location.reload();
  },

  async _refresh() {
    const refresh = localStorage.getItem('sp_refresh');
    if (!refresh) return false;

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh,
        client_id: CONFIG.CLIENT_ID,
      }),
    });

    if (!res.ok) return false;
    this._saveTokens(await res.json());
    return true;
  },

  _saveTokens({ access_token, refresh_token, expires_in }) {
    localStorage.setItem('sp_token', access_token);
    localStorage.setItem('sp_expiry', Date.now() + expires_in * 1000);
    if (refresh_token) localStorage.setItem('sp_refresh', refresh_token);
  },

  _generateVerifier(len = 128) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    return [...crypto.getRandomValues(new Uint8Array(len))]
      .map(x => chars[x % chars.length])
      .join('');
  },

  async _generateChallenge(verifier) {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(verifier)
    );
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  },
};
