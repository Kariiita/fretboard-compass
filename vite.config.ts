import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  // 单文件产物：JS / CSS 全部内联进 dist/index.html，
  // 这样双击就能打开（file:// 下浏览器会拦截外部 module / CSS 的 CORS）。
  plugins: [react(), viteSingleFile()],
  server: { port: 5173, open: false },
});
