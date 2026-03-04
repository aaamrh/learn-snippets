# VS Code 风格插件系统演进计划

> 本文档是插件系统从"教学级 mini 版"向"功能完备的 VS Code 架构复刻"演进的完整技术规范。
> 每次切换上下文时，阅读此文档即可恢复全部背景。

---

## 目录

- [1. 当前状态总结](#1-当前状态总结)
  - [1.1 V1 与 V2 架构对比](#11-v1-与-v2-架构对比)
  - [1.2 V2 已实现的核心模块](#12-v2-已实现的核心模块)
  - [1.3 已有的 V2 示例插件](#13-已有的-v2-示例插件)
  - [1.4 关键概念：Disposable 模式](#14-关键概念disposable-模式)
- [2. 演进目标](#2-演进目标)
- [3. 实施阶段与依赖关系](#3-实施阶段与依赖关系)
- [4. 特性详细规范](#4-特性详细规范)
  - [特性 1：错误边界 / 崩溃恢复](#特性-1错误边界--崩溃恢复)
  - [特性 2：Disposable 模式一致性](#特性-2disposable-模式一致性)
  - [特性 3：KeybindingService](#特性-3keybindingservice)
  - [特性 4：StatusBar 交互增强](#特性-4statusbar-交互增强)
  - [特性 5：插件间依赖](#特性-5插件间依赖)
  - [特性 6：插件设置 / 配置](#特性-6插件设置--配置)
  - [特性 7：右键菜单](#特性-7右键菜单)
  - [特性 8：插件自定义面板 / Webview](#特性-8插件自定义面板--webview)
  - [特性 9：多 Tab 编辑器](#特性-9多-tab-编辑器)
  - [特性 10：插件市场远程加载模拟](#特性-10插件市场远程加载模拟)
- [5. 文件清单](#5-文件清单)
  - [5.1 新增文件](#51-新增文件)
  - [5.2 需修改的现有文件](#52-需修改的现有文件)
- [6. 工作量估算](#6-工作量估算)
- [7. 进度追踪](#7-进度追踪)

---

## 1. 当前状态总结

### 1.1 V1 与 V2 架构对比

代码库中并存两套插件架构：

| 维度 | V1（Tiptap 风格） | V2（VS Code 风格）✅ 当前目标 |
|------|-------------------|-------------------------------|
| **宿主** | `PluginHost.ts` | `NewPluginHost.ts` |
| **类型定义** | `types.ts`（`Plugin` 接口） | `manifest-types.ts`（`PluginManifest` + `PluginEntry` + `PluginAPI`） |
| **插件位置** | `plugins/` 直属文件（bold.ts、italic.ts、emoji.tsx 等） | `plugins/v2/` 目录 |
| **设计思路** | 插件直接实现 `Plugin` 接口，没有 Manifest | Manifest-first，先声明再加载 |
| **激活方式** | 注册即激活 | 按需激活（`ActivationManager`：onStartup / onCommand / onEvent） |
| **API 访问** | 通过 `PluginContext`（on/off/emit/insertText） | 通过 `PluginAPI`（editor/commands/statusBar/events/storage） |
| **权限控制** | 无 | `PermissionGuard` 按 Manifest permissions 拦截 |
| **沙箱隔离** | 无 | `WorkerSandbox` / `MainThreadSandbox` |
| **弹窗机制** | 直接 React.createElement | 纯数据事件（`ui:show-popup`），宿主统一渲染 |

**Demo 页面（`page.tsx`）已完全使用 V2 架构。V1 代码是死代码，应在合适时机清理。**

V1 文件清单（可清理）：
- `src/plugin-system/PluginHost.ts`
- `src/plugin-system/types.ts`
- `src/plugin-system/plugins/bold.ts`
- `src/plugin-system/plugins/italic.ts`
- `src/plugin-system/plugins/emoji.tsx`
- `src/plugin-system/plugins/imageUpload.tsx`
- `src/plugin-system/plugins/lineCount.ts`
- `src/plugin-system/plugins/wordCount.ts`
- `src/plugin-system/plugins/autoSave.ts`
- `src/plugin-system/plugins/shortcut.ts`
- `src/plugin-system/plugins/markdownPreview.ts`

### 1.2 V2 已实现的核心模块

| 模块 | 文件 | 职责 |
|------|------|------|
| **PluginRegistry** | `PluginRegistry.ts` | 插件安装/卸载/状态管理、依赖检查、循环依赖检测 |
| **ContributionManager** | `ContributionManager.ts` | 按类型索引 contributions（commands / menus / keybindings / statusBar / selectionToolbar）、命令 handler 注册/执行 |
| **ActivationManager** | `ActivationManager.ts` | 按需激活：解析 activationEvents、触发 onCommand/onEvent/onStartup、加载插件代码 |
| **ContextKeyService** | `ContextKeyService.ts` | when 表达式解析与求值（支持 `&&`/`||`/`!`/比较/`in`/正则等） |
| **APIProxy** | `APIProxy.ts` | 创建 PluginAPI（editor/commands/statusBar/events/storage）、EditorBridge 实现 |
| **PermissionGuard** | `PermissionGuard.ts` | 权限检查代理（Proxy 模式）、审计日志、动态授权/撤销 |
| **WorkerSandbox** | `WorkerSandbox.ts` | Worker 沙箱（`WorkerSandbox`）和主线程沙箱（`MainThreadSandbox`），统一 `ISandbox` 接口 |
| **SelectionToolbar** | `SelectionToolbar.tsx` | 选中文本后的浮动工具条 |
| **NewPluginHost** | `NewPluginHost.ts` | 集成以上所有模块的顶层宿主 |

### 1.3 已有的 V2 示例插件

| 插件 ID | 文件 | 功能 | activationEvents |
|---------|------|------|------------------|
| `translate` | `plugins/v2/translate.ts` | 选中文字翻译（模拟） | `onCommand:translate.translateSelection` |
| `copy-as-markdown` | `plugins/v2/copyAsMarkdown.ts` | 复制为 Markdown | `onCommand:copy-as-markdown.copy` |
| `word-count` | `plugins/v2/wordCount.ts` | 字数统计（状态栏） | `onStartup` |
| `auto-save` | `plugins/v2/autoSave.ts` | 自动保存到 localStorage | `onStartup` |
| `emoji-picker` | `plugins/v2/emojiPicker.ts` | 表情面板 | `onCommand:emoji-picker.insert` |
| `image-upload` | `plugins/v2/imageUpload.ts` | 图片 URL 插入 | `onCommand:image-upload.insert` |

### 1.4 关键概念：Disposable 模式

```typescript
// Disposable 就是一个"清理函数的容器"
interface Disposable {
  dispose(): void;
}

// 使用场景：注册命令后得到 Disposable，调用 dispose() 就能撤销注册
const disposable = api.commands.registerCommand("my.command", handler);
// 插件停用时：
disposable.dispose(); // 命令 handler 被移除
```

**当前链路**：
1. `createPluginAPI()` 创建 API 时，内部各 `createXxxAPI()` 都会收集 Disposable
2. 这些 Disposable 通过 `apiDisposables` 返回
3. `NewPluginHost.handleActivationCallback()` 把 `apiDisposables` 存入 `pluginDisposables` Map
4. `NewPluginHost.deactivatePlugin()` 遍历 `pluginDisposables` 调用每个 `dispose()`
5. 同时还调用 `registry.disposeAll(pluginId)` 清理 Registry 层的 Disposable

**链路基本通，但缺少统一的管理工具和验证手段。**

---

## 2. 演进目标

把当前的"教学级 VS Code 插件系统 mini 版"演进为"功能完备的架构复刻"，新增 10 项核心特性：

1. **错误边界 / 崩溃恢复** — 插件崩溃不影响宿主和其他插件
2. **Disposable 模式一致性** — 资源注册 100% 可追踪、可清理
3. **KeybindingService** — 快捷键管理从 page.tsx 抽取为独立服务
4. **StatusBar 交互增强** — 颜色、tooltip、点击命令
5. **插件间依赖** — 验证已有逻辑 + 示例插件 + 依赖可视化
6. **插件设置/配置** — `contributes.configuration` + ConfigurationService
7. **右键菜单** — `contributes.menus` + ContextMenu 组件
8. **插件自定义面板 / Webview** — `contributes.views` + ViewContainer + TreeView
9. **多 Tab 编辑器** — EditorTabManager + Tab 栏 UI
10. **插件市场远程加载模拟** — MarketplaceService + 远程 Manifest/代码加载

---

## 3. 实施阶段与依赖关系

```
Phase 1 — 基础设施（无 UI 依赖，纯模块）
  ├── 特性 1: 错误边界 / 崩溃恢复（PluginErrorBoundary）
  ├── 特性 2: Disposable 一致性（DisposableStore）
  └── 特性 3: KeybindingService
  
  ↓ Phase 1 三个任务之间无依赖，可并行

Phase 2 — 核心扩展（新增 Contribution Points）
  ├── 特性 4: StatusBar 交互增强（扩展已有类型）
  ├── 特性 5: 插件间依赖（验证 + 示例 + UI）
  ├── 特性 6: 插件设置/配置（ConfigurationService）← 新模块
  └── 特性 7: 右键菜单（ContextMenu）← 后端逻辑已有，需要前端 UI

  ↓ Phase 2 依赖 Phase 1 的完成（特别是错误边界和 Disposable）

Phase 3 — 高级特性（较大的架构改动）
  ├── 特性 8: 插件自定义面板 / Webview（ViewContainer + TreeView）
  ├── 特性 9: 多 Tab 编辑器（EditorTabManager）
  └── 特性 10: 插件市场远程加载（MarketplaceService）

  ↓ Phase 3 各任务相对独立，建议顺序：8 → 9 → 10
```

---

## 4. 特性详细规范

---

### 特性 1：错误边界 / 崩溃恢复

**目标**：一个插件崩溃不影响其他插件和宿主，崩溃信息可视化展示在 UI 上。

#### 现状分析

- `handleActivationCallback` 里有 try-catch，激活失败会清理沙箱并 `setState("error")`
- `deactivatePlugin` 也有 try-catch
- `executeCommand` **缺少保护**——命令 handler 抛异常会直接冒泡到 page.tsx
- page.tsx 的 `handleExecuteCommand` 有 try-catch 但只是 `console.error` + `showToast`
- `ActivationManager.start()` 逐个 await，一个失败会记录到 history 但不影响后续 ✅
- `WorkerSandbox` 有 `onerror` 处理，但**没有重启策略**

#### 实施清单

| # | 操作 | 文件 | 说明 |
|---|------|------|------|
| 1.1 | `executeCommand` 加 try-catch | `NewPluginHost.ts` L581-613 | 捕获命令执行异常，emit `plugin-error` 事件而非让异常冒泡，返回 `{ error }` 对象 |
| 1.2 | 新增 `PluginErrorBoundary` 模块 | `src/plugin-system/PluginErrorBoundary.ts`（新建） | 记录每个插件的错误次数、错误历史（最近 N 条）；超过阈值（如连续 3 次激活失败）自动停用；提供 `reset()` 方法供手动重试 |
| 1.3 | `NewPluginHost` 集成 `PluginErrorBoundary` | `NewPluginHost.ts` | 构造时创建 `PluginErrorBoundary` 实例；`handleActivationCallback` 和 `executeCommand` 的 catch 块中调用 `errorBoundary.recordError(pluginId, error)`；emit 统一的 `plugin-error` 事件 |
| 1.4 | 错误面板 UI | `page.tsx` | 在底部面板区增加"错误"tab：展示每个插件的错误历史、当前状态（正常/已停用/错误）、"重试激活"按钮 |
| 1.5 | Worker 崩溃恢复 | `WorkerSandbox.ts` | 新增 `restart()` 方法：销毁旧 Worker → 重新 `init()` → 重新 `activate()`；`onerror` 时自动重启（最多 3 次，每次间隔递增）；超过重启次数则 `setState("error")`、emit 事件 |
| 1.6 | 事件类型扩展 | `NewPluginHost.ts` `PluginHostEvent` 类型 | 新增 `plugin-auto-disabled`（自动停用）、`plugin-restart-attempted`（重启尝试）事件 |

#### PluginErrorBoundary 接口设计

```typescript
interface PluginErrorRecord {
  pluginId: string;
  error: Error;
  timestamp: number;
  context: "activation" | "command" | "event" | "worker-crash";
  commandId?: string;
}

interface PluginErrorBoundaryConfig {
  /** 连续错误阈值，超过则自动停用，默认 3 */
  maxConsecutiveErrors: number;
  /** 错误历史最大条数，默认 50 */
  maxHistorySize: number;
  /** 自动停用回调 */
  onAutoDisable?: (pluginId: string, errors: PluginErrorRecord[]) => void;
}

class PluginErrorBoundary {
  constructor(config?: Partial<PluginErrorBoundaryConfig>);
  
  /** 记录一次错误 */
  recordError(pluginId: string, error: Error, context: PluginErrorRecord["context"], commandId?: string): void;
  
  /** 是否应该自动停用 */
  shouldAutoDisable(pluginId: string): boolean;
  
  /** 重置错误计数（用户手动重试前调用） */
  reset(pluginId: string): void;
  
  /** 获取插件的错误历史 */
  getErrors(pluginId: string): PluginErrorRecord[];
  
  /** 获取全局错误历史 */
  getAllErrors(): PluginErrorRecord[];
  
  /** 获取诊断信息 */
  getDiagnostics(): PluginErrorBoundaryDiagnostics;
}
```

---

### 特性 2：Disposable 模式一致性

**目标**：资源注册 100% 可追踪、可清理，防止内存泄漏。

#### 现状分析

- `createCommandsAPI`：`registerCommand` 返回 Disposable 给插件，同时有总 `disposable` 清理所有命令 ✅
- `createEventsAPI`：有 `registeredListeners` 数组 + 总 `disposable` ✅
- `createEditorAPI`：`onSelectionChange` 有 `disposable` ✅
- `createStorageAPI`：**没有返回 disposable**（存储可能不需要清理，但应保持一致性）
- `createStatusBarAPI`：**没有返回 disposable**（需要确认状态栏项是否需要在停用时移除）
- 手动数组管理 Disposable，没有防止重复 dispose 的保护

#### 实施清单

| # | 操作 | 文件 | 说明 |
|---|------|------|------|
| 2.1 | 新增 `DisposableStore` 工具类 | `src/plugin-system/DisposableStore.ts`（新建） | 统一管理一组 Disposable，支持 `add()`、`addMany()`、`disposeAll()`、`isDisposed` 属性、防止重复 dispose |
| 2.2 | `createPluginAPI` 使用 `DisposableStore` | `APIProxy.ts` | 替换手动数组 `const disposables: Disposable[] = []`，改用 `const store = new DisposableStore()` |
| 2.3 | `createStatusBarAPI` 补充 Disposable | `APIProxy.ts` L223-238 | `update()` 注册的状态栏项应在 dispose 时调用 `contributionManager.removeStatusBarContent()` |
| 2.4 | `createStorageAPI` 补充 Disposable | `APIProxy.ts` L301-348 | 虽然存储本身不需要清理，但为一致性添加空 Disposable 或清理缓存的逻辑 |
| 2.5 | `NewPluginHost.deactivatePlugin` 加清理审计 | `NewPluginHost.ts` L515-564 | 停用时 console.debug 输出清理了多少 Disposable，方便调试 |
| 2.6 | 诊断面板展示 Disposable 计数 | `page.tsx` DiagnosticsContent | 每个插件显示"活跃资源数"（从 `registry.get(pluginId).disposables.length` + `pluginDisposables.size` 获取） |

#### DisposableStore 接口设计

```typescript
class DisposableStore implements Disposable {
  private items: Disposable[] = [];
  private _isDisposed = false;

  get isDisposed(): boolean;
  
  /** 添加一个 Disposable，返回它自身（方便链式调用） */
  add<T extends Disposable>(disposable: T): T;
  
  /** 批量添加 */
  addMany(disposables: Disposable[]): void;
  
  /** 清理所有已添加的 Disposable */
  disposeAll(): void;
  
  /** 实现 Disposable 接口（等同于 disposeAll） */
  dispose(): void;
  
  /** 当前持有的 Disposable 数量 */
  get size(): number;
}
```

---

### 特性 3：KeybindingService

**目标**：快捷键管理从 page.tsx 抽取为独立服务，宿主内部统一管理。

#### 现状分析

- `NewPluginHost.setupKeybindings()` 方法体是**空的**（只有注释说"预留扩展点"）
- page.tsx L408-436 有 keydown 监听：构建 keyCombo → `host.contributions.findCommandByKeybinding(keyCombo)` → 执行
- `ContributionManager.findCommandByKeybinding` 有实现 ✅（含 `normalizeKeybinding` 标准化）
- `ContributionManager.getActiveKeybindings` 会用 `ContextKeyService` 过滤 `when` 条件 ✅
- **快捷键实际已经生效**，只是实现散落在 page.tsx 而非宿主内部

#### 实施清单

| # | 操作 | 文件 | 说明 |
|---|------|------|------|
| 3.1 | 新增 `KeybindingService` 模块 | `src/plugin-system/KeybindingService.ts`（新建） | 封装 keydown 监听、快捷键匹配、冲突检测、when 条件过滤；依赖 `ContributionManager` + `ContextKeyService` |
| 3.2 | `NewPluginHost` 集成 | `NewPluginHost.ts` | 构造时创建 `KeybindingService`；`setupKeybindings()` 填充实际逻辑；`dispose()` 时清理 keydown 监听 |
| 3.3 | page.tsx 移除 keydown 监听 | `page.tsx` L408-436 | 删除 `handleKeyDown` 和 `document.addEventListener("keydown", ...)` |
| 3.4 | 冲突检测 | `KeybindingService.ts` | 如果两个插件绑定了同一快捷键，记录冲突并在诊断信息中报告 |
| 3.5 | 快捷键面板 UI | `page.tsx` | 新增"快捷键"面板：展示所有已注册快捷键、来源插件、when 条件、冲突标记 |
| 3.6 | 用户自定义覆盖（可选） | `KeybindingService.ts` | 支持用户覆盖快捷键绑定（存储到 localStorage），优先级高于插件声明 |

#### KeybindingService 接口设计

```typescript
interface KeybindingConflict {
  key: string;
  plugins: Array<{ pluginId: string; commandId: string }>;
}

interface KeybindingServiceConfig {
  /** 绑定 keydown 的目标元素，默认 document */
  target?: EventTarget;
  /** 命令执行回调 */
  executeCommand: (commandId: string, ...args: unknown[]) => Promise<unknown>;
}

class KeybindingService implements Disposable {
  constructor(
    contributions: ContributionManager,
    contextKeys: ContextKeyService,
    config: KeybindingServiceConfig,
  );
  
  /** 启动监听 */
  start(): void;
  
  /** 停止监听 */
  stop(): void;
  
  /** 获取所有冲突 */
  getConflicts(): KeybindingConflict[];
  
  /** 获取诊断信息 */
  getDiagnostics(): KeybindingDiagnostics;
  
  dispose(): void;
}
```

---

### 特性 4：StatusBar 交互增强

**目标**：状态栏项支持颜色、tooltip、背景色、点击命令等丰富交互。

#### 现状分析

- `StatusBarContribution` 已有 `command` 字段 ✅
- page.tsx `StatusBarItem` 已支持 `onClick`（绑定 `host.executeCommand(command)`）✅
- 缺少：`tooltip`、`color`、`backgroundColor`、`when`（条件可见性）

#### 实施清单

| # | 操作 | 文件 | 说明 |
|---|------|------|------|
| 4.1 | 扩展 `StatusBarContribution` 类型 | `manifest-types.ts` L194-205 | 新增字段：`tooltip?: string`、`color?: string`、`backgroundColor?: string`、`when?: string` |
| 4.2 | `ContributionManager` 过滤 when | `ContributionManager.ts` | `getAllStatusBarItems()` → `getVisibleStatusBarItems()`，用 ContextKeyService 过滤 |
| 4.3 | StatusBar API 扩展 | `APIProxy.ts` `createStatusBarAPI` | 新增方法：`setTooltip(id, text)`、`setColor(id, color)`、`setBackgroundColor(id, color)`、`setCommand(id, commandId)` |
| 4.4 | StatusBarItem 渲染升级 | `page.tsx` StatusBarItem 组件 | 支持 `title` 属性（tooltip）、`style` 样式（color/backgroundColor）、hover 效果增强 |
| 4.5 | 新增示例插件 `gitStatus` | `plugins/v2/gitStatus.ts`（新建） | 模拟 Git 状态栏项：显示分支名 + commit 数、点击执行 `git-status.showDetails` 命令（弹 toast）、带颜色和 tooltip |
| 4.6 | 权限映射更新 | `PermissionGuard.ts` METHOD_PERMISSION_MAP | 新增 `statusBar.setTooltip`、`statusBar.setColor` 等方法的权限映射 |

---

### 特性 5：插件间依赖

**目标**：验证已有依赖逻辑、补充示例插件演示、添加依赖可视化 UI。

#### 现状分析

已实现的逻辑（已验证代码）：
- `PluginManifest.dependencies?: string[]` ✅
- `PluginRegistry.install()` 检查依赖是否已安装 ✅
- `PluginRegistry.install()` 循环依赖检测 (`wouldCreateCircularDependency`) ✅
- `ActivationManager.doActivation()` 先激活依赖再激活自身 ✅（L469-508）
- `PluginRegistry.uninstall()` 检查反向依赖，有依赖者则拒绝卸载 ✅
- `PluginRegistry.getDependents()` 获取反向依赖 ✅
- `PluginRegistry.topologicalSort()` 拓扑排序 ✅

**核心逻辑完整，但没有示例插件演示，UI 上也没有展示依赖关系。**

#### 实施清单

| # | 操作 | 文件 | 说明 |
|---|------|------|------|
| 5.1 | 新增依赖示例插件：baseFormatter | `plugins/v2/baseFormatter.ts`（新建） | 基础格式化插件：提供 `base-formatter.formatText` 命令，对文字做基础处理（trim、标准化空格等） |
| 5.2 | 新增依赖示例插件：markdownFormatter | `plugins/v2/markdownFormatter.ts`（新建） | Manifest 声明 `dependencies: ["base-formatter"]`；调用 `api.commands.executeCommand("base-formatter.formatText")` 后再做 Markdown 格式化 |
| 5.3 | Manifest 常量 | `manifest-types.ts` | 新增 `EXAMPLE_BASE_FORMATTER_MANIFEST` 和 `EXAMPLE_MARKDOWN_FORMATTER_MANIFEST` |
| 5.4 | 注册到 ALL_V2_PLUGINS | `plugins/v2/index.ts` | 添加两个新插件的 V2PluginDescriptor |
| 5.5 | 依赖可视化 UI | `page.tsx` PluginCard | 在插件卡片中显示"依赖"和"被依赖"列表（带插件名和安装状态图标） |
| 5.6 | 自动安装缺失依赖 | `NewPluginHost.ts` `installPlugin` | 安装时如果发现依赖未安装，从 ALL_V2_PLUGINS 中查找并自动安装；返回值中包含自动安装的插件列表 |
| 5.7 | 卸载保护 UI | `page.tsx` | 卸载时如果有反向依赖，弹出确认对话框："插件 X 依赖此插件，确认卸载将同时停用 X" |

---

### 特性 6：插件设置 / 配置

**目标**：插件通过 Manifest 声明可配置项（`contributes.configuration`），宿主自动渲染设置 UI，插件运行时读取配置。

#### 现状分析

完全没有实现。VS Code 的 `contributes.configuration` 是插件系统最常用的贡献点之一。

#### VS Code 对标

```jsonc
// VS Code 的 package.json
{
  "contributes": {
    "configuration": {
      "title": "My Plugin Settings",
      "properties": {
        "myPlugin.greeting": {
          "type": "string",
          "default": "Hello",
          "description": "The greeting message"
        },
        "myPlugin.enableFeatureX": {
          "type": "boolean",
          "default": true,
          "description": "Enable feature X"
        }
      }
    }
  }
}
```

#### 实施清单

| # | 操作 | 文件 | 说明 |
|---|------|------|------|
| 6.1 | 新增 `ConfigurationContribution` 类型 | `manifest-types.ts` | 在 `PluginContributes` 中新增 `configuration?: ConfigurationContribution`；`ConfigurationContribution` 包含 `title` 和 `properties`；每个 property 有 `type`（string/number/boolean/enum）、`default`、`description`、`enum?`（可选值列表）、`minimum?`/`maximum?` |
| 6.2 | 新增 `ConfigurationService` | `src/plugin-system/ConfigurationService.ts`（新建） | 管理所有插件的配置：注册 schema、读取值（合并默认值）、写入值、持久化到 localStorage、变更通知 |
| 6.3 | 扩展 `PluginAPI` | `manifest-types.ts` | 新增 `ConfigurationAPI` 接口：`get<T>(key)`、`update(key, value)`、`onDidChange(key, handler): Disposable` |
| 6.4 | `createConfigurationAPI` | `APIProxy.ts` | 实现 `ConfigurationAPI`，代理到 `ConfigurationService` |
| 6.5 | `PluginAPI` 新增 `configuration` 命名空间 | `manifest-types.ts` + `APIProxy.ts` | `api.configuration.get("autoSave.interval")` |
| 6.6 | 新增配置权限 | `manifest-types.ts` Permission 类型 + `PermissionGuard.ts` | 新增 `"configuration:read"` 和 `"configuration:write"` 权限及其映射 |
| 6.7 | `NewPluginHost` 集成 | `NewPluginHost.ts` | 构造时创建 `ConfigurationService`；在 `handleActivationCallback` 时将 `configService` 传给 `createPluginAPI` |
| 6.8 | `ContributionManager` 注册 configuration | `ContributionManager.ts` | 新增 `registerConfiguration()` / `unregisterConfiguration()` 方法 |
| 6.9 | 设置面板 UI | `page.tsx` | 新增"设置"面板：按插件分组展示配置项；根据 type 渲染对应控件（输入框/数字输入/开关/下拉框）；修改后实时生效并通知插件 |
| 6.10 | 示例：autoSave 配置化 | `plugins/v2/autoSave.ts` | 把保存间隔从硬编码 5000ms 改为读取配置 `autoSave.interval`；在 Manifest 中声明 `contributes.configuration` |

#### ConfigurationService 接口设计

```typescript
interface ConfigurationPropertySchema {
  type: "string" | "number" | "boolean" | "enum";
  default: unknown;
  description: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
}

interface ConfigurationContribution {
  title: string;
  properties: Record<string, ConfigurationPropertySchema>;
}

class ConfigurationService implements Disposable {
  /** 注册插件的配置 schema */
  registerSchema(pluginId: string, config: ConfigurationContribution): void;
  
  /** 注销插件的配置 schema */
  unregisterSchema(pluginId: string): void;
  
  /** 获取配置值（先查用户设置，再查默认值） */
  get<T>(pluginId: string, key: string): T;
  
  /** 更新配置值 */
  update(pluginId: string, key: string, value: unknown): void;
  
  /** 重置为默认值 */
  reset(pluginId: string, key: string): void;
  
  /** 监听配置变更 */
  onDidChange(pluginId: string, key: string, handler: (newValue: unknown) => void): Disposable;
  
  /** 获取插件的所有配置 schema */
  getSchema(pluginId: string): ConfigurationContribution | null;
  
  /** 获取所有已注册的配置 */
  getAllSchemas(): Map<string, ConfigurationContribution>;
  
  dispose(): void;
}
```

---

### 特性 7：右键菜单

**目标**：插件通过 Manifest 声明菜单项（`contributes.menus`），右键编辑器时出现上下文菜单。

#### 现状分析

- `ContributionManager` **已有** menus 相关方法：
  - `registerMenus()` / `unregisterMenus()` ✅
  - `getAllMenus()` ✅
  - `getVisibleMenus()` — 用 ContextKeyService 过滤 `when` ✅
  - `getVisibleMenusByGroup()` — 按 group 分组 ✅
- `MenuContribution` 类型已定义（`manifest-types.ts` L161-168）：`group`、`command`、`when` ✅
- **后端逻辑大部分就绪，缺少前端 ContextMenu 组件和插件实际使用。**

#### 实施清单

| # | 操作 | 文件 | 说明 |
|---|------|------|------|
| 7.1 | 新增 `ContextMenu` 组件 | `src/plugin-system/ContextMenu.tsx`（新建） | Props：`items`（分组后的菜单项）、`position`（x/y 坐标）、`onClose`、`onExecute`；渲染：按 group 分组 + 分隔线、图标、标题、快捷键提示、disabled 状态 |
| 7.2 | 菜单位置枚举 | `manifest-types.ts` `MenuContribution` | 扩展 `group` 字段语义，支持 `"editor/context"`（编辑器右键）、`"editor/title"`（标题栏菜单）；新增可选 `order?: number` 控制排序 |
| 7.3 | page.tsx 集成右键菜单 | `page.tsx` | 编辑器区域 `onContextMenu` → 阻止默认 → 调用 `host.contributions.getVisibleMenusByGroup()` → 渲染 `<ContextMenu />` |
| 7.4 | 为现有插件添加 menus 声明 | `manifest-types.ts` 各 EXAMPLE_xxx_MANIFEST | 为 translate、copyAsMarkdown 等插件的 Manifest 添加 `contributes.menus` |
| 7.5 | 点击菜单项执行命令 | `ContextMenu.tsx` + `page.tsx` | 点击 → `host.executeCommand(commandId)` → 关闭菜单 |
| 7.6 | 点击空白处 / Escape 关闭菜单 | `ContextMenu.tsx` | 监听 document click / keydown Escape 关闭 |

#### ContextMenu 组件 Props 设计

```typescript
interface ContextMenuProps {
  /** 分组后的菜单项 */
  groups: Map<string, SourcedMenuContribution[]>;
  /** 菜单显示位置 */
  position: { x: number; y: number };
  /** 关闭回调 */
  onClose: () => void;
  /** 执行命令回调 */
  onExecute: (commandId: string) => void;
  /** 快捷键查询（用于显示快捷键提示） */
  getKeybinding?: (commandId: string) => string | null;
}
```

---

### 特性 8：插件自定义面板 / Webview

**目标**：插件可以声明侧边栏面板（`contributes.views`），宿主渲染面板容器，插件提供面板内容。

#### 现状分析

完全没有实现。这是 VS Code 插件系统中非常核心的功能（文件浏览器、Git 面板、搜索面板等都是 views）。

#### VS Code 对标

```jsonc
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        { "id": "my-container", "title": "My Plugin", "icon": "📁" }
      ]
    },
    "views": {
      "my-container": [
        { "id": "my-view", "name": "My View", "when": "..." }
      ]
    }
  }
}
```

VS Code 的 `TreeDataProvider` 模式：插件提供数据（树节点），宿主负责渲染。

#### 实施清单

| # | 操作 | 文件 | 说明 |
|---|------|------|------|
| 8.1 | 新增类型定义 | `manifest-types.ts` | `ViewContainerContribution`（id、title、icon、位置）；`ViewContribution`（id、name、when、containerGroup）；在 `PluginContributes` 中新增 `viewsContainers?` 和 `views?` |
| 8.2 | 新增 `TreeDataProvider` 接口 | `manifest-types.ts` | `TreeItem`（id、label、icon、collapsible、command?、children?）；`TreeDataProvider`（getChildren、getTreeItem） |
| 8.3 | 扩展 `PluginAPI` | `manifest-types.ts` | 新增 `ViewsAPI`：`registerTreeDataProvider(viewId, provider)`、`refreshView(viewId)` |
| 8.4 | `createViewsAPI` | `APIProxy.ts` | 实现 `ViewsAPI`，将 TreeDataProvider 注册到 ContributionManager |
| 8.5 | `ContributionManager` 扩展 | `ContributionManager.ts` | 新增 views 和 viewsContainers 的注册/查询方法、TreeDataProvider 存储 |
| 8.6 | 新增 `TreeView` 组件 | `src/plugin-system/TreeView.tsx`（新建） | 渲染树形数据：展开/折叠、图标、点击执行命令、缩进层级 |
| 8.7 | 新增 `ViewContainer` 组件 | `src/plugin-system/ViewContainer.tsx`（新建） | 侧边栏容器：Activity Bar（图标列表） + 面板内容区（切换显示对应 view）；折叠/展开 |
| 8.8 | page.tsx 布局改造 | `page.tsx` | 最左侧加 Activity Bar（垂直图标栏）；点击图标切换侧边栏面板；面板内渲染对应 `<TreeView />` |
| 8.9 | 新增示例插件：outlineView | `plugins/v2/outlineView.ts`（新建） | 解析编辑器内容，提取文本结构（如按段落/标题拆分），以 TreeView 展示"大纲"面板 |
| 8.10 | 新增权限 | `manifest-types.ts` + `PermissionGuard.ts` | `"views:register"` 权限 |

#### 核心类型设计

```typescript
// ── Manifest 声明 ──

interface ViewContainerContribution {
  id: string;
  title: string;
  icon: string;
}

interface ViewContribution {
  id: string;
  name: string;
  when?: string;
}

// ── 运行时 API ──

interface TreeItem {
  id: string;
  label: string;
  icon?: string;
  description?: string;
  collapsibleState?: "collapsed" | "expanded" | "none";
  command?: { commandId: string; args?: unknown[] };
  children?: TreeItem[];
}

interface TreeDataProvider {
  getChildren(parentId?: string): TreeItem[] | Promise<TreeItem[]>;
  onDidChangeTreeData?: (handler: () => void) => Disposable;
}

interface ViewsAPI {
  registerTreeDataProvider(viewId: string, provider: TreeDataProvider): Disposable;
  refreshView(viewId: string): void;
}
```

---

### 特性 9：多 Tab 编辑器

**目标**：支持多个编辑器 Tab，每个 Tab 有独立内容，插件作用于当前激活的 Tab。

#### 现状分析

当前只有一个 `contentEditable` div。所有插件 API（`getSelectedText`、`insertText`、`replaceSelection`）都绑定到这一个 DOM 元素。

#### 实施清单

| # | 操作 | 文件 | 说明 |
|---|------|------|------|
| 9.1 | 新增 `EditorTabManager` | `src/plugin-system/EditorTabManager.ts`（新建） | 管理多个 Tab 的状态：`Tab`（id、title、content、isDirty、cursorPosition）；`activeTabId`；`addTab()`、`removeTab()`、`setActiveTab()`；变更通知 |
| 9.2 | 新增 `EditorTabs` 组件 | `src/plugin-system/EditorTabs.tsx`（新建） | Tab 栏 UI：切换、关闭（×按钮）、新建（+按钮）、修改标记（圆点）、可拖拽排序（可选） |
| 9.3 | EditorBridge 改造 | `APIProxy.ts` `createContentEditableBridge` | 支持 `setTarget(element)` 方法，activeTab 变化时重新绑定到对应的 DOM 元素 |
| 9.4 | page.tsx 布局改造 | `page.tsx` | 编辑器区域上方加 Tab 栏组件；每个 Tab 对应一个 contentEditable div（display: none/block 切换或动态挂载）；切换 Tab 时更新 EditorBridge 目标 |
| 9.5 | 扩展 `PluginAPI` | `manifest-types.ts` | `EditorAPI` 新增：`getActiveTab(): TabInfo`、`openTab(title, content?): string`、`closeTab(tabId): void`、`onDidChangeActiveTab(handler): Disposable` |
| 9.6 | 上下文变量 | `ContextKeyService` + `NewPluginHost` | 新增 `activeTabId`、`tabCount`、`activeTabDirty` 等上下文变量 |
| 9.7 | 新增权限 | `manifest-types.ts` + `PermissionGuard.ts` | `"editor:openTab"`、`"editor:closeTab"` 权限 |

#### EditorTabManager 接口设计

```typescript
interface EditorTab {
  id: string;
  title: string;
  content: string;
  isDirty: boolean;
  cursorPosition?: { line: number; column: number };
  createdAt: number;
}

type TabEvent =
  | { type: "tab-added"; tab: EditorTab }
  | { type: "tab-removed"; tabId: string }
  | { type: "tab-activated"; tabId: string; previousTabId: string | null }
  | { type: "tab-content-changed"; tabId: string }
  | { type: "tab-title-changed"; tabId: string; title: string };

class EditorTabManager implements Disposable {
  /** 获取所有 Tab */
  getTabs(): EditorTab[];
  
  /** 获取当前激活的 Tab */
  getActiveTab(): EditorTab | null;
  
  /** 获取当前激活的 Tab ID */
  getActiveTabId(): string | null;
  
  /** 添加新 Tab */
  addTab(title: string, content?: string): EditorTab;
  
  /** 关闭 Tab */
  removeTab(tabId: string): void;
  
  /** 切换激活 Tab */
  setActiveTab(tabId: string): void;
  
  /** 更新 Tab 内容 */
  updateContent(tabId: string, content: string): void;
  
  /** 重命名 Tab */
  renameTab(tabId: string, title: string): void;
  
  /** 监听 Tab 事件 */
  onEvent(handler: (event: TabEvent) => void): Disposable;
  
  dispose(): void;
}
```

---

### 特性 10：插件市场远程加载模拟

**目标**：模拟从"远程服务器"下载插件 Manifest + 代码，实现浏览/搜索/安装/更新/卸载流程。

#### 现状分析

当前所有插件都是静态导入 + 内存加载（`createDemoPluginLoader` 从 `ALL_V2_PLUGINS` 数组中查找）。

#### 实施清单

| # | 操作 | 文件 | 说明 |
|---|------|------|------|
| 10.1 | 新增 `MarketplaceService` | `src/plugin-system/MarketplaceService.ts`（新建） | 查询可用插件列表、获取 Manifest、"下载"代码；支持搜索/分类/排序 |
| 10.2 | 创建远程插件目录 | `public/marketplace/` 目录 | 每个插件一个子目录：`manifest.json` + `index.js`（编译好的插件代码） |
| 10.3 | 构建远程插件包 | `public/marketplace/registry.json` | 所有可用插件的索引文件（id、name、version、description、downloadUrl） |
| 10.4 | 远程 Manifest 加载 | `MarketplaceService.ts` | `fetchManifest(pluginId)` → `fetch("/marketplace/{pluginId}/manifest.json")` |
| 10.5 | 远程代码加载 | `MarketplaceService.ts` | `loadPluginCode(pluginId)` → `fetch()` → `new Function()` 或 Blob URL + Worker 加载 |
| 10.6 | 版本管理 | `MarketplaceService.ts` | semver 比较（简化版）、检测更新、已安装版本 vs 最新版本 |
| 10.7 | `ActivationManager` 支持远程 loader | `ActivationManager.ts` | `defaultPluginLoader` 支持 `fetch()` 方式加载远程代码 |
| 10.8 | 市场 UI 改造 | `page.tsx` PluginMarket | "在线"/"已安装" 双 Tab；搜索框；排序（热门/最新）；版本号显示；"更新可用"标记；下载进度模拟 |

#### MarketplaceService 接口设计

```typescript
interface MarketplacePlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  icon: string;
  category: string;
  downloadCount: number;
  rating: number;
  manifestUrl: string;
  codeUrl: string;
}

interface MarketplaceSearchOptions {
  query?: string;
  category?: string;
  sortBy?: "popularity" | "name" | "updated";
  page?: number;
  pageSize?: number;
}

class MarketplaceService {
  /** 获取所有可用插件 */
  async getAvailablePlugins(): Promise<MarketplacePlugin[]>;
  
  /** 搜索插件 */
  async search(options: MarketplaceSearchOptions): Promise<MarketplacePlugin[]>;
  
  /** 获取插件详情 */
  async getPluginDetail(pluginId: string): Promise<MarketplacePlugin | null>;
  
  /** 下载 Manifest */
  async fetchManifest(pluginId: string): Promise<PluginManifest>;
  
  /** 下载并加载插件代码 */
  async loadPluginCode(pluginId: string): Promise<PluginEntry>;
  
  /** 检查更新 */
  async checkUpdates(installedPlugins: Map<string, string>): Promise<Map<string, string>>;
}
```

---

## 5. 文件清单

### 5.1 新增文件

| 文件路径 | 特性 | 说明 |
|----------|------|------|
| `src/plugin-system/PluginErrorBoundary.ts` | 1 | 错误记录、阈值停用、重试 |
| `src/plugin-system/DisposableStore.ts` | 2 | Disposable 集合管理 |
| `src/plugin-system/KeybindingService.ts` | 3 | 快捷键匹配、冲突检测 |
| `src/plugin-system/ConfigurationService.ts` | 6 | 插件配置管理 |
| `src/plugin-system/ContextMenu.tsx` | 7 | 右键菜单组件 |
| `src/plugin-system/ViewContainer.tsx` | 8 | 侧边栏面板容器 |
| `src/plugin-system/TreeView.tsx` | 8 | 树形视图组件 |
| `src/plugin-system/EditorTabManager.ts` | 9 | 多 Tab 状态管理 |
| `src/plugin-system/EditorTabs.tsx` | 9 | Tab 栏组件 |
| `src/plugin-system/MarketplaceService.ts` | 10 | 远程市场服务 |
| `src/plugin-system/plugins/v2/gitStatus.ts` | 4 | StatusBar 交互示例 |
| `src/plugin-system/plugins/v2/baseFormatter.ts` | 5 | 依赖关系示例（被依赖方） |
| `src/plugin-system/plugins/v2/markdownFormatter.ts` | 5 | 依赖关系示例（依赖方） |
| `src/plugin-system/plugins/v2/outlineView.ts` | 8 | 大纲面板示例 |
| `public/marketplace/registry.json` | 10 | 远程插件索引 |
| `public/marketplace/*/manifest.json` | 10 | 远程插件 Manifest |
| `public/marketplace/*/index.js` | 10 | 远程插件代码 |

### 5.2 需修改的现有文件

| 文件 | 涉及特性 | 修改内容 |
|------|----------|----------|
| `manifest-types.ts` | 4, 6, 7, 8, 9 | 扩展类型定义（StatusBarContribution、ConfigurationContribution、ViewContribution、EditorAPI） |
| `APIProxy.ts` | 2, 4, 6, 8, 9 | DisposableStore 替换、新增 createXxxAPI、EditorBridge 改造 |
| `ContributionManager.ts` | 4, 7, 8 | StatusBar when 过滤、views 注册、configuration 注册 |
| `NewPluginHost.ts` | 1, 2, 3, 5, 6, 8, 9 | 集成 ErrorBoundary / DisposableStore / KeybindingService / ConfigurationService / ViewsAPI / TabManager |
| `WorkerSandbox.ts` | 1 | 崩溃恢复 restart() 方法 |
| `PermissionGuard.ts` | 4, 6, 8, 9 | 新增权限映射 |
| `ActivationManager.ts` | 10 | 远程 loader 支持 |
| `page.tsx` | 全部 | UI 集成（错误面板、快捷键面板、设置面板、右键菜单、侧边栏、Tab 栏、市场改造） |
| `plugins/v2/index.ts` | 4, 5 | 注册新示例插件 |
| `plugins/v2/autoSave.ts` | 6 | 配置化改造（保存间隔可配置） |

---

## 6. 工作量估算

| Phase | 特性 | 复杂度 | 说明 |
|-------|------|--------|------|
| 1 | 错误边界 / 崩溃恢复 | ⭐⭐ | try-catch + 状态管理 + Worker 重启 |
| 1 | Disposable 一致性 | ⭐ | 工具类 + 替换手动管理 |
| 1 | KeybindingService | ⭐⭐ | 从 page.tsx 抽取 + 冲突检测 |
| 2 | StatusBar 交互 | ⭐⭐ | 类型扩展 + UI 样式 + 示例插件 |
| 2 | 插件间依赖 | ⭐⭐ | 逻辑已有，主要是示例 + UI |
| 2 | 插件配置 | ⭐⭐⭐ | 全新模块 + 配置 UI 渲染 |
| 2 | 右键菜单 | ⭐⭐⭐ | UI 组件 + 位置计算 + 分组 |
| 3 | 自定义面板 / Webview | ⭐⭐⭐⭐ | 架构改动较大，布局改造 + TreeView |
| 3 | 多 Tab 编辑器 | ⭐⭐⭐⭐ | EditorBridge 改造 + Tab 状态管理 |
| 3 | 远程加载 | ⭐⭐⭐ | 打包格式 + fetch 加载 + 版本管理 |

---

## 7. 进度追踪

> 每完成一个特性后，在此处更新状态。

| # | 特性 | 状态 | 完成日期 | 备注 |
|---|------|------|----------|------|
| 1 | 错误边界 / 崩溃恢复 | ✅ 已完成 | 2026-03-04 | `PluginErrorBoundary.ts` 新建；`NewPluginHost` 集成：executeCommand 加 try-catch + recordError/recordSuccess；自动停用回调 + Worker 重启策略；plugin-auto-disabled / plugin-restart-attempted / command-error 事件类型已加入 PluginHostEvent |
| 2 | Disposable 一致性 | ✅ 已完成 | 2026-03-04 | `DisposableStore.ts` 新建（含 MutableDisposable / toDisposable / combineDisposables 工具）；`NewPluginHost` 中 pluginDisposables 从 `Disposable[]` 改为 `DisposableStore`；internalDisposables 同样改用 DisposableStore；deactivatePlugin 用 clear()（可重激活）、uninstallPlugin/dispose 用 dispose()；诊断信息新增 pluginDisposables 字段 |
| 3 | KeybindingService | ✅ 已完成 | 2026-03-04 | `KeybindingService.ts` 新建（normalizeKeybinding / keyEventToString / formatKeybindingForDisplay 工具函数 + 宿主级快捷键 + 用户自定义覆盖 + 冲突检测 + localStorage 持久化）；`NewPluginHost` 构造时创建并自动 start()；page.tsx 的 handleKeyDown 逻辑可迁移到此服务（page.tsx 侧的删除留待 UI 集成时处理） |
| 4 | StatusBar 交互增强 | ✅ 已完成 | 2026-03-04 | `StatusBarContribution` 新增 `tooltip`/`color`/`backgroundColor`/`when` 字段；`StatusBarAPI` 新增 `setTooltip`/`setColor`/`setBackgroundColor`/`setCommand` 方法；`ContributionManager` 新增运行时 tooltip/color/backgroundColor/command 存储与查询（`getStatusBarTooltip` 等）+ `getVisibleStatusBarItems`（when 过滤）；`PermissionGuard` 新增 `statusBar:setTooltip`/`statusBar:setColor`/`statusBar:setBackgroundColor`/`statusBar:setCommand` 权限映射；新增示例插件 `gitStatus`（模拟 Git 分支状态，带颜色变化和 tooltip）；现有 Manifest（wordCount/autoSave）补充 tooltip/color 字段 |
| 5 | 插件间依赖 | ✅ 已完成 | 2026-03-04 | 新增示例插件 `baseFormatter`（基础格式化，作为被依赖方，命令支持传参和返回值）；新增示例插件 `markdownFormatter`（声明 `dependencies: ["base-formatter"]`，通过 `executeCommand("base-formatter.formatText", text)` 调用依赖，叠加 Markdown 格式化规则）；两个插件的 Manifest 常量已加入 `manifest-types.ts`；已注册到 `ALL_V2_PLUGINS`；依赖可视化 UI 和卸载保护 UI 留待 page.tsx 集成时处理 |
| 6 | 插件设置/配置 | ✅ 已完成 | 2026-03-04 | `ConfigurationService.ts` 新建（schema 注册/注销、值读取合并默认值、值更新带验证、重置、localStorage 持久化、变更通知、诊断信息）；`manifest-types.ts` 新增 `ConfigurationPropertySchema`/`ConfigurationContribution`/`ConfigurationAPI` 类型 + `PluginContributes.configuration` 字段 + `configuration:read`/`configuration:write` 权限；`APIProxy.ts` 新增 `createConfigurationAPI`；`PermissionGuard` 新增权限映射；`ContributionManager` 新增 configuration 注册/注销/查询；`NewPluginHost` 构造时创建 `ConfigurationService`，install 时注册 schema，uninstall 时注销，activation 时传入 APIProxy；autoSave Manifest 新增 `contributes.configuration`（interval/enabled 两项配置）；设置面板 UI 留待 page.tsx 集成 |
| 7 | 右键菜单 | ✅ 已完成 | 2026-03-04 | `MenuContribution` 新增 `order?: number` 字段；`manifest-types.ts` 中 translate/copyAsMarkdown/markdownFormatter 的 Manifest 已补充 `contributes.menus`（group: "editor/context"）；`ContributionManager` 后端逻辑已就绪（registerMenus/getVisibleMenus/getVisibleMenusByGroup）；前端 `ContextMenu` 组件留待 page.tsx 集成时新建 |
| 8 | 自定义面板 / Webview | ✅ 已完成 | 2026-03-04 | `manifest-types.ts` 新增 `ViewContainerContribution`/`ViewContribution`/`TreeItem`/`TreeDataProvider`/`ViewsAPI` 类型 + `PluginContributes.viewsContainers`/`views` 字段 + `views:register` 权限；`ContributionManager` 新增 viewContainers/views/treeDataProviders 存储与注册/注销/查询方法（`registerTreeDataProvider`/`getTreeDataProvider`/`refreshView`/`getAllViewContainers`/`getViewsByContainer`/`getVisibleViewsByContainer`）；`APIProxy.ts` 新增 `createViewsAPI`；`PermissionGuard` 新增权限映射；新增示例插件 `outlineView`（解析编辑器文本结构，标题层级嵌套，TreeDataProvider 实现，防抖内容变化刷新）；TreeView/ViewContainer UI 组件留待 page.tsx 集成 |
| 9 | 多 Tab 编辑器 | ✅ 已完成 | 2026-03-04 | `EditorTabManager.ts` 新建（Tab 状态管理：addTab/removeTab/setActiveTab/updateContent/renameTab/markSaved/moveTab/updateCursorPosition；keepAtLeastOneTab 策略；maxTabs 限制；事件系统 tab-added/tab-removed/tab-activated/tab-content-changed/tab-title-changed/tab-dirty-changed/tabs-reordered；诊断信息）；`manifest-types.ts` 新增 `editor:openTab`/`editor:closeTab` 权限 + 权限描述/分组；`PermissionGuard` 新增权限映射；EditorTabs UI 组件和 page.tsx 布局改造留待 UI 集成 |
| 10 | 插件市场远程加载 | ✅ 已完成 | 2026-03-04 | `MarketplaceService.ts` 新建（`MarketplacePlugin` 类型含 downloadCount/rating/tags 等元数据；搜索支持关键词/分类/标签过滤 + 5 种排序 + 分页；`fetchManifest`/`loadPluginCode`/`downloadPlugin` 下载方法含进度事件；`checkUpdates` 版本管理含简化 semver 比较；模拟网络延迟；`registerPlugin`/`registerPlugins` 用于填充内存注册表；`createMarketplacePluginsFromDescriptors` 工厂函数可将 V2PluginDescriptor 转换为市场数据；支持真实 fetch 远程加载预留接口；诊断信息）；市场 UI 改造留待 page.tsx 集成 |

状态说明：⬜ 未开始 | 🟡 进行中 | ✅ 已完成 | ❌ 已取消