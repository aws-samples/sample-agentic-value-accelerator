import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// Plain React SPA → static dist/. Deployed to the same S3 + CloudFront the CDK
// stack already manages (BucketDeployment source = ../frontend-react/dist). Runtime
// config is loaded from /config.js (window.APP_CONFIG) before the bundle, so the
// build is env-agnostic and deploy.sh fills in per-DEMO_ENV values — see public/config.js.
//
// Tailwind v4 is wired via @tailwindcss/vite (no postcss/tailwind.config needed; the
// design tokens live in src/styles.css under @theme/@layer). The `@` alias points at
// src/ so ported component patterns resolve cleanly.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
