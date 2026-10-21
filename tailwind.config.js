/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 宣纸 / 绢帛（迭代 17 · 深色模式：全部映射 CSS 变量，.dark 下翻转）
        paper: 'var(--paper)',
        'paper-2': 'var(--paper-2)',
        'paper-3': 'var(--paper-3)',
        // 墨色层次
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        'ink-4': 'var(--ink-4)',
        // 朱砂 / 石青 / 石绿（深色下保持同色，仅调低不透明度）
        cinnabar: 'var(--cinnabar)',
        'cinnabar-2': 'var(--cinnabar-2)',
        azurite: 'var(--azurite)',
        malachite: 'var(--malachite)',
        gold: 'var(--gold)',
      },
      fontFamily: {
        song: ['"Songti SC"', '"STSong"', '"SimSun"', '"Noto Serif SC"', '"Source Han Serif SC"', 'serif'],
        kai: ['"Kaiti SC"', '"STKaiti"', '"KaiTi"', '"Songti SC"', 'serif'],
      },
      boxShadow: {
        scroll: '0 1px 2px rgba(43,39,36,0.04), 0 8px 24px rgba(43,39,36,0.08)',
        // 迭代 7：地图作品浮层的投影——要压在地图纹理上仍能清晰浮出
        popup: '0 2px 6px rgba(43,39,36,0.14), 0 12px 32px rgba(43,39,36,0.20)',
      },
      keyframes: {
        ripple: {
          '0%': { transform: 'scale(0.6)', opacity: '0.75' },
          '100%': { transform: 'scale(2.6)', opacity: '0' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        inkIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        ripple: 'ripple 1.8s ease-out infinite',
        fadeUp: 'fadeUp 0.35s ease-out both',
        inkIn: 'inkIn 0.6s ease-out both',
      },
    },
  },
  plugins: [],
};
