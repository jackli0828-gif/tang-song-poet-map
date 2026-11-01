#!/usr/bin/env node
/**
 * 构建入口守卫（在 npm run build 之前自动执行）
 * ==================================================================
 * 背景：vite 以 index.html 为构建入口。如果 index.html 里的 <script type="module">
 * 指向的是**已构建产物**（./assets/index-xxxx.js），vite 会把那个旧 bundle 当成
 * 入口再打包一遍 —— 结果是：
 *   · src/ 下的任何改动都不进入产物；
 *   · 构建不报错，部署也显示成功；
 *   · 产物 chunk 名出现双 hash（如 works-add-D3qS9XcJ-Dj9dVIGP.js），是唯一线索。
 *
 * 迭代 12/13 补录的 319 位诗人、1202 篇作品就是这样静默丢失的。
 * 此脚本把「静默失效」变成「构建直接失败」。
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = resolve(root, 'index.html');

let html;
try {
  html = readFileSync(htmlPath, 'utf8');
} catch (err) {
  console.error(`[check-entry] 无法读取 index.html：${err.message}`);
  process.exit(1);
}

// 先剥掉 HTML 注释再检查：index.html 里的警示注释本身包含
// <script type="module" src="/src/main.tsx"> 这段示例文本，
// 若不剥离，真入口被删掉时注释会让检查假通过。
const scanned = html.replace(/<!--[\s\S]*?-->/g, '');

const errors = [];

// 1) 必须存在指向源码的入口
if (!/<script[^>]+type=["']module["'][^>]+src=["']\/src\/main\.tsx["']/.test(scanned)) {
  errors.push(
    'index.html 中找不到 <script type="module" src="/src/main.tsx"> 入口。\n' +
      '    构建入口必须指向源码；若指向 ./assets/index-*.js，src 改动不会进入产物。',
  );
}

// 2) 入口不得指向构建产物
const assetEntry = scanned.match(
  /<script[^>]+type=["']module["'][^>]+src=["'](\.?\/?assets\/[^"']+)["']/,
);
if (assetEntry) {
  errors.push(
    `index.html 的模块入口指向了构建产物：${assetEntry[1]}\n` +
      '    这会让 vite 把旧 bundle 当入口重新打包，src 改动全部失效。',
  );
}

// 3) 不应残留指向旧产物的 modulepreload / stylesheet
if (/<link[^>]+rel=["']modulepreload["'][^>]+href=["'][^"']*assets\/[^"']*["']/.test(scanned)) {
  errors.push('index.html 残留了指向 assets/ 的 <link rel="modulepreload">，应由 vite 构建时自动注入。');
}
if (/<link[^>]+rel=["']stylesheet["'][^>]+href=["'][^"']*assets\/[^"']*["']/.test(scanned)) {
  errors.push('index.html 残留了指向 assets/ 的 <link rel="stylesheet">，应由 vite 构建时自动注入。');
}

if (errors.length > 0) {
  console.error('\n[check-entry] 构建入口检查未通过：\n');
  for (const e of errors) console.error(`  ✗ ${e}\n`);
  console.error('  参考：git log -- index.html 可查看该文件是否被构建产物覆盖过。\n');
  process.exit(1);
}

console.log('[check-entry] OK — 构建入口指向 src/main.tsx');
