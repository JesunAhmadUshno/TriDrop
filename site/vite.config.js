import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// The site reads ../index.html and ../README.md at build time, so every verdict, line number and count is generated, never typed.
// Served at /TriDrop/dashboard/; the app itself stays at /TriDrop/.
export default defineConfig({
  base: '/TriDrop/dashboard/',
  plugins: [react()],
  server: { fs: { allow: ['..'] } },
});
