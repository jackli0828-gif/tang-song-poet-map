import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppProvider } from './store/PoetContext';
import { ensurePoetsLoaded } from './data/poetStore';
import './index.css';

/* 迭代 19 · 诗人详情是独立分块，尽早发起下载：
 * 不必等 React 挂载完再开始（挂载本身也要几十毫秒），
 * 与主包解析并行，首屏闸门的等待时间因此更短。
 * 失败不在这里处理 —— BootGate 会接管并给出重试入口。 */
void ensurePoetsLoaded().catch(() => undefined);

/* 迭代 17 · 在 React 挂载前就按 localStorage / 系统偏好应用主题，避免 FOUC */
(function initTheme(): void {
  const LS_KEY = 'poetmap-theme';
  let pref: 'light' | 'dark' | 'auto';
  try {
    const v = localStorage.getItem(LS_KEY);
    pref = v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    pref = 'auto';
  }
  const isDark =
    pref === 'dark' ||
    (pref === 'auto' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
})();

const container = document.getElementById('root');
if (!container) {
  throw new Error('未找到 #root 挂载节点，请检查 index.html。');
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>,
);
