#!/usr/bin/env node
/**
 * 通过 GitHub Contents API 把 dist/ 目录上传到 tang-song-poet-map.git (main)
 * 绕过 git push 502 / 分歧问题。
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO = 'jackli0828-gif/tang-song-poet-map';
const BRANCH = 'main';
const DIST_DIR = join(process.cwd(), 'dist');

// ---- 1. 获取 GitHub token ----
function getGithubToken() {
  const r = spawnSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf-8',
  });
  const out = r.stdout || '';
  const mUser = out.match(/username=(.+)/);
  const mPass = out.match(/password=(.+)/);
  if (!mPass) throw new Error('无法获取 GitHub token');
  return { user: mUser?.[1] ?? '', token: mPass[1].trim() };
}

async function gitApi(path, { method = 'GET', body } = {}) {
  const { token } = getGithubToken();
  const url = `https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) {
    throw new Error(`GitHub API ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return json;
}

async function uploadFile(relPath, content, commitMsg) {
  const b64 = content.toString('base64');
  const sha = await gitApi(`.gitignore`, { method: 'GET' }).catch(() => null);
  // 先 GET 拿现有 sha（如果文件已存在），否则 PUT 新建
  let existingSha = null;
  try {
    const info = await gitApi(relPath);
    if (info) existingSha = info.sha;
  } catch {}

  const body = {
    message: commitMsg,
    content: b64,
    branch: BRANCH,
  };
  if (existingSha) body.sha = existingSha;

  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${relPath}`, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${getGithubToken().token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`上传 ${relPath} 失败 → ${res.status}: ${err.slice(0, 300)}`);
  }
  return relPath;
}

async function main() {
  // 收集需要上传的文件（dist 根 + assets）
  const toUpload = [];
  const distFiles = readdirSync(DIST_DIR);
  for (const f of distFiles) {
    const full = join(DIST_DIR, f);
    if (statSync(full).isFile()) {
      toUpload.push({ rel: f, full });
    }
  }
  const assetsDir = join(DIST_DIR, 'assets');
  if (readdirSync(assetsDir).length > 0) {
    for (const f of readdirSync(assetsDir)) {
      const full = join(assetsDir, f);
      if (statSync(full).isFile()) {
        toUpload.push({ rel: `assets/${f}`, full });
      }
    }
  }

  console.log(`上传 ${toUpload.length} 个文件 → ${REPO} (${BRANCH})\n`);
  for (const item of toUpload) {
    const content = readFileSync(item.full);
    await uploadFile(item.rel, content, `chore: update ${item.rel}`);
    console.log(`  ✓ ${item.rel} (${(content.length / 1024).toFixed(1)} KB)`);
  }
  console.log(`\n全部上传完成。等待 GitHub Pages 构建…`);
}

main().catch((e) => { console.error(e); process.exit(1); });
