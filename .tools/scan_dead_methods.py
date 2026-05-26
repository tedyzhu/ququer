"""自动扫描 chat.js 与各模块中无外部引用的方法

用法:
    python3 .tools/scan_dead_methods.py

工作流:
1. 从 app/pages/chat/chat.js 与 app/pages/chat/modules/*.js 中提取所有方法定义
   - chat.js 形如:`  methodName: function(...)` 或 `  methodName: async function(...)`
   - modules 形如:`function methodName(...)` 与 `page.methodName = function`(导出挂载)
2. 全项目 grep 每个方法名,排除自身定义行,统计真实引用数
3. 输出 0 引用的方法名清单,便于人工确认后批量删除

排除规则:
- 自身定义行
- 注释行(以 // 开头 或 /** ... */ 中)
- 模块内 `module.exports` 与 `page.xxx = ` 这类 wiring 语句

仅用于辅助决策,具体删除前仍需人工 grep 二次确认。
"""

import os
import re
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

# chat.js 与子模块路径
CHAT_JS = os.path.join(ROOT, 'app/pages/chat/chat.js')
MODULES_DIR = os.path.join(ROOT, 'app/pages/chat/modules')

# 全项目搜索范围
SEARCH_EXCLUDE_DIRS = {'.git', '.plans', 'node_modules', '.tools'}
SEARCH_FILE_EXTS = ('.js', '.wxml', '.json', '.wxss')

# Page 必须保留的生命周期/原生入口方法,即便外部"无引用"也不能删
LIFECYCLE_METHODS = {
    'data', 'onLoad', 'onShow', 'onReady', 'onHide', 'onUnload',
    'onPullDownRefresh', 'onReachBottom', 'onShareAppMessage', 'onPageScroll',
    'onTabItemTap',
}


def extract_methods_from_chat_js(path: str) -> dict:
    """提取 chat.js 中所有 Page 方法定义,返回 {name: line_no}"""
    methods = {}
    if not os.path.exists(path):
        return methods
    with open(path, encoding='utf-8') as f:
        content = f.read()
    pat = re.compile(r'^  (\w+):\s*(async\s+)?function', re.M)
    for m in pat.finditer(content):
        name = m.group(1)
        line_no = content[: m.start()].count('\n') + 1
        methods[name] = (path, line_no)
    return methods


def extract_methods_from_module(path: str) -> dict:
    """提取模块文件中通过 `function xxx` 或 `page.xxx = function` 暴露的方法。

    注意:模块内部的 helper(`function helper`)如果只在模块内引用,不会出现在外部 grep 中,
    这种情况会被 false-positive 报为 dead — 由人工二次确认时排除。
    """
    methods = {}
    if not os.path.exists(path):
        return methods
    with open(path, encoding='utf-8') as f:
        content = f.read()
    # function xxx(
    pat1 = re.compile(r'^function (\w+)\s*\(', re.M)
    for m in pat1.finditer(content):
        name = m.group(1)
        if name in ('attach', 'init'):
            continue  # 模块入口,不算业务方法
        line_no = content[: m.start()].count('\n') + 1
        methods[name] = (path, line_no)
    # page.xxx = function
    pat2 = re.compile(r'page\.(\w+)\s*=\s*function', re.M)
    for m in pat2.finditer(content):
        name = m.group(1)
        line_no = content[: m.start()].count('\n') + 1
        methods.setdefault(name, (path, line_no))
    return methods


def collect_search_files(root: str) -> list:
    files = []
    for r, ds, fs in os.walk(root):
        ds[:] = [d for d in ds if d not in SEARCH_EXCLUDE_DIRS]
        for f in fs:
            if f.endswith(SEARCH_FILE_EXTS):
                files.append(os.path.join(r, f))
    return files


def count_refs(name: str, files: list, definition_path: str, definition_line: int) -> int:
    """统计 name 在所有文件中的"外部引用"(排除自身定义行)"""
    pat = re.compile(r'(?<![\w])' + re.escape(name) + r'(?![\w])')
    count = 0
    for fp in files:
        try:
            with open(fp, encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
        except Exception:
            continue
        for i, line in enumerate(lines, 1):
            if not pat.search(line):
                continue
            stripped = line.strip()
            # 排除自身定义行
            if fp == definition_path and i == definition_line:
                continue
            # 排除模块导出 wiring(page.x = x; module.exports = { x };)
            if re.match(r'^\s*page\.' + re.escape(name) + r'\s*=', line):
                continue
            if re.match(r'^\s*' + re.escape(name) + r':\s*' + re.escape(name) + r',?\s*$', line):
                continue
            # 排除 chat.js 内的方法定义行(method 自身)
            if re.match(r'^\s*' + re.escape(name) + r':\s*(async\s+)?function', line):
                continue
            # 排除 function xxx 自身定义
            if re.match(r'^\s*function\s+' + re.escape(name) + r'\s*\(', line):
                continue
            # 排除注释行
            if stripped.startswith('//') or stripped.startswith('*'):
                continue
            count += 1
    return count


def main() -> None:
    methods = {}
    methods.update(extract_methods_from_chat_js(CHAT_JS))
    if os.path.isdir(MODULES_DIR):
        for f in sorted(os.listdir(MODULES_DIR)):
            if f.endswith('.js'):
                methods.update(extract_methods_from_module(os.path.join(MODULES_DIR, f)))

    files = collect_search_files(ROOT)
    print(f'扫描 {len(methods)} 个方法 在 {len(files)} 个文件中的引用情况...\n')

    no_refs, low_refs = [], []
    for name in sorted(methods.keys()):
        if name in LIFECYCLE_METHODS:
            continue
        path, line = methods[name]
        refs = count_refs(name, files, path, line)
        if refs == 0:
            no_refs.append((name, path, line))
        elif refs == 1:
            low_refs.append((name, path, line, refs))

    rel = lambda p: p.replace(ROOT + '/', '')

    if no_refs:
        print(f'## NO REFS ({len(no_refs)} 个 — 需人工二次确认是否真死)\n')
        for n, p, l in no_refs:
            print(f'  {n:50s}  {rel(p)}:{l}')
    else:
        print('## NO REFS — 无')

    print()
    if low_refs:
        print(f'## 仅 1 处引用 ({len(low_refs)} 个 — 可能也属于死代码,需查上下文)\n')
        for n, p, l, c in low_refs:
            print(f'  {n:50s}  {rel(p)}:{l}')


if __name__ == '__main__':
    main()
