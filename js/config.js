// =================================================================
//  CONFIGURATION — À modifier avant de lancer l'application
// =================================================================
//
//  ÉTAPES DE CONFIGURATION :
//  1. Va sur https://developer.spotify.com/dashboard
//  2. Clique "Create App"
//  3. Donne un nom (ex: MySpotify) et une description
//  4. Dans "Redirect URIs", ajoute l'une des URLs suivantes :
//       - Pour localhost : http://localhost:8080
//         (ou le port de ton serveur local)
//       - Pour GitHub Pages : https://TON-USERNAME.github.io/MySpotify/
//  5. Coche "Web API" et "Web Playback SDK" dans les APIs
//  6. Sauvegarde et copie le Client ID ci-dessous
//
// =================================================================

const CONFIG = {
  // Remplace par ton Client ID Spotify (string de 32 caractères)
  CLIENT_ID: '083e6118fcd34c01acf6f81cc1a44801',//'YOUR_CLIENT_ID_HERE',

  // L'URL de cette page (détectée automatiquement)
  // Si ça ne marche pas, remplace 'auto' par l'URL exacte, ex:
  // 'http://localhost:8080' ou 'https://username.github.io/MySpotify/'
  REDIRECT_URI: 'auto',

  SCOPES: [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-library-read',
    'user-library-modify',
    'user-read-playback-state',
    'user-modify-playback-state',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-read-currently-playing',
    'user-read-recently-played',
    'user-top-read',
  ].join(' '),
};

if (CONFIG.REDIRECT_URI === 'auto') {
  CONFIG.REDIRECT_URI = window.location.origin + window.location.pathname;
}
