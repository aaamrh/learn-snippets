// ==================== KeybindingService ====================
//
// 统一的快捷键管理服务。
//
// 解决的问题：
// - 之前快捷键监听散落在 page.tsx 的 useEffect 中（handleKeyDown），
//   与宿主核心逻辑分离，无法复用、无法测试。
// - NewPluginHost.setupKeybindings() 方法体是空的（只有注释预留）。
// - 没有快捷键冲突检测（两个插件绑定同一快捷键时静默覆盖）。
// - 没有用户自定义覆盖能力（VS Code 的 keybindings.json）。
//
// 设计原则：
// - KeybindingService 依赖 ContributionManager（读取插件声明的快捷键）
//   和 ContextKeyService（评估 when 条件），但不依赖 DOM。
// - DOM 的 keydown 监听由 start(target) 绑定，stop() 解绑。
// - 命令执行通过构造时传入的 executeCommand 回调，不直接依赖 NewPluginHost。
// - 支持宿主级快捷键（如 Escape 关闭弹窗），优先级高于插件快捷键。
// - 快捷键冲突不静默吞掉，而是记录到诊断信息并可在 UI 中展示。
//
// 与其他模块的关系：
// | 模块                | 关系                                              |
// |---------------------|---------------------------------------------------|
// | ContributionManager | 读取 keybindings 贡献点 + findCommandByKeybinding  |
// | ContextKeyService   | 评估 when 表达式，决定快捷键是否激活               |
// | NewPluginHost       | 构造时创建并持有 KeybindingService 实例              |
// | page.tsx            | 不再自己监听 keydown，由 KeybindingService 统一管理  |
// | DisposableStore     | KeybindingService 实现 Disposable 接口              |
//
// 快捷键格式标准化规则（与 ContributionManager.normalizeKeybinding 一致）：
// - 修饰键统一小写并按固定顺序排列：ctrl, meta, shift, alt
// - cmd → meta, option → alt
// - 普通键小写
// - 示例："Ctrl+Shift+T" → "ctrl+shift+t"
//         "Shift+Ctrl+T" → "ctrl+shift+t"（顺序无关）
//
// 使用方式：
// ```ts
// const keybindingService = new KeybindingService(
//   contributions,
//   contextKeys,
//   {
//     executeCommand: (id, ...args) => host.executeCommand(id, ...args),
//   },
// );
//
// // 注册宿主级快捷键（优先级最高）
// keybindingService.registerHostKeybinding("Escape", () => closePopup());
//
// // 启动监听
// keybindingService.start(document);
//
// // 查看冲突
// const conflicts = keybindingService.getConflicts();
//
// // 销毁
// keybindingService.dispose();
// ```

import type { Disposable } from "./manifest-types";
import type { ContributionManager } from "./ContributionManager";
import type { ContextKeyService } from "./ContextKeyService";

// ==================== 类型定义 ====================

/**
 * 快捷键冲突信息
 *
 * 当两个或更多插件声明了同一个快捷键时产生。
 * 不会阻止功能工作（按优先级执行第一个匹配的），
 * 但会在诊断面板中显示警告。
 */
export interface KeybindingConflict {
  /** 标准化后的快捷键字符串 */
  key: string;

  /** 冲突的插件和命令列表 */
  bindings: Array<{
    pluginId: string;
    commandId: string;
    when?: string;
  }>;
}

/**
 * 宿主级快捷键注册信息
 *
 * 宿主级快捷键（如 Escape 关闭弹窗）优先级高于所有插件快捷键。
 */
interface HostKeybinding {
  /** 标准化后的快捷键字符串 */
  normalizedKey: string;

  /** 原始快捷键字符串（用于显示） */
  rawKey: string;

  /** 快捷键触发时执行的回调 */
  handler: () => void;

  /** 可选描述（用于诊断面板） */
  description?: string;

  /** 可选条件（函数形式，不走 ContextKeyService） */
  when?: () => boolean;
}

/**
 * 用户自定义快捷键覆盖
 *
 * 对标 VS Code 的 keybindings.json：
 * 用户可以覆盖插件声明的快捷键绑定。
 */
export interface UserKeybindingOverride {
  /** 原始命令 ID */
  commandId: string;

  /** 新的快捷键（空字符串表示移除绑定） */
  key: string;

  /** 可选的 when 条件 */
  when?: string;
}

/**
 * KeybindingService 配置
 */
export interface KeybindingServiceConfig {
  /**
   * 命令执行回调
   *
   * KeybindingService 不直接依赖 NewPluginHost，
   * 而是通过此回调执行命令，保持解耦。
   */
  executeCommand: (commandId: string, ...args: unknown[]) => Promise<unknown>;

  /**
   * 快捷键触发时的通知回调（可选）
   *
   * 用于在事件日志中记录快捷键触发事件。
   */
  onKeybindingTriggered?: (info: {
    key: string;
    commandId: string;
    source: "host" | "plugin" | "user-override";
  }) => void;

  /**
   * 快捷键匹配失败时的通知回调（可选）
   *
   * 当用户按下的组合键没有匹配到任何命令时触发。
   * 不会对普通按键（无修饰键）触发。
   */
  onKeybindingMiss?: (info: { key: string }) => void;

  /**
   * 是否阻止浏览器默认行为（可选，默认 true）
   *
   * 当快捷键匹配到命令时，是否调用 e.preventDefault()。
   */
  preventDefault?: boolean;

  /**
   * 用户自定义覆盖的持久化 key（localStorage）
   * 默认 "plugin-host:user-keybindings"
   */
  userOverrideStorageKey?: string;
}

/**
 * 快捷键匹配结果
 */
interface KeybindingMatch {
  /** 匹配到的命令 ID */
  commandId: string;

  /** 来源 */
  source: "host" | "plugin" | "user-override";

  /** 执行回调（宿主级）或 null（插件级，走 executeCommand） */
  handler: (() => void) | null;
}

// ==================== 快捷键标准化 ====================

/**
 * 修饰键的标准顺序
 *
 * 与 ContributionManager 中的 normalizeKeybinding 保持一致。
 */
const MODIFIER_ORDER = ["ctrl", "meta", "shift", "alt"];

/**
 * 修饰键别名映射
 */
const MODIFIER_ALIASES: Record<string, string> = {
  cmd: "meta",
  command: "meta",
  option: "alt",
  win: "meta",
  windows: "meta",
};

/**
 * 标准化快捷键字符串
 *
 * 规则：
 * 1. 所有部分转小写
 * 2. 修饰键别名统一（cmd → meta, option → alt）
 * 3. 修饰键按 MODIFIER_ORDER 排序
 * 4. 普通键保持原始顺序（通常只有一个）
 *
 * @param key 原始快捷键字符串（如 "Ctrl+Shift+T" 或 "Shift+Ctrl+T"）
 * @returns 标准化后的字符串（如 "ctrl+shift+t"）
 */
export function normalizeKeybinding(key: string): string {
  const parts = key.split("+").map((p) => p.trim().toLowerCase());

  const modifiers: string[] = [];
  const keys: string[] = [];

  for (const part of parts) {
    // 检查是否是修饰键（包括别名）
    const alias = MODIFIER_ALIASES[part];
    if (alias) {
      if (!modifiers.includes(alias)) {
        modifiers.push(alias);
      }
    } else if (MODIFIER_ORDER.includes(part)) {
      if (!modifiers.includes(part)) {
        modifiers.push(part);
      }
    } else {
      keys.push(part);
    }
  }

  // 修饰键按固定顺序排列
  modifiers.sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b));

  return [...modifiers, ...keys].join("+");
}

/**
 * 从 KeyboardEvent 构建标准化的快捷键字符串
 *
 * @param event KeyboardEvent
 * @returns 标准化后的快捷键字符串，或 null（如果只有修饰键本身被按下）
 */
export function keyEventToString(event: KeyboardEvent): string | null {
  // 忽略单独的修饰键按下
  const ignoredKeys = new Set([
    "Control",
    "Shift",
    "Alt",
    "Meta",
    "CapsLock",
    "NumLock",
    "ScrollLock",
  ]);
  if (ignoredKeys.has(event.key)) {
    return null;
  }

  const parts: string[] = [];

  if (event.ctrlKey || event.metaKey) parts.push("ctrl");
  if (event.shiftKey) parts.push("shift");
  if (event.altKey) parts.push("alt");

  // 普通键处理
  if (event.key.length === 1) {
    // 单字符键，转大写后再小写（统一处理）
    parts.push(event.key.toLowerCase());
  } else {
    // 特殊键名（Escape, Enter, ArrowUp 等）
    parts.push(event.key.toLowerCase());
  }

  return parts.join("+");
}

/**
 * 将标准化快捷键字符串格式化为用户可读的展示形式
 *
 * @param key 标准化后的快捷键字符串（如 "ctrl+shift+t"）
 * @param platform 平台（默认自动检测）
 * @returns 用户可读的展示形式（如 "Ctrl+Shift+T" 或 "⌘⇧T"）
 */
export function formatKeybindingForDisplay(
  key: string,
  platform?: "mac" | "windows" | "linux",
): string {
  const detectedPlatform =
    platform ??
    (typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
      ? "mac"
      : "windows");

  const parts = key.split("+");

  if (detectedPlatform === "mac") {
    const symbolMap: Record<string, string> = {
      ctrl: "⌃",
      meta: "⌘",
      shift: "⇧",
      alt: "⌥",
      escape: "⎋",
      enter: "↩",
      backspace: "⌫",
      delete: "⌦",
      tab: "⇥",
      arrowup: "↑",
      arrowdown: "↓",
      arrowleft: "←",
      arrowright: "→",
    };

    return parts.map((p) => symbolMap[p] ?? p.toUpperCase()).join("");
  }

  // Windows / Linux 格式
  const labelMap: Record<string, string> = {
    ctrl: "Ctrl",
    meta: "Win",
    shift: "Shift",
    alt: "Alt",
    escape: "Esc",
    enter: "Enter",
    backspace: "Backspace",
    delete: "Del",
    tab: "Tab",
    arrowup: "↑",
    arrowdown: "↓",
    arrowleft: "←",
    arrowright: "→",
    " ": "Space",
  };

  return parts.map((p) => labelMap[p] ?? p.toUpperCase()).join("+");
}

// ==================== KeybindingService 主类 ====================

/**
 * KeybindingService — 统一快捷键管理服务
 *
 * 职责：
 * 1. 监听 DOM keydown 事件
 * 2. 将按键组合标准化并匹配到命令
 * 3. 按优先级执行匹配：宿主级 > 用户覆盖 > 插件声明
 * 4. 检测和报告快捷键冲突
 * 5. 管理用户自定义快捷键覆盖
 *
 * 匹配优先级：
 * 1. 宿主级快捷键（registerHostKeybinding 注册的）
 * 2. 用户自定义覆盖（UserKeybindingOverride）
 * 3. 插件声明的快捷键（Manifest contributes.keybindings）
 *
 * 当同一优先级内有多个匹配时，使用 ContributionManager 的
 * findCommandByKeybinding 方法，它会考虑 when 条件和声明顺序。
 */
export class KeybindingService implements Disposable {
  // ── 依赖 ──
  private contributions: ContributionManager;
  private contextKeys: ContextKeyService;

  // ── 配置 ──
  private config: Required<
    Pick<KeybindingServiceConfig, "preventDefault" | "userOverrideStorageKey">
  > & {
    executeCommand: KeybindingServiceConfig["executeCommand"];
    onKeybindingTriggered: KeybindingServiceConfig["onKeybindingTriggered"] | null;
    onKeybindingMiss: KeybindingServiceConfig["onKeybindingMiss"] | null;
  };

  // ── 宿主级快捷键 ──
  private hostKeybindings: Map<string, HostKeybinding> = new Map();

  // ── 用户自定义覆盖 ──
  private userOverrides: UserKeybindingOverride[] = [];

  // ── 标准化后的用户覆盖映射（key → commandId） ──
  private userOverrideMap: Map<string, { commandId: string; when?: string }> = new Map();

  // ── 被用户移除绑定的命令集合 ──
  private userRemovedCommands: Set<string> = new Set();

  // ── DOM 监听 ──
  private target: EventTarget | null = null;
  private boundHandleKeyDown: ((event: Event) => void) | null = null;

  // ── 状态 ──
  private _isStarted = false;
  private _isDisposed = false;

  // ── 统计 ──
  private stats = {
    totalTriggered: 0,
    totalMissed: 0,
    lastTriggeredKey: null as string | null,
    lastTriggeredCommand: null as string | null,
    lastTriggeredAt: null as number | null,
  };

  constructor(
    contributions: ContributionManager,
    contextKeys: ContextKeyService,
    config: KeybindingServiceConfig,
  ) {
    this.contributions = contributions;
    this.contextKeys = contextKeys;

    this.config = {
      executeCommand: config.executeCommand,
      onKeybindingTriggered: config.onKeybindingTriggered ?? null,
      onKeybindingMiss: config.onKeybindingMiss ?? null,
      preventDefault: config.preventDefault ?? true,
      userOverrideStorageKey: config.userOverrideStorageKey ?? "plugin-host:user-keybindings",
    };

    // 加载用户自定义覆盖
    this.loadUserOverrides();
  }

  // ==================== 生命周期 ====================

  /**
   * 启动快捷键监听
   *
   * @param target 绑定 keydown 事件的目标（通常是 document）
   */
  start(target: EventTarget = document): void {
    if (this._isDisposed) {
      console.warn("[KeybindingService] Cannot start a disposed service.");
      return;
    }

    if (this._isStarted) {
      console.warn("[KeybindingService] Already started. Call stop() first.");
      return;
    }

    this.target = target;
    this.boundHandleKeyDown = (event: Event) => {
      this.handleKeyDown(event as KeyboardEvent);
    };

    target.addEventListener("keydown", this.boundHandleKeyDown);
    this._isStarted = true;
  }

  /**
   * 停止快捷键监听（不销毁，可以再次 start）
   */
  stop(): void {
    if (!this._isStarted || !this.target || !this.boundHandleKeyDown) return;

    this.target.removeEventListener("keydown", this.boundHandleKeyDown);
    this.target = null;
    this.boundHandleKeyDown = null;
    this._isStarted = false;
  }

  /**
   * 销毁服务（停止监听 + 清理所有资源）
   */
  dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;

    this.stop();
    this.hostKeybindings.clear();
    this.userOverrides = [];
    this.userOverrideMap.clear();
    this.userRemovedCommands.clear();
  }

  // ==================== 宿主级快捷键 ====================

  /**
   * 注册宿主级快捷键
   *
   * 宿主级快捷键优先级最高，用于 Escape 关闭弹窗等宿主行为。
   *
   * @param key         快捷键字符串（如 "Escape"、"Ctrl+S"）
   * @param handler     触发时执行的回调
   * @param options     可选参数
   * @returns Disposable（取消注册）
   */
  registerHostKeybinding(
    key: string,
    handler: () => void,
    options?: {
      description?: string;
      when?: () => boolean;
    },
  ): Disposable {
    const normalizedKey = normalizeKeybinding(key);

    const binding: HostKeybinding = {
      normalizedKey,
      rawKey: key,
      handler,
      description: options?.description,
      when: options?.when,
    };

    this.hostKeybindings.set(normalizedKey, binding);

    return {
      dispose: () => {
        // 只移除自己注册的那个（防止别人覆盖后被误删）
        if (this.hostKeybindings.get(normalizedKey) === binding) {
          this.hostKeybindings.delete(normalizedKey);
        }
      },
    };
  }

  /**
   * 移除宿主级快捷键
   *
   * @param key 快捷键字符串
   */
  unregisterHostKeybinding(key: string): void {
    const normalizedKey = normalizeKeybinding(key);
    this.hostKeybindings.delete(normalizedKey);
  }

  // ==================== 用户自定义覆盖 ====================

  /**
   * 添加用户自定义快捷键覆盖
   *
   * @param override 覆盖信息
   */
  addUserOverride(override: UserKeybindingOverride): void {
    // 移除同一命令的旧覆盖
    this.userOverrides = this.userOverrides.filter((o) => o.commandId !== override.commandId);

    this.userOverrides.push(override);
    this.rebuildUserOverrideMap();
    this.saveUserOverrides();
  }

  /**
   * 移除用户自定义快捷键覆盖（恢复为插件默认）
   *
   * @param commandId 命令 ID
   */
  removeUserOverride(commandId: string): void {
    this.userOverrides = this.userOverrides.filter((o) => o.commandId !== commandId);
    this.rebuildUserOverrideMap();
    this.saveUserOverrides();
  }

  /**
   * 获取所有用户自定义覆盖
   */
  getUserOverrides(): UserKeybindingOverride[] {
    return [...this.userOverrides];
  }

  /**
   * 清除所有用户自定义覆盖
   */
  clearUserOverrides(): void {
    this.userOverrides = [];
    this.rebuildUserOverrideMap();
    this.saveUserOverrides();
  }

  // ==================== 查询方法 ====================

  /**
   * 查找快捷键对应的命令
   *
   * 按优先级查找：宿主级 > 用户覆盖 > 插件声明
   *
   * @param key 快捷键字符串
   * @returns 匹配结果，或 null
   */
  findMatch(key: string): KeybindingMatch | null {
    const normalizedKey = normalizeKeybinding(key);

    // 1. 宿主级
    const hostBinding = this.hostKeybindings.get(normalizedKey);
    if (hostBinding) {
      // 检查 when 条件
      if (!hostBinding.when || hostBinding.when()) {
        return {
          commandId: `host:${hostBinding.rawKey}`,
          source: "host",
          handler: hostBinding.handler,
        };
      }
    }

    // 2. 用户自定义覆盖
    const userOverride = this.userOverrideMap.get(normalizedKey);
    if (userOverride) {
      // 检查 when 条件
      if (!userOverride.when || this.contextKeys.evaluate(userOverride.when)) {
        return {
          commandId: userOverride.commandId,
          source: "user-override",
          handler: null,
        };
      }
    }

    // 3. 插件声明的快捷键
    // 检查命令是否被用户移除绑定
    const pluginCommandId = this.contributions.findCommandByKeybinding(normalizedKey);
    if (pluginCommandId && !this.userRemovedCommands.has(pluginCommandId)) {
      return {
        commandId: pluginCommandId,
        source: "plugin",
        handler: null,
      };
    }

    return null;
  }

  /**
   * 获取指定命令的当前有效快捷键
   *
   * 考虑用户覆盖后的实际绑定。
   *
   * @param commandId 命令 ID
   * @returns 快捷键字符串（用户覆盖优先），或 null
   */
  getKeybindingForCommand(commandId: string): string | null {
    // 1. 检查用户是否移除了绑定
    if (this.userRemovedCommands.has(commandId)) {
      return null;
    }

    // 2. 检查用户覆盖
    const userOverride = this.userOverrides.find((o) => o.commandId === commandId && o.key !== "");
    if (userOverride) {
      return userOverride.key;
    }

    // 3. 查找插件声明的快捷键
    const allKeybindings = this.contributions.getAllKeybindings();
    for (const binding of allKeybindings) {
      if (binding.command === commandId) {
        return binding.key;
      }
    }

    return null;
  }

  /**
   * 获取所有快捷键冲突
   *
   * 冲突定义：同一标准化快捷键被多个插件的多个命令绑定，
   * 且这些绑定的 when 条件可能同时为真。
   *
   * @returns 冲突列表
   */
  getConflicts(): KeybindingConflict[] {
    const allKeybindings = this.contributions.getAllKeybindings();

    // 按标准化 key 分组
    const groups = new Map<string, Array<{ pluginId: string; commandId: string; when?: string }>>();

    for (const binding of allKeybindings) {
      const normalized = normalizeKeybinding(binding.key);
      const existing = groups.get(normalized);
      if (existing) {
        existing.push({
          pluginId: binding.pluginId,
          commandId: binding.command,
          when: binding.when,
        });
      } else {
        groups.set(normalized, [
          {
            pluginId: binding.pluginId,
            commandId: binding.command,
            when: binding.when,
          },
        ]);
      }
    }

    // 找出有多个绑定的 key
    const conflicts: KeybindingConflict[] = [];
    for (const [key, bindings] of groups) {
      if (bindings.length > 1) {
        conflicts.push({ key, bindings });
      }
    }

    return conflicts;
  }

  /**
   * 检查指定快捷键是否有冲突
   *
   * @param key 快捷键字符串
   * @returns 是否有冲突
   */
  hasConflict(key: string): boolean {
    const normalized = normalizeKeybinding(key);
    return this.getConflicts().some((c) => c.key === normalized);
  }

  /**
   * 获取所有已注册的快捷键（宿主级 + 用户覆盖 + 插件声明）
   *
   * 用于诊断面板的"快捷键"tab 展示。
   */
  getAllKeybindings(): Array<{
    key: string;
    displayKey: string;
    commandId: string;
    source: "host" | "user-override" | "plugin";
    pluginId?: string;
    when?: string;
    description?: string;
    hasConflict: boolean;
  }> {
    const result: Array<{
      key: string;
      displayKey: string;
      commandId: string;
      source: "host" | "user-override" | "plugin";
      pluginId?: string;
      when?: string;
      description?: string;
      hasConflict: boolean;
    }> = [];

    const conflicts = this.getConflicts();
    const conflictKeys = new Set(conflicts.map((c) => c.key));

    // 1. 宿主级
    for (const [, binding] of this.hostKeybindings) {
      result.push({
        key: binding.normalizedKey,
        displayKey: formatKeybindingForDisplay(binding.normalizedKey),
        commandId: `host:${binding.rawKey}`,
        source: "host",
        description: binding.description,
        hasConflict: false, // 宿主级不参与冲突检测
      });
    }

    // 2. 用户覆盖
    for (const override of this.userOverrides) {
      if (override.key === "") continue; // 移除绑定的不展示
      const normalized = normalizeKeybinding(override.key);
      result.push({
        key: normalized,
        displayKey: formatKeybindingForDisplay(normalized),
        commandId: override.commandId,
        source: "user-override",
        when: override.when,
        hasConflict: conflictKeys.has(normalized),
      });
    }

    // 3. 插件声明
    const pluginKeybindings = this.contributions.getAllKeybindings();
    for (const binding of pluginKeybindings) {
      const normalized = normalizeKeybinding(binding.key);
      // 如果被用户覆盖了，不重复展示
      const isOverridden = this.userOverrides.some((o) => o.commandId === binding.command);
      if (isOverridden) continue;

      result.push({
        key: normalized,
        displayKey: formatKeybindingForDisplay(normalized),
        commandId: binding.command,
        source: "plugin",
        pluginId: binding.pluginId,
        when: binding.when,
        hasConflict: conflictKeys.has(normalized),
      });
    }

    return result;
  }

  // ==================== 状态查询 ====================

  /** 是否已启动监听 */
  get isStarted(): boolean {
    return this._isStarted;
  }

  /** 是否已被销毁 */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  // ==================== 诊断 ====================

  /**
   * 获取诊断信息
   */
  getDiagnostics(): KeybindingDiagnostics {
    const allKeybindings = this.getAllKeybindings();
    const conflicts = this.getConflicts();

    return {
      isStarted: this._isStarted,
      isDisposed: this._isDisposed,
      hostKeybindingCount: this.hostKeybindings.size,
      userOverrideCount: this.userOverrides.length,
      pluginKeybindingCount: this.contributions.getAllKeybindings().length,
      totalKeybindingCount: allKeybindings.length,
      conflictCount: conflicts.length,
      conflicts: conflicts.map((c) => ({
        key: c.key,
        displayKey: formatKeybindingForDisplay(c.key),
        commandIds: c.bindings.map((b) => b.commandId),
      })),
      stats: { ...this.stats },
      keybindings: allKeybindings,
    };
  }

  // ==================== 内部方法 ====================

  /**
   * keydown 事件处理器
   *
   * 核心流程：
   * 1. 将 KeyboardEvent 转为标准化快捷键字符串
   * 2. 按优先级查找匹配的命令
   * 3. 如果匹配到，执行命令并阻止默认行为
   */
  private handleKeyDown(event: KeyboardEvent): void {
    // 将 KeyboardEvent 转为标准化字符串
    const keyString = keyEventToString(event);
    if (!keyString) return;

    // 查找匹配
    const match = this.findMatch(keyString);

    if (match) {
      // 阻止默认行为
      if (this.config.preventDefault) {
        event.preventDefault();
        event.stopPropagation();
      }

      // 更新统计
      this.stats.totalTriggered++;
      this.stats.lastTriggeredKey = keyString;
      this.stats.lastTriggeredCommand = match.commandId;
      this.stats.lastTriggeredAt = Date.now();

      // 通知回调
      if (this.config.onKeybindingTriggered) {
        try {
          this.config.onKeybindingTriggered({
            key: keyString,
            commandId: match.commandId,
            source: match.source,
          });
        } catch (error) {
          console.error("[KeybindingService] Error in onKeybindingTriggered callback:", error);
        }
      }

      // 执行
      if (match.handler) {
        // 宿主级：直接调用 handler
        try {
          match.handler();
        } catch (error) {
          console.error(
            `[KeybindingService] Error executing host keybinding "${keyString}":`,
            error,
          );
        }
      } else {
        // 插件级/用户覆盖：通过 executeCommand 回调
        this.config.executeCommand(match.commandId).catch((error: unknown) => {
          console.error(
            `[KeybindingService] Error executing command "${match.commandId}" ` +
              `for keybinding "${keyString}":`,
            error,
          );
        });
      }
    } else {
      // 未匹配到命令
      // 只对有修饰键的组合触发 miss 回调（避免普通打字都触发）
      const hasModifier =
        keyString.includes("ctrl+") || keyString.includes("meta+") || keyString.includes("alt+");

      if (hasModifier && this.config.onKeybindingMiss) {
        try {
          this.config.onKeybindingMiss({ key: keyString });
        } catch (error) {
          console.error("[KeybindingService] Error in onKeybindingMiss callback:", error);
        }
      }

      if (hasModifier) {
        this.stats.totalMissed++;
      }
    }
  }

  /**
   * 重建用户覆盖映射表
   */
  private rebuildUserOverrideMap(): void {
    this.userOverrideMap.clear();
    this.userRemovedCommands.clear();

    for (const override of this.userOverrides) {
      if (override.key === "") {
        // 空 key 表示移除绑定
        this.userRemovedCommands.add(override.commandId);
      } else {
        const normalized = normalizeKeybinding(override.key);
        this.userOverrideMap.set(normalized, {
          commandId: override.commandId,
          when: override.when,
        });
      }
    }
  }

  /**
   * 从 localStorage 加载用户自定义覆盖
   */
  private loadUserOverrides(): void {
    try {
      if (typeof localStorage === "undefined") return;

      const raw = localStorage.getItem(this.config.userOverrideStorageKey);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.userOverrides = parsed.filter(
          (item: unknown): item is UserKeybindingOverride =>
            typeof item === "object" &&
            item !== null &&
            "commandId" in item &&
            typeof (item as UserKeybindingOverride).commandId === "string" &&
            "key" in item &&
            typeof (item as UserKeybindingOverride).key === "string",
        );
        this.rebuildUserOverrideMap();
      }
    } catch (error) {
      console.warn("[KeybindingService] Failed to load user keybinding overrides:", error);
    }
  }

  /**
   * 将用户自定义覆盖保存到 localStorage
   */
  private saveUserOverrides(): void {
    try {
      if (typeof localStorage === "undefined") return;

      if (this.userOverrides.length === 0) {
        localStorage.removeItem(this.config.userOverrideStorageKey);
      } else {
        localStorage.setItem(
          this.config.userOverrideStorageKey,
          JSON.stringify(this.userOverrides),
        );
      }
    } catch (error) {
      console.warn("[KeybindingService] Failed to save user keybinding overrides:", error);
    }
  }
}

// ==================== 诊断类型 ====================

/**
 * KeybindingService 的诊断信息
 */
export interface KeybindingDiagnostics {
  /** 是否已启动监听 */
  isStarted: boolean;

  /** 是否已被销毁 */
  isDisposed: boolean;

  /** 宿主级快捷键数量 */
  hostKeybindingCount: number;

  /** 用户自定义覆盖数量 */
  userOverrideCount: number;

  /** 插件声明的快捷键数量 */
  pluginKeybindingCount: number;

  /** 所有快捷键总数 */
  totalKeybindingCount: number;

  /** 冲突数量 */
  conflictCount: number;

  /** 冲突详情 */
  conflicts: Array<{
    key: string;
    displayKey: string;
    commandIds: string[];
  }>;

  /** 统计信息 */
  stats: {
    totalTriggered: number;
    totalMissed: number;
    lastTriggeredKey: string | null;
    lastTriggeredCommand: string | null;
    lastTriggeredAt: number | null;
  };

  /** 所有快捷键列表 */
  keybindings: Array<{
    key: string;
    displayKey: string;
    commandId: string;
    source: "host" | "user-override" | "plugin";
    pluginId?: string;
    when?: string;
    description?: string;
    hasConflict: boolean;
  }>;
}
