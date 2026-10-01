/**
 * cocktail 主面板（鸡尾酒面板）
 *
 * - 在扩展设置里插入一个“鸡尾酒”面板
 * - 把所有已注册的子面板渲染为“自定义 HTML 子面板”（非酒馆 inline-drawer 样式）
 */

import { listCocktailSubpanels, onCocktailSubpanelsChanged } from './subpanels.js';
import { detectStCompatVersion, isBoundedChatSurfaceActive, isTauriTavernSync, isTouchLikeDevice } from './tt-detect.js';

const COCKTAIL_DRAWER_ID = 'cocktail_drawer';
const COCKTAIL_ROOT_ID = 'cocktail_settings_root';
const COCKTAIL_BODY_ID = 'cocktail_settings_body';

/**
 * 鸡尾酒各优化模块的 settings key。
 * 用于「逐模块排查」——出现渲染异常时可以直接在这里关掉某个模块定位问题，
 * 不需要再去酒馆 settings.json 里手改。
 */
const COCKTAIL_MODULE_KEYS = [
  ['st-startup-optimizer', '启动加载优化'],
  ['st-chat-render-optimizer', '聊天渲染优化'],
  ['st-preset-drag-optimizer', '预设拖拽优化'],
  ['st-worldinfo-drag-optimizer', '世界书拖拽优化'],
  ['st-regex-drag-optimizer', '正则拖拽优化'],
  ['st-ui-animation-optimizer', 'UI 动画与抽屉展开'],
  ['st-regex-refresh-optimizer', '正则刷新优化'],
  ['st-worldinfo-panel-slim', '世界书面板精简'],
  ['st-chat-saving-unblocker', '保存中切换解锁'],
];

function getCtx() {
  try {
    return globalThis.SillyTavern?.getContext?.();
  } catch {
    return null;
  }
}

function getModuleSettings(ctx, key) {
  const root = ctx?.extensionSettings;
  if (!root || typeof root !== 'object') return null;
  if (!root[key] || typeof root[key] !== 'object') root[key] = {};
  return root[key];
}

/**
 * 运行环境与模块开关面板。
 * 放在鸡尾酒面板最前面，方便出问题第一时间看到。
 */
function renderRuntimeSection(container, ctx) {
  const wrap = document.createElement('div');
  wrap.className = 'cocktail-runtime';

  const env = document.createElement('div');
  env.className = 'cocktail-runtime-env';
  wrap.appendChild(env);

  const toggleWrap = document.createElement('div');
  toggleWrap.className = 'cocktail-module-toggles';
  wrap.appendChild(toggleWrap);

  const hint = document.createElement('div');
  hint.className = 'cocktail-help';
  hint.textContent = '出现界面显示异常（行被裁切、滚动时内容没加载全等）时，先在这里逐个关掉定位；改完刷新页面生效。';
  wrap.appendChild(hint);

  container.appendChild(wrap);

  const refreshEnv = () => {
    const isTT = isTauriTavernSync();
    const isTouch = isTouchLikeDevice();
    const bounded = isBoundedChatSurfaceActive();
    const chips = [
      isTT ? 'TauriTavern' : 'SillyTavern',
      `ST 兼容 ${detectStCompatVersionVersion() ?? '未知'}`,
      isTouch ? '触屏设备' : '桌面指针',
      bounded ? '聊天 bounded 虚拟化：开' : '聊天 bounded 虚拟化：关',
    ];
    env.innerHTML = chips
      .map((c) => `<span class="cocktail-runtime-chip">${String(c).replace(/[<>&]/g, '')}</span>`)
      .join('');
  };

  const syncToggles = () => {
    toggleWrap.innerHTML = '';
    for (const [key, title] of COCKTAIL_MODULE_KEYS) {
      const s = getModuleSettings(ctx, key);
      const row = document.createElement('label');
      row.className = 'cocktail-check';

      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = Boolean(s?.enabled);
      box.addEventListener('change', () => {
        const target = getModuleSettings(ctx, key);
        if (!target) return;
        target.enabled = box.checked;
        try { ctx?.saveSettingsDebounced?.(); } catch { }
      });

      const span = document.createElement('span');
      span.textContent = `${title}（${key}）`;

      row.appendChild(box);
      row.appendChild(span);
      toggleWrap.appendChild(row);
    }
  };

  refreshEnv();
  syncToggles();

  return () => { };
}

let _cachedCompatVersion = null;

function detectStCompatVersionVersion() {
  if (_cachedCompatVersion !== null) return _cachedCompatVersion;
  _cachedCompatVersion = '__pending__';
  void detectStCompatVersion()
    .then((r) => { _cachedCompatVersion = r?.version ?? null; })
    .catch(() => { _cachedCompatVersion = null; });
  return null;
}

function getExtensionsHost() {
  return (
    document.getElementById('extensions_settings2') ||
    document.getElementById('extensions_settings') ||
    null
  );
}

function readBool(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return v === '1';
  } catch {
    return fallback;
  }
}

function writeBool(key, value) {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch { }
}

/** @type {Map<string, (() => void) | void>} */
let _subpanelCleanups = new Map();

function cleanupSubpanels() {
  for (const cleanup of _subpanelCleanups.values()) {
    try { if (typeof cleanup === 'function') cleanup(); } catch { }
  }
  _subpanelCleanups = new Map();
}

function createHeaderButton(title, initialOpen, onToggle) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cocktail-subpanel-header';
  btn.setAttribute('aria-expanded', initialOpen ? 'true' : 'false');

  const left = document.createElement('div');
  left.className = 'cocktail-subpanel-title';
  left.textContent = title;

  const right = document.createElement('div');
  right.className = 'cocktail-subpanel-indicator';
  right.textContent = initialOpen ? '−' : '+';

  btn.appendChild(left);
  btn.appendChild(right);

  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    const next = !expanded;
    btn.setAttribute('aria-expanded', next ? 'true' : 'false');
    right.textContent = next ? '−' : '+';
    onToggle(next);
  });

  return btn;
}

function renderSubpanel(container, def, ctx) {
  const key = `cocktail.subpanel.open.${def.id}`;
  const open = readBool(key, true);

  const section = document.createElement('section');
  section.className = 'cocktail-subpanel';
  section.dataset.id = def.id;

  const body = document.createElement('div');
  body.className = 'cocktail-subpanel-body';
  body.style.display = open ? 'block' : 'none';

  const header = createHeaderButton(def.title, open, (isOpen) => {
    body.style.display = isOpen ? 'block' : 'none';
    writeBool(key, isOpen);
  });

  section.appendChild(header);
  section.appendChild(body);

  // Render content
  try {
    const cleanup = def.render(body, ctx);
    _subpanelCleanups.set(def.id, cleanup);
  } catch (e) {
    const err = document.createElement('div');
    err.className = 'cocktail-error';
    err.textContent = `子面板渲染失败：${def.id}（请看控制台）`;
    body.appendChild(err);
    console.error('[cocktail] subpanel render failed', def.id, e);
  }

  container.appendChild(section);
}

function renderAllSubpanels() {
  const body = document.getElementById(COCKTAIL_BODY_ID);
  if (!(body instanceof HTMLElement)) return;

  const ctx = getCtx();
  cleanupSubpanels();
  body.innerHTML = '';

  const list = listCocktailSubpanels();
  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'cocktail-empty';
    empty.textContent = '暂无已注册的子面板。';
    body.appendChild(empty);
    return;
  }

  for (const def of list) {
    renderSubpanel(body, def, ctx);
  }
}

function ensureCocktailPanel() {
  const host = getExtensionsHost();
  if (!(host instanceof HTMLElement)) return false;

  if (document.getElementById(COCKTAIL_DRAWER_ID)) {
    // already mounted; just make sure content stays in sync
    renderAllSubpanels();
    return true;
  }

  // Outer: use SillyTavern inline-drawer style
  const drawer = document.createElement('div');
  drawer.id = COCKTAIL_DRAWER_ID;
  drawer.className = 'inline-drawer';

  const header = document.createElement('div');
  header.className = 'inline-drawer-toggle inline-drawer-header';
  header.innerHTML = `<b>鸡尾酒</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>`;

  const content = document.createElement('div');
  content.className = 'inline-drawer-content';

  // Inner: custom cocktail layout + custom subpanels
  const inner = document.createElement('div');
  inner.id = COCKTAIL_ROOT_ID;
  inner.className = 'cocktail-panel-root';

  const desc = document.createElement('div');
  desc.className = 'cocktail-panel-desc';
  desc.textContent = '综合优化：启动加载 / 聊天渲染 / 正则刷新 等（按需启用）';

  const body = document.createElement('div');
  body.id = COCKTAIL_BODY_ID;
  body.className = 'cocktail-panel-body';

  inner.appendChild(desc);
  const runtimeHost = document.createElement('div');
  runtimeHost.id = 'cocktail_runtime_root';
  runtimeHost.className = 'cocktail-runtime-root';
  inner.appendChild(runtimeHost);
  inner.appendChild(body);
  content.appendChild(inner);

  drawer.appendChild(header);
  drawer.appendChild(content);

  // Append to the end of the right panel (not the top)
  host.appendChild(drawer);

  renderRuntimeSection(runtimeHost, getCtx());
  renderAllSubpanels();
  return true;
}

async function ensureCocktailPanelWithRetry() {
  for (let i = 0; i < 20; i++) {
    if (ensureCocktailPanel()) return true;
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

function init() {
  if (globalThis.__cocktailPanelLoaded) return;
  globalThis.__cocktailPanelLoaded = true;

  // Re-render when registry changes
  onCocktailSubpanelsChanged(() => {
    if (document.getElementById(COCKTAIL_DRAWER_ID)) {
      renderAllSubpanels();
    }
  });

  // Try mount on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { void ensureCocktailPanelWithRetry(); }, { once: true });
  } else {
    void ensureCocktailPanelWithRetry();
  }

  // Try again on APP_READY (some builds delay settings DOM)
  const ctx = getCtx();
  ctx?.eventSource?.on?.(ctx?.eventTypes?.APP_READY, () => { void ensureCocktailPanelWithRetry(); });
  ctx?.eventSource?.on?.(ctx?.eventTypes?.SETTINGS_LOADED, () => { void ensureCocktailPanelWithRetry(); });

  // Observe DOM mutations so opening扩展设置后也能自动挂载面板
  try {
    let rafPending = false;
    const obs = new MutationObserver(() => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        // If panel got removed (e.g. host recreated), mount again.
        if (!document.getElementById(COCKTAIL_DRAWER_ID)) {
          ensureCocktailPanel();
        }
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  } catch { }
}

init();

