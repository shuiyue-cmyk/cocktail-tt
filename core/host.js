/**
 * 宿主识别（SillyTavern / TauriTavern）
 *
 * TauriTavern 在加载任何扩展之前就会写入 `window.__TAURI_RUNNING__`（init.js）和
 * `window.__TAURITAVERN__`（Host ABI，bootstrap.js），所以第三方扩展在模块求值阶段即可同步判断。
 * 参考：TauriTavern/ExtensionDEV.md §1.3、docs/FrontendHostContract.md §2.2 / §3.6
 */

export const IS_TAURITAVERN = Boolean(
  globalThis.__TAURITAVERN__ || globalThis.__TAURI_RUNNING__ === true,
);

/**
 * 聊天是否运行在 TT 的“有界 ChatSurface”（聊天虚拟化）下。
 * 此时 `#chat > .mes` 只是完整 chat[] 的有界投影：没有 “Show more messages” 按钮，
 * 滚动与挂载由宿主的虚拟列表接管，扩展不应再自己分批插入楼层或改写 scrollTop。
 *
 * isManagedOwnershipRequired() 是页面启动时冻结的布尔值（等价于“聊天虚拟化已开启”），
 * 参考 TauriTavern/docs/API/ChatSurface.md。
 */
export function isBoundedChatSurface() {
  try {
    return globalThis.__TAURITAVERN__?.api?.chatSurface?.isManagedOwnershipRequired?.() === true;
  } catch {
    return false;
  }
}

/**
 * TT 上因“宿主已内置同等能力 / 依赖 Node 后端”而不加载的模块。
 * key 与 index.js 中的动态 import 一一对应；reason 会显示在“TauriTavern 适配”子面板里。
 */
export const TT_DISABLED_MODULES = Object.freeze([
  {
    id: 'startup-optimizer',
    title: '启动加载优化',
    reason: 'TT 已内置分阶段启动（Shell → Core → Full）、/api/bootstrap 快照，并在第一帧就移除遮罩；再预取 characters/avatars/backgrounds 只会白白多做三次 IPC。',
  },
  {
    id: 'regex-refresh-optimizer',
    title: '正则刷新优化',
    reason: 'TT 的正则扩展已内置 RegexRefreshCoordinator（防抖 + 空闲分帧增量重渲染），不再像上游那样每次开关都 reloadCurrentChat()；两套机制叠加会互相抢事件。',
  },
  {
    id: 'chat-saving-unblocker',
    title: '保存时允许切换角色',
    reason: 'TT 的第一方聊天保存走内部 Tauri transport，不再产生 /api/chats/save 的 fetch 请求，本模块依赖的 fetch 拦截点已不存在。',
  },
  {
    id: 'cocktail-plus-installer',
    title: '鸡尾酒+ 安装器',
    reason: '鸡尾酒+ 依赖 SillyTavern 的 Node Server Plugin，TT 没有 Node 后端，无法使用。',
  },
]);
