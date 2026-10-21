import { useCallback, useEffect, useState } from 'react';

/**
 * 主题切换（迭代 17 · 深色模式）
 * ------------------------------------------------------------------
 * 用 CSS 变量驱动：`body` 上挂 `.dark` 类切换主题。
 * Tailwind 的 paper / ink / cinnabar 等色板全部映射到 var(--paper) /
 * var(--ink) 等（见 tailwind.config.js），因此切换 body 类即可让
 * 所有 `bg-paper`、`text-ink` 等 Tailwind 工具类自动翻成深色值。
 *
 * - 默认值：跟随系统 `prefers-color-scheme`
 * - 持久化：localStorage `poetmap-theme`（'light' | 'dark' | 'auto'）
 * - 手动切换时立即覆盖系统偏好，并写回 localStorage
 */

const LS_KEY = 'poetmap-theme';
export type Theme = 'light' | 'dark';
type ThemePref = Theme | 'auto';

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(() => resolveTheme(loadPref()));

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
  }, [theme]);

  // 跟随系统：仅在偏好为 'auto' 时监听
  useEffect(() => {
    const pref = loadPref();
    if (pref !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (): void => setTheme(mq.matches ? 'dark' : 'light');
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const setThemePersisted = useCallback((t: Theme): void => {
    setTheme(t);
    try {
      localStorage.setItem(LS_KEY, t);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback((): void => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(LS_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { theme, setTheme: setThemePersisted, toggle };
}

function loadPref(): ThemePref {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === 'light' || v === 'dark' || v === 'auto') return v;
  } catch {
    /* ignore */
  }
  return 'auto';
}

function resolveTheme(pref: ThemePref): Theme {
  if (pref === 'light' || pref === 'dark') return pref;
  // auto：跟随系统
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
