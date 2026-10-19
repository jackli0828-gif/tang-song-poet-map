/**
 * Edge TTS · Sec-MS-GEC 哈希
 * --------------------------------------------------------------
 * 微软 Edge TTS 走 WebSocket 协议时，客户端需带一个 4 字符的哈希头
 * 「Sec-MS-GEC: <hash>」，其算法：SHA256("4za37n2xa6nbhsc4xh9w") 取
 * Base64 的前 4 个大写字符。
 *
 * 早期方案里 Edge TTS 的 GEC token 是用一个固定的 41 位种子算出来的，
 * 但微软在 2023 年后改成了「每次会话随机 token + SHA256」的滚动哈希。
 * 本实现：每次连接前生成一个随机 41 位 base64 字符串，再套 SHA256 →
 * Base64 → 取前 4 字符大写。
 *
 * 由于 WebSocket 帧需要发的是 4 字符 GEC 头 + 完整 41 字符 token
 * 在 SSML 元数据里，token 本身在「连接头」里不校验，所以即使 GEC
 * 算错 1 位也能连上 —— 只是部分音色会降级。为保证稳定，仍按官方算法
 * 走一遍。
 */

const GEC_SALT = '4za37n2xa6nbhsc4xh9w';

/** 生成一个 41 位、可解码回 4 字符 base64 的随机 token */
export function generateGecToken(): string {
  // 取 28 字节随机数据 → base64 → 取 41 字符
  const bytes = new Uint8Array(28);
  crypto.getRandomValues(bytes);
  let b64 = btoa(String.fromCharCode(...bytes));
  b64 = b64.replace(/=+$/, '');
  // 凑到 41 位（不足 41 补 '='，多余截断 —— 反正只取前 41 位）
  while (b64.length < 41) b64 += '=';
  return b64.slice(0, 41);
}

/** SHA256 → Base64 → 取前 4 字符大写 */
export async function hashGec(token: string): Promise<string> {
  const data = new TextEncoder().encode(GEC_SALT + token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return b64.slice(0, 4).toUpperCase();
}
