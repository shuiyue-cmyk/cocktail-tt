/**
 * cocktail（综合优化插件）
 * 
 * 说明：
 * - 酒馆会以 <script type="module"> 加载扩展脚本，因此这里使用 ES Module 的拆分方式即可，无需打包。
 * - 每个模块仍使用自己原本的 EXTENSION_NAME 作为 settings key，方便迁移/回滚。
 */

// 主鸡尾酒面板 + 子面板注册器
import './core/panel.js';
import { IS_TAURITAVERN, TT_DISABLED_MODULES, isModuleForceEnabled } from './core/host.js';
import { registerTauriTavernAdapterPanel } from './core/tt-adapter-panel.js';

const REGEX_MODULE_MIN_ST_VERSION = '1.14.0';
const VERSION_GATED_MODULES = Object.freeze([
  {
    key: 'regex-refresh',
    name: 'st-regex-refresh-optimizer',
    path: './modules/regex-refresh-optimizer.js',
  },
]);
const _versionGatedState = new Map(VERSION_GATED_MODULES.map((m) => [m.key, { finalized: false, loadingPromise: null }]));

function extractVersionString(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;

  // Source: displayVersion, e.g. "SillyTavern 1.15.0 'release' (hash)"
  const m = raw.match(/(\d+\.\d+\.\d+)/);
  return m ? m[1] : null;
}

function parseSemver(version) {
  const m = String(version ?? '').trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareSemver(a, b) {
  const av = parseSemver(a);
  const bv = parseSemver(b);
  if (!av || !bv) return 0;
  for (let i = 0; i < 3; i++) {
    if (av[i] > bv[i]) return 1;
    if (av[i] < bv[i]) return -1;
  }
  return 0;
}

async function detectStVersion() {
  try {
    const scriptMod = await import('/script.js');
    return extractVersionString(scriptMod?.displayVersion);
  } catch {
    return null;
  }
}

async function maybeLoadVersionGatedModule(moduleDef) {
  const state = _versionGatedState.get(moduleDef.key);
  if (!state) return;
  if (state.finalized) return;
  if (state.loadingPromise) return state.loadingPromise;

  state.loadingPromise = (async () => {
    const stVersion = await detectStVersion();

    // Version not ready yet -> keep waiting for a later retry hook.
    if (!stVersion) {
      console.debug(`[cocktail] ST version is not ready, postpone loading ${moduleDef.name}`);
      return;
    }

    if (compareSemver(stVersion, REGEX_MODULE_MIN_ST_VERSION) < 0) {
      state.finalized = true;
      console.info(`[cocktail] skip ${moduleDef.name} on ST ${stVersion} (< ${REGEX_MODULE_MIN_ST_VERSION})`);
      return;
    }

    await import(moduleDef.path);
    state.finalized = true;
  })()
    .catch((e) => {
      console.warn(`[cocktail] failed to load ${moduleDef.name}`, e);
    })
    .finally(() => {
      state.loadingPromise = null;
    });

  return state.loadingPromise;
}

function tryLoadVersionGatedModules() {
  // TT 内置 RegexRefreshCoordinator，默认不加载 regex-refresh-optimizer（见 core/host.js）；用户可在适配面板强制启用。
  if (IS_TAURITAVERN && !isModuleForceEnabled('regex-refresh-optimizer')) return;
  for (const moduleDef of VERSION_GATED_MODULES) {
    void maybeLoadVersionGatedModule(moduleDef);
  }
}

// 这些模块在 TauriTavern 上被宿主内置能力取代（或依赖 Node 后端），默认不加载。
// 原因见 core/host.js 的 TT_DISABLED_MODULES，也会显示在“TauriTavern 适配”子面板里，
// 可在该面板对可用的模块勾选“强制启用”（刷新后生效）。regex-refresh-optimizer 由下面的版本门控逻辑加载。
if (IS_TAURITAVERN) {
  registerTauriTavernAdapterPanel();
  for (const m of TT_DISABLED_MODULES) {
    if (m.id === 'regex-refresh-optimizer' || !isModuleForceEnabled(m.id)) continue;
    import(m.path).catch((e) => console.warn(`[cocktail] failed to load ${m.path}`, e));
  }
} else {
  for (const path of [
    './modules/startup-optimizer.js',
    './modules/cocktail-plus-installer.js',
    './modules/chat-saving-unblocker.js',
  ]) {
    import(path).catch((e) => console.warn(`[cocktail] failed to load ${path}`, e));
  }
}

import './modules/chat-render-optimizer.js';
import './modules/preset-drag-optimizer.js';
import './modules/auto-update-checker.js';
import './modules/ui-animation-optimizer.js';
import './modules/worldinfo-drag-optimizer.js';
import './modules/regex-drag-optimizer.js';
import './modules/worldinfo-panel-slim.js';
tryLoadVersionGatedModules();

globalThis.jQuery?.(() => {
  // Retry when DOM is ready.
  tryLoadVersionGatedModules();

  // Retry again after APP_READY; by then version info is usually initialized.
  const ctx = globalThis.SillyTavern?.getContext?.();
  ctx?.eventSource?.on?.(ctx?.eventTypes?.APP_READY, () => {
    tryLoadVersionGatedModules();
  });
});

// import './modules/html-render-cache.js';
// 暂时不再使用，避免bug