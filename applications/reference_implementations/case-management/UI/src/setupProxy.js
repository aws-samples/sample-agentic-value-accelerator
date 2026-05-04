const { createProxyMiddleware } = require('http-proxy-middleware');

// Dev-only proxy — routes local /fraudscore and /api/* to the deployed API Gateway.
// The target URL is read from public/config.json at startup.
module.exports = function(app) {
  let sarApiUrl;
  try {
    const config = require('../public/config.json');
    sarApiUrl = config.SAR_API_URL;
  } catch {
    sarApiUrl = 'http://localhost:3001';
  }

  if (!sarApiUrl || sarApiUrl === '') {
    console.warn('[setupProxy] SAR_API_URL not set in public/config.json — proxy disabled');
    return;
  }

  app.use(
    '/fraudscore',
    createProxyMiddleware({
      target: sarApiUrl,
      changeOrigin: true,
      secure: true,
      pathRewrite: { '^/fraudscore': '/fraudscore' },
      logLevel: 'warn',
    })
  );

  app.use(
    '/api',
    createProxyMiddleware({
      target: sarApiUrl,
      changeOrigin: true,
      secure: true,
      logLevel: 'warn',
    })
  );
};
