// ── Utilities ────────────────────────────────────────────────────
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtTime(ms) {
  const s = Math.floor((ms || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function $(id) { return document.getElementById(id); }

// ── App ──────────────────────────────────────────────────────────
const App = {
  user: null,
  playlists: [],
  shuffle: false,
  repeat: 'off',
  _progressInterval: null,
  _isSeeking: false,
  _currentDuration: 0,

  // ── Init ──────────────────────────────────────────────────────
  async init() {
    if (CONFIG.CLIENT_ID === 'YOUR_CLIENT_ID_HERE') {
      this._showSetupMessage();
      return;
    }

    if (location.search.includes('code=') || location.search.includes('error=')) {
      try {
        await Auth.handleCallback();
      } catch (e) {
        this._showError('Erreur de connexion', e.message);
        return;
      }
    }

    if (!Auth.isLoggedIn()) {
      this._showLogin();
      return;
    }

    this._showApp();
    this._bindEvents();

    try {
      await Promise.all([this._loadUserData(), this._initPlayer()]);
    } catch (e) {
      this.toast('⚠ ' + e.message, 6000);
    }

    this.navigate('home');
    this._startProgressTimer();
  },

  async _initPlayer() {
    try {
      const deviceId = await Player.init();
      await API.transferPlayback(deviceId, false);
    } catch (e) {
      this.toast('Lecteur: ' + e.message, 8000);
    }
  },

  async _loadUserData() {
    const [me, playlists] = await Promise.all([
      API.getMe(),
      API.getPlaylists(),
    ]);
    this.user = me;
    this.playlists = playlists.items || [];
    $('user-name').textContent = me.display_name || me.id;
    this._renderSidebarPlaylists();
  },

  // ── Sidebar ───────────────────────────────────────────────────
  _renderSidebarPlaylists() {
    const list = $('sidebar-playlists');
    list.innerHTML = '';

    const liked = document.createElement('div');
    liked.className = 'pl-item';
    liked.dataset.id = 'liked';
    liked.innerHTML = `<span class="pl-icon">♥</span> Titres likés`;
    liked.onclick = () => this.navigate('liked');
    list.appendChild(liked);

    this.playlists.forEach(pl => {
      const item = document.createElement('div');
      item.className = 'pl-item';
      item.dataset.id = pl.id;
      item.textContent = pl.name;
      item.onclick = () => this.navigate('playlist', pl);
      list.appendChild(item);
    });
  },

  // ── Navigation ────────────────────────────────────────────────
  async navigate(view, data = null) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    document.querySelectorAll('.pl-item').forEach(p =>
      p.classList.toggle('active',
        data ? p.dataset.id === (data.id || data) : p.dataset.id === view
      )
    );

    switch (view) {
      case 'home':
        document.querySelector('.nav-item[data-view="home"]')?.classList.add('active');
        await this._renderHome();
        $('view-home').classList.remove('hidden');
        break;

      case 'search':
        document.querySelector('.nav-item[data-view="search"]')?.classList.add('active');
        $('view-search').classList.remove('hidden');
        $('search-input').focus();
        break;

      case 'playlist':
        await this._renderPlaylist(data);
        $('view-playlist').classList.remove('hidden');
        break;

      case 'liked':
        await this._renderLikedSongs();
        $('view-playlist').classList.remove('hidden');
        break;
    }
  },

  // ── Home ──────────────────────────────────────────────────────
  async _renderHome() {
    const el = $('view-home');
    el.innerHTML = '<div class="spinner"></div>';

    try {
      const [recent, top] = await Promise.all([
        API.getRecentlyPlayed(),
        API.getTopTracks(),
      ]);

      const seen = new Set();
      const recentTracks = (recent.items || [])
        .filter(({ track }) => track && !seen.has(track.id) && seen.add(track.id))
        .slice(0, 8);

      el.innerHTML = `
        <div class="home-section">
          <h2 class="section-title">Récemment joués</h2>
          <div class="cards-grid" id="recent-grid"></div>
        </div>
        <div class="home-section">
          <h2 class="section-title">Vos top titres</h2>
          <div class="cards-grid" id="top-grid"></div>
        </div>
        <div class="home-section">
          <h2 class="section-title">Mes playlists</h2>
          <div class="cards-grid" id="pl-grid"></div>
        </div>
      `;

      recentTracks.forEach(({ track }) =>
        $('recent-grid').appendChild(this._trackCard(track)));

      (top.items || []).slice(0, 8).forEach(track =>
        $('top-grid').appendChild(this._trackCard(track)));

      this.playlists.slice(0, 8).forEach(pl =>
        $('pl-grid').appendChild(this._playlistCard(pl)));

    } catch (e) {
      el.innerHTML = `<p class="empty">Erreur: ${esc(e.message)}</p>`;
    }
  },

  _trackCard(track) {
    const art = track.album?.images[0]?.url || '';
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <img class="card-art" src="${esc(art)}" alt="" loading="lazy">
      <div class="card-title">${esc(track.name)}</div>
      <div class="card-subtitle">${esc(track.artists.map(a => a.name).join(', '))}</div>
      <button class="card-play-btn" title="Lire">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
      </button>
    `;
    const play = () => this._playTrack(track.uri);
    card.querySelector('.card-play-btn').onclick = (e) => { e.stopPropagation(); play(); };
    card.ondblclick = play;
    return card;
  },

  _playlistCard(pl) {
    const art = pl.images?.[0]?.url || '';
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      ${art
        ? `<img class="card-art" src="${esc(art)}" alt="" loading="lazy">`
        : `<div class="card-art card-art-placeholder">♪</div>`
      }
      <div class="card-title">${esc(pl.name)}</div>
      <div class="card-subtitle">${esc(pl.description || `${pl.tracks?.total || 0} titres`)}</div>
      <button class="card-play-btn" title="Lire">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
      </button>
    `;
    card.querySelector('.card-play-btn').onclick = (e) => {
      e.stopPropagation();
      this._playContext(pl.uri);
    };
    card.onclick = () => this.navigate('playlist', pl);
    return card;
  },

  // ── Playlist View ─────────────────────────────────────────────
  async _renderPlaylist(pl) {
    const el = $('view-playlist');
    el.innerHTML = '<div class="spinner"></div>';

    try {
      const data = await API.getPlaylistTracks(pl.id);
      const tracks = (data.items || []).filter(i => i?.track?.type === 'track');
      const art = pl.images?.[0]?.url || '';
      const uris = tracks.map(t => t.track.uri);

      el.innerHTML = `
        <div class="content-header">
          ${art
            ? `<img class="header-art" src="${esc(art)}" alt="">`
            : `<div class="header-art header-art-placeholder">♪</div>`
          }
          <div class="header-info">
            <div class="header-type">PLAYLIST</div>
            <h1 class="header-title">${esc(pl.name)}</h1>
            ${pl.description ? `<div class="header-desc">${esc(pl.description)}</div>` : ''}
            <div class="header-meta">${tracks.length} titres</div>
          </div>
        </div>
        <div class="content-actions">
          <button class="btn-play-large" id="ctx-play-btn">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
        <div class="track-list">
          <div class="track-list-header">
            <span>#</span><span>Titre</span><span>Album</span><span>⏱</span>
          </div>
          <div id="track-items"></div>
        </div>
      `;

      $('ctx-play-btn').onclick = () => this._playContext(pl.uri);

      const container = $('track-items');
      tracks.forEach(({ track }, i) =>
        container.appendChild(this._trackItem(track, i + 1, pl.uri, uris)));

    } catch (e) {
      el.innerHTML = `<p class="empty">Erreur: ${esc(e.message)}</p>`;
    }
  },

  async _renderLikedSongs() {
    const el = $('view-playlist');
    el.innerHTML = '<div class="spinner"></div>';

    try {
      const data = await API.getLikedSongs();
      const tracks = data.items || [];

      el.innerHTML = `
        <div class="content-header liked-header">
          <div class="header-art liked-art">♥</div>
          <div class="header-info">
            <div class="header-type">PLAYLIST</div>
            <h1 class="header-title">Titres likés</h1>
            <div class="header-meta">${data.total} titres</div>
          </div>
        </div>
        <div class="content-actions">
          <button class="btn-play-large" id="ctx-play-btn">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
        <div class="track-list">
          <div class="track-list-header">
            <span>#</span><span>Titre</span><span>Album</span><span>⏱</span>
          </div>
          <div id="track-items"></div>
        </div>
      `;

      const uris = tracks.map(t => t.track?.uri).filter(Boolean);
      $('ctx-play-btn').onclick = () => {
        if (uris[0]) this._playTrackList(uris, 0);
      };

      const container = $('track-items');
      tracks.forEach(({ track }, i) => {
        if (track) container.appendChild(this._trackItem(track, i + 1, null, uris));
      });

    } catch (e) {
      el.innerHTML = `<p class="empty">Erreur: ${esc(e.message)}</p>`;
    }
  },

  _trackItem(track, num, contextUri, uris) {
    const art = track.album?.images[track.album.images.length - 1]?.url || '';
    const item = document.createElement('div');
    item.className = 'track-item';
    item.dataset.id = track.id;
    item.innerHTML = `
      <div class="track-num-cell">
        <span class="track-num">${num}</span>
        <span class="track-play-icon">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </span>
      </div>
      <div class="track-info">
        ${art ? `<img class="track-art" src="${esc(art)}" alt="" loading="lazy">` : '<div class="track-art track-art-ph">♪</div>'}
        <div class="track-details">
          <div class="track-name">${esc(track.name)}</div>
          <div class="track-artist">${esc(track.artists.map(a => a.name).join(', '))}</div>
        </div>
      </div>
      <div class="track-album">${esc(track.album?.name || '')}</div>
      <div class="track-duration">${fmtTime(track.duration_ms)}</div>
    `;

    const play = () => {
      if (contextUri) {
        this._playContext(contextUri, track.uri);
      } else if (uris) {
        this._playTrackList(uris, uris.indexOf(track.uri));
      } else {
        this._playTrack(track.uri);
      }
    };

    item.ondblclick = play;
    item.querySelector('.track-play-icon').onclick = (e) => { e.stopPropagation(); play(); };
    return item;
  },

  // ── Playback ──────────────────────────────────────────────────
  async _playTrack(uri) {
    if (!Player.deviceId) { this.toast('Lecteur non prêt'); return; }
    try { await API.play(Player.deviceId, { uris: [uri] }); }
    catch (e) { this.toast('Erreur: ' + e.message); }
  },

  async _playTrackList(uris, offset = 0) {
    if (!Player.deviceId) { this.toast('Lecteur non prêt'); return; }
    try { await API.play(Player.deviceId, { uris, offset: { position: offset } }); }
    catch (e) { this.toast('Erreur: ' + e.message); }
  },

  async _playContext(contextUri, trackUri = null) {
    if (!Player.deviceId) { this.toast('Lecteur non prêt'); return; }
    try {
      const body = { context_uri: contextUri };
      if (trackUri) body.offset = { uri: trackUri };
      await API.play(Player.deviceId, body);
    } catch (e) { this.toast('Erreur: ' + e.message); }
  },

  // ── Player State ──────────────────────────────────────────────
  onStateChange(state) {
    if (!state) return;
    const track = state.track_window.current_track;

    $('np-art').src = track.album.images[0]?.url || '';
    $('np-name').textContent = track.name;
    $('np-artist').textContent = track.artists.map(a => a.name).join(', ');
    $('np-art').parentElement.classList.remove('hidden');

    const playing = !state.paused;
    $('icon-play').classList.toggle('hidden', playing);
    $('icon-pause').classList.toggle('hidden', !playing);

    this.shuffle = state.shuffle;
    this.repeat = ['off', 'context', 'track'][state.repeat_mode];
    $('btn-shuffle').classList.toggle('active', state.shuffle);
    $('btn-repeat').classList.toggle('active', state.repeat_mode > 0);
    $('btn-repeat').title = state.repeat_mode === 2 ? 'Répéter (1)' : 'Répéter';

    this._currentDuration = track.duration_ms;
    this._updateProgress(state.position, track.duration_ms);

    document.querySelectorAll('.track-item').forEach(item =>
      item.classList.toggle('playing', item.dataset.id === track.id));
  },

  _updateProgress(position, duration) {
    const pct = duration ? (position / duration) * 100 : 0;
    $('progress-fill').style.width = `${pct}%`;
    $('time-current').textContent = fmtTime(position);
    $('time-total').textContent = fmtTime(duration);
  },

  _startProgressTimer() {
    this._progressInterval = setInterval(async () => {
      if (this._isSeeking) return;
      const state = await Player.getState();
      if (state && !state.paused) {
        this._updateProgress(
          state.position,
          state.track_window.current_track.duration_ms
        );
      }
    }, 1000);
  },

  // ── Search ────────────────────────────────────────────────────
  async _performSearch(query) {
    const results = $('search-results');
    if (!query.trim()) { results.innerHTML = ''; return; }

    results.innerHTML = '<div class="spinner"></div>';
    try {
      const data = await API.search(query);
      results.innerHTML = '';

      if (data.tracks?.items?.length) {
        const section = document.createElement('div');
        section.innerHTML = '<h2 class="section-title">Titres</h2>';
        const list = document.createElement('div');
        data.tracks.items.forEach((track, i) =>
          list.appendChild(this._trackItem(track, i + 1, null, data.tracks.items.map(t => t.uri))));
        section.appendChild(list);
        results.appendChild(section);
      }

      if (data.playlists?.items?.length) {
        const section = document.createElement('div');
        section.innerHTML = '<h2 class="section-title" style="margin-top:2rem">Playlists</h2>';
        const grid = document.createElement('div');
        grid.className = 'cards-grid';
        data.playlists.items.filter(Boolean).forEach(pl =>
          grid.appendChild(this._playlistCard(pl)));
        section.appendChild(grid);
        results.appendChild(section);
      }

      if (!results.children.length) {
        results.innerHTML = `<p class="empty">Aucun résultat pour « ${esc(query)} »</p>`;
      }
    } catch (e) {
      results.innerHTML = `<p class="empty">Erreur: ${esc(e.message)}</p>`;
    }
  },

  // ── Event Binding ─────────────────────────────────────────────
  _bindEvents() {
    $('login-btn').onclick = () => Auth.login();
    $('logout-btn').onclick = () => Auth.logout();

    document.querySelectorAll('.nav-item').forEach(item =>
      item.onclick = () => this.navigate(item.dataset.view));

    $('btn-play').onclick = () => Player.togglePlay();
    $('btn-next').onclick = () => Player.next();
    $('btn-prev').onclick = () => Player.prev();

    $('btn-shuffle').onclick = async () => {
      this.shuffle = !this.shuffle;
      await API.setShuffle(this.shuffle).catch(() => {});
      $('btn-shuffle').classList.toggle('active', this.shuffle);
    };

    $('btn-repeat').onclick = async () => {
      const cycle = { off: 'context', context: 'track', track: 'off' };
      this.repeat = cycle[this.repeat];
      await API.setRepeat(this.repeat).catch(() => {});
      $('btn-repeat').classList.toggle('active', this.repeat !== 'off');
    };

    const progressBar = $('progress-bar');
    progressBar.onclick = async (e) => {
      const rect = progressBar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const ms = Math.floor(pct * this._currentDuration);
      this._isSeeking = true;
      this._updateProgress(ms, this._currentDuration);
      await Player.seek(ms);
      setTimeout(() => this._isSeeking = false, 600);
    };

    const vol = $('vol-slider');
    vol.oninput = () => Player.setVolume(vol.value / 100);

    let searchTimer;
    $('search-input').oninput = (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => this._performSearch(e.target.value), 400);
    };

    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Space') { e.preventDefault(); Player.togglePlay(); }
      if (e.code === 'ArrowRight') Player.next();
      if (e.code === 'ArrowLeft') Player.prev();
    });
  },

  // ── Screen helpers ────────────────────────────────────────────
  _showLogin() {
    $('login-screen').classList.remove('hidden');
    $('app-screen').classList.add('hidden');
    $('player-bar').classList.add('hidden');
  },

  _showApp() {
    $('login-screen').classList.add('hidden');
    $('app-screen').classList.remove('hidden');
    $('player-bar').classList.remove('hidden');
  },

  _showSetupMessage() {
    $('login-screen').innerHTML = `
      <div class="login-container">
        <div class="login-logo">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 168 168"><path d="M84 0C37.7 0 0 37.7 0 84s37.7 84 84 84 84-37.7 84-84S130.3 0 84 0zm38.6 121.2c-1.5 2.5-4.8 3.3-7.3 1.8-20-12.2-45.2-15-74.9-8.2-2.9.7-5.7-1.1-6.4-4-.7-2.9 1.1-5.7 4-6.4 32.5-7.4 60.4-4.2 82.9 9.5 2.5 1.5 3.3 4.8 1.7 7.3zm10.3-22.9c-1.9 3.1-6 4.1-9.1 2.2-22.9-14.1-57.8-18.1-84.9-9.9-3.5 1.1-7.2-1-8.2-4.4-1.1-3.5 1-7.2 4.4-8.2 30.9-9.4 69.3-4.8 95.6 11.2 3.1 1.9 4.1 6 2.2 9.1zm.9-23.8c-27.4-16.3-72.7-17.8-98.9-9.8-4.2 1.3-8.6-1.1-9.8-5.2-1.3-4.2 1.1-8.6 5.2-9.8 30-9.1 79.8-7.4 111.3 11.3 3.8 2.2 5 7.1 2.7 10.9-2.2 3.7-7.1 5-10.9 2.7l.4-.1z"/></svg>
          <h1>MySpotify</h1>
        </div>
        <div class="setup-card">
          <h2>⚙ Configuration requise</h2>
          <p>Ouvre <strong>js/config.js</strong> et remplace <code>YOUR_CLIENT_ID_HERE</code> par ton Client ID Spotify.</p>
          <ol>
            <li>Va sur <strong>developer.spotify.com/dashboard</strong></li>
            <li>Crée une application (Web API + Web Playback SDK)</li>
            <li>Ajoute ce Redirect URI dans les settings de l'app :<br>
              <code id="redir-uri"></code>
            </li>
            <li>Copie le Client ID dans <strong>js/config.js</strong></li>
          </ol>
        </div>
      </div>
    `;
    $('redir-uri').textContent = CONFIG.REDIRECT_URI;
  },

  _showError(title, msg) {
    $('login-screen').innerHTML = `
      <div class="login-container">
        <div class="setup-card" style="border-color:#f15e6c">
          <h2 style="color:#f15e6c">${esc(title)}</h2>
          <p>${esc(msg)}</p>
          <button onclick="location.href=location.pathname" class="btn-login" style="margin-top:1.5rem">Réessayer</button>
        </div>
      </div>
    `;
  },

  toast(msg, duration = 3000) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), duration);
  },
};

App.init();
