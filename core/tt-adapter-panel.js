/**
 * “TauriTavern 适配”子面板：仅在 TT 宿主下注册，向用户说明哪些模块被停用以及原因，
 * 并允许对可用的模块“强制启用”（刷新页面后生效）。
 */

import { registerCocktailSubpanel } from './subpanels.js';
import {
  IS_TAURITAVERN,
  TT_DISABLED_MODULES,
  isBoundedChatSurface,
  isModuleForceEnabled,
  setModuleForceEnabled,
} from './host.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function registerTauriTavernAdapterPanel() {
  if (!IS_TAURITAVERN) return;

  registerCocktailSubpanel({
    id: 'tauritavern-adapter',
    title: 'TauriTavern 适配',
    order: -200,
    render(container) {
      const bounded = isBoundedChatSurface();
      const rows = TT_DISABLED_MODULES
        .map((m) => {
          const forceable = m.forceable !== false;
          const toggle = forceable
            ? `<label class="cocktail-check"><input type="checkbox" data-force-module="${escapeHtml(m.id)}" ${isModuleForceEnabled(m.id) ? 'checked' : ''}> 强制启用（刷新后生效）</label>`
            : '<div>（无法启用）</div>';
          return `<div style="margin-top:6px"><b>${escapeHtml(m.title)}</b>：${escapeHtml(m.reason)}${toggle}</div>`;
        })
        .join('');

      container.innerHTML = `
        <div class="cocktail-help">
          <div>已检测到 <b>TauriTavern</b> 宿主，本版本已按 TT 的扩展契约做了适配。</div>
          <div>聊天虚拟化（有界 ChatSurface）：<b>${bounded ? '已开启' : '未开启'}</b>${
            bounded
              ? '。分页 / 加载更多 / 提前预加载由宿主虚拟列表接管，“聊天渲染优化”里与之相关的选项不再生效；防误触滑动、代码块相关开关等仍然有效。'
              : '。使用上游的 “Show more messages” 路径，分页、分帧加载更多等选项照常生效。'
          }</div>
          <div style="margin-top:6px">以下模块在 TT 上默认不加载（强制启用后与宿主内置机制叠加，行为未经验证，请自行承担）：</div>
          ${rows}
          <div style="margin-top:6px">预设面板：只保留拖拽优化；PromptManager 的 render / dry-run 调度交还给 TT（TT 已在面板不可见时延后 dry-run）。</div>
          <div>TT 上的默认值与上游不同：代码高亮默认保留（TT 已有视口附近延迟高亮）；UI 动画优化默认关闭（未经 TT 移动端验证）；关闭聊天渲染优化时会还原你原来的“加载消息条数”，而不是改成无限。</div>
          <div>修改了聊天虚拟化设置后需要重启 App 才会生效。</div>
        </div>
      `;

      const onChange = (e) => {
        const el = e.target;
        if (!(el instanceof HTMLInputElement)) return;
        const id = el.getAttribute('data-force-module');
        if (id) setModuleForceEnabled(id, el.checked);
      };
      container.addEventListener('change', onChange);
      return () => container.removeEventListener('change', onChange);
    },
  });
}
