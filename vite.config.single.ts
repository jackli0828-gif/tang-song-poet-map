import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 单文件 HTML 专用构建配置
 * ------------------------------------------------------------------
 * 与常规构建（vite.config.ts）的区别：
 * - 取消 manualChunks，改用 inlineDynamicImports → 只产出一个 JS 包；
 * - 输出格式 IIFE（而非 ESM）。这一点很关键：
 *   file:// 协议下浏览器会以 CORS 规则拦截 ES module 的加载，
 *   用户「双击打开 HTML」会白屏；IIFE 是经典脚本，双击即可运行；
 * - cssCodeSplit: false → 只产出一个 CSS 文件，便于后续内联。
 *
 * 产出 dist-single/ 后，由 scripts/inline-single.mjs 把 CSS/JS 全部内联进 HTML。
 */
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist-single',
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'app.[ext]',
      },
    },
  },
});
