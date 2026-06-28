const Player = {
  instance: null,
  deviceId: null,

  init() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('SDK timeout — Spotify est peut-être bloqué sur ce réseau')),
        15_000
      );

      window.onSpotifyWebPlaybackSDKReady = () => {
        clearTimeout(timeout);

        this.instance = new Spotify.Player({
          name: 'MySpotify',
          getOAuthToken: async (cb) => {
            const token = await Auth.getToken();
            cb(token);
          },
          volume: 0.5,
        });

        this.instance.addListener('ready', ({ device_id }) => {
          this.deviceId = device_id;
          resolve(device_id);
        });

        this.instance.addListener('not_ready', ({ device_id }) => {
          console.warn('Device offline:', device_id);
          this.deviceId = null;
        });

        this.instance.addListener('player_state_changed', (state) => {
          App.onStateChange(state);
        });

        this.instance.addListener('initialization_error', ({ message }) =>
          reject(new Error('Init: ' + message)));
        this.instance.addListener('authentication_error', ({ message }) =>
          reject(new Error('Auth: ' + message)));
        this.instance.addListener('account_error', ({ message }) =>
          reject(new Error('Compte: ' + message)));

        this.instance.connect();
      };

      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Impossible de charger le SDK Spotify — réseau bloqué ?'));
      };
      document.head.appendChild(script);
    });
  },

  togglePlay: () => Player.instance?.togglePlay(),
  next: () => Player.instance?.nextTrack(),
  prev: () => Player.instance?.previousTrack(),
  seek: (ms) => Player.instance?.seek(ms),
  setVolume: (v) => Player.instance?.setVolume(v),
  getState: () => Player.instance?.getCurrentState() ?? Promise.resolve(null),
  disconnect: () => Player.instance?.disconnect(),
};
