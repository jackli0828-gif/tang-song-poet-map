# -*- coding: utf-8 -*-
"""
生成「唐宋词人时空轨迹图」软件著作权申请材料（三份 .docx）：
  1) 计算机软件著作权登记申请表.docx
  2) 源程序鉴别材料.docx   （前30页 + 后30页，每页50行，等宽字体）
  3) 软件用户操作手册.docx （软件文档鉴别材料）

依赖：python-docx（已安装在托管 venv）。
运行：python gen-soft-copyright.py
"""
import os
import io
from docx import Document
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

SRC = r"C:\Users\li\WorkBuddy\2026-10-13-22-46-09\tang-song-poet-map\src"
OUTDIR = r"C:\Users\li\WorkBuddy\2026-10-13-22-46-09\tang-song-poet-map\软著申请材料"
os.makedirs(OUTDIR, exist_ok=True)

# 用户上传的软件演示截图（4 张，其中 096Z 与 101Z 为同一张，实际 3 张唯一）
SHOT_MAIN = r"C:\Users\li\.workbuddy\clipboard-images\clipboard-2026-10-20T10-54-49-096Z-06003298.jpg"
SHOT_POPUP = r"C:\Users\li\.workbuddy\clipboard-images\clipboard-2026-10-20T10-54-49-112Z-b8bbe2a5.jpg"
SHOT_FULL = r"C:\Users\li\.workbuddy\clipboard-images\clipboard-2026-10-20T10-54-49-107Z-4df7507f.jpg"

SOFT_NAME = "唐宋词人时空轨迹图"
SOFT_SHORT = "词人轨迹图"
SOFT_EN = "Tang-Song Poet Map"
VERSION = "V1.0"
VERSION_FULL = "1.0.0"

# ----------------------------------------------------------------------------
# 通用 helper
# ----------------------------------------------------------------------------
def set_cjk(run, font="宋体"):
    run.font.name = font
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn('w:rFonts'))
    if rfonts is None:
        rfonts = OxmlElement('w:rFonts')
        rpr.append(rfonts)
    rfonts.set(qn('w:eastAsia'), font)
    rfonts.set(qn('w:ascii'), font)
    rfonts.set(qn('w:hAnsi'), font)

def style_base(doc):
    normal = doc.styles['Normal']
    normal.font.name = '宋体'
    normal.font.size = Pt(10.5)
    normal._element.get_or_add_rPr().get_or_add_rFonts().set(qn('w:eastAsia'), '宋体')
    # 页面 A4
    for s in doc.sections:
        s.page_height = Cm(29.7)
        s.page_width = Cm(21.0)
        s.left_margin = Cm(2.5)
        s.right_margin = Cm(2.5)
        s.top_margin = Cm(2.5)
        s.bottom_margin = Cm(2.5)

def add_heading(doc, text, level=1):
    p = doc.add_paragraph()
    p.space_after = Pt(6)
    run = p.add_run(text)
    run.bold = True
    if level == 1:
        run.font.size = Pt(15)
        set_cjk(run, "黑体")
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    elif level == 2:
        run.font.size = Pt(13)
        set_cjk(run, "黑体")
    else:
        run.font.size = Pt(11.5)
        set_cjk(run, "黑体")
    return p

def add_para(doc, text, size=10.5, bold=False, align=None, line=1.5, color=None, font="宋体"):
    p = doc.add_paragraph()
    p.paragraph_format.line_spacing = line
    if align is not None:
        p.alignment = align
    run = p.add_run(text)
    run.bold = bold
    run.font.size = Pt(size)
    if color:
        run.font.color.rgb = color
    set_cjk(run, font)
    return p

def add_field(paragraph, field_code):
    run = paragraph.add_run()
    b = OxmlElement('w:fldChar'); b.set(qn('w:fldCharType'), 'begin')
    it = OxmlElement('w:instrText'); it.set(qn('xml:space'), 'preserve'); it.text = field_code
    e = OxmlElement('w:fldChar'); e.set(qn('w:fldCharType'), 'end')
    run._r.append(b); run._r.append(it); run._r.append(e)
    return run

def add_page_number_field(paragraph):
    add_field(paragraph, 'PAGE')
def add_num_pages_field(paragraph):
    add_field(paragraph, 'NUMPAGES')

def add_section_pages_field(paragraph):
    add_field(paragraph, 'SECTIONPAGES')

def shade_cell(cell, fill="D9E2F3"):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), fill)
    tcPr.append(shd)

def kv_table(doc, rows, widths=None, label_w=4.2, value_w=11.0):
    """两列：标签 | 值"""
    t = doc.add_table(rows=0, cols=2)
    t.style = 'Table Grid'
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for label, value in rows:
        r = t.add_row().cells
        r[0].text = ""
        r[1].text = ""
        lr = r[0].paragraphs[0].add_run(label)
        lr.bold = True; lr.font.size = Pt(10); set_cjk(lr, "黑体")
        shade_cell(r[0], "D9E2F3")
        vr = r[1].paragraphs[0].add_run(str(value))
        vr.font.size = Pt(10); set_cjk(vr, "宋体")
        if widths:
            for i, w in enumerate(widths):
                pass
    # 设置列宽
    for row in t.rows:
        row.cells[0].width = Cm(label_w)
        row.cells[1].width = Cm(value_w)
    return t

# ============================================================================
# 1) 计算机软件著作权登记申请表
# ============================================================================
def add_figure(doc, path, caption, srcfile=""):
    """在说明书中插入一张居中图片与图注。"""
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    try:
        run = p.add_run()
        run.add_picture(path, width=Cm(15))
    except Exception:
        p.add_run("[图片未能嵌入：" + path + "]")
    cap = doc.add_paragraph()
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    ct = caption + (("　（截图源文件：" + srcfile + "）") if srcfile else "")
    cr = cap.add_run(ct)
    cr.font.size = Pt(9); cr.italic = True; set_cjk(cr, "宋体")
    cap.paragraph_format.space_after = Pt(10)
    return p

def build_application_form():
    doc = Document()
    style_base(doc)

    # 标题
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("计算机软件著作权登记申请表"); r.bold = True; r.font.size = Pt(20)
    set_cjk(r, "黑体")
    add_para(doc, "（填写样张 / 信息汇总 — 实际申报请在中国版权保护中心网上登记系统在线填报并自动生成正式表格）",
             size=9, align=WD_ALIGN_PARAGRAPH.CENTER, color=RGBColor(0x80,0x80,0x80))
    doc.add_paragraph()

    add_heading(doc, "一、软件基本信息", 1)
    kv_table(doc, [
        ("软件全称", SOFT_NAME),
        ("软件简称", SOFT_SHORT + "（可不选填）"),
        ("版本号", VERSION),
        ("软件分类", "应用软件"),
        ("行业领域", "文化教育 / 数据可视化（古典文学时空轨迹可视化）"),
    ])

    add_heading(doc, "二、著作权人", 1)
    add_para(doc, "（以下带〔*〕的字段请著作权人按实际证件信息填写；本表以自然人独立开发为默认情形给出示例。）", size=9, color=RGBColor(0x80,0x80,0x80))
    kv_table(doc, [
        ("著作权人姓名/名称〔*〕", "（请填写真实姓名或单位名称）"),
        ("著作权人类别", "自然人（或：企业法人）"),
        ("证件类型", "身份证（或：统一社会信用代码证）"),
        ("证件号码〔*〕", "（请填写身份证号 / 统一社会信用代码）"),
        ("国籍", "中国"),
        ("省份/城市", "广东省深圳市（按实际填写）"),
        ("通讯地址〔*〕", "（请填写有效通讯地址）"),
        ("邮政编码〔*〕", "（请填写）"),
        ("联系人〔*〕", "（请填写）"),
        ("联系电话〔*〕", "（请填写）"),
        ("E-mail〔*〕", "（请填写）"),
    ])

    add_heading(doc, "三、权利取得方式与权利范围", 1)
    kv_table(doc, [
        ("权利取得方式", "原始取得"),
        ("权利范围", "全部权利"),
        ("是否含有对操作系统/硬件的独占许可", "否"),
    ])

    add_heading(doc, "四、开发与发表信息", 1)
    kv_table(doc, [
        ("开发完成日期", "2026-10-20"),
        ("是否已发表", "已发表"),
        ("首次发表日期", "2026-10-20"),
        ("首次发表地点 / 国家", "中国 · 互联网（GitHub Pages 公开部署）"),
        ("首次发表网址", "https://jackli0828-gif.github.io/tang-song-poet-map/"),
        ("开发方式", "独立开发（原始取得，无合作开发/委托开发/下达任务）"),
    ])

    add_heading(doc, "五、软件技术信息", 1)
    kv_table(doc, [
        ("开发使用的编程语言", "TypeScript（含 React/TSX 组件）、HTML5、CSS3"),
        ("开发语言及版本号", "TypeScript 5.6、React 18.3、Vite 5.4、Tailwind CSS 3.4、d3-geo 3.1"),
        ("开发硬件环境", "通用 x86_64 个人计算机（内存 8GB 以上）"),
        ("运行硬件环境", "任意可运行现代浏览器的设备（PC / 平板 / 手机）"),
        ("开发使用的操作系统", "Windows 10/11（兼容 macOS / Linux 开发）"),
        ("运行使用的操作系统", "跨平台：Windows / macOS / Linux / Android / iOS 的浏览器"),
        ("开发使用的数据库", "无（数据以内置 JSON / TypeScript 常量形式随包发布，无外部数据库）"),
        ("程序量（源程序总行数）", "62,379 行（.ts/.tsx 源程序；详见《源程序鉴别材料》）"),
        ("源程序鉴别材料提交说明", "源程序超过 60 页（3000 行），依规定提交前 30 页与后 30 页，每页 50 行"),
        ("文档鉴别材料", "《软件用户操作手册》一份（软件文档鉴别材料）"),
        ("面向领域 / 行业", "文化教育、古典文学普及、人文数据可视化"),
    ])

    add_heading(doc, "六、软件功能与特点（简介）", 1)
    add_para(doc,
        "《" + SOFT_NAME + "》是一款完全离线运行的唐宋诗人词人时空轨迹可视化软件。"
        "软件内置中国矢量地图（不调用任何在线地图瓦片或地图 SDK），以 d3-geo 自行投影渲染 SVG 底图，"
        "将诗人词人的年谱节点（生、游、仕、贬、隐、交、卒七类事件）按时间顺序连成轨迹，"
        "并可沿时间轴播放逐节点推进。软件实现“人—时间—地点—作品”一一对应的精准关联："
        "右侧面板同步呈现某地某年所创作的诗词作品（含体裁、名句、全文、创作背景与系年地望）。"
        "主要功能包括：离线中国地图（滚轮缩放、拖拽平移、双击复位）、诗人名录检索与筛选、"
        "时空轨迹绘制、时间轴动画播放与变速、人时地作联动、作品总览与全文放大、"
        "Edge TTS 拟人化朗读（含换音/引擎切换）、背景音乐、多诗人对比时间线、全局四维检索、"
        "地点访客分析、唐宋底图切换、分享链接与全屏模式等。", line=1.5)
    add_para(doc,
        "软件已内置经考订的权威语料：收录唐宋诗人词人 " + "474" + " 位（唐 182 / 宋 292），"
        "人生时空节点 " + "1,827" + " 个，诗词作品 " + "2,066" + " 篇；"
        "内置古地名词典 " + "472" + " 条、地点/系年回填补丁 " + "563" + " 条，"
        "地图依国家标准底图绘制并完整呈现中国领土（含台湾省、南海诸岛）。"
        "软件为纯前端单页应用，可构建为多文件站点或完全离线的单文件 HTML，便于分发与归档。", line=1.5)

    add_heading(doc, "七、申请人声明", 1)
    add_para(doc,
        "本申请表所填写内容及所附材料均真实、合法、有效；软件系本著作权人独立开发完成，"
        "不侵犯任何第三方的著作权及其他合法权益。如有不实，申请人愿承担相应法律责任。", line=1.5)
    doc.add_paragraph()
    kv_table(doc, [
        ("申请人（签章）〔*〕", "________________________"),
        ("申请日期〔*〕", "______ 年 ______ 月 ______ 日"),
    ])

    add_para(doc, "注：带〔*〕字段为正式申报必填项，请著作权人据实补全；本表为信息汇总样张，"
                  "正式表格须通过中国版权保护中心“著作权登记网上登记系统”在线填报并打印。",
             size=9, color=RGBColor(0x80,0x80,0x80))

    out = os.path.join(OUTDIR, "计算机软件著作权登记申请表.docx")
    doc.save(out)
    return out

# ============================================================================
# 2) 源程序鉴别材料（前30页 + 后30页）
# ============================================================================
# 源程序文件顺序（代码模块在前，大型数据文件在后，使前30页展示真实程序逻辑）
ORDER_PREFIX = [
    # 入口
    "main.tsx", "App.tsx", "index.css",
    "types.ts",
    "store/PoetContext.tsx",
]
# utils / hooks / components 全部纳入
DATA_LAST = [  # 数据层放最后
    "data/cities.ts", "data/rivers.ts", "data/regions.ts",
    "data/gazetteer.ts", "data/work-plink.ts",
    "data/poets-x1.ts",
    "data/poets-t1.ts", "data/poets-t2.ts", "data/poets-t3.ts", "data/poets-t4.ts",
    "data/poets-s1.ts", "data/poets-s2.ts", "data/poets-s3.ts", "data/poets-s4.ts",
    "data/works-add.ts", "data/poets.ts",
]

def collect_source():
    files = []
    # 入口与 types/store 按前缀顺序
    for f in ORDER_PREFIX:
        fp = os.path.join(SRC, f)
        if os.path.exists(fp):
            files.append(f)
    # utils
    utils_dir = os.path.join(SRC, "utils")
    if os.path.isdir(utils_dir):
        for f in sorted(os.listdir(utils_dir)):
            if f.endswith(".ts") and os.path.join("utils", f) not in files:
                files.append(os.path.join("utils", f))
    # hooks
    hooks_dir = os.path.join(SRC, "hooks")
    if os.path.isdir(hooks_dir):
        for f in sorted(os.listdir(hooks_dir)):
            if (f.endswith(".ts") or f.endswith(".tsx")) and os.path.join("hooks", f) not in files:
                files.append(os.path.join("hooks", f))
    # components
    comp_dir = os.path.join(SRC, "components")
    if os.path.isdir(comp_dir):
        for f in sorted(os.listdir(comp_dir)):
            if (f.endswith(".ts") or f.endswith(".tsx")) and os.path.join("components", f) not in files:
                files.append(os.path.join("components", f))
    # data 层（最后）
    for f in DATA_LAST:
        fp = os.path.join(SRC, f)
        if os.path.exists(fp) and f not in files:
            files.append(f)
    return files

def build_source_material():
    from docx.enum.section import WD_SECTION
    files = collect_source()
    # 拼合为带文件分隔的纯文本
    buf = []
    for rel in files:
        fp = os.path.join(SRC, rel)
        try:
            with open(fp, "r", encoding="utf-8") as fh:
                text = fh.read()
        except Exception:
            text = ""
        buf.append("// ===== 文件：" + rel + " =====")
        buf.extend(text.split("\n"))
    total_lines = len(buf)
    per_page = 50
    front_n = 30 * per_page   # 1500
    back_n = 30 * per_page    # 1500
    front = buf[:front_n]
    back = buf[total_lines - back_n:] if total_lines >= front_n + back_n else buf[front_n:]

    doc = Document()
    style_base(doc)

    # —— 第 0 节：封面说明（不编入代码页页码）——
    sec0 = doc.sections[0]
    # 清空默认页眉
    sec0.header.paragraphs[0].text = ""
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("源程序鉴别材料"); r.bold = True; r.font.size = Pt(22); set_cjk(r, "黑体")
    add_para(doc, SOFT_NAME + " " + VERSION, size=12, align=WD_ALIGN_PARAGRAPH.CENTER, bold=True)
    doc.add_paragraph()
    add_para(doc,
        "本材料依据《计算机软件著作权登记办法》及中国版权保护中心有关规定提交。"
        "源程序总规模为 " + "{:,}".format(total_lines) + " 行，超过 60 页（3000 行），"
        "依规提交源程序的前 30 页与后 30 页，每页 50 行，采用等宽字体排版。",
        line=1.5, align=WD_ALIGN_PARAGRAPH.LEFT)
    add_para(doc,
        "· 第 1–30 页：源程序前部（入口、类型定义、全局状态、工具函数、钩子、界面组件等核心逻辑）。",
        size=10, line=1.5)
    add_para(doc,
        "· 第 31–60 页：源程序后部（界面组件尾部与数据层尾部）。",
        size=10, line=1.5)
    add_para(doc,
        "说明：本材料左列为连续行号，便于核对；代码以等宽字体（Consolas）呈现，"
        "中文注释以系统中文等宽字体回退显示。末页不足 50 行者已全部提交。",
        size=10, line=1.5, color=RGBColor(0x80,0x80,0x80))

    # —— 第 1 节：代码页（页码从此节重新从 1 开始）——
    doc.add_section(WD_SECTION.NEW_PAGE)
    sec1 = doc.sections[-1]
    # 重启页码
    sectPr = sec1._sectPr
    pgNum = sectPr.find(qn('w:pgNumType'))
    if pgNum is None:
        pgNum = OxmlElement('w:pgNumType')
        sectPr.append(pgNum)
    pgNum.set(qn('w:start'), '1')

    # 第 1 节页眉：软件名 + 版本 + 页码
    hp = sec1.header.paragraphs[0]
    hp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    hr = hp.add_run(SOFT_NAME + " " + VERSION + "　源程序鉴别材料　　第 ")
    hr.font.size = Pt(9); set_cjk(hr, "宋体")
    add_page_number_field(hp)
    hr2 = hp.add_run(" 页 / 共 ")
    hr2.font.size = Pt(9); set_cjk(hr2, "宋体")
    add_section_pages_field(hp)
    hr3 = hp.add_run(" 页")
    hr3.font.size = Pt(9); set_cjk(hr3, "宋体")

    code_font = "Consolas"

    def emit(lines, start_index):
        n = start_index
        lc = 0
        for ln in lines:
            p = doc.add_paragraph()
            p.paragraph_format.line_spacing = 1.0
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.space_before = Pt(0)
            n += 1
            lc += 1
            num = str(n).zfill(5)
            rn = p.add_run(num + "  ")
            rn.font.name = code_font; rn.font.size = Pt(8.5)
            rn._element.get_or_add_rPr().get_or_add_rFonts().set(qn('w:ascii'), code_font)
            rn._element.get_or_add_rPr().get_or_add_rFonts().set(qn('w:hAnsi'), code_font)
            content = ln.rstrip("\n")
            rc = p.add_run(content if content else " ")
            rc.font.name = code_font; rc.font.size = Pt(8.5)
            rc._element.get_or_add_rPr().get_or_add_rFonts().set(qn('w:ascii'), code_font)
            rc._element.get_or_add_rPr().get_or_add_rFonts().set(qn('w:hAnsi'), code_font)
            rc._element.get_or_add_rPr().get_or_add_rFonts().set(qn('w:eastAsia'), "宋体")
            if lc % per_page == 0:
                doc.add_page_break()

    # 前部 1500 行（全局行号 1 起）
    emit(front, 0)
    # 后部 1500 行（全局行号接在源程序末尾）
    emit(back, total_lines - back_n)

    out = os.path.join(OUTDIR, "源程序鉴别材料.docx")
    doc.save(out)
    return out, total_lines, 61

# ============================================================================
# 3) 软件用户操作手册（软件文档鉴别材料）
# ============================================================================
def build_user_manual():
    doc = Document()
    style_base(doc)

    # 封面
    for _ in range(4):
        doc.add_paragraph()
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(SOFT_NAME); r.bold = True; r.font.size = Pt(28); set_cjk(r, "黑体")
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("软 件 用 户 操 作 手 册"); r.bold = True; r.font.size = Pt(20); set_cjk(r, "黑体")
    doc.add_paragraph()
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("（软件文档鉴别材料）"); r.font.size = Pt(12); set_cjk(r, "宋体")
    doc.add_paragraph()
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("版本 " + VERSION + "　·　" + SOFT_EN); r.font.size = Pt(11); set_cjk(r, "宋体")
    doc.add_paragraph()
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("开发完成日期：2026-10-20"); r.font.size = Pt(10.5); set_cjk(r, "宋体")
    doc.add_page_break()

    # 目录（静态列出）
    add_heading(doc, "目　录", 1)
    toc = [
        "第一章　软件概述", "第二章　运行环境与安装部署", "第三章　主界面说明",
        "第四章　地图基础操作", "第五章　诗人名录与选择", "第六章　时空轨迹与节点",
        "第七章　时间轴播放", "第八章　人—时—地—作品联动", "第九章　作品总览与全文",
        "第十章　作品朗读与背景音乐", "第十一章　多诗人对比", "第十二章　全局搜索",
        "第十三章　地点访客分析", "第十四章　唐宋底图切换", "第十五章　分享链接与全屏",
        "第十六章　数据说明与地图合规", "第十七章　常见问题（FAQ）",
    ]
    for t in toc:
        add_para(doc, t, size=11, line=1.4)

    doc.add_page_break()

    def ch(title): add_heading(doc, title, 1)

    ch("第一章　软件概述")
    add_para(doc,
        "《" + SOFT_NAME + "》是一款完全离线运行的唐宋诗人词人时空轨迹可视化软件。"
        "软件以“人—时间—地点—作品”一一对应为核心设计理念，将唐宋诗人词人的生平行迹与创作活动"
        "在地图上直观呈现，帮助用户理解文学作品的时空背景。")
    add_para(doc, "1.1　软件定位", size=11, bold=True); set_last_bold(doc)
    add_para(doc,
        "面向古典文学爱好者、教研人员与普通读者，提供可交互的时空叙事：沿时间轴回放一位诗人一生"
        "的迁徙与创作，或并置多位诗人“同一年，谁在哪里，写了什么”。")
    add_para(doc, "1.2　核心特性", size=11, bold=True); set_last_bold(doc)
    for t in [
        "完全离线：内置中国矢量地图，不依赖任何在线地图瓦片或地图 SDK；可构建为单文件 HTML。",
        "精准关联：内置考订语料 474 位诗人词人、1,827 个时空节点、2,066 篇作品，系年与地望可溯。",
        "多维交互：缩放/平移/复位、时间轴动画、轨迹生长、人时地作联动、对比时间线、全局搜索。",
        "有声阅读：Edge TTS 拟人化中文朗读（5 种音色可切换），并保留系统朗读作为回退。",
        "合规底图：依国家标准绘制，完整呈现中国领土（含台湾省、南海诸岛）。",
    ]:
        add_para(doc, "· " + t, size=10.5, line=1.4)

    ch("第二章　运行环境与安装部署")
    add_para(doc, "2.1　硬件环境", size=11, bold=True); set_last_bold(doc)
    add_para(doc, "开发/运行硬件：通用 x86_64 个人计算机（建议内存 8GB 以上）；运行端可为任意可运行现代浏览器的设备（PC、平板、手机）。")
    add_para(doc, "2.2　软件环境", size=11, bold=True); set_last_bold(doc)
    kv_table(doc, [
        ("操作系统（开发）", "Windows 10/11（兼容 macOS / Linux）"),
        ("操作系统（运行）", "跨平台：Windows / macOS / Linux / Android / iOS 的浏览器"),
        ("运行依赖", "现代浏览器（Chrome / Edge / Firefox / Safari，建议近三年版本）"),
        ("构建工具链", "Node.js 18+，npm；Vite 5.4、TypeScript 5.6、React 18.3"),
        ("外部数据库", "无（数据随包内置）"),
    ])
    add_para(doc, "2.3　安装与启动（开发模式）", size=11, bold=True); set_last_bold(doc)
    add_para(doc, "在项目根目录执行以下命令：", line=1.4)
    add_code(doc, "npm install          # 安装依赖（索引异常可加 --registry=https://registry.npmmirror.com）\n"
                   "npm run dev          # 启动开发服务器，浏览器访问终端提示的本地地址\n"
                   "npm run build        # 类型检查 + 生产构建（输出 dist/）\n"
                   "npm run typecheck    # 仅类型检查")
    add_para(doc, "2.4　发布与离线使用", size=11, bold=True); set_last_bold(doc)
    add_para(doc,
        "执行 `npm run build` 后，dist/ 目录即为可部署的多文件站点；亦可通过单文件构建脚本生成"
        "完全离线的「" + SOFT_NAME + ".html」（约 2.5 MB），双击即可在浏览器打开，无需联网与服务器。")

    ch("第三章　主界面说明")
    add_figure(doc, SHOT_MAIN, "图 3-1　软件主界面与地图总览（顶栏 / 左侧诗人名录 / 中央地图轨迹 / 底部时间轴 / 右侧作品面板）",
              "clipboard-2026-10-20T10-54-49-096Z-06003298.jpg")
    add_para(doc,
        "软件采用单页布局，自左至右、自上而下分为以下区域：")
    kv_table(doc, [
        ("顶部栏（TopBar）", "软件标题、唐宋底图切换、全局搜索入口、全屏按钮、分享按钮、背景音乐开关。"),
        ("左侧栏（PoetSidebar）", "诗人名录：按朝代筛选、关键词搜索、单击选中、勾选（≤3 位）进入对比。"),
        ("中央地图区（MapCanvas）", "中国矢量底图与轨迹、节点、河流、古今都会标注；支持缩放/平移/复位。"),
        ("时间轴（Timeline）", "底部播放控制：播放/暂停、0.5×–2× 变速、拖动/点击年份跳转、节点刻度。"),
        ("右侧面板（WorkPanel / WorksGallery / CompareView）", "展示年谱事件、该地该时作品、作品总览或多人对比。"),
        ("图例（Legend）", "七类事件字形/颜色说明，默认收起，点击展开。"),
        ("首屏引导（GuideOverlay）", "首次进入的简短操作引导，可随时关闭。"),
    ])

    ch("第四章　地图基础操作")
    add_para(doc, "4.1　缩放", size=11, bold=True); set_last_bold(doc)
    add_para(doc, "在地图区滚动鼠标滚轮（或触控板捏合）进行缩放；缩放以光标位置为焦点。")
    add_para(doc, "4.2　平移", size=11, bold=True); set_last_bold(doc)
    add_para(doc, "按住鼠标左键拖拽地图可平移视图；拖到边界处自动约束在中国版图范围内。")
    add_para(doc, "4.3　复位", size=11, bold=True); set_last_bold(doc)
    add_para(doc, "双击地图任意位置可将视图复位到初始范围；作品弹窗（MapWorkPopup）也可独立拖拽，不随地图移动。")

    ch("第五章　诗人名录与选择")
    add_para(doc,
        "左侧栏列出全部 474 位诗人词人（唐 182 / 宋 292）。可在搜索框输入姓名或关键词过滤；"
        "点击朝代标签（唐/宋）进行筛选。单击某位诗人即选中并在地图上绘制其轨迹；"
        "勾选不超过 3 位诗人可进入对比模式，时间轴与右侧面板切换为多人对照视图。")

    ch("第六章　时空轨迹与节点")
    add_para(doc,
        "选中诗人后，地图按年份顺序将其人生节点连成带方向箭头的轨迹线；轨迹随播放进度“生长”。"
        "每个节点以七类字形与颜色区分事件类型：")
    kv_table(doc, [
        ("生（出生）", "出生地 / 早年"), ("游（游历）", "漫游、行旅"),
        ("仕（仕宦）", "任职、应举"), ("贬（贬谪）", "贬官、流放"),
        ("隐（隐居）", "隐逸、闲居"), ("交（交游）", "交游、唱和"),
        ("卒（逝世）", "卒葬之地"),
    ])
    add_para(doc,
        "节点旁标注古称与今地（如“黄州（湖北黄冈）”）；将鼠标悬停或单击节点可查看该节点的"
        "年号纪年、年龄、事件描述与所在地该时的作品。")

    ch("第七章　时间轴播放")
    add_para(doc,
        "底部时间轴提供完整的时空回放控制：")
    for t in [
        "播放 / 暂停：点击中心按钮开始或停止逐年推进。",
        "变速：提供 0.5×、1×、2× 三档，控制推进速度。",
        "跳转：拖动滑块或直接点击年份刻度，可定位到任意年份。",
        "脉冲与生长：当前年份对应节点有脉冲动画，轨迹按进度动态生长。",
    ]:
        add_para(doc, "· " + t, size=10.5, line=1.4)

    ch("第八章　人—时—地—作品联动")
    add_figure(doc, SHOT_POPUP, "图 8-1　地点作品联动弹窗（选中节点后，弹窗内列出此地此际所作诗词，可切换标签与查看赏析）",
              "clipboard-2026-10-20T10-54-49-112Z-b8bbe2a5.jpg")
    add_para(doc,
        "右侧面板是“人—时—地—作品”联动的核心：当时间轴推进到某一年，面板同步显示——"
        "该节点的年号纪年（如“元丰五年”）、诗人当年年龄、古称（今地）、事件描述，"
        "以及“此地此际所作”的作品列表，每条含体裁、名句节选、创作背景。"
        "点击作品条目可在弹窗中展开全文与赏析。")

    ch("第九章　作品总览与全文")
    add_figure(doc, SHOT_FULL, "图 9-1　作品全文页（点击作品标题处放大按钮进入，完整呈现全文、创作背景、系年地望与主题标签）",
              "clipboard-2026-10-20T10-54-49-107Z-4df7507f.jpg")
    add_para(doc,
        "“作品总览”（WorksGallery）按创作时间倒序列出该诗人全部作品；点击任一作品条目可反向"
        "定位回地图对应节点。点击作品标题处的放大按钮，进入“作品全文页”（WorkFullscreen），"
        "以更大字号呈现作品全文、创作背景与系年地望，便于诵读与研读。")

    ch("第十章　作品朗读与背景音乐")
    add_para(doc, "10.1　作品朗读", size=11, bold=True); set_last_bold(doc)
    add_para(doc,
        "在作品弹窗与作品总览中，每条作品提供“朗读”按钮，调用 Edge TTS 拟人化中文语音"
        "（云希/晓晓/云扬/云皓/云枫五种 Neural 音色），通过浏览器直连合成并流式播放；"
        "旁有“换音”与“引擎”小按钮，可切换音色或在 Edge TTS 与系统朗读之间切换（系统朗读为回退）。"
        "生平朗读在时间轴处始终可用。")
    add_para(doc, "10.2　背景音乐", size=11, bold=True); set_last_bold(doc)
    add_para(doc, "顶部栏提供背景音乐开关，可开启/关闭内置 BGM，提升沉浸式的古典浏览体验。")

    ch("第十一章　多诗人对比")
    add_para(doc,
        "在左侧栏勾选不超过 3 位诗人后进入对比模式（CompareView）：地图叠加多人轨迹；"
        "右侧对照时间线展示“同一年，谁在哪里，写了什么”，并可同步定位到同一年份，"
        "直观比较同时代诗人的行迹与创作。")

    ch("第十二章　全局搜索")
    add_para(doc,
        "顶部栏的全局搜索（GlobalSearch）支持对“人 / 地 / 作品 / 关键词”四维检索："
        "输入诗人姓名、地名古称或今地、作品标题或名句、主题标签（如“思乡”“贬谪”“山水”），"
        "即可快速定位到对应的诗人、地点节点或作品，并一键跳转至地图相应位置。")

    ch("第十三章　地点访客分析")
    add_para(doc,
        "“地点访客面板”（PlaceVisitorsPanel）汇总某一地点被哪些诗人到访、各自在何年因何事到此、"
        "留下了哪些作品，帮助用户从“地点”视角串联多位诗人的行迹与创作交集。")

    ch("第十四章　唐宋底图切换")
    add_para(doc,
        "顶部栏可切换唐（开元十五道）与宋（路制）两种淡设色示意底图，"
        "以历史政区语境呈现诗人行迹；唐宋政区为简化示意，中国版图完整呈现，"
        "不追求精确历史疆界。")

    ch("第十五章　分享链接与全屏")
    add_para(doc,
        "“分享”按钮可生成携带当前选中诗人、年份与视图状态的链接（基于 Hash 路由），"
        "他人打开链接即可还原同一浏览场景；顶部“全屏”按钮可进入/退出浏览器全屏模式，"
        "便于演示与教学。")

    ch("第十六章　数据说明与地图合规")
    add_para(doc, "16.1　数据规模", size=11, bold=True); set_last_bold(doc)
    kv_table(doc, [
        ("诗人词人", "474 位（唐 182 / 宋 292）"),
        ("人生时空节点", "1,827 个"),
        ("诗词作品", "2,066 篇"),
        ("古地名词典", "472 条（古称→今地→经纬度）"),
        ("地点/系年回填补丁", "563 条"),
    ])
    add_para(doc, "16.2　数据来源与考订", size=11, bold=True); set_last_bold(doc)
    add_para(doc,
        "年谱依据两《唐书》、《宋史》本传及学界通行年谱整理；作品系年凡有异说者，均在背景或"
        "注释中标注“一说……”或“系年存疑”，不以一说冒充定论。作品文本经权威版本校订。")
    add_para(doc, "16.3　地图合规", size=11, bold=True); set_last_bold(doc)
    add_para(doc,
        "底图数据源自阿里云 DataV.GeoAtlas（依国家标准底图绘制），经抽稀随包内置；"
        "完整绘制中国台湾省、海南省、香港及澳门特别行政区与南海诸岛断续线；"
        "不使用任何境外地图瓦片或在线地图 SDK，不裁剪、不割裂任何中国领土要素。")

    ch("第十七章　常见问题（FAQ）")
    faqs = [
        ("地图打不开/空白？", "请使用近三年的主流浏览器并启用 JavaScript；离线单文件 HTML 直接双击即可，无需服务器。"),
        ("朗读没声音？", "Edge TTS 需浏览器直连微软语音服务，请确认网络可达；若不可用，自动回退到系统朗读。"),
        ("为什么只能对比 3 位诗人？", "为避免轨迹与对照时间线过于拥挤，对比模式上限为 3 位，可在左侧栏取消勾选后重选。"),
        ("数据可以扩充吗？", "数据层（data/）以 TypeScript 常量维护，可追加诗人、节点与作品后重新构建。"),
        ("如何部署到自己的服务器？", "将 dist/ 目录整体上传至任意静态服务器，或将单文件 HTML 直接托管即可。"),
    ]
    for q, a in faqs:
        add_para(doc, "Q：" + q, size=10.5, bold=True, line=1.3)
        add_para(doc, "A：" + a, size=10.5, line=1.4)

    add_para(doc, "— 手册结束 —", size=10, align=WD_ALIGN_PARAGRAPH.CENTER, color=RGBColor(0x80,0x80,0x80))

    out = os.path.join(OUTDIR, "软件用户操作手册.docx")
    doc.save(out)
    return out

def set_last_bold(doc):
    # 上一段落已是加粗小标题，无需额外处理；占位以保持调用一致
    pass

def add_code(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.line_spacing = 1.05
    p.paragraph_format.left_indent = Cm(0.5)
    code_font = "Consolas"
    for line in text.split("\n"):
        run = p.add_run(line + "\n")
        run.font.name = code_font; run.font.size = Pt(9.5)
        run._element.get_or_add_rPr().get_or_add_rFonts().set(qn('w:ascii'), code_font)
        run._element.get_or_add_rPr().get_or_add_rFonts().set(qn('w:hAnsi'), code_font)
        run._element.get_or_add_rPr().get_or_add_rFonts().set(qn('w:eastAsia'), "宋体")
    # 用浅灰底纹包裹
    pPr = p._p.get_or_add_pPr()
    shd = OxmlElement('w:shd'); shd.set(qn('w:val'),'clear'); shd.set(qn('w:color'),'auto'); shd.set(qn('w:fill'),'F2F2F2')
    pPr.append(shd)
    return p

# ----------------------------------------------------------------------------
if __name__ == "__main__":
    f1 = build_application_form()
    f2, total, pages = build_source_material()
    f3 = build_user_manual()
    print("OK")
    print("申请表:", f1)
    print("源程序鉴别材料:", f2, "总行数=", total, "页数=", pages)
    print("用户操作手册:", f3)
