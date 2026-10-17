/**
 * 把 dist-single/ 的 CSS 与 JS 全部内联进 HTML，产出一个可双击打开的独立文件。
 *
 * 用法: node scripts/inline-single.mjs [输出路径]
 *   默认输出: <项目根>/唐宋词人时空轨迹图.html
 *
 * 注意点：
 * - 内联脚本里若出现 "</script" 字面量会提前闭合标签，必须转义；
 * - 同理 "</style" 也要转义；
 * - 产物完全离线：地图 GeoJSON 已打进 JS，字体走系统字体，无任何外部请求。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const out = process.argv[2] || resolve(root, '唐宋词人时空轨迹图.html');
const dist = resolve(root, 'dist-single');

const htmlPath = resolve(dist, 'index.html');
if (!existsSync(htmlPath)) {
  console.error('未找到 dist-single/index.html，请先运行：npx vite build --config vite.config.single.ts');
  process.exit(1);
}

let html = readFileSync(htmlPath, 'utf8');
const cssPath = resolve(dist, 'app.css');
const jsPath = resolve(dist, 'app.js');

let css = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : '';
let js = existsSync(jsPath) ? readFileSync(jsPath, 'utf8') : '';
if (!js) {
  console.error('未找到 dist-single/app.js');
  process.exit(1);
}

// 防提前闭合：内联内容中的 </script> / </style> 需转义
js = js.replace(/<\/script/gi, '<\\/script');
css = css.replace(/<\/style/gi, '<\\/style');

// 1) 去掉原本的 modulepreload / stylesheet link / script src 引用
html = html
  .replace(/<link[^>]*rel="modulepreload"[^>]*>/gi, '')
  .replace(/<link[^>]*rel="stylesheet"[^>]*>/gi, '')
  .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/gi, '');

// 2) 在 </head> 前插入内联 <style>
//    必须用「函数式替换」：压缩后的 CSS/JS 里含 $& / $' / $` 等序列，
//    用字符串替换会被当成特殊替换模式，把 </body> 之类的文本插进代码里导致语法崩坏。
const styleBlock = `<style>\n${css}\n</style>\n</head>`;
html = html.replace('</head>', () => styleBlock);

// 3) 在 </body> 前插入内联 <script>（IIFE，file:// 下可直接运行）
const scriptBlock = `<script>\n${js}\n</script>\n</body>`;
html = html.replace('</body>', () => scriptBlock);

writeFileSync(out, html, 'utf8');

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
console.log(`已生成单文件 HTML：${out}`);
console.log(`体积：${kb} KB（含内置地图数据与全部作品，完全离线）`);
console.log(`内联：CSS ${(Buffer.byteLength(css) / 1024).toFixed(0)} KB + JS ${(Buffer.byteLength(js) / 1024).toFixed(0)} KB`);
