import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 纯前端离线项目：地图数据以 GeoJSON 内置打包，不依赖任何外部瓦片 / 在线地图服务。
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5199,
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
    // 迭代 3 · 产物组织：把框架与投影库拆成独立 chunk，
    // 便于浏览器并行下载与长效缓存（业务代码更新时不必重下 vendor）。
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          d3: ['d3-geo'],
        },
      },
    },
  },
});
