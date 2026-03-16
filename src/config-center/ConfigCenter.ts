/**
 * 分层配置中心
 *
 * 核心概念：
 * 1. 分层（Layer）- 默认 → 环境 → 用户，后者覆盖前者
 * 2. 类型安全 - TypeScript 泛型确保配置类型正确
 * 3. 热更新 - 监听变化，自动通知订阅者
 * 4. 持久化 - 可选持久化到 localStorage
 *
 * 配置优先级（从低到高）：
 * 1. defaults - 代码中的默认值
 * 2. env - 环境变量/服务端配置
 * 3. user - 用户偏好设置
 *
 * 解决的问题：
 * - 配置散落各处 → 集中管理
 * - 合并逻辑混乱 → 分层覆盖
 * - 类型不安全 → 泛型约束
 */

// ==================== 类型定义 ====================

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

type ConfigListener<T> = (config: T, changedKeys: string[]) => void;

interface ConfigLayer<T> {
  name: string;
  priority: number;
  values: DeepPartial<T>;
}

// ==================== ConfigCenter ====================

/**
 * 分层配置中心
 */
export class ConfigCenter<T extends Record<string, unknown>> {
  private layers: ConfigLayer<T>[] = [];
  private listeners = new Set<ConfigListener<T>>();
  private cachedConfig: T | null = null;
  private storageKey: string | null = null;

  constructor(private defaults: T) {
    // 默认层
    this.layers.push({
      name: "defaults",
      priority: 0,
      values: defaults,
    });
  }

  /**
   * 启用持久化
   */
  enablePersistence(key: string): this {
    this.storageKey = key;
    // 加载已保存的用户配置
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(key);
        if (saved) {
          this.setLayer("user", 100, JSON.parse(saved));
        }
      } catch (e) {
        console.warn("Failed to load config from localStorage:", e);
      }
    }
    return this;
  }

  /**
   * 设置配置层
   */
  setLayer(name: string, priority: number, values: DeepPartial<T>): this {
    // 移除已存在的同名层
    this.layers = this.layers.filter((l) => l.name !== name);

    // 添加新层
    this.layers.push({ name, priority, values });

    // 按优先级排序
    this.layers.sort((a, b) => a.priority - b.priority);

    // 清除缓存
    this.cachedConfig = null;

    // 通知监听者
    this.notifyListeners(Object.keys(values));

    // 持久化用户层
    if (name === "user" && this.storageKey && typeof window !== "undefined") {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(values));
      } catch (e) {
        console.warn("Failed to save config to localStorage:", e);
      }
    }

    return this;
  }

  /**
   * 设置环境配置
   */
  setEnv(values: DeepPartial<T>): this {
    return this.setLayer("env", 50, values);
  }

  /**
   * 设置用户配置
   */
  setUser(values: DeepPartial<T>): this {
    return this.setLayer("user", 100, values);
  }

  /**
   * 更新单个配置项
   */
  set<K extends keyof T>(key: K, value: T[K], layer = "user"): this {
    const existingLayer = this.layers.find((l) => l.name === layer);
    if (existingLayer) {
      (existingLayer.values as Record<string, unknown>)[key as string] = value;
      this.cachedConfig = null;
      this.notifyListeners([key as string]);

      // 持久化
      if (layer === "user" && this.storageKey && typeof window !== "undefined") {
        try {
          localStorage.setItem(this.storageKey, JSON.stringify(existingLayer.values));
        } catch (e) {
          console.warn("Failed to save config to localStorage:", e);
        }
      }
    } else {
      this.setLayer(layer, layer === "user" ? 100 : 50, { [key]: value } as DeepPartial<T>);
    }
    return this;
  }

  /**
   * 获取合并后的完整配置
   */
  getAll(): T {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    // 深度合并所有层
    let result = {} as T;
    for (const layer of this.layers) {
      result = this.deepMerge(result, layer.values as T);
    }

    this.cachedConfig = result;
    return result;
  }

  /**
   * 获取单个配置项
   */
  get<K extends keyof T>(key: K): T[K] {
    return this.getAll()[key];
  }

  /**
   * 获取嵌套配置（点号路径）
   */
  getPath<R = unknown>(path: string): R {
    const keys = path.split(".");
    let current: unknown = this.getAll();

    for (const key of keys) {
      if (current === null || current === undefined) return undefined as R;
      current = (current as Record<string, unknown>)[key];
    }

    return current as R;
  }

  /**
   * 重置用户配置
   */
  resetUser(): this {
    this.layers = this.layers.filter((l) => l.name !== "user");
    this.cachedConfig = null;
    this.notifyListeners(["*"]);

    if (this.storageKey && typeof window !== "undefined") {
      localStorage.removeItem(this.storageKey);
    }

    return this;
  }

  /**
   * 订阅配置变化
   */
  subscribe(listener: ConfigListener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 获取所有配置层信息
   */
  getLayers(): { name: string; priority: number; keys: string[] }[] {
    return this.layers.map((l) => ({
      name: l.name,
      priority: l.priority,
      keys: Object.keys(l.values),
    }));
  }

  /**
   * 获取某个配置项的来源层
   */
  getSource<K extends keyof T>(key: K): string {
    // 从高优先级到低优先级查找
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const layer = this.layers[i];
      if (key in layer.values) {
        return layer.name;
      }
    }
    return "defaults";
  }

  // ==================== Private ====================

  private deepMerge<U extends Record<string, unknown>>(target: U, source: U): U {
    const result = { ...target };

    for (const key of Object.keys(source) as Array<keyof U>) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (
        sourceValue !== undefined &&
        typeof sourceValue === "object" &&
        sourceValue !== null &&
        !Array.isArray(sourceValue) &&
        typeof targetValue === "object" &&
        targetValue !== null &&
        !Array.isArray(targetValue)
      ) {
        result[key] = this.deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>,
        ) as U[keyof U];
      } else if (sourceValue !== undefined) {
        result[key] = sourceValue;
      }
    }

    return result;
  }

  private notifyListeners(changedKeys: string[]): void {
    const config = this.getAll();
    for (const listener of this.listeners) {
      try {
        listener(config, changedKeys);
      } catch (e) {
        console.error("Config listener error:", e);
      }
    }
  }
}

// ==================== React 集成 ====================

import { createContext, useContext, useState, useEffect, type ReactNode, createElement } from "react";

const ConfigContext = createContext<ConfigCenter<Record<string, unknown>> | null>(null);

/**
 * 配置 Provider
 */
export function ConfigProvider<T extends Record<string, unknown>>({
  config,
  children,
}: {
  config: ConfigCenter<T>;
  children: ReactNode;
}) {
  return createElement(
    ConfigContext.Provider,
    { value: config as ConfigCenter<Record<string, unknown>> },
    children,
  );
}

/**
 * 使用配置 Hook
 */
export function useConfig<T extends Record<string, unknown>>(): {
  config: T;
  get: <K extends keyof T>(key: K) => T[K];
  set: <K extends keyof T>(key: K, value: T[K]) => void;
  reset: () => void;
} {
  const configCenter = useContext(ConfigContext) as ConfigCenter<T> | null;
  if (!configCenter) throw new Error("useConfig must be used within ConfigProvider");

  const [config, setConfig] = useState<T>(configCenter.getAll());

  useEffect(() => {
    return configCenter.subscribe((newConfig) => {
      setConfig(newConfig);
    });
  }, [configCenter]);

  return {
    config,
    get: (key) => config[key],
    set: (key, value) => configCenter.set(key, value),
    reset: () => configCenter.resetUser(),
  };
}
