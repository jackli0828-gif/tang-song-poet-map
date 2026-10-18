#!/usr/bin/env bash
# 构建并把产物同步回仓库根目录。
#
# GitHub Pages 目前由 Actions 部署 dist（见 .github/workflows/deploy.yml），
# 但仓库根目录也保留了一份 index.html + assets/，便于直接以根目录为源打开。
#
# 注意：vite.config.ts 已把构建入口固定为 index.src.html（源码入口），
# 不要再拿根目录 index.html 当入口 —— 它指向仓库内预构建的
# assets/index-*.js，vite 会把那个旧 bundle 原样打包（只 transform 6 个模块），
# src/data 下的所有数据改动都不会进入产物。
set -e
cd "$(dirname "$0")/.."

rm -rf dist
npx vite build

# dist 入口文件名沿用 index.src.html，拷回根目录时改名为 index.html
cp dist/index.src.html index.html
rm -rf assets
cp -r dist/assets assets

echo "--- 根目录 index.html 引用 ---"
grep -o 'assets/index-[A-Za-z0-9_-]*\.js' index.html
echo "--- 产物自检（应与 DATA_STATS 一致）---"
node -e "
const fs=require('fs');
const f=fs.readdirSync('assets').find(x=>x.startsWith('index-')&&x.endsWith('.js'));
const s=fs.readFileSync('assets/'+f,'utf8');
const n=k=>s.split(k).length-1;
console.log(f);
console.log('  诗人条目 dynasty:', n('dynasty:'), '| 追加作品 -wa:', n('-wa'), '| 作品 excerpt:', n('excerpt:'));
"
