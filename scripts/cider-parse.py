#!/usr/bin/env python3
"""
cider-parse.py — 从《唐诗/宋词鉴赏辞典（新一版）》EPUB 提取结构化语料
输出：scripts/_cider/cider-tang.json / cider-song.json
结构：{ "volume": ..., "authors": [ {name, bio, works:[{title, body}]} ] }
"""
import zipfile, re, json, sys, os

EPUB = r'C:/Users/li/Downloads/唐诗宋词元曲古文(共6册)(中国文学鉴赏辞典).epub'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_cider')
os.makedirs(OUT, exist_ok=True)

z = zipfile.ZipFile(EPUB)
names = [n for n in z.namelist() if n.startswith('text/part') and n.endswith('.html')]
texts = []
for n in names:
    data = z.read(n).decode('utf-8', errors='ignore')
    txt = re.sub(r'<br\s*/?>', '\n', data)
    txt = re.sub(r'</(p|div|h[1-6]|li)>', '\n', txt)
    txt = re.sub(r'<[^>]+>', '', txt)
    txt = txt.replace('\u3000', ' ')
    txt = re.sub(r'[ \t]+', ' ', txt)
    txt = re.sub(r'\n\s+', '\n', txt)
    texts.append(txt.strip())

MARK = '【作者小传】'

def locate_volume(title_pat: str, start_hint: int, end_pat: str = None):
    """定位分册：从 start_hint 开始找 title_pat，到 end_pat（古文册出版说明）为止"""
    start = end = None
    for i in range(start_hint, len(texts)):
        if title_pat in texts[i][:300]:
            start = i
            break
    if start is None:
        return None, None
    # 宋册正文起点：start 后第一个含小传标记的 part
    s2 = start
    while s2 < len(texts) and MARK not in texts[s2]:
        s2 += 1
    if s2 >= len(texts):
        return start, start
    # 终点：遇到「古文鉴赏辞典」出版说明
    e = None
    for i in range(s2, len(texts)):
        if '古文鉴赏辞典' in texts[i][:200] and ('出版说明' in texts[i][:500] or '凡例' in texts[i][:500]):
            e = i
            break
    if e is None:
        # 元曲册出版说明
        for i in range(s2, len(texts)):
            if '元曲鉴赏辞典' in texts[i][:200] and '出版说明' in texts[i][:500]:
                e = i
                break
    if e is None:
        e = len(texts)
    return s2, e - 1

def chinese_names(s: str):
    return re.findall(r'[\u4e00-\u9fff]{1,6}', s)

def extract(start, end):
    """逐 part 顺序扫描，拼出完整作者块序列"""
    # 拼接正文为一段，记录小传标记位置
    blob_parts = []
    for i in range(start, end + 1):
        blob_parts.append(texts[i])
    blob = '\n'.join(blob_parts)

    # 按小传标记切分
    segs = blob.split(MARK)
    authors = []
    for k in range(len(segs)):
        if k == 0:
            continue
        pre = segs[k - 1]      # 小传前：通常以「作者名」结尾（跨页时可能夹带作品赏析尾文）
        block = segs[k]        # 小传 + 作品们（到下一位作者的小传标记前）
        # 作者名：pre 末尾 1..6 字中文（跳过「诗 人」类标题残留）
        nm = chinese_names(pre.strip())
        name = nm[-1] if nm else '?'
        # 小传文本：block 开头到第一个作品标题
        bio, works = split_works(block, name)
        authors.append({'name': name, 'bio': bio, 'works': works})
    return authors

def split_works(block: str, author_name: str):
    """块 = 小传 + 作品们。切分：短标题行(2-16字,无标点) + 下一行含作者名 → 作品起点"""
    lines = [l.strip() for l in block.split('\n') if l.strip()]

    def is_title(idx):
        if idx + 1 >= len(lines):
            return False
        t = lines[idx]
        if not (2 <= len(t) <= 16):
            return False
        if re.search(r'[，。；：、【】（）(\)""\'\'！？?！]', t):
            return False
        nxt = lines[idx + 1]
        return (nxt == author_name or nxt.startswith(author_name) or
                (len(nxt) < 24 and author_name in nxt))

    # 找小传与第一作品的分界（第一个标题候选，且其前文本含「小传特征词」）
    boundary = None
    for idx in range(1, len(lines)):
        if is_title(idx):
            prev_ctx = ' '.join(lines[max(0, idx - 3):idx])
            # 小传通常提到 唐书/才子传/纪事/存其诗 等
            if re.search(r'唐书|宋史|才子传|纪事|全唐诗|全宋词|存其诗|词集|诗一卷|集.*卷', prev_ctx) or idx >= 4:
                boundary = idx
                break
    bio = ' '.join(lines[:boundary]) if boundary else ''

    works = []
    idx = boundary if boundary else 0
    while idx < len(lines):
        if not is_title(idx):
            # 标题行没匹配到 → 跳过该行（赏析散文行）继续找下一个标题
            idx += 1
            continue
        title = lines[idx]
        j = idx + 2
        body_lines = [lines[idx + 1]] if idx + 1 < len(lines) else []
        while j < len(lines):
            if is_title(j):
                break
            body_lines.append(lines[j])
            j += 1
        body = ' '.join(body_lines).strip()
        works.append({'title': title, 'body': body})
        idx = j
    return bio, works

def main():
    # 唐册：凡例(part4)后第一个小传
    t_start = None
    for i in range(4, 40):
        if MARK in texts[i]:
            t_start = i
            break
    t_end = None
    for i in range(t_start, len(texts)):
        if '宋词鉴赏辞典' in texts[i][:300] and '目录' in texts[i][:300]:
            t_end = i
            break
    t_end = t_end - 1 if t_end else len(texts) - 1

    # 宋册：宋册目录后第一个小传
    s_start = None
    for i in range(t_end, len(texts)):
        if MARK in texts[i]:
            s_start = i
            break
    s_end = None
    for i in range(s_start, len(texts)):
        if ('元曲鉴赏辞典' in texts[i][:300] or '古文鉴赏辞典' in texts[i][:300]) and '出版说明' in texts[i][:600]:
            s_end = i
            break
    s_end = s_end - 1 if s_end else len(texts) - 1

    print(f'唐册 [{t_start}..{t_end}]  宋册 [{s_start}..{s_end}]', file=sys.stderr)
    for vol, s, e in (('tang', t_start, t_end), ('song', s_start, s_end)):
        authors = extract(s, e)
        path = os.path.join(OUT, f'cider-{vol}.json')
        with open(path, 'w', encoding='utf-8') as f:
            json.dump({'volume': vol, 'authors': authors}, f, ensure_ascii=False, indent=1)
        print(f'{vol}: {len(authors)} authors → {path}', file=sys.stderr)
        for a in authors[:3]:
            print('   ', a['name'], '| works:', len(a['works']), [w['title'] for w in a['works'][:3]], file=sys.stderr)

if __name__ == '__main__':
    main()
