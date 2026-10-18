import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const ROOT = process.cwd();
const r = await build({ entryPoints: [ROOT + '/src/data/poets.ts'], bundle: true, write: false, format: 'esm', platform: 'node', absWorkingDir: ROOT });
writeFileSync(ROOT + '/scripts/_poets-bundle.tmp.mjs', r.outputFiles[0].text);
const mod = await import(pathToFileURL(ROOT + '/scripts/_poets-bundle.tmp.mjs').href);
const P = mod.POETS;
console.log('POETS 总数:', P.length);
console.log('DATA_STATS:', JSON.stringify(mod.DATA_STATS));
const ids = P.map(p => p.id);
const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
console.log('重复 id:', dup.length ? dup.slice(0, 15).join(',') : '无');
for (const n of ['李贺', '朱敦儒', '薛涛', '苏轼']) {
  console.log(n, '在 POETS:', P.filter(p => p.name === n).length, '处');
}
