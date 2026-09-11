import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5175,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep the UI light while the renderer loads; cache Three.js independently.
          if (id.includes('/node_modules/three/')) return 'three';
        },
      },
    },
  },
});
