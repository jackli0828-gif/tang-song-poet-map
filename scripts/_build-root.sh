#!/usr/bin/env bash
# 从**源码**构建，并把产物同步回仓库根目录。
#
# 背景（踩过的坑，勿改回旧做法）：
#   根目录 index.html 指向仓库内预构建的 assets/index-*.js，是为了让仓库
#   根目录能直接静态服务。但若直接 `vite build`，vite 会把 index.html 里的
#   那个旧 bundle 当入口 —— 只 transform 6 个模块，src/data 下所有数据改动
#   都不会进入产物（迭代 12/13 补录的 319 位诗人、1202 篇作品就是这样一直
#   没上线的）。
#   因此构建前必须先把入口临时换成 /src/main.tsx，构建完再把 dist 拷回根目录。
#
#   另：入口文件名必须是 index.html（不能用 index.src.html 之类）——
#   Pages 部署 dist 时只认 index.html，否则站点 404。
set -e
cd "$(dirname "$0")/.."

cp index.html .index.root.html.bak

cat > index.html <<'EOF'
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="唐宋诗人词人时空轨迹地图：人 — 时间 — 地点 — 作品 一一对应" />
    <!-- 中式印章造型 favicon（inline SVG data URI，不引入二进制文件） -->
    <link
      rel="icon"
      href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='4' fill='%23F5EFE1'/%3E%3Crect x='3.5' y='3.5' width='25' height='25' rx='3' fill='none' stroke='%23A83232' stroke-width='3'/%3E%3Ctext x='16' y='21' font-family='Songti SC,STSong,SimSun,serif' font-size='16' font-weight='700' text-anchor='middle' fill='%23A83232'%3E%E8%AF%97%3C/text%3E%3C/svg%3E"
    />
    <title>唐宋词人轨迹 · 时空诗旅图</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF

rm -rf dist
npx vite build

cp dist/index.html index.html
rm -rf assets
cp -r dist/assets assets
rm -f .index.root.html.bak

echo "--- 根目录 index.html 引用 ---"
grep -o 'assets/index-[A-Za-z0-9_-]*\.js' index.html
echo "--- 产物自检（应与 DATA_STATS 一致）---"
# 迭代 17：辞典补录语料（works-add / work-plink）已改为动态 import 的异步 chunk，
# 不再出现在主包里 —— 自检必须把主包与异步 chunk 合并统计，否则会误报「数据丢失」。
node -e "
const fs=require('fs');
const files=fs.readdirSync('assets');
const main=files.find(x=>x.startsWith('index-')&&x.endsWith('.js'));
const chunks=files.filter(x=>x.endsWith('.js')&&!x.startsWith('index-')&&!x.startsWith('react')&&!x.startsWith('d3'));
const n=(s,k)=>s.split(k).length-1;
const sm=fs.readFileSync('assets/'+main,'utf8');
let wa=n(sm,'-wa'), ex=n(sm,'excerpt:');
console.log('主包 '+main);
console.log('  诗人条目 dynasty:', n(sm,'dynasty:'), '| 主包内作品 excerpt:', ex);
for(const c of chunks){
  const s=fs.readFileSync('assets/'+c,'utf8');
  const w=n(s,'-wa'), e=n(s,'excerpt:');
  wa+=w; ex+=e;
  console.log('  异步块 '+c+' : -wa '+w+' , excerpt '+e);
}
console.log('合并统计 => -wa', wa, '| excerpt', ex, '(应分别 ≈1220 / ≈2066)');
"
