// ==================== ConfigurationService ====================
//
// 管理插件的配置项（contributes.configuration）。
//
// 对标 VS Code 的 workspace.getConfiguration：
// - 插件在 Manifest 中声明配置 schema（类型、默认值、描述等）
// - 宿主自动渲染设置 UI（根据 type 渲染对应控件）
// - 插件运行时通过 api.configuration.get/update 读写配置
// - 配置持久化到 localStorage
// - 配置变更时通知相关插件
//
// 设计原则：
// - ConfigurationService 是纯状态管理，不依赖 UI 框架
// - 通过回调通知变更，不直接操作 DOM
// - 每个插件的配置 schema 在安装时注册，卸载时注销
// - 配置值分层：默认值（来自 schema）→ 用户设置（来自 localStorage）
//
// 与其他模块的关系：
// | 模块                | 职责                                    |
// |---------------------|-----------------------------------------|
// | manifest-types.ts   | 定义 ConfigurationContribution 类型      |
// | ContributionManager | 注册/注销 configuration 贡献点           |
// | APIProxy            | 创建 ConfigurationAPI 代理               |
// | PermissionGuard     | 拦截 configuration:read/write 权限       |
// | NewPluginHost       | 协调初始化和生命周期                      |

import type {
  Disposable,
  ConfigurationContribution,
  ConfigurationPropertySchema,
} from "./manifest-types";

// ==================== 事件类型 ====================

/**
 * 配置变更事件
 */
export interface ConfigurationChangeEvent {
  /** 变更的插件 ID */
  pluginId: string;
  /** 变更的配置 key */
  key: string;
  /** 新值 */
  newValue: unknown;
  /** 旧值 */
  oldValue: unknown;
}

/**
 * 配置变更监听器
 */
export type ConfigurationChangeListener = (event: ConfigurationChangeEvent) => void;

// ==================== ConfigurationService ====================

/**
 * ConfigurationService — 插件配置管理服务
 *
 * 用法：
 * ```ts
 * const configService = new ConfigurationService("plugin-config:");
 *
 * // 注册插件的配置 schema
 * configService.registerSchema("auto-save", {
 *   title: "自动保存设置",
 *   properties: {
 *     "autoSave.interval": { type: "number", default: 5000, description: "保存间隔（ms）" },
 *     "autoSave.enabled": { type: "boolean", default: true, description: "是否启用" },
 *   },
 * });
 *
 * // 读取配置值（先查用户设置，再查默认值）
 * const interval = configService.get<number>("auto-save", "autoSave.interval"); // 5000
 *
 * // 更新配置值
 * configService.update("auto-save", "autoSave.interval", 3000);
 *
 * // 监听变更
 * const disposable = configService.onDidChange("auto-save", "autoSave.interval", (newValue) => {
 *   console.log("Interval changed to:", newValue);
 * });
 *
 * // 清理
 * configService.dispose();
 * ```
 */
export class ConfigurationService implements Disposable {
  // ── 存储 ──

  /** 每个插件的配置 schema */
  private schemas: Map<string, ConfigurationContribution> = new Map();

  /** 每个插件的用户设置值（pluginId → { key → value }） */
  private userValues: Map<string, Map<string, unknown>> = new Map();

  /** 变更监听器（pluginId:key → listeners） */
  private changeListeners: Map<string, Set<(newValue: unknown) => void>> = new Map();

  /** 全局变更监听器 */
  private globalListeners: Set<ConfigurationChangeListener> = new Set();

  /** localStorage key 前缀 */
  private storagePrefix: string;

  /** 是否已 disposed */
  private _isDisposed: boolean = false;

  // ── 构造 ──

  constructor(storagePrefix: string = "plugin-config:") {
    this.storagePrefix = storagePrefix;
  }

  // ==================== Schema 管理 ====================

  /**
   * 注册插件的配置 schema
   *
   * 安装插件时调用，将 Manifest contributes.configuration 注册到服务中。
   * 同时从 localStorage 恢复该插件之前的用户设置。
   *
   * @param pluginId 插件 ID
   * @param config   配置贡献
   */
  registerSchema(pluginId: string, config: ConfigurationContribution): void {
    this.assertNotDisposed();

    this.schemas.set(pluginId, config);

    // 从 localStorage 恢复用户设置
    this.loadFromStorage(pluginId);
  }

  /**
   * 注销插件的配置 schema
   *
   * 卸载插件时调用。注销 schema 后，该插件的配置值仍保留在 localStorage 中，
   * 以便重新安装时恢复。如需彻底清除，调用 clearPlugin。
   *
   * @param pluginId 插件 ID
   */
  unregisterSchema(pluginId: string): void {
    this.schemas.delete(pluginId);
    this.userValues.delete(pluginId);

    // 清理监听器
    const keysToDelete: string[] = [];
    for (const key of this.changeListeners.keys()) {
      if (key.startsWith(`${pluginId}:`)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.changeListeners.delete(key);
    }
  }

  // ==================== 读取配置 ====================

  /**
   * 获取配置值
   *
   * 优先级：用户设置 > schema 默认值
   * 如果 key 不存在于 schema 中，返回 undefined。
   *
   * @param pluginId 插件 ID
   * @param key      配置 key（如 "autoSave.interval"）
   * @returns 配置值
   */
  get<T>(pluginId: string, key: string): T {
    this.assertNotDisposed();

    // 1. 查用户设置
    const userMap = this.userValues.get(pluginId);
    if (userMap && userMap.has(key)) {
      return userMap.get(key) as T;
    }

    // 2. 查 schema 默认值
    const schema = this.schemas.get(pluginId);
    if (schema && schema.properties[key]) {
      return schema.properties[key].default as T;
    }

    return undefined as T;
  }

  /**
   * 获取插件的所有配置值（合并默认值和用户设置）
   *
   * @param pluginId 插件 ID
   * @returns key → value 的映射
   */
  getAll(pluginId: string): Record<string, unknown> {
    this.assertNotDisposed();

    const result: Record<string, unknown> = {};
    const schema = this.schemas.get(pluginId);

    if (!schema) return result;

    // 填入默认值
    for (const [key, prop] of Object.entries(schema.properties)) {
      result[key] = prop.default;
    }

    // 覆盖用户设置
    const userMap = this.userValues.get(pluginId);
    if (userMap) {
      for (const [key, value] of userMap) {
        result[key] = value;
      }
    }

    return result;
  }

  // ==================== 更新配置 ====================

  /**
   * 更新配置值
   *
   * 验证值是否符合 schema 定义（类型、范围等），
   * 通过验证后保存到 localStorage 并通知监听器。
   *
   * @param pluginId 插件 ID
   * @param key      配置 key
   * @param value    新值
   * @throws 如果值不符合 schema 定义
   */
  update(pluginId: string, key: string, value: unknown): void {
    this.assertNotDisposed();

    const schema = this.schemas.get(pluginId);
    if (!schema) {
      console.warn(
        `[ConfigurationService] No schema registered for plugin "${pluginId}". Ignoring update.`,
      );
      return;
    }

    const propSchema = schema.properties[key];
    if (!propSchema) {
      console.warn(
        `[ConfigurationService] Unknown config key "${key}" for plugin "${pluginId}". Ignoring update.`,
      );
      return;
    }

    // 验证值
    const validationError = this.validateValue(value, propSchema);
    if (validationError) {
      console.warn(
        `[ConfigurationService] Invalid value for "${pluginId}.${key}": ${validationError}`,
      );
      return;
    }

    // 获取旧值
    const oldValue = this.get(pluginId, key);

    // 如果值相同，跳过
    if (oldValue === value) return;

    // 保存用户设置
    let userMap = this.userValues.get(pluginId);
    if (!userMap) {
      userMap = new Map();
      this.userValues.set(pluginId, userMap);
    }
    userMap.set(key, value);

    // 持久化到 localStorage
    this.saveToStorage(pluginId);

    // 通知变更
    this.notifyChange(pluginId, key, value, oldValue);
  }

  /**
   * 重置配置项为默认值
   *
   * @param pluginId 插件 ID
   * @param key      配置 key
   */
  reset(pluginId: string, key: string): void {
    this.assertNotDisposed();

    const schema = this.schemas.get(pluginId);
    if (!schema || !schema.properties[key]) return;

    const oldValue = this.get(pluginId, key);
    const defaultValue = schema.properties[key].default;

    // 删除用户设置（回退到默认值）
    const userMap = this.userValues.get(pluginId);
    if (userMap) {
      userMap.delete(key);
      this.saveToStorage(pluginId);
    }

    // 如果值发生了变化，通知监听器
    if (oldValue !== defaultValue) {
      this.notifyChange(pluginId, key, defaultValue, oldValue);
    }
  }

  /**
   * 重置插件的所有配置为默认值
   *
   * @param pluginId 插件 ID
   */
  resetAll(pluginId: string): void {
    this.assertNotDisposed();

    const schema = this.schemas.get(pluginId);
    if (!schema) return;

    const userMap = this.userValues.get(pluginId);
    if (!userMap || userMap.size === 0) return;

    // 收集所有需要通知的变更
    const changes: Array<{ key: string; oldValue: unknown; newValue: unknown }> = [];

    for (const [key, userValue] of userMap) {
      const defaultValue = schema.properties[key]?.default;
      if (userValue !== defaultValue) {
        changes.push({ key, oldValue: userValue, newValue: defaultValue });
      }
    }

    // 清除用户设置
    userMap.clear();
    this.saveToStorage(pluginId);

    // 通知变更
    for (const change of changes) {
      this.notifyChange(pluginId, change.key, change.newValue, change.oldValue);
    }
  }

  // ==================== 变更监听 ====================

  /**
   * 监听指定配置项的变更
   *
   * @param pluginId 插件 ID
   * @param key      配置 key
   * @param handler  变更处理器
   * @returns Disposable
   */
  onDidChange(
    pluginId: string,
    key: string,
    handler: (newValue: unknown) => void,
  ): Disposable {
    this.assertNotDisposed();

    const listenerKey = `${pluginId}:${key}`;
    let listeners = this.changeListeners.get(listenerKey);
    if (!listeners) {
      listeners = new Set();
      this.changeListeners.set(listenerKey, listeners);
    }

    listeners.add(handler);

    return {
      dispose: () => {
        listeners!.delete(handler);
        if (listeners!.size === 0) {
          this.changeListeners.delete(listenerKey);
        }
      },
    };
  }

  /**
   * 监听所有配置变更
   *
   * @param handler 变更处理器
   * @returns Disposable
   */
  onDidChangeAny(handler: ConfigurationChangeListener): Disposable {
    this.assertNotDisposed();

    this.globalListeners.add(handler);

    return {
      dispose: () => {
        this.globalListeners.delete(handler);
      },
    };
  }

  // ==================== 查询 ====================

  /**
   * 获取插件的配置 schema
   *
   * @param pluginId 插件 ID
   * @returns schema 或 null
   */
  getSchema(pluginId: string): ConfigurationContribution | null {
    return this.schemas.get(pluginId) ?? null;
  }

  /**
   * 获取所有已注册的配置 schema
   *
   * @returns pluginId → ConfigurationContribution 的映射
   */
  getAllSchemas(): Map<string, ConfigurationContribution> {
    return new Map(this.schemas);
  }

  /**
   * 获取指定属性的 schema
   *
   * @param pluginId 插件 ID
   * @param key      配置 key
   * @returns 属性 schema 或 null
   */
  getPropertySchema(pluginId: string, key: string): ConfigurationPropertySchema | null {
    const schema = this.schemas.get(pluginId);
    if (!schema) return null;
    return schema.properties[key] ?? null;
  }

  /**
   * 检查插件是否有已注册的配置
   *
   * @param pluginId 插件 ID
   */
  hasSchema(pluginId: string): boolean {
    return this.schemas.has(pluginId);
  }

  // ==================== 清理 ====================

  /**
   * 彻底清除插件的配置数据（包括 localStorage 中的持久化数据）
   *
   * @param pluginId 插件 ID
   */
  clearPlugin(pluginId: string): void {
    this.schemas.delete(pluginId);
    this.userValues.delete(pluginId);

    // 清理 localStorage
    this.removeFromStorage(pluginId);

    // 清理监听器
    const keysToDelete: string[] = [];
    for (const key of this.changeListeners.keys()) {
      if (key.startsWith(`${pluginId}:`)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.changeListeners.delete(key);
    }
  }

  /**
   * 销毁服务
   */
  dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;

    this.schemas.clear();
    this.userValues.clear();
    this.changeListeners.clear();
    this.globalListeners.clear();
  }

  /** 是否已销毁 */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  // ==================== 诊断 ====================

  /**
   * 获取诊断信息
   */
  getDiagnostics(): ConfigurationServiceDiagnostics {
    const plugins: ConfigurationPluginDiagnostics[] = [];

    for (const [pluginId, schema] of this.schemas) {
      const userMap = this.userValues.get(pluginId);
      const propertyCount = Object.keys(schema.properties).length;
      const overriddenCount = userMap?.size ?? 0;

      const properties: Record<
        string,
        { schema: ConfigurationPropertySchema; currentValue: unknown; isOverridden: boolean }
      > = {};

      for (const [key, propSchema] of Object.entries(schema.properties)) {
        const isOverridden = userMap?.has(key) ?? false;
        properties[key] = {
          schema: propSchema,
          currentValue: this.get(pluginId, key),
          isOverridden,
        };
      }

      plugins.push({
        pluginId,
        title: schema.title,
        propertyCount,
        overriddenCount,
        properties,
      });
    }

    return {
      totalSchemas: this.schemas.size,
      totalListeners: this.changeListeners.size + this.globalListeners.size,
      isDisposed: this._isDisposed,
      plugins,
    };
  }

  // ==================== 内部方法 ====================

  /**
   * 验证值是否符合 schema
   *
   * @returns 错误信息，null 表示验证通过
   */
  private validateValue(value: unknown, schema: ConfigurationPropertySchema): string | null {
    switch (schema.type) {
      case "string":
        if (typeof value !== "string") {
          return `Expected string, got ${typeof value}`;
        }
        break;

      case "number":
        if (typeof value !== "number" || Number.isNaN(value)) {
          return `Expected number, got ${typeof value}`;
        }
        if (schema.minimum !== undefined && value < schema.minimum) {
          return `Value ${value} is below minimum ${schema.minimum}`;
        }
        if (schema.maximum !== undefined && value > schema.maximum) {
          return `Value ${value} is above maximum ${schema.maximum}`;
        }
        break;

      case "boolean":
        if (typeof value !== "boolean") {
          return `Expected boolean, got ${typeof value}`;
        }
        break;

      case "enum":
        if (!schema.enum || !schema.enum.includes(String(value))) {
          return `Value "${value}" is not in enum [${schema.enum?.join(", ") ?? ""}]`;
        }
        break;

      default:
        return `Unknown schema type: ${schema.type}`;
    }

    return null;
  }

  /**
   * 通知配置变更
   */
  private notifyChange(pluginId: string, key: string, newValue: unknown, oldValue: unknown): void {
    const event: ConfigurationChangeEvent = { pluginId, key, newValue, oldValue };

    // 通知 key 级别的监听器
    const listenerKey = `${pluginId}:${key}`;
    const listeners = this.changeListeners.get(listenerKey);
    if (listeners) {
      for (const handler of listeners) {
        try {
          handler(newValue);
        } catch (error) {
          console.error(
            `[ConfigurationService] Error in change listener for "${pluginId}.${key}":`,
            error,
          );
        }
      }
    }

    // 通知全局监听器
    for (const handler of this.globalListeners) {
      try {
        handler(event);
      } catch (error) {
        console.error("[ConfigurationService] Error in global change listener:", error);
      }
    }
  }

  /**
   * 从 localStorage 加载插件的用户设置
   */
  private loadFromStorage(pluginId: string): void {
    if (typeof localStorage === "undefined") return;

    try {
      const storageKey = this.makeStorageKey(pluginId);
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;

      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const userMap = new Map<string, unknown>();

      // 只恢复 schema 中存在的 key（忽略过期的配置）
      const schema = this.schemas.get(pluginId);
      if (schema) {
        for (const [key, value] of Object.entries(parsed)) {
          if (key in schema.properties) {
            // 验证类型
            const validationError = this.validateValue(value, schema.properties[key]);
            if (!validationError) {
              userMap.set(key, value);
            } else {
              console.warn(
                `[ConfigurationService] Ignoring invalid stored value for "${pluginId}.${key}": ${validationError}`,
              );
            }
          }
        }
      }

      if (userMap.size > 0) {
        this.userValues.set(pluginId, userMap);
      }
    } catch (error) {
      console.error(
        `[ConfigurationService] Failed to load config for "${pluginId}" from localStorage:`,
        error,
      );
    }
  }

  /**
   * 保存插件的用户设置到 localStorage
   */
  private saveToStorage(pluginId: string): void {
    if (typeof localStorage === "undefined") return;

    try {
      const storageKey = this.makeStorageKey(pluginId);
      const userMap = this.userValues.get(pluginId);

      if (!userMap || userMap.size === 0) {
        localStorage.removeItem(storageKey);
        return;
      }

      const obj: Record<string, unknown> = {};
      for (const [key, value] of userMap) {
        obj[key] = value;
      }

      localStorage.setItem(storageKey, JSON.stringify(obj));
    } catch (error) {
      console.error(
        `[ConfigurationService] Failed to save config for "${pluginId}" to localStorage:`,
        error,
      );
    }
  }

  /**
   * 从 localStorage 删除插件的配置数据
   */
  private removeFromStorage(pluginId: string): void {
    if (typeof localStorage === "undefined") return;

    try {
      const storageKey = this.makeStorageKey(pluginId);
      localStorage.removeItem(storageKey);
    } catch {
      // 忽略
    }
  }

  /**
   * 生成 localStorage key
   */
  private makeStorageKey(pluginId: string): string {
    return `${this.storagePrefix}${pluginId}`;
  }

  /**
   * 断言未被销毁
   */
  private assertNotDisposed(): void {
    if (this._isDisposed) {
      throw new Error("[ConfigurationService] Service has been disposed.");
    }
  }
}

// ==================== 诊断类型 ====================

export interface ConfigurationServiceDiagnostics {
  totalSchemas: number;
  totalListeners: number;
  isDisposed: boolean;
  plugins: ConfigurationPluginDiagnostics[];
}

export interface ConfigurationPluginDiagnostics {
  pluginId: string;
  title: string;
  propertyCount: number;
  overriddenCount: number;
  properties: Record<
    string,
    {
      schema: ConfigurationPropertySchema;
      currentValue: unknown;
      isOverridden: boolean;
    }
  >;
}
