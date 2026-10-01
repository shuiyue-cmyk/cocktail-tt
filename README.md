# 鸡尾酒（cocktail-tt）

> **TauriTavern 适配 fork**，基于 [Lianues/cocktail](https://github.com/Lianues/cocktail)。
> 上游 ST 装法见下方「安装」；TT 装法见文末「TauriTavern 适配」。

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

## TauriTavern 适配（本 fork：shuiyue-cmyk/cocktail-tt）

本分支在上游基础上增加 TT 2.3.0（ST 兼容 1.18.0）适配，不改变原生 ST 行为：

- 版本门控修复：`index.js` 优先从 `CLIENT_VERSION`（`SillyTavern:<compat>:TauriTavern`）解析 ST 兼容版本，TT 2.3.0 正确识别为 1.18.0，正则刷新模块正常加载；旧逻辑会误把 `TauriTavern 2.3.0` 当 ST 版本。
- 启动优化默认让路：TT 已有分阶段启动 + Rust bootstrap 并发快照，`startup-optimizer` 的提前解遮罩与预取在 TT 上默认跳过（面板可手动打开验证：`TT：允许...`）。
- 聊天渲染避让虚拟化：TT 实验性 bounded 虚拟化激活时（`#chat[data-tt-chat-surface="bounded"]`），自动跳过 Show More 拦截与分片直插，只保留高亮/折叠/防误触，避免与 TanStack 状态分叉。
- 存档解锁停用：TT 第一方存档走直连 transport，不经过 `/api/chats/save` fetch，本模块在 TT 上自动停用。
- 更新检查指向 fork：远端 manifest 优先查本 fork，`0.2.0-tt.x` 不会被上游 `0.1.x` 误判为可更新。
- 鸡尾酒+ 提示：在 TT 上不再自动弹窗，且面板注明 TT 不支持 Node 后端插件。

### tt.2 修复：世界书条目「加载不全 / 行被裁切」

症状：iPad 等触屏设备上打开世界书，条目标题与「位置/深度/顺序/触发%」那一行被裁掉一半，滚动时部分条目像没渲染完。关掉鸡尾酒即恢复。

原因与改动：

1. **条目标题被硬裁剪**（主因）：上游 `style.css` 用 `overflow-x/y: hidden !important` 强制裁剪 `textarea[name="comment"]`。窄屏下条目名会换行，第 2 行直接被裁掉（截图里的 `[mvu_updat` 就是这么断的），整行高度随之失真。→ 改为只保留换行规则，高度交回 ST 自己的 `initScrollHeight`。
2. **合成层常驻**：`will-change: opacity, transform` + `contain: layout paint` 原本常驻在每个被接管的抽屉上。世界书动辄几百个条目 = 几百个合成层，iPadOS 上直接耗尽 GPU 预算，表现就是滚动时内容画不全。→ 改为只在动画播放期间挂 `body.st-uao-animating`。
3. **全局 `show()` 被强制成 `display:block`**：patch 过的 jQuery `show` 在拿不到原 display 时一律回退 `block`，会把酒馆里大量 flex/grid 元素（世界书条目的 `inline-drawer-header`、`world_entry_form_control` 等）布局压坏。→ 改为探测元素自然 display 值再决定。
4. **预留高度可能卡死**：条目展开时会写死 `height + overflow:hidden`，而延迟构建的回调在抽屉已被关闭时直接 return，**不回收这个固定高度**，条目就永久显示不全。→ 补上回收，并加 `ResizeObserver` 在真实高度变化时自动放开固定高度。
5. **`content-visibility` 在触屏上不再挂类**：这是「滚动时只渲染一部分」最典型的成因，移动 WebView 上直接禁用。
6. 新增开关「世界书条目展开优化：自动/开/关」。`自动` = TauriTavern 或触屏设备下完全交回酒馆原生处理，桌面原生 ST 保持原行为。
7. 鸡尾酒主面板顶部新增运行环境与逐模块开关，出现异常可直接在这里关掉某个模块定位问题（改完刷新生效）。

### tt.3 修复：真正的元凶（顶部抽屉优化与 ST 1.18 抽屉动画不兼容）

tt.2 只治了世界书条目列表自身的逻辑，症状没消失。tt.3 找到根因：

`ui-animation-optimizer` 会给 `.drawer-content` 强制

```css
body.st-uao-top-drawer .drawer-content { transition: none !important; }
```

而 ST 1.18 / TT 2.3.0 的抽屉高度动画是用现代 CSS 实现的：

```css
:root { interpolate-size: allow-keywords; }
.drawer-content { height: 0; transition-property: height, display; transition-behavior: allow-discrete; }
.drawer-content.openDrawer { height: calc-size(auto, size); @starting-style { height: 0; } }
```

`#WorldInfo`（世界书面板）自己就是一个 `.drawer-content`。把过渡整个掐掉后，抽屉高度按新公式算不准，结果就是世界书条目被裁切、滚动时内容没加载全。上游 cocktail 是对着 ST 1.14/1.15 写的，那时抽屉还是纯 `max-height` 动画，所以没暴露。

tt.3 改动：

1. **顶部抽屉优化与 jQuery slide* 替换升级为三态**（`自动` / 强制开 / 强制关）。老设置里的 `true` 一律迁移成 `自动`，所以**原生 ST 1.15 及更早的行为完全不变**。
2. **顶部抽屉优化按 ST 兼容版本判定**：ST ≥ 1.18（或版本识别不出来）默认关闭，因为已经切到现代抽屉 CSS；TT 一律关闭。
3. **jQuery slide* 全局替换**：TT 或触屏设备默认关闭。这是对 `$.fn.slideToggle/slideUp/slideDown` 的全局替换，影响酒馆每一个面板，TT 前端是 rspack 打包 + 自有注入层，无法逐一验证替换点。
4. 世界书条目展开优化维持 tt.2 的 `自动`（TT/触屏关闭）。

升级后的默认行为矩阵：

| 环境 | 顶部抽屉优化 | jQuery slide* 替换 | 世界书条目展开 |
|---|---|---|---|
| ST ≤ 1.15 桌面 | 开 | 开 | 开 |
| ST 1.18 桌面 | **关** | 开 | 开 |
| ST 1.18 触屏 | **关** | 关 | 关 |
| TT 2.3 桌面 | **关** | 关 | 关 |
| TT 2.3 触屏 | **关** | 关 | 关 |

如果升级后你仍然看到异常，可以在「UI 动画与抽屉展开」里把三项逐个改成「强制开启」来定位是哪一项；也可以用主面板顶部的逐模块开关。

TT 安装：扩展页用 Git URL 安装 `https://github.com/shuiyue-cmyk/cocktail-tt`（全局/本地均可），或手动放入 `data/extensions/third-party/cocktail-tt/`（全局）/`data/default-user/extensions/cocktail-tt/`（本地），然后在扩展设置启用`鸡尾酒`。

> 注意：TT 内置 Git 以**仓库名**作为扩展目录名，因此从 Git URL 安装后目录为 `cocktail-tt`。如果你之前用的是旧名 `cocktail`，改名前后属于两个不同扩展，需要在扩展页卸载旧的再装新的。

兼容结论（TT 2.3.0 实测逻辑核查）：`manifest.dependencies=["regex"]` 满足（TT discover 含 system `regex`）；面板挂载点 `#extensions_settings2/#extensions_settings` 存在；`/scripts/*` import 别名与正则引擎路径存在；`fetch /api/extensions/*` 参数形状与 TT Rust 归一化兼容（前导 `/` 会被 trim）。


