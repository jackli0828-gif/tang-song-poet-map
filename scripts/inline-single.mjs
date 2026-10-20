/**
 * 把 dist-single/ 的产物「全部」内联进一个可双击打开的独立 HTML。
 *
 * 用法: node scripts/inline-single.mjs [输出路径]
 *   默认输出: <项目根>/唐宋词人时空轨迹图.html
 *
 * 要点：
 * - Vite 在 app 模式下即便设了 inlineDynamicImports，也会把 react / d3 等
 *   node_modules 自动拆成独立 chunk（ESM + modulepreload），并不会真正产出
 *   单一文件。因此这里用 esbuild 把入口与所有依赖 chunk 重新打包成「单个 IIFE」，
 *   再整体内联，保证 file:// 双击即可运行（IIFE 不受 CORS 限制）。
 * - 内联脚本里若出现 "</script" 字面量会提前闭合标签，必须转义；同理 "</style>"。
 * - 产物完全离线：地图 GeoJSON 已打进 JS，字体走系统字体，无任何外部请求。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import esbuild from 'esbuild';

const root = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const out = process.argv[2] || resolve(root, '唐宋词人时空轨迹图.html');
const dist = resolve(root, 'dist-single');

const htmlPath = resolve(dist, 'index.html');
if (!existsSync(htmlPath)) {
  console.error('未找到 dist-single/index.html，请先运行：npx vite build --config vite.config.single.ts');
  process.exit(1);
}

let html = readFileSync(htmlPath, 'utf8');

// 找到入口脚本（type="module" 的那个）
const entryMatch = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*>/i);
if (!entryMatch) {
  console.error('未在 dist-single/index.html 中找到 type="module" 的入口脚本');
  process.exit(1);
}
const entryRel = entryMatch[1].replace(/^\.\//, '');
const entryAbs = resolve(dist, entryRel);

// 用 esbuild 把所有 chunk 打成一个 IIFE（含 react / d3 / 业务代码 + 数据）
const result = await esbuild.build({
  entryPoints: [entryAbs],
  bundle: true,
  format: 'iife',
  write: false,
  absWorkingDir: dist,
  legalComments: 'none',
  logLevel: 'silent',
});
let js = result.outputFiles[0].text;

// CSS（单文件）
let css = '';
const cssMatch = html.match(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/i);
if (cssMatch) {
  const cssAbs = resolve(dist, cssMatch[1].replace(/^\.\//, ''));
  if (existsSync(cssAbs)) css = readFileSync(cssAbs, 'utf8');
}

// 防提前闭合：内联内容中的 </script> / </style> 需转义
js = js.replace(/<\/script/gi, '<\\/script');
css = css.replace(/<\/style/gi, '<\\/style');

// 去掉原本的 modulepreload / stylesheet link / module script src 引用
html = html
  .replace(/<link[^>]*rel="modulepreload"[^>]*>/gi, '')
  .replace(/<link[^>]*rel="stylesheet"[^>]*>/gi, '')
  .replace(/<script[^>]*type="module"[^>]*src="[^"]*"[^>]*><\/script>/gi, '')
  .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/gi, '');

// 在 </head> 前插入内联 <style>
const styleBlock = `<style>\n${css}\n</style>\n</head>`;
html = html.replace('</head>', () => styleBlock);

// 在 </body> 前插入内联 <script>（IIFE，file:// 下可直接运行）
const scriptBlock = `<script>\n${js}\n</script>\n</body>`;
html = html.replace('</body>', () => scriptBlock);

writeFileSync(out, html, 'utf8');

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
console.log(`已生成单文件 HTML：${out}`);
console.log(`体积：${kb} KB（含内置地图数据与全部作品，完全离线）`);
console.log(`内联：CSS ${(Buffer.byteLength(css) / 1024).toFixed(0)} KB + JS ${(Buffer.byteLength(js) / 1024).toFixed(0)} KB`);
