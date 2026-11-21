#!/usr/bin/env node
/* ============================================================
 * PhoneShell 构建脚本（零依赖 / ESM / Node 18+）
 *
 * 作用：把 src/ 下的模板与源码组装成单文件 phone.html
 *   1. src/shell.html   —— HTML 模板（含 3 个占位标记）
 *   2. src/core.css     —— 填入 CSS 占位标记（位于 <style> 内）
 *   3. src/core.js      —— 填入 JS  占位标记（位于 <script> 内）
 *   4. src/apps/*.js    —— 追加到 APP_SCRIPTS 占位注释处
 *   5. src/games/*.js   —— 追加到 APP_SCRIPTS 占位注释处（排在 apps 之后）
 *
 * 注：三个占位标记的原文见下方常量 MARK_CSS / MARK_JS / MARK_APPS。
 *
 * 用法：
 *   node build.mjs                       # 构建一次
 *   node build.mjs --watch               # 监听 src/ 变化并自动重建
 *   node build.mjs --out dist/phone.html # 指定输出路径
 * ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

/* ---------------- 基础路径 ---------------- */

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url)); // 本脚本所在目录（即项目根）
const SRC_DIR = path.join(SCRIPT_DIR, 'src');
const SHELL_FILE = path.join(SRC_DIR, 'shell.html');
const CORE_CSS_FILE = path.join(SRC_DIR, 'core.css');
const CORE_JS_FILE = path.join(SRC_DIR, 'core.js');

// 插件目录：apps 在前，games 在后（顺序即最终 <script> 顺序）
const PLUGIN_DIRS = [
  { key: 'apps', dir: path.join(SRC_DIR, 'apps') },
  { key: 'games', dir: path.join(SRC_DIR, 'games') },
];

// 三个占位标记（必须与模板完全一致）
const MARK_CSS = '/*__CORE_CSS__*/';
const MARK_JS = '/*__CORE_JS__*/';
const MARK_APPS = '<!--__APP_SCRIPTS__-->';

const DEFAULT_OUT = path.join(SCRIPT_DIR, 'phone.html');

/* ---------------- 小工具 ---------------- */

/** 读取文本文件（去掉 BOM，统一不存在时抛中文错误） */
function readText(file, label) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw new BuildError(`无法读取${label}：${file}\n  原因：${err.message}\n  提示：请确认文件存在且可读。`);
  }
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw; // 去掉 BOM
}

/** 统计行数：空内容记 0 行，否则按换行符计数 */
function countLines(text) {
  if (text.length === 0) return 0;
  let n = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

/** 人类可读的字节大小 */
function fmtKB(text) {
  return `${(Buffer.byteLength(text, 'utf8') / 1024).toFixed(2)} KB`;
}

/** 自定义错误：用于区分「预期内的构建失败」和意外崩溃 */
class BuildError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BuildError';
    this.isBuildError = true;
  }
}

/* ---------------- 关键：内联转义防护 ---------------- */

/**
 * 转义会破坏 HTML 结构的序列。
 * - `</script`（大小写不敏感）→ `<\/script`：JS 字符串在语义上完全等价，
 *   但 HTML 解析器不再把它当作 </script> 结束标签，避免脚本被提前截断。
 * - `<!--` 在 script 数据状态下会开启「脚本数据转义状态」，
 *   进而可能让后续的 `</script>` 失效，这里一并拆断为 `<\!--`（JS 中字符串里合法）。
 * - `</style`（大小写不敏感）→ `<\/style`：CSS 中 `\/` 在字符串/url() 里等价，
 *   可防止提前结束 <style> 块。
 */
function escapeInlineText(text, kind = 'js') {
  // 用替换函数而不是替换字符串：既避免 `$\`` 等特殊替换模式被解释，
  // 又能把结尾标签原本的大小写（</SCRIPT / </Script）原样带过去。
  let out = text.replace(/<\/(script)/gi, (_, tag) => `<\\/${tag}`);
  out = out.replace(/<!--/g, '<\\!--');
  if (kind === 'css') out = out.replace(/<\/(style)/gi, (_, tag) => `<\\/${tag}`);
  return out;
}

/* ---------------- 语法校验（内存中完成，不 spawn 子进程） ---------------- */

function checkSyntax(source, label) {
  try {
    new vm.Script(source, { filename: label }); // 只编译不执行
  } catch (err) {
    throw new BuildError(
      `语法检查失败：${label}\n  ${err.message}\n  提示：请修正该文件的 JavaScript 语法后重新构建。`
    );
  }
}

/* ---------------- 收集插件文件 ---------------- */

/**
 * 列出某个插件目录下的 .js 文件（按文件名排序）。
 * 目录不存在 / 为空 / 没有 .js 都不算错误，返回空数组即可。
 */
function listPlugins(dirInfo) {
  const { key, dir } = dirInfo;
  if (!fs.existsSync(dir)) return [];
  let stat;
  try {
    stat = fs.statSync(dir);
  } catch {
    return [];
  }
  if (!stat.isDirectory()) return [];

  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    throw new BuildError(`无法读取插件目录：${dir}\n  原因：${err.message}`);
  }

  return names
    .filter((name) => name.toLowerCase().endsWith('.js'))
    .filter((name) => {
      try {
        return fs.statSync(path.join(dir, name)).isFile(); // 目录形式的 xxx.js 直接忽略
      } catch {
        return false;
      }
    })
    .sort((a, b) => a.localeCompare(b, 'en'))
    .map((name) => ({
      name,
      label: `${key}/${name}`, // 报告中显示的相对路径
      file: path.join(dir, name),
    }));
}

/* ---------------- 单次构建 ---------------- */

/**
 * 执行一次完整构建。
 * @param {string} outFile 输出文件绝对路径
 * @returns {{report:string, outFile:string}}
 */
function buildOnce(outFile) {
  const t0 = Date.now();

  /* 1. 读取模板与核心资源 */
  let shell = readText(SHELL_FILE, 'HTML 模板');
  const coreCss = readText(CORE_CSS_FILE, '核心样式 core.css');
  const coreJs = readText(CORE_JS_FILE, '核心脚本 core.js');

  /* 2. 校验占位标记是否存在（每个必须恰好出现一次） */
  const marks = [
    { mark: MARK_CSS, where: 'HTML 模板 <style> 内' },
    { mark: MARK_JS, where: 'HTML 模板 <script> 内' },
    { mark: MARK_APPS, where: 'HTML 模板末尾' },
  ];
  const missing = [];
  for (const { mark, where } of marks) {
    const hits = shell.split(mark).length - 1;
    if (hits === 0) missing.push(`  缺失 ${mark}（应位于：${where}）`);
    else if (hits > 1) missing.push(`  重复出现 ${hits} 次 ${mark}（应位于：${where}，必须唯一）`);
  }
  if (missing.length) {
    throw new BuildError(
      `HTML 模板占位标记检查未通过：${SHELL_FILE}\n${missing.join('\n')}\n  提示：请恢复模板中的占位标记后再构建。`
    );
  }

  /* 3. 收集插件（apps 在前，games 在后；目录缺失或为空均不算错误） */
  const pluginGroups = PLUGIN_DIRS.map(listPlugins);
  const plugins = pluginGroups.flat();

  /* 4. 逐个校验插件语法并转义 */
  const parts = [];
  for (const p of plugins) {
    const source = readText(p.file, `插件文件 ${p.label}`);
    checkSyntax(source, p.label); // 语法错误 → 直接失败并给出中文提示
    const safe = escapeInlineText(source, 'js');
    p.source = safe;
    p.lines = countLines(source);
    parts.push(
      `\n<script>/* ${p.label} */\n${safe.replace(/\n+$/, '')}\n</script>\n`
    );
  }

  /* 5. 校验 core.js 语法并转义 */
  checkSyntax(coreJs, 'core.js');
  const safeCoreJs = escapeInlineText(coreJs, 'js');
  const safeCoreCss = escapeInlineText(coreCss, 'css');

  /* 6. 替换占位标记
     注意：必须用“替换函数”而不是替换字符串，否则被内联的源码里的 $$、$&、$` 等
     会被 String.replace 当成替换模式解释（历史上就因此把 core.js 的 function $$(...)
     塌缩成了 function $(...)）。 */
  shell = shell.replace(MARK_CSS, () => safeCoreCss);
  shell = shell.replace(MARK_JS, () => safeCoreJs);
  shell = shell.replace(MARK_APPS, () => parts.join(''));

  /* 6.5 产物自检：占位符必须已被消耗，且内联后的脚本必须仍能通过编译 */
  if (shell.includes(MARK_CSS) || shell.includes(MARK_JS) || shell.includes(MARK_APPS)) {
    throw new BuildError('产物自检失败：仍存在未替换的占位标记，请检查模板中的标记是否被改动。');
  }
  for (const [label, src] of [['phone.html 内联 core.js', safeCoreJs], ...plugins.map(p => ['phone.html 内联 ' + p.label, p.source])]) {
    checkSyntax(src, label);
  }
  /* 逐个抽出产物里的 script 块再校验一次，确保替换过程没有破坏任何字节 */
  const emitted = [...shell.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  if (emitted.length !== plugins.length + 2) {
    throw new BuildError(`产物自检失败：应有 ${plugins.length + 2} 个 script 块，实际 ${emitted.length} 个。`);
  }
  emitted.forEach((src, i) => checkSyntax(src, `phone.html script#${i}`));
  /* 关键回归断言：core.js 里的 $$ 辅助函数不能被替换过程吃掉 */
  const ddCount = (safeCoreJs.match(/function \$\$\(/g) || []).length;
  const singleCount = (safeCoreJs.match(/function \$\(/g) || []).length;
  if (ddCount !== 1 || singleCount !== 1) {
    throw new BuildError(
      `产物自检失败：core.js 的单/双美元辅助函数数量异常（$$ = ${ddCount}，$ = ${singleCount}，应各为 1）。\n` +
      '  原因通常是替换占位标记时用了替换字符串而非替换函数，导致 $ 序列被解释。'
    );
  }

  /* 7. 写出文件（UTF-8，无 BOM） */
  try {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, shell, { encoding: 'utf8', flag: 'w' });
  } catch (err) {
    throw new BuildError(`写入输出文件失败：${outFile}\n  原因：${err.message}`);
  }

  /* 8. 生成中文报告 */
  const lines = [];
  lines.push('');
  lines.push('════════════════════════════════════════════════════════');
  lines.push('  PhoneShell 构建完成');
  lines.push('════════════════════════════════════════════════════════');
  lines.push(`  输出文件 : ${outFile}`);
  lines.push(`  输出大小 : ${fmtKB(shell)}（${Buffer.byteLength(shell, 'utf8')} 字节，${countLines(shell)} 行）`);
  lines.push('  ──────────────────────────────────────────────────────');
  lines.push('  各部分大小：');
  lines.push(`    core.css            ${fmtKB(coreCss).padStart(10)}   ${countLines(coreCss)} 行`);
  lines.push(`    core.js             ${fmtKB(coreJs).padStart(10)}   ${countLines(coreJs)} 行`);
  for (const p of plugins) {
    lines.push(`    ${p.label.padEnd(20)}${fmtKB(p.source).padStart(10)}   ${p.lines} 行`);
  }
  lines.push('  ──────────────────────────────────────────────────────');
  if (plugins.length === 0) {
    lines.push('  内联插件清单：无（src/apps、src/games 中暂无 .js 文件，仅输出核心部分）');
  } else {
    lines.push(`  内联插件清单（共 ${plugins.length} 个，apps 优先、games 其次，各自按文件名排序）：`);
    plugins.forEach((p, i) => {
      lines.push(`    ${String(i + 1).padStart(2)}. ${p.label}  （${p.lines} 行）`);
    });
  }
  lines.push('  ──────────────────────────────────────────────────────');
  lines.push(`  构建耗时 : ${Date.now() - t0} ms`);
  lines.push('════════════════════════════════════════════════════════');
  lines.push('');

  return { report: lines.join('\n'), outFile };
}

/* ---------------- 参数解析 ---------------- */

function parseArgs(argv) {
  const opts = { watch: false, out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--watch' || a === '-w') {
      opts.watch = true;
    } else if (a === '--out' || a === '-o') {
      const v = argv[++i];
      if (!v) {
        throw new BuildError('参数 --out 后面缺少输出路径。\n  示例：node build.mjs --out dist/phone.html');
      }
      opts.out = path.resolve(SCRIPT_DIR, v);
    } else if (a.startsWith('--out=')) {
      opts.out = path.resolve(SCRIPT_DIR, a.slice('--out='.length));
    } else if (a === '--help' || a === '-h') {
      opts.help = true;
    } else {
      throw new BuildError(`无法识别的参数：${a}\n  可用参数：--watch / -w，--out <path> / -o <path>，--help`);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`PhoneShell 构建脚本

用法：
  node build.mjs                        构建一次，输出到 ${DEFAULT_OUT}
  node build.mjs --watch                监听 src/ 变化并自动重建
  node build.mjs --out <path>           自定义输出路径
  node build.mjs --watch --out <path>   两者组合

说明：
  读取 src/shell.html、src/core.css、src/core.js，
  以及 src/apps/*.js、src/games/*.js（apps 在前，各自按文件名排序），
  全部内联进单文件 HTML。插件目录不存在或为空时仍可正常构建。`);
}

/* ---------------- watch 模式 ---------------- */

function startWatch(outFile) {
  const watchers = [];
  const watchedDirs = [];

  /** 递归监听一个目录；目录不存在时向上寻找最近的已存在祖先 */
  function addWatcher(dir, label) {
    let target = dir;
    while (!fs.existsSync(target)) {
      const parent = path.dirname(target);
      if (parent === target) break; // 到根了仍不存在
      target = parent;
    }
    // 避免重复监听同一个目录
    if (watchedDirs.includes(target)) return;
    try {
      const w = fs.watch(target, { recursive: true }, (event, filename) => {
        schedule(`${label}${filename ? ` → ${filename}` : ''}`);
      });
      w.on('error', (err) => {
        console.error(`[watch] 监听 ${target} 出错：${err.message}`);
      });
      watchers.push(w);
      watchedDirs.push(target);
      if (target !== dir) {
        console.log(`[watch] 注意：${dir} 尚不存在，暂时监听其父目录 ${target}`);
      }
    } catch (err) {
      console.error(`[watch] 无法监听 ${target}：${err.message}`);
    }
  }

  // 防抖：合并短时间内的多次文件事件
  let timer = null;
  let pendingReason = '';
  function schedule(reason) {
    pendingReason = reason || pendingReason;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      console.log(`\n[watch] 检测到变化（${pendingReason}），重新构建……`);
      try {
        const { report } = buildOnce(outFile);
        console.log(report);
        console.log('[watch] 构建成功，继续监听中（按 Ctrl+C 退出）');
      } catch (err) {
        // watch 模式下只报错不退出，等待下次修改
        console.error(`\n[watch] 构建失败：\n${err.isBuildError ? err.message : err.stack || err.message}`);
        console.error('[watch] 已忽略本次错误，继续监听中（按 Ctrl+C 退出）');
      }
    }, 150);
  }

  addWatcher(SHELL_FILE, 'shell.html');
  addWatcher(CORE_CSS_FILE, 'core.css');
  addWatcher(CORE_JS_FILE, 'core.js');
  for (const { key, dir } of PLUGIN_DIRS) addWatcher(dir, `${key}/`);

  console.log(`[watch] 已开始监听 ${SRC_DIR}（递归），输出目标：${outFile}`);
  console.log('[watch] 修改 src 下的文件即可自动重建，按 Ctrl+C 退出。');

  process.on('SIGINT', () => {
    for (const w of watchers) {
      try { w.close(); } catch { /* 忽略关闭异常 */ }
    }
    console.log('\n[watch] 已停止监听，退出。');
    process.exit(0);
  });
}

/* ---------------- 入口 ---------------- */

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`\n构建失败：${err.message}\n`);
    process.exit(1);
  }

  if (opts.help) {
    printHelp();
    return;
  }

  // 兜底：确保 src/games 目录存在（后续游戏插件可直接放进去）
  try {
    fs.mkdirSync(path.join(SRC_DIR, 'games'), { recursive: true });
  } catch {
    /* 目录创建失败不阻塞构建（listPlugins 已能容忍目录缺失） */
  }

  if (opts.watch) {
    // watch 模式：先构建一次，成功与否都进入监听
    try {
      const { report } = buildOnce(opts.out);
      console.log(report);
    } catch (err) {
      console.error(`\n构建失败：\n${err.isBuildError ? err.message : err.stack || err.message}`);
    }
    startWatch(opts.out);
    return; // 保持进程存活
  }

  // 单次构建：出错则中文报错 + 非 0 退出码
  try {
    const { report } = buildOnce(opts.out);
    console.log(report);
  } catch (err) {
    console.error(`\n构建失败：\n${err.isBuildError ? err.message : err.stack || err.message}\n`);
    process.exit(1);
  }
}

/* ---------------- 导出（供测试或其它脚本复用；直接运行时自动执行 main） ---------------- */

export { buildOnce, parseArgs, escapeInlineText, BuildError, DEFAULT_OUT, SRC_DIR };

// 仅当本文件被直接执行（node build.mjs）时才跑 main；
// 被 import 时只提供上面的导出，不产生副作用。
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
