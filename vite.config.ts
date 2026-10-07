import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A relative base lets the build live at any path, e.g. https://<user>.github.io/<repo>/
export default defineConfig({
  base: './',
  plugins: [react()],
});
