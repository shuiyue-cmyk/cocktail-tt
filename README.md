# 鸡尾酒（cocktail）— TauriTavern 适配版

> 基于 [Lianues/cocktail](https://github.com/Lianues/cocktail) `0.1.17`（main @ fc52924）。原作者 Limerence / Lianues；本分支只做 [TauriTavern](https://github.com/Darkatse/TauriTavern)（TT 酒馆）的宿主适配，**同时仍可在 SillyTavern 上使用**。

## 在 TT 酒馆里安装

TT 的「扩展 → 安装扩展」只接受匿名 http(s) Git 地址，填入：

```
https://github.com/shuiyue-cmyk/cocktail-tt
```

安装后重启 / 刷新即可，在「扩展设置」里会出现 **鸡尾酒** 面板。更新可直接用 TT 的扩展更新按钮，或等启动后的自动检查提示。

> 不要同时安装原版 cocktail 和本适配版，两者共用同一套全局标记与设置键，会互相跳过初始化。

## 适配内容

| 模块 | TT 上的处理 | 原因 |
| --- | --- | --- |
| 启动加载优化 | **不加载** | TT 已内置分阶段启动、`/api/bootstrap` 快照，遮罩在第一帧就移除；再预取 `characters/avatars/backgrounds` 只会多做三次 IPC |
| 正则刷新优化 | **不加载** | TT 的正则扩展已内置 `RegexRefreshCoordinator`（防抖 + 空闲分帧增量重渲染） |
| 保存时允许切换角色 | **不加载** | TT 第一方聊天保存走内部 Tauri transport，不再发 `/api/chats/save`，fetch 拦截点已不存在 |
| 鸡尾酒+ 安装器 | **不加载** | 鸡尾酒+ 依赖 SillyTavern 的 Node Server Plugin，TT 没有 Node 后端 |
| 聊天渲染优化 | 已适配 | 「显示更多」在 TT 绑定的是 `click`（上游是 `mouseup/touchend`），改为按宿主实际绑定的事件类型接管，避免一次点击加载两批；TT 上不再补发伪造的 `MESSAGE_UPDATED`；开启 TT 聊天虚拟化时不再安装分页/加载更多/提前预加载，只保留防误触滑动、代码块相关 |
| 预设面板 | 已适配 | TT 已重写 PromptManager 的 render / dry-run 调度，TT 上只保留拖拽优化，不再接管 dry-run |
| 自动更新 | 已适配 | 版本源指向本仓库，去掉 Gitee 回退 |
| 拖拽（预设 / 正则 / 世界书）、世界书面板精简、UI 动画 | 未改动 | 依赖的 DOM id、jQuery UI sortable 初始化点在 TT 里与上游一致 |

TT 下会多出一个 **「TauriTavern 适配」** 子面板，显示当前是否开启了聊天虚拟化以及被停用的模块；除「鸡尾酒+ 安装器」外，其余被停用的模块都可以在该面板勾选**强制启用**（刷新后生效，与宿主内置机制叠加的行为未经验证）。

## TT 上与上游不同的默认值

| 项 | 上游默认 | TT 默认 | 原因 |
| --- | --- | --- | --- |
| 禁用代码块高亮 | 开 | **关** | TT 已有视口附近延迟高亮，不会卡顿，没必要牺牲高亮 |
| UI 动画优化 | 开 | **关** | 会全局替换 jQuery slide 并改抽屉过渡，未经 TT 移动端验证 |
| 关闭聊天渲染优化时的 `chat_truncation` | 改成“无限” | **还原原值** | 上游会让长聊天一次性全部挂载且不再恢复；现在记住原值并在关闭时还原 |

已经保存过这些设置的用户不受默认值影响，以已保存的值为准。

## 已知限制 / 未验证

- 以上适配基于对 TT `main` 源码的静态核对，**没有在真机（Android / iOS）上逐项实测**。UI 动画优化在 TT 上默认关闭；如手动开启后在移动端发现抽屉异常，请在面板里关掉它。
- 聊天渲染优化里的「首屏渲染条数」仍会写入 `power_user.chat_truncation`（开启期间覆盖你手动设置的值），但会记住原值，关闭模块时还原。
- 若你在鸡尾酒开启期间手动改了「加载消息条数」，该值会被当作新的原值；下次保存/刷新时仍由鸡尾酒的「首屏渲染条数」接管。

---

以下为上游原版说明：

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

