const API = {
  async _fetch(path, opts = {}) {
    const token = await Auth.getToken();
    if (!token) throw new Error('Non authentifié');

    const res = await fetch(`https://api.spotify.com/v1${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...opts.headers,
      },
    });

    if (res.status === 204) return null;

    if (res.status === 429) {
      const wait = Number(res.headers.get('Retry-After') || 2) * 1000;
      await new Promise(r => setTimeout(r, wait));
      return this._fetch(path, opts);
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API ${res.status}`);
    }

    return res.json();
  },

  getMe: () => API._fetch('/me'),

  getPlaylists: () => API._fetch('/me/playlists?limit=50'),

  getPlaylist: (id) => API._fetch(`/playlists/${id}`),

  getPlaylistTracks: (id, offset = 0) =>
    API._fetch(`/playlists/${id}/tracks?limit=100&offset=${offset}&market=from_token`),

  getLikedSongs: (offset = 0) =>
    API._fetch(`/me/tracks?limit=50&offset=${offset}&market=from_token`),

  getRecentlyPlayed: () =>
    API._fetch('/me/player/recently-played?limit=20'),

  getTopTracks: () =>
    API._fetch('/me/top/tracks?limit=20&time_range=medium_term'),

  search: (q, types = 'track,playlist') =>
    API._fetch(`/search?q=${encodeURIComponent(q)}&type=${types}&limit=20&market=from_token`),

  play: (deviceId, body = {}) =>
    API._fetch(`/me/player/play${deviceId ? `?device_id=${deviceId}` : ''}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  pause: () =>
    API._fetch('/me/player/pause', { method: 'PUT' }),

  next: () =>
    API._fetch('/me/player/next', { method: 'POST' }),

  previous: () =>
    API._fetch('/me/player/previous', { method: 'POST' }),

  seek: (ms) =>
    API._fetch(`/me/player/seek?position_ms=${ms}`, { method: 'PUT' }),

  setVolume: (pct) =>
    API._fetch(`/me/player/volume?volume_percent=${Math.round(pct)}`, { method: 'PUT' }),

  setShuffle: (state) =>
    API._fetch(`/me/player/shuffle?state=${state}`, { method: 'PUT' }),

  setRepeat: (state) =>
    API._fetch(`/me/player/repeat?state=${state}`, { method: 'PUT' }),

  transferPlayback: (deviceId, play = false) =>
    API._fetch('/me/player', {
      method: 'PUT',
      body: JSON.stringify({ device_ids: [deviceId], play }),
    }),

  isTrackSaved: async (id) => {
    const res = await API._fetch(`/me/tracks/contains?ids=${id}`);
    return Array.isArray(res) ? res[0] : false;
  },

  saveTrack: (id) =>
    API._fetch(`/me/tracks?ids=${id}`, { method: 'PUT' }),

  removeTrack: (id) =>
    API._fetch(`/me/tracks?ids=${id}`, { method: 'DELETE' }),
};
