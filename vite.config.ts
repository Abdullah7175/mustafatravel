import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  // Prevent Vite from reading files outside the project
  server: {
    fs: {
      strict: true,
      deny: ['.git'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:7000',
        changeOrigin: true,
      },
    },
    allowedHosts: ['booking.mustafatravelsandtour.com', 'www.booking.mustafatravelsandtour.com', 'localhost', '0.0.0.0', '34.224.169.168'],
    hmr: {
      overlay: false, // Disable error overlay to prevent blocking
    },
    // Handle malformed URIs gracefully
    middlewareMode: false,
  },
});
