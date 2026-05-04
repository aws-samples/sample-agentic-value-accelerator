import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    basicSsl()  // Enable HTTPS with self-signed cert
  ],
  server: {
    https: true,
    port: 9000,
    host: 'localhost',
    // Proxy removed - now using mock payment service directly via VITE_PAYMENT_MOCK_MODE
  }
})
