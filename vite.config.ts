import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Wildmorph/' : '/',
  server: {
    host: '127.0.0.1',
  },
  build: {
    target: 'es2022',
  },
}));
