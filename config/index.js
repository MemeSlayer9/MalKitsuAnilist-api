require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  mal: {
    clientId: process.env.MAL_CLIENT_ID || '',
    clientSecret: process.env.MAL_CLIENT_SECRET || '',
    baseUrl: 'https://api.myanimelist.net/v2',
    authUrl: 'https://myanimelist.net/v1/oauth2',
  },

  kitsu: {
    baseUrl: 'https://kitsu.app/api/edge',
    authUrl: 'https://kitsu.app/api/oauth/token',
    email: process.env.KITSU_EMAIL || '',
    password: process.env.KITSU_PASSWORD || '',
  },
};
