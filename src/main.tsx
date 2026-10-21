import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppProvider } from './store/PoetContext';
import './index.css';

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
