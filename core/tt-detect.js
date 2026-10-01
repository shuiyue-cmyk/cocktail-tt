/**
 * cocktail TT 适配：TauriTavern 检测与兼容版本解析（ST / TT 双兼容）
 *
 * 背景：
 * - 上游 cocktail 的 index.js 只从 `/script.js` 的 `displayVersion`
 *   里正则提取 `x.y.z` 作为 ST 版本。
 * - 在 TauriTavern 上 `displayVersion` 是 `TauriTavern 2.3.0 ...`，
 *   提取到的是 TT 发行版号，不是 ST 兼容版本号，会误判版本门控。
 * - TT 的 ST 兼容版本单一事实源是 `SILLYTAVERN_COMPAT_VERSION`（2.3.0 对应 1.18.0），
 *   运行时 `CLIENT_VERSION` 格式为 `SillyTavern:<compat>:TauriTavern`。
 *
 * 本模块提供同步启发式检测（各优化模块用）+ 异步精确版本解析（index.js 版本门控用），
 * 不依赖任何酒馆内部私有 API，检测失败时回退为“非 TT”，不改变上游行为。
 */

/** 同步判断当前是否运行在 TauriTavern（启发式，多信号任一命中即判定）。 */
export function isTauriTavernSync() {
  try {
    if (globalThis.__TAURITAVERN__ && typeof globalThis.__TAURITAVERN__ === 'object') return true;
  } catch { /* noop */ }
  try {
    if (globalThis.__TAURI__ && typeof globalThis.__TAURI__ === 'object') return true;
  } catch { /* noop */ }
  try {
    if (globalThis.__TAURITAVERN_MAIN_READY__) return true;
  } catch { /* noop */ }
  try {
    if (typeof globalThis.location !== 'undefined' && String(globalThis.location?.protocol || '') === 'tauri:') return true;
  } catch { /* noop */ }
  try {
    const ua = String(globalThis.navigator?.userAgent || '');
    if (/tauri/i.test(ua)) return true;
  } catch { /* noop */ }
  return false;
}

/** 从 `SillyTavern:x.y.z:TauriTavern` 格式中提取兼容版本号。 */
export function extractCompatFromClientVersion(clientVersion) {
  const raw = String(clientVersion ?? '').trim();
  if (!raw) return null;
  const parts = raw.split(':');
  // 标准格式 SillyTavern:1.18.0:TauriTavern -> parts[1]
  if (parts.length >= 3 && /tauritavern/i.test(parts[2] || '')) {
    const m = String(parts[1] || '').match(/(\d+\.\d+\.\d+)/);
    return m ? m[1] : null;
  }
  return null;
}

/** 从任意展示字符串中提取第一个 semver（兜底用）。 */
export function extractVersionString(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  const m = raw.match(/(\d+\.\d+\.\d+)/);
  return m ? m[1] : null;
}

/**
 * 异步解析“ST 兼容版本”（TT 上返回 compat version，原生 ST 上返回 displayVersion）。
 * 解析优先级：
 * 1. `/script.js` 的 `CLIENT_VERSION`（TT: SillyTavern:1.18.0:TauriTavern）
 * 2. `SillyTavern.getContext()` 可达时的上下文版本字段（若未来暴露）
 * 3. `/script.js` 的 `displayVersion`（原生 ST；TT 上仅当 1 失败时兜底）
 * 4. TT 兼容常量（动态 import 上游同步文件，路径不存在则忽略）
 */
export async function detectStCompatVersion() {
  // 1. CLIENT_VERSION（TT 精确，ST 上一般为 UNKNOWN 占位则跳过）
  try {
    const scriptMod = await import('/script.js');
    const compat = extractCompatFromClientVersion(scriptMod?.CLIENT_VERSION);
    if (compat) return { version: compat, source: 'CLIENT_VERSION', isTT: true };
    const display = extractVersionString(scriptMod?.displayVersion);
    if (display) {
      const isTT = /tauritavern/i.test(String(scriptMod?.displayVersion || '')) || isTauriTavernSync();
      return { version: display, source: 'displayVersion', isTT };
    }
  } catch { /* ignore, try next source */ }

  // 2. 运行期 context（防御性：某些构建 displayVersion 初始化较晚）
  try {
    const ctx = globalThis.SillyTavern?.getContext?.();
    const compat = extractCompatFromClientVersion(ctx?.clientVersion)
      || extractCompatFromClientVersion(ctx?.CLIENT_VERSION);
    if (compat) return { version: compat, source: 'context.clientVersion', isTT: true };
  } catch { /* ignore */ }

  return null;
}

/**
 * 是否为触屏/移动类设备（iPad / 手机 / 触屏笔记本）。
 *
 * 用于给「依赖同步布局测量 / requestIdleCallback 时序」的优化做保守降级：
 * Tauri WebView 在 iPadOS 这类环境下滚动期间不派发空闲回调，且 GPU 内存紧张时
 * 大量合成层 / content-visibility 会直接表现为「滚动时内容渲染不全」。
 */
export function isTouchLikeDevice() {
  try {
    if (typeof globalThis.matchMedia === 'function'
      && globalThis.matchMedia('(pointer: coarse)').matches) return true;
  } catch { /* noop */ }
  try {
    if (typeof globalThis.matchMedia === 'function'
      && globalThis.matchMedia('(hover: none)').matches) return true;
  } catch { /* noop */ }
  try {
    if (Number(globalThis.navigator?.maxTouchPoints || 0) > 1) return true;
  } catch { /* noop */ }
  try {
    if (/iPad|iPhone|iPod|Android/i.test(String(globalThis.navigator?.userAgent || ''))) return true;
  } catch { /* noop */ }
  try {
    // iPadOS 13+ 桌面模式 UA 会伪装成 Macintosh，靠触点数兜底（上面已覆盖）。
    return Boolean(globalThis.navigator?.maxTouchPoints > 0 && globalThis.matchMedia?.('(any-hover: hover)')?.matches === false);
  } catch { /* noop */ }
  return false;
}

/** TT 聊天 bounded 虚拟化是否激活（DOM 语义检查，无私有 API 依赖）。 */
export function isBoundedChatSurfaceActive() {
  try {
    const chat = document.getElementById('chat');
    if (chat instanceof HTMLElement && chat.getAttribute('data-tt-chat-surface') === 'bounded') return true;
  } catch { /* noop */ }
  try {
    if (document.querySelector('#chat[data-tt-chat-surface="bounded"]')) return true;
  } catch { /* noop */ }
  return false;
}

// 调试句柄（只读）
globalThis.__cocktailTT = globalThis.__cocktailTT || {
  isTauriTavernSync,
  detectStCompatVersion,
  isTouchLikeDevice,
  isBoundedChatSurfaceActive,
};
