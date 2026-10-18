import { execSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const content = readFileSync('public/bgm.mp3');
const b64 = content.toString('base64');

// 直接从 git credential fill 取 token（stdin pipe via spawnSync）
function getToken() {
  const r = spawnSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
  });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('password='));
  return line ? line.slice('password='.length).trim() : '';
}

const TOKEN = getToken();
if (!TOKEN) {
  console.error('未获取到 GitHub token');
  process.exit(1);
}

// 先 GET sha
let sha = '';
try {
  const res = await fetch(
    'https://api.github.com/repos/jackli0828-gif/tang-song-poet-map/contents/public/bgm.mp3?ref=main',
    { headers: { Authorization: `token ${TOKEN}`, 'Content-Type': 'application/json' } }
  );
  if (res.ok) sha = (await res.json()).sha || '';
} catch { /* ignore */ }

const payload = { message: 'chore: 替换BGM为用户提供的 hechang--250488.mp3', content: b64 };
if (sha) payload.sha = sha;

const res = await fetch(
  'https://api.github.com/repos/jackli0828-gif/tang-song-poet-map/contents/public/bgm.mp3',
  {
    method: 'PUT',
    headers: { Authorization: `token ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }
);

const d = await res.json();
if (!res.ok) {
  console.error('GitHub API 错误:', res.status, d.message || JSON.stringify(d).slice(0, 300));
  process.exit(1);
}
console.log('OK 上传成功 → sha:', d.content.sha.slice(0, 10), '| size:', d.content.size, 'bytes');
