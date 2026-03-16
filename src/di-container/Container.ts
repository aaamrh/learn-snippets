/**
 * 轻量级依赖注入容器
 *
 * 核心概念：
 * 1. Token（标识符）- 用于标识依赖
 * 2. Provider（提供者）- 描述如何创建依赖
 * 3. Scope（作用域）- singleton / transient / scoped
 * 4. Container（容器）- 管理依赖的注册和解析
 *
 * 解决的问题：
 * - 依赖硬编码 → 通过 Token 解耦
 * - 难以测试 → 可以注入 Mock
 * - 切换实现麻烦 → 只需重新注册
 */

// ==================== Token ====================

/**
 * 依赖标识符
 * 可以是字符串、Symbol 或类本身
 */
export type Token<T = unknown> = string | symbol | (new (...args: unknown[]) => T);

/**
 * 创建类型安全的 Token
 */
export function createToken<T>(name: string): Token<T> {
  return Symbol.for(name) as Token<T>;
}

// ==================== Provider ====================

/**
 * 作用域
 * - singleton: 全局单例，只创建一次
 * - transient: 每次解析都创建新实例
 * - scoped: 在同一个 scope 内单例
 */
export type Scope = "singleton" | "transient" | "scoped";

/**
 * 提供者类型
 */
export type Provider<T> =
  | { useClass: new (...args: unknown[]) => T; scope?: Scope }
  | { useFactory: (container: Container) => T; scope?: Scope }
  | { useValue: T };

// ==================== Container ====================

interface Registration<T = unknown> {
  provider: Provider<T>;
  instance?: T; // singleton 缓存
}

/**
 * 依赖注入容器
 */
export class Container {
  private registrations = new Map<Token<unknown>, Registration>();
  private scopedInstances = new Map<Token<unknown>, unknown>();
  private parent?: Container;

  constructor(parent?: Container) {
    this.parent = parent;
  }

  /**
   * 注册依赖
   */
  register<T>(token: Token<T>, provider: Provider<T>): this {
    this.registrations.set(token, { provider });
    return this;
  }

  /**
   * 快捷方法：注册单例
   */
  registerSingleton<T>(token: Token<T>, ClassOrFactory: new () => T | ((c: Container) => T)): this {
    if (typeof ClassOrFactory === "function" && ClassOrFactory.prototype) {
      return this.register(token, {
        useClass: ClassOrFactory as new () => T,
        scope: "singleton",
      });
    }
    return this.register(token, {
      useFactory: ClassOrFactory as (c: Container) => T,
      scope: "singleton",
    });
  }

  /**
   * 快捷方法：注册值
   */
  registerValue<T>(token: Token<T>, value: T): this {
    return this.register(token, { useValue: value });
  }

  /**
   * 解析依赖
   */
  resolve<T>(token: Token<T>): T {
    // 先在当前容器查找
    let registration = this.registrations.get(token) as Registration<T> | undefined;

    // 没找到则向父容器查找
    if (!registration && this.parent) {
      return this.parent.resolve(token);
    }

    if (!registration) {
      // 如果 token 是类，尝试自动创建
      if (typeof token === "function") {
        return new (token as new () => T)();
      }
      throw new Error(`No provider registered for token: ${String(token)}`);
    }

    return this.createInstance(token, registration);
  }

  /**
   * 尝试解析，失败返回 undefined
   */
  tryResolve<T>(token: Token<T>): T | undefined {
    try {
      return this.resolve(token);
    } catch {
      return undefined;
    }
  }

  /**
   * 检查是否已注册
   */
  has(token: Token<unknown>): boolean {
    return this.registrations.has(token) || (this.parent?.has(token) ?? false);
  }

  /**
   * 创建子容器（用于 scoped 作用域）
   */
  createScope(): Container {
    return new Container(this);
  }

  /**
   * 清除 scoped 缓存
   */
  clearScope(): void {
    this.scopedInstances.clear();
  }

  /**
   * 获取所有已注册的 Token
   */
  getRegisteredTokens(): Token<unknown>[] {
    const tokens = new Set<Token<unknown>>(this.registrations.keys());
    if (this.parent) {
      for (const token of this.parent.getRegisteredTokens()) {
        tokens.add(token);
      }
    }
    return Array.from(tokens);
  }

  // ==================== Private ====================

  private createInstance<T>(token: Token<T>, registration: Registration<T>): T {
    const { provider } = registration;

    // useValue: 直接返回值
    if ("useValue" in provider) {
      return provider.useValue;
    }

    const scope: Scope = ("scope" in provider && provider.scope) || "transient";

    // singleton: 检查缓存
    if (scope === "singleton" && registration.instance !== undefined) {
      return registration.instance;
    }

    // scoped: 检查 scoped 缓存
    if (scope === "scoped" && this.scopedInstances.has(token)) {
      return this.scopedInstances.get(token) as T;
    }

    // 创建实例
    let instance: T;
    if ("useClass" in provider) {
      instance = new provider.useClass() as T;
    } else {
      instance = provider.useFactory(this);
    }

    // 缓存
    if (scope === "singleton") {
      registration.instance = instance;
    } else if (scope === "scoped") {
      this.scopedInstances.set(token, instance);
    }

    return instance;
  }
}

// ==================== 装饰器（可选） ====================

/**
 * 依赖注入元数据存储
 */
const injectMetadata = new Map<new (...args: unknown[]) => unknown, Token<unknown>[]>();

/**
 * 标记构造函数参数需要注入
 * 注意：需要 TypeScript 装饰器支持
 */
export function Inject(token: Token<unknown>) {
  return function (target: unknown, _propertyKey: string | symbol | undefined, parameterIndex: number) {
    const existingTokens = injectMetadata.get(target as new (...args: unknown[]) => unknown) || [];
    existingTokens[parameterIndex] = token;
    injectMetadata.set(target as new (...args: unknown[]) => unknown, existingTokens);
  };
}

/**
 * 获取类的注入元数据
 */
export function getInjectTokens(target: new (...args: unknown[]) => unknown): Token<unknown>[] {
  return injectMetadata.get(target) || [];
}

// ==================== 全局容器 ====================

/**
 * 默认的全局容器实例
 */
export const globalContainer = new Container();
