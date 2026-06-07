/**
 * cocktail-plus installer entry for cocktail.
 *
 * - Adds a cocktail panel button to install 鸡尾酒+ from GitHub/Gitee.
 * - Shows a one-time browser-local intro popup after cocktail starts.
 * - Uses SillyTavern native extension install API; no server plugin dependency.
 */

import { registerCocktailSubpanel } from '../core/subpanels.js';

const EXTENSION_NAME = 'cocktail-plus-installer';
const TARGET_EXTENSION_FOLDER = 'cocktail-plus';
const INTRO_LOCAL_STORAGE_KEY = 'cocktail.plus.intro.dismissed.v1';

const SOURCES = Object.freeze({
  github: {
    id: 'github',
    label: '国外下载（GitHub）',
    url: 'https://github.com/Lianues/cocktail-plus',
  },
  gitee: {
    id: 'gitee',
    label: '国内下载（Gitee）',
    url: 'https://gitee.com/lianues/cocktail-plus',
  },
});

const STATE = {
  started: false,
  installing: false,
  status: /** @type {null | { installed: boolean, type: string | null, name: string | null, lastCheckedAt: number }} */ (null),
  lastMessage: '',
};

function getCtx() {
  try { return globalThis.SillyTavern?.getContext?.() ?? null; } catch { return null; }
}

function getRequestHeaders(ctx = getCtx()) {
  try {
    const headers = ctx?.getRequestHeaders?.();
    if (headers && typeof headers === 'object') return headers;
  } catch { }
  return { 'Content-Type': 'application/json' };
}

function toast(type, message, title = '鸡尾酒+') {
  try { globalThis.toastr?.[type]?.(message, title, { timeOut: type === 'error' ? 6500 : 3000 }); } catch { }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function guessCocktailExternalId() {
  try {
    const path = new URL(import.meta.url).pathname || '';
    const marker = '/scripts/extensions/third-party/';
    const idx = path.indexOf(marker);
    if (idx === -1) return '/cocktail';
    const rest = path.slice(idx + marker.length);
    const folder = rest.split('/')[0];
    return folder ? `/${folder}` : '/cocktail';
  } catch {
    return '/cocktail';
  }
}

function externalIdToDiscoverName(externalId) {
  const folder = String(externalId || '').replace(/^\//, '').trim();
  return folder ? `third-party/${folder}` : null;
}

async function discoverExtensions() {
  const response = await fetch('/api/extensions/discover', {
    method: 'GET',
    headers: getRequestHeaders(),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`discover failed: ${response.status} ${response.statusText}`);
  const list = await response.json();
  return Array.isArray(list) ? list : [];
}

async function discoverExtensionByExternalId(externalId) {
  const name = externalIdToDiscoverName(externalId);
  if (!name) return null;
  const list = await discoverExtensions();
  return list.find(item => item && typeof item === 'object' && item.name === name) ?? null;
}

async function discoverCurrentCocktailType() {
  const hit = await discoverExtensionByExternalId(guessCocktailExternalId());
  const type = hit?.type;
  return type === 'global' || type === 'local' || type === 'system' ? type : 'global';
}

async function refreshCocktailPlusStatus() {
  try {
    const hit = await discoverExtensionByExternalId(`/${TARGET_EXTENSION_FOLDER}`);
    const type = hit?.type;
    STATE.status = {
      installed: !!hit,
      type: type === 'global' || type === 'local' || type === 'system' ? type : null,
      name: hit?.name ?? null,
      lastCheckedAt: Date.now(),
    };
  } catch (error) {
    STATE.lastMessage = `状态探测失败：${error?.message || error}`;
  }
  return STATE.status;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
}

async function installCocktailPlus(sourceId = 'github') {
  if (STATE.installing) return;
  const source = SOURCES[sourceId] || SOURCES.github;
  STATE.installing = true;
  STATE.lastMessage = `正在从 ${source.label} 安装…`;
  rerenderInstallerPanel();

  try {
    const existing = await discoverExtensionByExternalId(`/${TARGET_EXTENSION_FOLDER}`).catch(() => null);
    if (existing) {
      const msg = `鸡尾酒+ 已安装（${existing.type || 'unknown'}：${existing.name || TARGET_EXTENSION_FOLDER}）。如需更新，请进入鸡尾酒+ 面板使用更新检查。`;
      STATE.lastMessage = msg;
      toast('info', msg);
      return;
    }

    const cocktailType = await discoverCurrentCocktailType();
    const isGlobal = cocktailType !== 'local';
    const response = await fetch('/api/extensions/install', {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify({
        url: source.url,
        global: isGlobal,
      }),
    });

    const text = await response.text();
    if (!response.ok) throw new Error(text || `${response.status} ${response.statusText}`);

    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    STATE.lastMessage = `安装完成：${data?.display_name || '鸡尾酒+'}。页面即将刷新以加载新扩展；进入鸡尾酒+ 面板后可继续安装其后端增强插件。`;
    toast('success', STATE.lastMessage);
    setIntroDismissed();
    await refreshCocktailPlusStatus();
    await sleep(800);
    try {
      globalThis.location?.reload?.();
    } catch { }
  } catch (error) {
    const message = error?.message || String(error);
    STATE.lastMessage = `安装失败：${message}`;
    toast('error', message, '鸡尾酒+ 安装失败');
  } finally {
    STATE.installing = false;
    rerenderInstallerPanel();
  }
}

function setIntroDismissed() {
  try { localStorage.setItem(INTRO_LOCAL_STORAGE_KEY, '1'); } catch { }
}

function isIntroDismissed() {
  try { return localStorage.getItem(INTRO_LOCAL_STORAGE_KEY) === '1'; } catch { return true; }
}

function createSourceSelect(id, value = 'github') {
  return `
    <label class="cocktail-plus-source-row">
      下载源
      <select id="${id}">
        ${Object.values(SOURCES).map(source => `<option value="${source.id}" ${source.id === value ? 'selected' : ''}>${escapeHtml(source.label)}</option>`).join('')}
      </select>
    </label>
  `;
}

function renderInstallerContent(container) {
  const status = STATE.status;
  container.innerHTML = `
    <div class="cocktail-plus-installer-panel">
      <div class="cocktail-help">
        <b>鸡尾酒+</b> 是 cocktail 的增强版扩展，包含前端扩展和可选后端 Server Plugin。后端插件用于更深度优化，需要安装后重启 SillyTavern 才能生效。
      </div>
      <div class="cocktail-plus-status">
        状态：${status?.installed ? `已安装（${escapeHtml(status.type || 'unknown')}）` : '未检测到'}
      </div>
      ${createSourceSelect('cocktail_plus_source_panel')}
      <div class="cocktail-actions cocktail-plus-actions">
        <button type="button" class="cocktail-btn" id="cocktail_plus_refresh_status">刷新状态</button>
        <button type="button" class="cocktail-btn" id="cocktail_plus_install" ${STATE.installing ? 'disabled' : ''}>安装 鸡尾酒+</button>
      </div>
      ${STATE.lastMessage ? `<div class="cocktail-help">${escapeHtml(STATE.lastMessage)}</div>` : ''}
    </div>
  `;

  container.querySelector('#cocktail_plus_refresh_status')?.addEventListener('click', async () => {
    await refreshCocktailPlusStatus();
    renderInstallerContent(container);
  });
  container.querySelector('#cocktail_plus_install')?.addEventListener('click', async () => {
    const sourceId = container.querySelector('#cocktail_plus_source_panel')?.value || 'github';
    const ok = await showInstallConfirm(sourceId);
    if (!ok) return;
    await installCocktailPlus(sourceId);
  });
}

function rerenderInstallerPanel() {
  const container = document.querySelector('[data-cocktail-plus-installer-body="1"]');
  if (container instanceof HTMLElement) renderInstallerContent(container);
}

function registerInstallerSubpanel() {
  registerCocktailSubpanel({
    id: 'cocktail-plus-installer',
    title: '安装 鸡尾酒+',
    order: -100,
    render(container) {
      container.dataset.cocktailPlusInstallerBody = '1';
      void refreshCocktailPlusStatus().finally(() => renderInstallerContent(container));
      renderInstallerContent(container);
    },
  });
}

async function showInstallConfirm(sourceId) {
  const source = SOURCES[sourceId] || SOURCES.github;
  const text = `即将从 ${source.label} 安装 鸡尾酒+：\n${source.url}\n\n鸡尾酒+ 包含可选后端 Server Plugin。安装前端扩展后，请进入鸡尾酒+ 面板按提示安装后端插件并重启 SillyTavern。`;
  const ctx = getCtx();
  try {
    if (ctx?.Popup?.show?.confirm) {
      const result = await ctx.Popup.show.confirm('安装 鸡尾酒+', text, {
        okButton: '开始安装',
        cancelButton: '取消',
      });
      const affirmative = ctx.POPUP_RESULT?.AFFIRMATIVE;
      return affirmative === undefined ? !!result : result === affirmative;
    }
  } catch { }
  return !!globalThis.confirm?.(`安装 鸡尾酒+\n\n${text}`);
}

function showIntroModal() {
  if (isIntroDismissed()) return;
  if (document.getElementById('cocktail_plus_intro_modal')) return;

  const overlay = document.createElement('div');
  overlay.id = 'cocktail_plus_intro_modal';
  overlay.className = 'cocktail-plus-modal-overlay';
  overlay.innerHTML = `
    <div class="cocktail-plus-modal" role="dialog" aria-modal="true" aria-label="鸡尾酒+">
      <div class="cocktail-plus-modal-title">推荐安装：鸡尾酒+</div>
      <div class="cocktail-plus-modal-body">
        <p><b>鸡尾酒+</b> 是 cocktail 的增强版，包含可选后端 Server Plugin，可进一步优化启动、角色列表、settings/chat 保存等性能路径。</p>
        <p>安装后会新增一个独立前端扩展；进入 鸡尾酒+ 面板后，可按脚本助手安装后端插件。</p>
        ${createSourceSelect('cocktail_plus_source_modal')}
      </div>
      <div class="cocktail-plus-modal-actions">
        <button type="button" class="cocktail-btn" id="cocktail_plus_modal_cancel">暂不安装</button>
        <button type="button" class="cocktail-btn" id="cocktail_plus_modal_install">安装 鸡尾酒+</button>
      </div>
    </div>
  `;

  const close = () => {
    setIntroDismissed();
    overlay.remove();
  };

  overlay.querySelector('#cocktail_plus_modal_cancel')?.addEventListener('click', close);
  overlay.querySelector('#cocktail_plus_modal_install')?.addEventListener('click', async () => {
    const sourceId = overlay.querySelector('#cocktail_plus_source_modal')?.value || 'github';
    close();
    await installCocktailPlus(sourceId);
  });
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  document.body.appendChild(overlay);
}

async function maybeShowIntroModal() {
  if (isIntroDismissed()) return;
  await refreshCocktailPlusStatus();
  if (STATE.status?.installed) {
    setIntroDismissed();
    return;
  }
  showIntroModal();
}

function init() {
  if (STATE.started) return;
  STATE.started = true;
  registerInstallerSubpanel();

  const scheduleIntro = () => setTimeout(() => { void maybeShowIntroModal(); }, 1200);
  globalThis.jQuery?.(scheduleIntro);
  try {
    const ctx = getCtx();
    ctx?.eventSource?.on?.(ctx?.eventTypes?.APP_READY, scheduleIntro);
  } catch { }
}

init();
