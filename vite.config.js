import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  build: {
    rolldownOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        landing: fileURLToPath(new URL('./air-gesture/index.html', import.meta.url))
      }
    }
  },
  server: {
    port: 5180,
    strictPort: false
  }
});
