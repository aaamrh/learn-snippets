# 前端架构学习 Demo 计划

> 通过 3 个完整场景，学习 3 种正交的经典工业级架构。
> 每个 Demo 都是可交互的完整实现，不是玩具代码。

---

## 总览

| Demo | 场景 | 经典架构 | 对标项目 | 状态 |
|------|------|----------|----------|------|
| **Demo 1** | VS Code 级插件系统 | Plugin Host（Manifest + 生命周期 + 扩展点 + 沙箱） | VS Code / Obsidian | 🔧 现有代码大改 |
| **Demo 2** | 截图标注工具 | Command + Strategy + Undo/Redo | Excalidraw / Figma / Snipaste | 🆕 新建 |
| **Demo 3** | 富文本编辑器 + 选中浮动工具条 | Editor Extension + BubbleMenu（Selection 驱动状态） | medium-editor / Tiptap | 🆕 新建 |

### 为什么是这 3 个？

1. **Plugin Host** — 解决"如何让第三方代码安全地扩展你的系统"。核心是注册/发现/隔离/权限。
2. **Command + Strategy** — 解决"如何把用户操作变成可撤销、可组合、可切换的对象"。核心是命令封装和工具策略。
3. **Editor Extension + BubbleMenu** — 解决"如何让编辑器状态驱动 UI，并允许扩展参与渲染"。核心是 Selection → State → Toolbar 联动。

三者零重叠：Plugin Host 管"谁能进来"，Command 管"做了什么"，Editor Extension 管"当前状态是什么"。

---

## Demo 1：VS Code 级插件系统

### 场景描述

一个文本编辑器，支持：
- 通过 Manifest（JSON 声明）注册插件，声明贡献点（commands / menus / statusBar / panels）和激活条件
- 插件按需激活（懒加载），只有满足 activationEvents 时才 `import()` 加载
- 插件运行在沙箱中（Web Worker），不能直接操作宿主 DOM
- 权限控制：插件只能访问 Manifest 中声明的能力（如 insertText / readContent / statusBar）
- 运行时动态安装/卸载插件
- **选中文字时弹出浮动工具条**，工具条按钮由插件通过扩展点贡献（翻译、复制、搜索等）

### 对标：VS Code 插件架构

从 VS Code 源码和官方文档中提取的核心设计：

#### 1. Manifest 声明模型（package.json contributes）

VS Code 插件通过 `package.json` 的 `contributes` 字段声明式注册能力，而不是在代码中命令式注册：

```jsonc
// VS Code 插件的 package.json
{
  "name": "my-plugin",
  "activationEvents": ["onCommand:myPlugin.sayHello", "onLanguage:javascript"],
  "contributes": {
    "commands": [{ "command": "myPlugin.sayHello", "title": "Hello World" }],
    "menus": {
      "editor/context": [{ "command": "myPlugin.sayHello", "when": "editorHasSelection" }]
    },
    "keybindings": [{ "command": "myPlugin.sayHello", "key": "ctrl+shift+h" }],
    "configuration": {
      "properties": {
        "myPlugin.greeting": { "type": "string", "default": "Hello" }
      }
    }
  }
}
```

**关键原则**：
- 宿主读取 Manifest 就能知道插件贡献了什么，不需要加载插件代码
- 插件代码只在满足 `activationEvents` 时才加载（按需激活）
- `when` 条件控制 UI 元素的可见性（上下文感知）

#### 2. Contribution Points（贡献点）

VS Code 定义了 40+ 种贡献点（commands / menus / views / configuration / keybindings / themes 等）。
我们的 Demo 精简为以下贡献点：

| 贡献点 | 说明 | VS Code 对应 |
|--------|------|-------------|
| `commands` | 注册命令（可从命令面板调用） | `contributes.commands` |
| `menus` | 命令出现在哪些菜单中 | `contributes.menus` |
| `keybindings` | 快捷键绑定 | `contributes.keybindings` |
| `statusBar` | 状态栏项目 | Status Bar API |
| `panels` | 侧边面板 | `contributes.views` |
| `selectionToolbar` | 选中文字时的浮动工具条按钮 | 类似 `editor/context` menu |

#### 3. 激活事件（Activation Events）

VS Code 插件不是启动时全部加载的，而是按需激活：

| 事件 | 含义 |
|------|------|
| `onCommand:xxx` | 当命令被调用时激活 |
| `onLanguage:xxx` | 当打开某种语言的文件时激活 |
| `onView:xxx` | 当某个视图可见时激活 |
| `*` | 启动时立即激活（不推荐） |

我们的 Demo 简化为：
- `onStartup` — 启动时激活
- `onCommand:xxx` — 命令触发时激活
- `onEvent:xxx` — 某个事件触发时激活（如 `onEvent:editor:selection-change`）

#### 4. 进程隔离（Extension Host）

VS Code 的插件运行在独立的 Extension Host 进程中：
- 插件不能直接操作 UI DOM
- 插件通过 API 对象（`vscode` 命名空间）与宿主通信
- API 对象是宿主注入的代理，内部通过 IPC 转发

我们的 Demo 用 **Web Worker** 模拟：
- 插件代码运行在 Worker 线程
- 宿主通过 `postMessage` / `onmessage` 与 Worker 通信
- 宿主向 Worker 注入一个 API 代理对象（序列化的函数调用）

#### 5. 权限模型

VS Code 的权限是隐式的（你在 contributes 中声明了什么就能用什么）。
我们的 Demo 显式化：

```jsonc
{
  "permissions": ["editor:insertText", "editor:readContent", "ui:statusBar"]
}
```

插件只能调用 Manifest 中声明的 API，调用未声明的 API 会抛出 `PermissionDeniedError`。

### 与现有 PluginHost 的差异（需要大改的地方）

| 特性 | 现有 PluginHost | Demo 1 目标 |
|------|----------------|-------------|
| 注册方式 | 代码中硬编码 `host.register(plugin)` | Manifest JSON 声明 + 动态 `import()` |
| 激活时机 | 全部一次性 activate | 按 activationEvents 按需激活 |
| 隔离 | 同一个 JS 上下文，无隔离 | Web Worker 沙箱 |
| 权限 | 无限制，插件能访问所有能力 | 按 Manifest 声明授予 |
| 贡献模型 | `extensions` 对象 + 事件 | Contribution Points 声明式 |
| 安装/卸载 | 只有代码中写死的插件 | 运行时动态 install/uninstall |
| 选中工具条 | 无 | 插件通过 `selectionToolbar` 贡献点注册按钮 |

### 架构设计

```
┌─────────────────────────────────────────────────────┐
│                    宿主（Main Thread）                │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ PluginRegistry│  │ContributionMgr│  │  EventBus  │ │
│  │ (manifest解析 │  │ (贡献点花名册) │  │ (事件总线) │ │
│  │  懒加载管理)  │  │              │  │            │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                 │                │        │
│  ┌──────┴─────────────────┴────────────────┴──────┐ │
│  │              PluginHost（协调者）                │ │
│  │  - defineContributionPoint()                    │ │
│  │  - installPlugin(manifest)                      │ │
│  │  - activatePlugin(id, reason)                   │ │
│  │  - executeCommand(commandId, args)              │ │
│  │  - getContributions(point)                      │ │
│  └────────────────────┬───────────────────────────┘ │
│                       │ postMessage                  │
│  ┌────────────────────┴───────────────────────────┐ │
│  │          Worker Sandbox Pool                    │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐         │ │
│  │  │Plugin A  │ │Plugin B  │ │Plugin C  │         │ │
│  │  │(Worker)  │ │(Worker)  │ │(Worker)  │         │ │
│  │  │          │ │          │ │          │         │ │
│  │  │ api.     │ │ api.     │ │ api.     │         │ │
│  │  │ editor.  │ │ editor.  │ │ commands.│         │ │
│  │  │ insertTxt│ │ readCont │ │ register │         │ │
│  │  └─────────┘ └─────────┘ └─────────┘         │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  ┌─────────────────── UI Layer ───────────────────┐ │
│  │  Editor │ Toolbar │ StatusBar │ Panels │ Popup  │ │
│  │         │(固定+浮动)│          │        │        │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 核心类型定义

```typescript
// ==================== Manifest ====================
interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  // 入口文件路径（相对于插件根目录）
  main: string;
  // 激活条件
  activationEvents: string[];
  // 权限声明
  permissions: string[];
  // 依赖
  dependencies?: string[];
  // 贡献点声明（纯 JSON，不含代码）
  contributes?: {
    commands?: CommandContribution[];
    menus?: MenuContribution[];
    keybindings?: KeybindingContribution[];
    statusBar?: StatusBarContribution[];
    selectionToolbar?: SelectionToolbarContribution[];
  };
}

interface CommandContribution {
  command: string;  // e.g. "myPlugin.translate"
  title: string;    // e.g. "翻译选中文字"
  icon?: string;
}

interface MenuContribution {
  command: string;
  when?: string;    // 上下文条件表达式
  group?: string;
}

interface KeybindingContribution {
  command: string;
  key: string;      // e.g. "Ctrl+Shift+T"
  when?: string;
}

interface StatusBarContribution {
  id: string;
  command?: string;
  priority?: number;
}

interface SelectionToolbarContribution {
  command: string;
  title: string;
  icon?: string;
  when?: string;   // e.g. "selection.length > 0"
  priority?: number;
}

// ==================== Plugin API（注入给插件的能力） ====================
interface PluginAPI {
  editor: {
    insertText(text: string): Promise<void>;
    replaceSelection(text: string): Promise<void>;
    getSelectedText(): Promise<string>;
    getContent(): Promise<string>;
    onSelectionChange(handler: (selection: SelectionInfo) => void): Disposable;
  };
  commands: {
    registerCommand(id: string, handler: (...args: any[]) => any): Disposable;
    executeCommand(id: string, ...args: any[]): Promise<any>;
  };
  statusBar: {
    update(id: string, content: { label: string; value?: string }): void;
    remove(id: string): void;
  };
  events: {
    on(event: string, handler: (...args: any[]) => void): Disposable;
    emit(event: string, ...args: any[]): void;
  };
  storage: {
    get(key: string): Promise<any>;
    set(key: string, value: any): Promise<void>;
  };
}

interface Disposable {
  dispose(): void;
}

interface SelectionInfo {
  text: string;
  start: number;
  end: number;
  rect: { top: number; left: number; width: number; height: number };
}

// ==================== Plugin Entry（插件代码的入口） ====================
interface PluginEntry {
  activate(api: PluginAPI): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}
```

### 示例插件 Manifest

```jsonc
// plugins/translate/manifest.json
{
  "id": "translate",
  "name": "翻译插件",
  "version": "1.0.0",
  "description": "选中文字后翻译为英文",
  "main": "./index.ts",
  "activationEvents": ["onCommand:translate.translateSelection"],
  "permissions": ["editor:getSelectedText", "editor:replaceSelection", "ui:selectionToolbar"],
  "contributes": {
    "commands": [
      {
        "command": "translate.translateSelection",
        "title": "翻译选中文字",
        "icon": "🌐"
      }
    ],
    "selectionToolbar": [
      {
        "command": "translate.translateSelection",
        "title": "翻译",
        "icon": "🌐",
        "priority": 10
      }
    ],
    "keybindings": [
      {
        "command": "translate.translateSelection",
        "key": "Ctrl+Shift+T",
        "when": "editorHasSelection"
      }
    ]
  }
}
```

```typescript
// plugins/translate/index.ts
import type { PluginEntry, PluginAPI } from '../../types';

const plugin: PluginEntry = {
  activate(api: PluginAPI) {
    api.commands.registerCommand('translate.translateSelection', async () => {
      const text = await api.editor.getSelectedText();
      if (!text) return;

      // 模拟翻译（实际可调用翻译 API）
      const translated = `[Translated] ${text}`;
      await api.editor.replaceSelection(translated);
    });
  },

  deactivate() {
    // 自动清理（Disposable 模式）
  }
};

export default plugin;
```

### 文件结构

```
src/
  plugin-system/                    # Demo 1 核心库
    PluginHost.ts                   # 宿主协调者（大改）
    PluginRegistry.ts               # 🆕 Manifest 解析 + 插件注册表
    ContributionManager.ts          # 🆕 贡献点管理器
    ActivationManager.ts            # 🆕 激活事件管理
    PermissionGuard.ts              # 🆕 权限守卫
    WorkerSandbox.ts                # 🆕 Web Worker 沙箱
    APIProxy.ts                     # 🆕 注入给 Worker 的 API 代理
    SelectionToolbar.tsx            # 🆕 选中文字浮动工具条
    ContextKeyService.ts            # 🆕 when 条件表达式求值
    types.ts                        # 类型定义（大改）
    plugins/                        # 示例插件
      translate/
        manifest.json
        index.ts
      copy-as-markdown/
        manifest.json
        index.ts
      word-count/
        manifest.json
        index.ts
      auto-save/
        manifest.json
        index.ts
      emoji/
        manifest.json
        index.tsx
      image-upload/
        manifest.json
        index.tsx

  app/
    plugin-demo/
      page.tsx                      # Demo 页面（大改）
```

### 实施清单

1. 定义 `PluginManifest` / `PluginAPI` / `PluginEntry` / `Disposable` 等类型 → `types.ts`
2. 实现 `ContextKeyService`：解析和求值 `when` 条件表达式（如 `editorHasSelection && selection.length > 0`）
3. 实现 `PluginRegistry`：解析 Manifest JSON，维护已安装插件列表，检查依赖关系
4. 实现 `ContributionManager`：读取 Manifest 中的 `contributes`，按贡献点类型分类存储，支持增删
5. 实现 `ActivationManager`：监听激活事件，匹配 `activationEvents`，触发懒加载
6. 实现 `WorkerSandbox`：创建 Web Worker，注入 API 代理，管理 Worker 生命周期
7. 实现 `APIProxy`：序列化 PluginAPI 调用为 postMessage 消息，宿主侧执行并返回结果
8. 实现 `PermissionGuard`：包装 APIProxy，拦截未授权的 API 调用
9. 重写 `PluginHost`：整合以上模块，提供 `installPlugin` / `activatePlugin` / `executeCommand` / `uninstallPlugin`
10. 实现 `SelectionToolbar.tsx`：监听 selection change，从 ContributionManager 获取 `selectionToolbar` 贡献，渲染浮动工具条
11. 重写 `page.tsx`：展示插件市场（安装/卸载）、编辑器、状态栏、面板、选中浮动工具条
12. 迁移现有插件（word-count / auto-save / emoji / image-upload / bold / italic）为 Manifest 格式
13. 新增 translate 和 copy-as-markdown 插件作为选中工具条的用例

---

## Demo 2：截图标注工具

### 场景描述

一个完整的截图标注工具（类似微信截图 / Snipaste），功能：
- **主工具栏**：画笔、矩形、圆形、箭头、文字、橡皮擦、选择（移动/缩放）
- 选择"画笔"后 → 弹出**二级工具条**：颜色选择器、粗细选择器
- 选择"文字"后 → 弹出**二级工具条**：字号、颜色
- 选择"矩形/圆形/箭头"后 → 弹出**二级工具条**：线条颜色、填充颜色、线宽
- 每个操作可以 **Ctrl+Z 撤销** / **Ctrl+Y 重做**
- 选择工具可以**点击选中已绘制元素**，移动、缩放、删除

### 对标：Excalidraw 架构

从 Excalidraw 源码中提取的核心设计模式：

#### 1. Action 接口（Command 模式）

Excalidraw 的每一个操作（画矩形、改颜色、撤销、复制、删除等）都是一个 `Action` 对象：

```typescript
// 来自 excalidraw/packages/excalidraw/actions/types.ts
interface Action {
  name: ActionName;
  label: string | ((elements, appState, app) => string);
  icon?: React.ReactNode;
  // 核心：执行动作，返回新的 elements + appState（不可变更新）
  perform: (elements, appState, formData, app) => ActionResult;
  // 快捷键测试
  keyTest?: (event, appState, elements, app) => boolean;
  // 是否在当前上下文可用
  predicate?: (elements, appState, appProps, app) => boolean;
  // 每个 Action 可以自带一个面板组件（如颜色选择器）
  PanelComponent?: React.FC<PanelComponentProps>;
  trackEvent: false | { category: string; action?: string };
}

type ActionResult = {
  elements?: readonly ExcalidrawElement[] | null;
  appState?: Partial<AppState> | null;
  captureUpdate: CaptureUpdateActionType;  // 控制是否记入 undo 历史
} | false;
```

**关键设计**：
- `perform` 接收当前状态，返回新状态（纯函数，不可变）
- `captureUpdate` 标记这个操作是否应该记入撤销历史
- `PanelComponent` 让每个 Action 可以自带 UI（二级工具条）
- `predicate` 控制 Action 在什么条件下可用
- `keyTest` 声明快捷键匹配逻辑

#### 2. ActionManager（命令管理器）

```typescript
// 来自 excalidraw/packages/excalidraw/actions/manager.tsx
class ActionManager {
  actions = {} as Record<ActionName, Action>;
  updater: (actionResult: ActionResult) => void;
  getAppState: () => AppState;
  getElementsIncludingDeleted: () => readonly ExcalidrawElement[];

  registerAction(action: Action) {
    this.actions[action.name] = action;
  }

  registerAll(actions: readonly Action[]) {
    actions.forEach(action => this.registerAction(action));
  }

  // 处理键盘事件：遍历所有 action 找到匹配的 keyTest
  handleKeyDown(event: KeyboardEvent) {
    const matching = Object.values(this.actions)
      .sort((a, b) => (b.keyPriority || 0) - (a.keyPriority || 0))
      .filter(action => action.keyTest?.(event, ...));

    if (matching.length === 1) {
      event.preventDefault();
      this.updater(matching[0].perform(elements, appState, null, app));
      return true;
    }
    return false;
  }

  // 执行指定 Action
  executeAction(action: Action, source: ActionSource, value?: any) {
    this.updater(action.perform(elements, appState, value, app));
  }

  // 渲染 Action 的 PanelComponent（二级工具条）
  renderAction(name: ActionName, data?: any) {
    const action = this.actions[name];
    if (action?.PanelComponent) {
      return <action.PanelComponent
        elements={elements}
        appState={appState}
        updateData={(formState) => {
          this.updater(action.perform(elements, appState, formState, app));
        }}
      />;
    }
    return null;
  }
}
```

**关键设计**：
- `registerAction` — 注册制，所有操作统一注册
- `handleKeyDown` — 快捷键自动分发，按 `keyPriority` 排序
- `executeAction` — 统一执行入口，所有操作经过同一管道
- `renderAction` — 每个 Action 自带 UI（PanelComponent），实现二级工具条
- `updater` — 单一状态更新通道，所有 Action 的结果汇入同一出口

#### 3. 工具策略（Strategy 模式）

不同的绘图工具（画笔、矩形、箭头等）对鼠标事件的响应不同，但共享同一套事件入口：

```typescript
interface Tool {
  type: ToolType; // "pen" | "rect" | "circle" | "arrow" | "text" | "eraser" | "select"
  // 指针事件处理
  onPointerDown(event: PointerEvent, state: AppState): ToolResult;
  onPointerMove(event: PointerEvent, state: AppState): ToolResult;
  onPointerUp(event: PointerEvent, state: AppState): ToolResult;
  // 工具激活/停用
  onActivate?(state: AppState): Partial<AppState>;
  onDeactivate?(state: AppState): Partial<AppState>;
  // 工具的属性面板（二级工具条内容）
  getPropertyPanel?(): PropertyPanelConfig;
  // 光标样式
  getCursor?(state: AppState): string;
}
```

宿主不关心当前是什么工具，只把事件转发给 `activeTool`，工具自己决定行为。

#### 4. Undo/Redo 历史栈

```typescript
interface HistoryStack {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
}

interface HistoryEntry {
  elements: readonly CanvasElement[];
  appState: Partial<AppState>;
}

// undo = pop undoStack, push current to redoStack, apply popped
// redo = pop redoStack, push current to undoStack, apply popped
// 任何新操作 = push current to undoStack, clear redoStack
```

### 架构设计

```
┌──────────────────────────────────────────────────────┐
│                    App Component                      │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │                 Main Toolbar                    │  │
│  │  [🖊 画笔] [▢ 矩形] [○ 圆] [→ 箭头]          │  │
│  │  [T 文字] [⌫ 橡皮] [↖ 选择]                  │  │
│  │  [↶ 撤销] [↷ 重做] [🗑 清空]                  │  │
│  └────────────────────┬───────────────────────────┘  │
│                       │ activeTool                    │
│  ┌────────────────────┴───────────────────────────┐  │
│  │            Secondary Toolbar                    │  │
│  │  (根据当前工具动态渲染)                         │  │
│  │  画笔: [颜色🔴🟢🔵] [粗细 ─ ━ ▬]            │  │
│  │  文字: [字号 12 16 20] [颜色🔴🟢🔵]          │  │
│  │  矩形: [线色] [填色] [线宽]                    │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │              Canvas (HTML Canvas)               │  │
│  │                                                │  │
│  │  onPointerDown ──→ activeTool.onPointerDown()  │  │
│  │  onPointerMove ──→ activeTool.onPointerMove()  │  │
│  │  onPointerUp   ──→ activeTool.onPointerUp()    │  │
│  │                         │                      │  │
│  │                         ▼                      │  │
│  │                    ToolResult                   │  │
│  │                    { newElement?, appState? }   │  │
│  │                         │                      │  │
│  │                         ▼                      │  │
│  │              ActionManager.executeAction()      │  │
│  │                         │                      │  │
│  │                         ▼                      │  │
│  │              HistoryManager.push()              │  │
│  │              (captureUpdate → undoStack)        │  │
│  │                         │                      │  │
│  │                         ▼                      │  │
│  │              Canvas re-render                   │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### 核心类型定义

```typescript
// ==================== 画布元素 ====================
type ElementType = 'pen' | 'rect' | 'circle' | 'arrow' | 'text';

interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  opacity: number;
  isDeleted: boolean;
}

interface PenElement extends BaseElement {
  type: 'pen';
  points: Array<{ x: number; y: number; pressure?: number }>;
}

interface RectElement extends BaseElement {
  type: 'rect';
  width: number;
  height: number;
  borderRadius: number;
}

interface CircleElement extends BaseElement {
  type: 'circle';
  radiusX: number;
  radiusY: number;
}

interface ArrowElement extends BaseElement {
  type: 'arrow';
  endX: number;
  endY: number;
  arrowheadSize: number;
}

interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
}

type CanvasElement = PenElement | RectElement | CircleElement | ArrowElement | TextElement;

// ==================== App State ====================
type ToolType = 'pen' | 'rect' | 'circle' | 'arrow' | 'text' | 'eraser' | 'select';

interface AppState {
  activeTool: ToolType;
  selectedElementIds: Set<string>;
  // 当前工具的属性
  currentStrokeColor: string;
  currentFillColor: string;
  currentStrokeWidth: number;
  currentFontSize: number;
  currentOpacity: number;
  // 视口
  scrollX: number;
  scrollY: number;
  zoom: number;
  // UI 状态
  isDrawing: boolean;
  cursorType: string;
}

// ==================== Action ====================
interface Action {
  name: string;
  label: string;
  icon?: string;
  perform: (
    elements: readonly CanvasElement[],
    appState: Readonly<AppState>,
    formData: any,
  ) => ActionResult;
  keyTest?: (event: KeyboardEvent, appState: AppState) => boolean;
  predicate?: (elements: readonly CanvasElement[], appState: AppState) => boolean;
  PanelComponent?: React.FC<ActionPanelProps>;
}

interface ActionResult {
  elements?: readonly CanvasElement[];
  appState?: Partial<AppState>;
  captureHistory: boolean;  // 是否记入 undo 历史
}

// ==================== Tool ====================
interface Tool {
  type: ToolType;
  onPointerDown(event: PointerEvent, state: AppState, elements: readonly CanvasElement[]): ToolResult;
  onPointerMove(event: PointerEvent, state: AppState, elements: readonly CanvasElement[]): ToolResult;
  onPointerUp(event: PointerEvent, state: AppState, elements: readonly CanvasElement[]): ToolResult;
  onActivate?(state: AppState): Partial<AppState>;
  onDeactivate?(state: AppState): Partial<AppState>;
  getPropertyPanel?(): PropertyPanelConfig;
  getCursor?(state: AppState): string;
}

interface ToolResult {
  elements?: readonly CanvasElement[];
  appState?: Partial<AppState>;
  captureHistory?: boolean;
}

interface PropertyPanelConfig {
  items: PropertyPanelItem[];
}

type PropertyPanelItem =
  | { type: 'color-picker'; label: string; stateKey: keyof AppState }
  | { type: 'slider'; label: string; stateKey: keyof AppState; min: number; max: number; step: number }
  | { type: 'button-group'; label: string; stateKey: keyof AppState; options: Array<{ value: any; label: string }> };

// ==================== History ====================
interface HistoryEntry {
  elements: readonly CanvasElement[];
  appState: Pick<AppState, 'activeTool' | 'currentStrokeColor' | 'currentFillColor' | 'currentStrokeWidth'>;
}

interface HistoryManager {
  push(entry: HistoryEntry): void;
  undo(): HistoryEntry | null;
  redo(): HistoryEntry | null;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;
}
```

### 文件结构

```
src/
  canvas-annotator/                  # Demo 2 核心库
    types.ts                         # 所有类型定义
    elements/                        # 画布元素
      factory.ts                     # 创建元素的工厂
      renderer.ts                    # Canvas 渲染器（绘制所有元素）
      hitTest.ts                     # 点击检测（判断点击了哪个元素）
      transform.ts                   # 元素变换（移动、缩放、旋转）
    tools/                           # 工具策略
      BaseTool.ts                    # 抽象基类
      PenTool.ts                     # 画笔
      RectTool.ts                    # 矩形
      CircleTool.ts                  # 圆形
      ArrowTool.ts                   # 箭头
      TextTool.ts                    # 文字
      EraserTool.ts                  # 橡皮擦
      SelectTool.ts                  # 选择工具（移动、缩放）
      ToolRegistry.ts                # 工具注册表
    actions/                         # 命令/动作
      types.ts                       # Action 接口
      ActionManager.ts               # 命令管理器
      HistoryManager.ts              # Undo/Redo 历史栈
      changeColor.ts                 # 改颜色
      changeStrokeWidth.ts           # 改粗细
      changeFontSize.ts              # 改字号
      deleteElements.ts              # 删除元素
      clearCanvas.ts                 # 清空画布
      undo.ts                        # 撤销
      redo.ts                        # 重做
    components/                      # UI 组件
      Canvas.tsx                     # 画布组件
      MainToolbar.tsx                # 主工具栏
      SecondaryToolbar.tsx           # 二级工具条（根据工具动态渲染）
      ColorPicker.tsx                # 颜色选择器
      StrokeWidthPicker.tsx          # 粗细选择器

  app/
    demos/
      canvas-annotator/
        page.tsx                     # Demo 页面
```

### 实施清单

1. 定义所有类型（CanvasElement / AppState / Action / Tool / HistoryEntry）→ `types.ts`
2. 实现 `HistoryManager`：undoStack / redoStack / push / undo / redo / canUndo / canRedo
3. 实现 `ActionManager`：registerAction / executeAction / handleKeyDown / renderAction
4. 实现 Canvas 渲染器：接收 `CanvasElement[]`，遍历绘制到 Canvas 2D context
5. 实现 hitTest：给定 (x, y) 坐标，返回被点击的元素 id（支持 pen/rect/circle/arrow/text）
6. 实现 `BaseTool` 抽象基类，定义 onPointerDown/Move/Up 默认行为
7. 实现 `PenTool`：按下开始记录 points，移动添加点，抬起生成 PenElement
8. 实现 `RectTool`：按下记录起点，移动计算宽高（实时预览），抬起生成 RectElement
9. 实现 `CircleTool`：同 RectTool，但生成 CircleElement
10. 实现 `ArrowTool`：按下记录起点，抬起记录终点，生成 ArrowElement
11. 实现 `TextTool`：点击位置弹出输入框，回车确认生成 TextElement
12. 实现 `EraserTool`：点击元素标记 isDeleted = true
13. 实现 `SelectTool`：点击 hitTest 选中元素，拖拽移动，支持缩放手柄
14. 实现 `ToolRegistry`：注册所有工具，根据 `activeTool` 返回当前工具实例
15. 实现 Action：changeColor / changeStrokeWidth / changeFontSize / deleteElements / clearCanvas / undo / redo
16. 实现 `MainToolbar.tsx`：工具切换按钮 + 撤销/重做按钮
17. 实现 `SecondaryToolbar.tsx`：根据 `activeTool.getPropertyPanel()` 动态渲染二级工具条
18. 实现 `ColorPicker.tsx` 和 `StrokeWidthPicker.tsx` 组件
19. 实现 `Canvas.tsx`：绑定 pointer 事件，转发给 activeTool，触发 re-render
20. 实现 `page.tsx`：组装所有组件，管理全局 state

---

## Demo 3：富文本编辑器 + 选中浮动工具条

### 场景描述

一个迷你富文本编辑器，功能对齐 Demo 1 的插件系统但用完全不同的架构实现：
- **固定工具栏**：加粗、斜体、下划线、标题（H1/H2）、插入链接、插入图片、插入表情
- **选中文字浮动工具条（BubbleMenu）**：加粗、斜体、翻译、复制
- 按钮状态与编辑器状态同步（选中粗体文字时，B 按钮高亮）
- 字数统计（状态栏）
- 自动保存
- 快捷键（Ctrl+B 加粗 / Ctrl+I 斜体 等）
- **所有变更走 Transaction**（不可变状态流转）

### 对标：medium-editor + Tiptap/ProseMirror

#### 1. medium-editor 的 Extension/Button/Toolbar 三层模型

从 medium-editor 源码中提取的架构：

**Extension（扩展基类）**：所有功能都是扩展，包括 toolbar 自身。

```javascript
// medium-editor 的扩展接口
Extension = {
  name: string,          // 唯一标识
  init(),                // 初始化（base 属性已设置为 MediumEditor 实例）
  checkState(node),      // selection 变化时被调用，遍历 DOM 祖先链逐个检查
  destroy(),             // 清理
  getInteractionElements(), // 返回扩展渲染的 DOM 元素（用于判断点击是否在编辑器内）

  // 代理方法（调用宿主能力）
  execAction(action, opts),  // 执行编辑命令（bold, italic 等）
  subscribe(name, listener), // 订阅编辑器事件
  trigger(name, data),       // 触发编辑器事件
  on(target, event, fn),     // 绑定 DOM 事件（自动在 destroy 时清理）
  off(target, event, fn),    // 解绑 DOM 事件
}
```

**Button（按钮扩展）**：继承 Extension，与 toolbar 有约定。

```javascript
// medium-editor 的 Button 接口
Button extends Extension = {
  // 必须实现：返回工具栏中的按钮元素
  getButton(): HTMLElement,
  // 配置
  action: string,            // 执行的命令名（'bold', 'italic' 等）
  aria: string,              // 无障碍标签
  tagNames: ['b', 'strong'], // 哪些标签表示此按钮已激活
  style: { prop, value },    // 哪些 CSS 属性表示此按钮已激活
  contentDefault: '<b>B</b>',// 按钮默认内容
  contentFA: '<i class="fa fa-bold"></i>', // FontAwesome 图标
  handleClick(event),        // 点击处理（默认调用 execAction(action)）

  // 状态检查（medium-editor 自动调用）
  isActive(): boolean,
  isAlreadyApplied(node): boolean,
  setActive(),
  setInactive(),
  queryCommandState(): boolean | null,
}
```

**Toolbar（工具栏扩展）**：也是一个 Extension，管理所有 Button。

```javascript
// medium-editor toolbar.js 的核心逻辑
Toolbar extends Extension = {
  buttons: ['bold', 'italic', 'underline', 'anchor', 'h2', 'h3', 'quote'],
  static: false,  // false = 浮动跟随选区（BubbleMenu），true = 固定位置

  // 核心方法
  checkState() {
    // 1. 检查是否有有效选区
    if (!selection || selection.isCollapsed) {
      this.hideToolbar();
      return;
    }
    // 2. 显示工具栏并更新按钮状态
    this.showAndUpdateToolbar();
  },

  showAndUpdateToolbar() {
    this.setToolbarButtonStates();  // 遍历所有按钮，先全部 setInactive()
    this.checkActiveButtons();      // 爬 DOM 祖先链，检查每个按钮的 isAlreadyApplied()
    this.setToolbarPosition();      // 定位到选区上方
    this.showToolbar();
  },

  checkActiveButtons() {
    let parentNode = getSelectedParentElement(selection);
    // 从选区向上爬 DOM 树
    while (parentNode) {
      extensions.forEach(ext => {
        if (ext.isAlreadyApplied(parentNode)) {
          ext.setActive();  // 命中！按钮高亮
        }
      });
      if (isMediumEditorElement(parentNode)) break;
      parentNode = parentNode.parentNode;
    }
  },

  // 浮动定位（BubbleMenu 模式）
  positionToolbar(selection) {
    const boundary = selection.getRangeAt(0).getBoundingClientRect();
    // 默认在选区上方，空间不够则翻转到下方
    if (boundary.top < buttonHeight) {
      toolbar.style.top = boundary.bottom + offset;  // 翻转到下方
    } else {
      toolbar.style.top = boundary.top - toolbarHeight + offset;  // 正常在上方
    }
    // 水平居中对齐选区
    toolbar.style.left = boundary.left + boundary.width / 2 - toolbarWidth / 2;
  }
}
```

**关键设计原则**：
- Toolbar 本身是 Extension，不是特殊存在
- Selection 变化 → 遍历 DOM 祖先链 → 检查每个按钮是否 active → 更新 UI
- 浮动工具栏和固定工具栏是**同一个 Toolbar 扩展的两种配置**（`static: true/false`）
- 按钮的 active 状态不是按钮自己管的，是 Toolbar 通过爬 DOM 树统一判断的

#### 2. Tiptap/ProseMirror 的 State + Transaction 模型

ProseMirror（Tiptap 的底层）的核心思想：

```
用户操作 → 创建 Transaction → apply 到 EditorState → 生成新 State → 重新渲染
```

这与 React 的 `setState` 和 Redux 的 `dispatch(action)` 是同一思想。

```typescript
// ProseMirror 的核心流程（简化版）
interface EditorState {
  doc: DocumentNode;       // 不可变文档树
  selection: Selection;    // 当前选区
  marks: Mark[];           // 当前激活的 marks（bold, italic 等）
}

interface Transaction {
  // 操作链
  steps: Step[];
  // 元信息
  meta: Record<string, any>;
  // 链式 API
  insertText(text: string, from: number, to?: number): Transaction;
  addMark(from: number, to: number, mark: Mark): Transaction;
  removeMark(from: number, to: number, mark: Mark): Transaction;
  setSelection(selection: Selection): Transaction;
}

// 状态流转
const newState = oldState.apply(transaction);
// 视图更新
view.updateState(newState);
```

#### 3. 我们的简化设计

不实现完整的 ProseMirror（那太重了），而是提取核心思想：
- **用 contenteditable** 而非 textarea（支持富文本渲染）
- **EditorState 是不可变的**：每次操作创建新 state
- **所有变更走 Transaction**：insertText / toggleMark / setSelection 都是 Transaction 方法
- **Extension 模型参考 medium-editor**：Extension → Button → FormExtension 三层

### 架构设计

```
┌────────────────────────────────────────────────────────────┐
│                     Editor Component                        │
│                                                            │
│  ┌──────────── Fixed Toolbar (static: true) ────────────┐  │
│  │  [B] [I] [U] [H1] [H2] [🔗] [📷] [😀]              │  │
│  │   ↑ active 状态由 checkState() 驱动                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌──────────── Bubble Menu (static: false) ─────────────┐  │
│  │  (选中文字时浮动显示)                                  │  │
│  │  [B] [I] [🌐翻译] [📋复制]                           │  │
│  │   ↑ 同一套 Extension/Button 机制                      │  │
│  │   ↑ 定位: selection.getRangeAt(0).getBoundingClientRect│  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌──────────── Editor Area (contenteditable) ───────────┐  │
│  │                                                      │  │
│  │  用户操作                                            │  │
│  │    │                                                 │  │
│  │    ▼                                                 │  │
│  │  Transaction                                         │  │
│  │    │ .toggleMark('bold')                             │  │
│  │    │ .insertText('hello')                            │  │
│  │    │ .setSelection(...)                              │  │
│  │    ▼                                                 │  │
│  │  EditorState.apply(transaction)                      │  │
│  │    │                                                 │  │
│  │    ▼                                                 │  │
│  │  newState { doc, selection, activeMarks }             │  │
│  │    │                                                 │  │
│  │    ├──→ View re-render (contenteditable 更新)        │  │
│  │    ├──→ Toolbar.checkState() (按钮状态更新)          │  │
│  │    └──→ Extensions.onStateChange() (字数统计等)      │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌──────────── Status Bar ──────────────────────────────┐  │
│  │  字数: 128 │ 行数: 5 │ 自动保存: 已保存 12:30:45     │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### 核心类型定义

```typescript
// ==================== 文档模型（简化版） ====================
type MarkType = 'bold' | 'italic' | 'underline' | 'link';

interface Mark {
  type: MarkType;
  attrs?: Record<string, any>;  // link 需要 href
}

// 我们不实现完整的 ProseMirror 文档树，
// 而是用 contenteditable + document.execCommand/Selection API
// 但保持 State + Transaction 的数据流

// ==================== Editor State ====================
interface EditorState {
  // 文档内容（HTML string，从 contenteditable 获取）
  content: string;
  // 当前选区
  selection: {
    from: number;
    to: number;
    empty: boolean;
    text: string;
    rect: DOMRect | null;
  };
  // 当前选区内激活的 marks
  activeMarks: Set<MarkType>;
  // 元数据
  wordCount: number;
  lineCount: number;
  lastSaved: number | null;
}

// ==================== Transaction ====================
interface Transaction {
  readonly oldState: EditorState;
  // 操作方法（链式）
  toggleMark(mark: MarkType, attrs?: Record<string, any>): Transaction;
  insertText(text: string): Transaction;
  insertHTML(html: string): Transaction;
  setSelection(from: number, to: number): Transaction;
  setMeta(key: string, value: any): Transaction;
  // 执行
  dispatch(): EditorState;
}

// ==================== Extension ====================
interface Extension {
  name: string;
  // 生命周期
  init?(editor: EditorInstance): void;
  destroy?(): void;
  // Selection 变化时调用（用于更新 active 状态）
  checkState?(state: EditorState): void;
  // State 变化时调用（用于派生数据，如字数统计）
  onStateChange?(state: EditorState): void;
  // 返回扩展管理的 DOM 元素（用于判断点击是否在编辑器外）
  getInteractionElements?(): HTMLElement[];

  // 代理方法（由 EditorInstance 在 init 时注入）
  execCommand?(command: string, value?: string): void;
  subscribe?(event: string, handler: (...args: any[]) => void): void;
}

// ==================== Button Extension ====================
interface ButtonExtension extends Extension {
  // 按钮配置
  command: string;           // 执行的命令（'bold', 'italic' 等）
  label: string;             // 显示名称
  icon: string | React.ReactNode;  // 图标
  shortcut?: string;         // 快捷键描述（显示用）

  // 按钮 DOM
  getButton(): HTMLElement | React.ReactNode;

  // 状态管理
  tagNames?: string[];       // 哪些标签表示已激活（['b', 'strong'] for bold）
  style?: { prop: string; value: string };  // 哪些 CSS 属性表示已激活
  isActive(): boolean;
  isAlreadyApplied(node: Node): boolean;
  setActive(): void;
  setInactive(): void;

  // 事件
  handleClick(event: MouseEvent): void;  // 默认：execCommand(command)
}

// ==================== Form Extension ====================
interface FormExtension extends ButtonExtension {
  // 点击按钮后弹出表单（如链接输入框）
  hasForm: true;
  getForm(): HTMLElement | React.ReactNode;
  isDisplayed(): boolean;
  showForm(opts?: any): void;
  hideForm(): void;
}

// ==================== Toolbar Extension ====================
interface ToolbarConfig {
  buttons: string[];         // 按钮名称列表
  static: boolean;           // true = 固定，false = 浮动跟随选区
  diffTop?: number;          // 位置偏移
  diffLeft?: number;
  allowMultiParagraphSelection?: boolean;
}

// ==================== Editor Instance ====================
interface EditorInstance {
  // 状态
  state: EditorState;
  // 创建事务
  createTransaction(): Transaction;
  // 注册扩展
  registerExtension(extension: Extension): void;
  // 获取扩展
  getExtension(name: string): Extension | null;
  // 事件
  on(event: string, handler: (...args: any[]) => void): void;
  off(event: string, handler: (...args: any[]) => void): void;
  emit(event: string, ...args: any[]): void;
  // 编辑命令
  execCommand(command: string, value?: string): void;
  // 销毁
  destroy(): void;
}
```

### 示例扩展定义

```typescript
// extensions/BoldExtension.ts
const BoldExtension: ButtonExtension = {
  name: 'bold',
  command: 'bold',
  label: '加粗',
  icon: '<b>B</b>',
  shortcut: 'Ctrl+B',
  tagNames: ['b', 'strong'],
  style: { prop: 'font-weight', value: '700|bold' },

  // ... 其余方法由基类提供默认实现
};

// extensions/LinkExtension.ts（FormExtension 示例）
const LinkExtension: FormExtension = {
  name: 'anchor',
  command: 'createLink',
  label: '插入链接',
  icon: '🔗',
  shortcut: 'Ctrl+K',
  hasForm: true,
  tagNames: ['a'],

  getForm() {
    // 返回链接输入表单
    return <LinkForm onSubmit={(url) => this.execCommand('createLink', url)} />;
  },
  // ...
};

// extensions/WordCountExtension.ts（纯 Extension，不是 Button）
const WordCountExtension: Extension = {
  name: 'word-count',

  onStateChange(state: EditorState) {
    // 每次状态变化时更新字数
    // 通过 subscribe('ui:status-bar:update') 推送给 UI
  }
};
```

### 文件结构

```
src/
  rich-editor/                       # Demo 3 核心库
    types.ts                         # 所有类型定义
    core/
      EditorState.ts                 # 不可变编辑器状态
      Transaction.ts                 # 事务（变更描述）
      EditorInstance.ts              # 编辑器实例（整合所有模块）
      SelectionObserver.ts           # 监听 selection 变化
    extensions/
      Extension.ts                   # Extension 基类
      ButtonExtension.ts             # Button 扩展基类
      FormExtension.ts               # Form 扩展基类
      BoldExtension.ts               # 加粗
      ItalicExtension.ts             # 斜体
      UnderlineExtension.ts          # 下划线
      HeadingExtension.ts            # 标题（H1/H2）
      LinkExtension.ts               # 链接（FormExtension）
      ImageExtension.ts              # 图片
      EmojiExtension.ts              # 表情
      TranslateExtension.ts          # 翻译（BubbleMenu 按钮）
      CopyExtension.ts               # 复制（BubbleMenu 按钮）
      WordCountExtension.ts          # 字数统计
      AutoSaveExtension.ts           # 自动保存
    toolbar/
      Toolbar.ts                     # 工具栏扩展（也是 Extension）
      ToolbarRenderer.tsx            # 工具栏 React 渲染
      BubbleMenu.tsx                 # 浮动工具条（Toolbar 的 static=false 模式）
    components/
      Editor.tsx                     # 编辑器主组件
      StatusBar.tsx                  # 状态栏
      LinkForm.tsx                   # 链接输入表单
      ImageUploader.tsx              # 图片上传
      EmojiPicker.tsx                # 表情选择器

  app/
    demos/
      rich-editor/
        page.tsx                     # Demo 页面
```

### 实施清单

1. 定义所有类型（EditorState / Transaction / Extension / ButtonExtension / FormExtension / ToolbarConfig）→ `types.ts`
2. 实现 `EditorState`：不可变状态对象，包含 content / selection / activeMarks / wordCount
3. 实现 `Transaction`：链式 API（toggleMark / insertText / insertHTML / setSelection），dispatch 生成新 State
4. 实现 `SelectionObserver`：监听 `selectionchange` 事件，读取当前选区信息，检测 activeMarks
5. 实现 `Extension` 基类：提供 `execCommand` / `subscribe` / `trigger` 代理方法的默认实现
6. 实现 `ButtonExtension` 基类：提供 `isActive` / `isAlreadyApplied` / `setActive` / `setInactive` / `handleClick` 默认实现
7. 实现 `FormExtension` 基类：继承 ButtonExtension，增加 `getForm` / `showForm` / `hideForm`
8. 实现 `Toolbar`（也是 Extension）：
   - `checkState()`：检测选区 → 爬 DOM 祖先链 → 调用每个按钮的 `isAlreadyApplied` → 更新 active 状态
   - `positionToolbar()`：static 模式固定在顶部，非 static 模式用 `getBoundingClientRect` 跟随选区
   - `showToolbar()` / `hideToolbar()`
9. 实现 `EditorInstance`：整合 EditorState + Transaction + SelectionObserver + Extension 管理
10. 实现具体扩展：BoldExtension / ItalicExtension / UnderlineExtension / HeadingExtension
11. 实现 `LinkExtension`（FormExtension）：点击弹出 URL 输入框
12. 实现 `ImageExtension`：插入图片
13. 实现 `EmojiExtension`：插入表情
14. 实现 `TranslateExtension` 和 `CopyExtension`：BubbleMenu 专用按钮
15. 实现 `WordCountExtension` 和 `AutoSaveExtension`：纯逻辑扩展
16. 实现 `ToolbarRenderer.tsx`：渲染固定工具栏，根据 buttons 配置渲染按钮
17. 实现 `BubbleMenu.tsx`：渲染浮动工具条，selection 变化时定位
18. 实现 `Editor.tsx`：contenteditable 容器 + 固定 Toolbar + BubbleMenu + StatusBar
19. 实现 `StatusBar.tsx`：字数 / 行数 / 保存状态
20. 实现 `page.tsx`：组装编辑器，配置两个 Toolbar（固定 + 浮动）

---

## 三个 Demo 的架构对比

| 维度 | Demo 1 Plugin Host | Demo 2 Command+Strategy | Demo 3 Editor Extension |
|------|--------------------|-----------------------|----------------------|
| **核心问题** | 谁能进来？怎么隔离？ | 做了什么？怎么撤销？ | 当前状态是什么？UI 怎么同步？ |
| **状态管理** | 插件各管各的 state | 全局不可变 elements + appState | 不可变 EditorState + Transaction |
| **扩展方式** | Manifest 声明贡献点 | Action 注册 + Tool 注册 | Extension/Button 注册 |
| **通信方式** | postMessage（跨线程） | ActionResult（函数返回值） | execCommand + 事件 |
| **UI 驱动** | 宿主读取贡献点渲染 | Action.PanelComponent 自带 UI | checkState() 爬 DOM 更新 |
| **隔离** | Web Worker 沙箱 | 无（同一上下文） | 无（同一上下文） |
| **撤销** | 无（插件各自处理） | HistoryManager（undoStack） | 可选（Transaction 粒度） |
| **对标** | VS Code / Obsidian | Excalidraw / Figma | medium-editor / Tiptap |

---

## 现有代码处理

### 保留并大改
- `src/plugin-system/` → Demo 1 的基础，需要重写为 Manifest + Worker 架构
- `src/app/plugin-demo/` → Demo 1 的页面，需要重写

### 新建
- `src/canvas-annotator/` → Demo 2
- `src/app/demos/canvas-annotator/` → Demo 2 页面
- `src/rich-editor/` → Demo 3
- `src/app/demos/rich-editor/` → Demo 3 页面

### 可删除
- `examples/plugin-system/plugins/lineCount.ts` → 遗留文件，已迁移到 `src/plugin-system/plugins/`

### Demo 广场更新
- `src/app/demos/page.tsx` 的 `DEMO_CARDS` 数组需要添加 Demo 2 和 Demo 3 的卡片

---

## 实施顺序建议

1. **Demo 2（截图标注）先做** — 最独立，不依赖现有代码，可以直接新建
2. **Demo 3（富文本编辑器）第二做** — 也是新建，但复杂度更高
3. **Demo 1（插件系统大改）最后做** — 需要改现有代码，风险最高

每个 Demo 内部的实施顺序：**核心库 → 组件 → 页面**，先跑通最小可用版本再逐步补功能。

---

## 参考资料

### VS Code 插件架构
- [VS Code Contribution Points](https://code.visualstudio.com/api/references/contribution-points) — 40+ 种贡献点的完整文档
- [VS Code Activation Events](https://code.visualstudio.com/api/references/activation-events) — 插件激活条件
- [VS Code Extension API](https://code.visualstudio.com/api/references/vscode-api) — 注入给插件的 API

### Excalidraw
- [`actions/types.ts`](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/actions/types.ts) — Action 接口定义
- [`actions/manager.tsx`](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/actions/manager.tsx) — ActionManager 实现

### medium-editor
- [`src/js/extensions/README.md`](https://github.com/yabwe/medium-editor/blob/master/src/js/extensions/README.md) — Extension/Button/Form 三层模型文档
- [`src/js/extensions/toolbar.js`](https://github.com/yabwe/medium-editor/blob/master/src/js/extensions/toolbar.js) — Toolbar 实现（checkState / positionToolbar / checkActiveButtons）

### Tiptap / ProseMirror
- [Tiptap 文档](https://tiptap.dev/docs) — 基于 ProseMirror 的富文本框架
- [ProseMirror Guide](https://prosemirror.net/docs/guide/) — State + Transaction + View 三层架构