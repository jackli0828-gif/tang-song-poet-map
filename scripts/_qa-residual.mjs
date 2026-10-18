/** 打印残留样本的全文，判断是否需要尾部再修剪 */
import { writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const ROOT = process.cwd();
const r = await build({ entryPoints: [resolve(ROOT, 'src/data/poets.ts')], bundle: true, write: false, format: 'esm', platform: 'node', absWorkingDir: ROOT });
writeFileSync(resolve(ROOT, 'scripts/_tmp2.mjs'), r.outputFiles[0].text);
const m = await import(pathToFileURL(resolve(ROOT, 'scripts/_tmp2.mjs')).href);
const P = m.POETS;
const want = [
  ['刘长卿', '穆陵关北逢人归渔阳'],
  ['刘禹锡', '望洞庭'],
  ['范仲淹', '御街行'],
  ['周邦彦', '渡江云'],
  ['贺铸', '凌歊'],
  ['张孝祥', '念奴娇'],
  ['温庭筠', '蔡中郎坟'],
  ['张元幹', '浣溪沙'],
];
for (const [n, t] of want) {
  const p = P.find((x) => x.name === n);
  const w = p ? p.nodes.flatMap((x) => x.works).find((x) => x.title.startsWith(t)) : null;
  console.log('====', n, '《' + t + '》');
  console.log(w ? w.fullText : '未找到');
  console.log('');
}
