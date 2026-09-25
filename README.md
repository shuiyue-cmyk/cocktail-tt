# 鸡尾酒（cocktail）

这是一个 **SillyTavern 前端扩展**，把以下三个优化插件合并成一个：

- `st-startup-optimizer`（启动加载优化）
- `st-chat-render-optimizer`（聊天渲染优化）
- `st-regex-refresh-optimizer`（正则刷新优化）

本插件的实现方式是 **入口 `index.js` + `modules/` 下的独立模块文件**：三个模块互不依赖，方便你后续按需拆装/替换。

## 安装（无需编译）

把整个 `cocktail/` 文件夹复制到你的 SillyTavern：

`SillyTavern/public/scripts/extensions/third-party/cocktail/`

确保目录内至少有：

- `manifest.json`
- `index.js`
- `modules/`
- `style.css`

然后在酒馆前端：**扩展 → 启用** `鸡尾酒`。

## 设置面板（可选）

启用后，会在“扩展设置”里插入一个 **鸡尾酒** 面板，内部包含 3 个 **自定义 HTML 子面板**：

- 启动加载优化
- 聊天渲染优化
- 正则刷新优化

三个模块不再各自注册独立面板；而是通过 `core/subpanels.js` 提供的统一注册器注册到鸡尾酒面板里。

## 如何“解耦/只保留其中一项”

编辑 `index.js`，删除对应的 import，并删除 `modules/` 下的对应模块文件即可。

## TauriTavern 适配（本 fork：shuiyue-cmyk/cocktail）

本分支在上游基础上增加 TT 2.3.0（ST 兼容 1.18.0）适配，不改变原生 ST 行为：

- 版本门控修复：`index.js` 优先从 `CLIENT_VERSION`（`SillyTavern:<compat>:TauriTavern`）解析 ST 兼容版本，TT 2.3.0 正确识别为 1.18.0，正则刷新模块正常加载；旧逻辑会误把 `TauriTavern 2.3.0` 当 ST 版本。
- 启动优化默认让路：TT 已有分阶段启动 + Rust bootstrap 并发快照，`startup-optimizer` 的提前解遮罩与预取在 TT 上默认跳过（面板可手动打开验证：`TT：允许...`）。
- 聊天渲染避让虚拟化：TT 实验性 bounded 虚拟化激活时（`#chat[data-tt-chat-surface="bounded"]`），自动跳过 Show More 拦截与分片直插，只保留高亮/折叠/防误触，避免与 TanStack 状态分叉。
- 存档解锁停用：TT 第一方存档走直连 transport，不经过 `/api/chats/save` fetch，本模块在 TT 上自动停用。
- 更新检查指向 fork：远端 manifest 优先查本 fork，`0.2.0-tt.x` 不会被上游 `0.1.x` 误判为可更新。
- 鸡尾酒+ 提示：在 TT 上不再自动弹窗，且面板注明 TT 不支持 Node 后端插件。

TT 安装：扩展页用 Git URL 安装 `https://github.com/shuiyue-cmyk/cocktail`（全局/本地均可），或手动放入 `data/extensions/third-party/cocktail/`（全局）/`data/default-user/extensions/cocktail/`（本地），然后在扩展设置启用`鸡尾酒`。

兼容结论（TT 2.3.0 实测逻辑核查）：`manifest.dependencies=["regex"]` 满足（TT discover 含 system `regex`）；面板挂载点 `#extensions_settings2/#extensions_settings` 存在；`/scripts/*` import 别名与正则引擎路径存在；`fetch /api/extensions/*` 参数形状与 TT Rust 归一化兼容（前导 `/` 会被 trim）。


