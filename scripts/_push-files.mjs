#!/usr/bin/env node
// One-off helper: push local changed files to GitHub main via Contents API.
// Reads GitHub OAuth token from /tmp/ghtoken.txt (written by `git credential fill`).
// Usage: node scripts/_push-files.mjs
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const repo = "jackli0828-gif/tang-song-poet-map";
const root = process.cwd();

// token file: try /tmp/ghtoken.txt (POSIX) or C:\Users\li\... (if run elsewhere)
const tokenPath = process.platform === "win32"
  ? resolve(process.env.TEMP || "C:\\temp", "ghtoken.txt")
  : "/tmp/ghtoken.txt";
const token = readFileSync(tokenPath, "utf8").trim();

// [localPath, remoteSha|null]
const updates = [
  ["src/utils/speech.ts", "d0f84f900451b85bc0ef4f67728d9ed59b7cfeb8"],
  ["src/hooks/useSpeech.ts", "c7d652900c2e3a987fd5448736dcc02ee4709706"],
  ["src/components/MapWorkPopup.tsx", "b02e6f103cf67ac92d944a3296b918476184556c"],
  ["src/components/WorksGallery.tsx", "cf631f576d4810ca456705060a751f38f089625e"],
  ["src/components/Timeline.tsx", "a264f60ae48ae758085408a27fee3dfc677325f6"],
  ["scripts/gen-cider-append-works.mjs", "9fecbb6985221434395cdb0e352a981f27aabf1b"],
  ["src/data/works-add.ts", "0d3a1922838ce209816aa32006b6d5bfeaa2b656"],
];
const creates = [
  "src/utils/edge-tts.ts",
  "src/utils/edge-tts-gec.ts",
  "src/utils/speech-system.ts",
];

function b64(p) {
  return readFileSync(resolve(root, p)).toString("base64");
}

async function pushFile(f, sha) {
  const body = {
    message: `feat(tts): Edge TTS 拟人音引擎 + 双调词 TRUNC 修复 (${f})`,
    content: b64(f),
    encoding: "base64",
  };
  if (sha) body.sha = sha;
  const res = await fetch(
    `https://api.github.com/repos/${repo}/contents/${f}`,
    {
      method: "PUT",
      headers: {
        Authorization: `token ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  const text = await res.text();
  if (!res.ok) {
    console.error(`FAIL ${f} => ${res.status} ${text.slice(0, 200)}`);
    return false;
  }
  let shaNew = "unknown";
  try {
    const j = JSON.parse(text);
    shaNew = j?.content?.sha || j?.sha || "unknown";
  } catch {}
  console.log(`OK ${f} => ${sha}`);
  return true;
}

let ok = 0, fail = 0;
for (const [f, sha] of updates) {
  (await pushFile(f, sha)) ? ok++ : fail++;
  await new Promise((r) => setTimeout(r, 500));
}
for (const f of creates) {
  (await pushFile(f, null)) ? ok++ : fail++;
  await new Promise((r) => setTimeout(r, 500));
}
console.log(`\nDone: ${ok} OK, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
