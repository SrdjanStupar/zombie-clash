import { defineConfig } from 'vite';
import { jevPlugin } from './server/jev';
export default defineConfig({
  plugins: [jevPlugin()],
  build: { rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
});
