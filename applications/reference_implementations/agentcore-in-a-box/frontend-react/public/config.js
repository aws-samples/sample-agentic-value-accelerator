// Placeholder runtime config. deploy.sh overwrites this file in dist/ after the
// stack is deployed, filling in the per-DEMO_ENV values. Vite copies public/ files
// into dist/ untouched, so the build never inlines these.
window.APP_CONFIG = {
  REGION: '',
  USER_POOL_ID: '',
  USER_POOL_CLIENT_ID: '',
  API_URL: '',
  WS_URL: '',
  AGUI_URL: '',
  IDENTITY_POOL_ID: '',
  COGNITO_DOMAIN: '',
  REDIRECT_URI: '',
};
