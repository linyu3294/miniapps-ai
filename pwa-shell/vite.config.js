import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // ...other config
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
      }
    }
  }
});