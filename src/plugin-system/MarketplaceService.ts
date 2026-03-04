// ==================== MarketplaceService ====================
//
// 模拟插件市场的远程加载服务。
//
// 对标 VS Code 的 Extension Marketplace：
// - 浏览/搜索可用插件
// - 获取插件详情（描述、评分、下载量等）
// - "下载" 插件 Manifest 和代码
// - 版本管理（检查更新）
//
// 实现方式：
// - 使用内存数据 + 模拟延迟模拟远程服务
// - 在真实场景中，这些方法会改为 fetch() 调用
// - 支持从 public/marketplace/ 目录加载静态资源（可选）
//
// 设计原则：
// - MarketplaceService 是纯数据服务，不依赖 UI
// - 所有方法返回 Promise（模拟异步网络请求）
// - 通过回调/事件通知下载进度等状态
// - 支持 Disposable 接口，集成到 NewPluginHost 的生命周期
//
// 与其他模块的关系：
// | 模块              | 职责                                          |
// |-------------------|-----------------------------------------------|
// | NewPluginHost     | 持有 MarketplaceService 实例                   |
// | PluginRegistry    | 安装从 marketplace 下载的 Manifest              |
// | ActivationManager | 使用远程 loader 加载插件代码                    |
// | page.tsx          | 渲染市场 UI（在线 / 已安装切换、搜索等）         |

import type { PluginManifest, PluginEntry, Disposable } from "./manifest-types";

// ==================== 类型定义 ====================

/**
 * MarketplacePlugin — 市场中的插件信息
 *
 * 包含展示用的元数据（评分、下载量等），
 * 以及获取 Manifest 和代码的 URL。
 */
export interface MarketplacePlugin {
  /** 插件 ID（与 PluginManifest.id 一致） */
  id: string;
  /** 显示名称 */
  name: string;
  /** 版本号（semver） */
  version: string;
  /** 插件描述 */
  description: string;
  /** 作者 */
  author: string;
  /** 图标（emoji 或 URL） */
  icon: string;
  /** 分类 */
  category: string;
  /** 下载次数 */
  downloadCount: number;
  /** 评分（0-5） */
  rating: number;
  /** 评分人数 */
  ratingCount: number;
  /** Manifest 文件 URL */
  manifestUrl: string;
  /** 插件代码 URL */
  codeUrl: string;
  /** 标签列表 */
  tags: string[];
  /** 最后更新时间 */
  updatedAt: number;
  /** 发布时间 */
  publishedAt: number;
  /** 文件大小（字节，模拟值） */
  size: number;
  /** 兼容的宿主版本范围 */
  hostVersionRange?: string;
  /** 截图/预览图 URL 列表 */
  screenshots?: string[];
  /** 仓库 URL */
  repositoryUrl?: string;
  /** 许可证 */
  license?: string;
}

/**
 * 市场搜索选项
 */
export interface MarketplaceSearchOptions {
  /** 搜索关键词（匹配 name、description、tags） */
  query?: string;
  /** 按分类过滤 */
  category?: string;
  /** 按标签过滤 */
  tag?: string;
  /** 排序方式 */
  sortBy?: "popularity" | "rating" | "name" | "updated" | "published";
  /** 排序方向 */
  sortOrder?: "asc" | "desc";
  /** 页码（从 1 开始） */
  page?: number;
  /** 每页数量 */
  pageSize?: number;
}

/**
 * 搜索结果
 */
export interface MarketplaceSearchResult {
  /** 匹配的插件列表（当前页） */
  plugins: MarketplacePlugin[];
  /** 总匹配数 */
  total: number;
  /** 当前页码 */
  page: number;
  /** 每页数量 */
  pageSize: number;
  /** 是否有更多页 */
  hasMore: boolean;
}

/**
 * 下载进度事件
 */
export interface DownloadProgressEvent {
  /** 插件 ID */
  pluginId: string;
  /** 下载阶段 */
  phase: "manifest" | "code" | "complete" | "error";
  /** 进度百分比（0-100） */
  progress: number;
  /** 错误信息（仅当 phase 为 "error" 时） */
  error?: string;
}

/**
 * 下载进度监听器
 */
export type DownloadProgressListener = (event: DownloadProgressEvent) => void;

/**
 * 版本更新信息
 */
export interface UpdateInfo {
  /** 插件 ID */
  pluginId: string;
  /** 当前安装的版本 */
  currentVersion: string;
  /** 最新可用版本 */
  latestVersion: string;
  /** 是否有更新 */
  hasUpdate: boolean;
}

/**
 * MarketplaceService 配置
 */
export interface MarketplaceServiceConfig {
  /** 市场注册表 URL（默认从内存模拟） */
  registryUrl?: string;
  /** 网络请求模拟延迟范围（ms，默认 [200, 800]） */
  simulatedLatency?: [number, number];
  /** 下载进度回调 */
  onDownloadProgress?: DownloadProgressListener;
  /** 已有的内存插件注册表（用于模拟，默认使用内置数据） */
  plugins?: MarketplacePlugin[];
  /** 已有的 PluginEntry 映射（用于模拟代码下载） */
  entryMap?: Map<string, PluginEntry>;
  /** 已有的 Manifest 映射（用于模拟 Manifest 下载） */
  manifestMap?: Map<string, PluginManifest>;
}

// ==================== MarketplaceService ====================

/**
 * MarketplaceService — 插件市场服务
 *
 * 模拟远程插件市场，提供搜索、下载、版本检查等功能。
 *
 * 用法：
 * ```ts
 * const marketplace = new MarketplaceService({
 *   onDownloadProgress: (event) => {
 *     console.log(`${event.pluginId}: ${event.phase} ${event.progress}%`);
 *   },
 * });
 *
 * // 搜索插件
 * const results = await marketplace.search({ query: "翻译", sortBy: "popularity" });
 *
 * // 下载并安装
 * const manifest = await marketplace.fetchManifest("translate");
 * const entry = await marketplace.loadPluginCode("translate");
 *
 * // 检查更新
 * const updates = await marketplace.checkUpdates(
 *   new Map([["translate", "1.0.0"]])
 * );
 * ```
 */
export class MarketplaceService implements Disposable {
  // ── 存储 ──

  /** 可用插件注册表（内存） */
  private registry: MarketplacePlugin[] = [];

  /** PluginEntry 映射（模拟代码下载） */
  private entryMap: Map<string, PluginEntry> = new Map();

  /** PluginManifest 映射（模拟 Manifest 下载） */
  private manifestMap: Map<string, PluginManifest> = new Map();

  /** 下载进度监听器 */
  private progressListener: DownloadProgressListener | null = null;

  /** 模拟延迟范围 [min, max] ms */
  private latencyRange: [number, number];

  /** 注册表 URL（暂时未使用，预留给真实远程场景） */
  private registryUrl: string | null;

  /** 是否已销毁 */
  private _isDisposed: boolean = false;

  // ── 构造 ──

  constructor(config?: MarketplaceServiceConfig) {
    this.latencyRange = config?.simulatedLatency ?? [200, 800];
    this.progressListener = config?.onDownloadProgress ?? null;
    this.registryUrl = config?.registryUrl ?? null;

    // 使用传入的数据或内置数据
    if (config?.plugins) {
      this.registry = [...config.plugins];
    }
    if (config?.entryMap) {
      this.entryMap = new Map(config.entryMap);
    }
    if (config?.manifestMap) {
      this.manifestMap = new Map(config.manifestMap);
    }
  }

  // ==================== 注册表管理 ====================

  /**
   * 注册插件到市场（用于模拟，生产环境不需要）
   *
   * @param plugin  市场插件信息
   * @param manifest 插件 Manifest（可选，用于模拟 fetchManifest）
   * @param entry   插件入口（可选，用于模拟 loadPluginCode）
   */
  registerPlugin(
    plugin: MarketplacePlugin,
    manifest?: PluginManifest,
    entry?: PluginEntry,
  ): void {
    this.assertNotDisposed();

    // 检查是否已存在（更新版本）
    const existingIndex = this.registry.findIndex((p) => p.id === plugin.id);
    if (existingIndex >= 0) {
      this.registry[existingIndex] = plugin;
    } else {
      this.registry.push(plugin);
    }

    if (manifest) {
      this.manifestMap.set(plugin.id, manifest);
    }
    if (entry) {
      this.entryMap.set(plugin.id, entry);
    }
  }

  /**
   * 批量注册插件
   */
  registerPlugins(
    items: Array<{
      plugin: MarketplacePlugin;
      manifest?: PluginManifest;
      entry?: PluginEntry;
    }>,
  ): void {
    for (const item of items) {
      this.registerPlugin(item.plugin, item.manifest, item.entry);
    }
  }

  /**
   * 从注册表中移除插件
   */
  removePlugin(pluginId: string): void {
    this.registry = this.registry.filter((p) => p.id !== pluginId);
    this.entryMap.delete(pluginId);
    this.manifestMap.delete(pluginId);
  }

  // ==================== 搜索与浏览 ====================

  /**
   * 获取所有可用插件
   *
   * @returns 所有插件列表
   */
  async getAvailablePlugins(): Promise<MarketplacePlugin[]> {
    this.assertNotDisposed();
    await this.simulateLatency();

    return [...this.registry];
  }

  /**
   * 搜索插件
   *
   * 支持关键词匹配（name、description、tags）、分类过滤、排序、分页。
   *
   * @param options 搜索选项
   * @returns 搜索结果
   */
  async search(options: MarketplaceSearchOptions = {}): Promise<MarketplaceSearchResult> {
    this.assertNotDisposed();
    await this.simulateLatency();

    let results = [...this.registry];

    // 1. 关键词过滤
    if (options.query && options.query.trim() !== "") {
      const query = options.query.toLowerCase().trim();
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query) ||
          p.id.toLowerCase().includes(query) ||
          p.tags.some((t) => t.toLowerCase().includes(query)) ||
          p.author.toLowerCase().includes(query),
      );
    }

    // 2. 分类过滤
    if (options.category) {
      const category = options.category.toLowerCase();
      results = results.filter((p) => p.category.toLowerCase() === category);
    }

    // 3. 标签过滤
    if (options.tag) {
      const tag = options.tag.toLowerCase();
      results = results.filter((p) =>
        p.tags.some((t) => t.toLowerCase() === tag),
      );
    }

    // 4. 排序
    const sortBy = options.sortBy ?? "popularity";
    const sortOrder = options.sortOrder ?? "desc";
    const multiplier = sortOrder === "desc" ? -1 : 1;

    results.sort((a, b) => {
      switch (sortBy) {
        case "popularity":
          return (a.downloadCount - b.downloadCount) * multiplier;
        case "rating":
          return (a.rating - b.rating) * multiplier;
        case "name":
          return a.name.localeCompare(b.name) * multiplier;
        case "updated":
          return (a.updatedAt - b.updatedAt) * multiplier;
        case "published":
          return (a.publishedAt - b.publishedAt) * multiplier;
        default:
          return 0;
      }
    });

    // 5. 分页
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
    const total = results.length;
    const startIndex = (page - 1) * pageSize;
    const paginatedResults = results.slice(startIndex, startIndex + pageSize);

    return {
      plugins: paginatedResults,
      total,
      page,
      pageSize,
      hasMore: startIndex + pageSize < total,
    };
  }

  /**
   * 获取插件详情
   *
   * @param pluginId 插件 ID
   * @returns 插件信息，不存在则返回 null
   */
  async getPluginDetail(pluginId: string): Promise<MarketplacePlugin | null> {
    this.assertNotDisposed();
    await this.simulateLatency();

    return this.registry.find((p) => p.id === pluginId) ?? null;
  }

  /**
   * 获取可用分类列表
   *
   * @returns 分类列表（去重）
   */
  async getCategories(): Promise<string[]> {
    this.assertNotDisposed();
    await this.simulateLatency(50, 150);

    const categories = new Set(this.registry.map((p) => p.category));
    return Array.from(categories).sort();
  }

  /**
   * 获取可用标签列表
   *
   * @returns 标签列表（去重，按频率排序）
   */
  async getTags(): Promise<string[]> {
    this.assertNotDisposed();
    await this.simulateLatency(50, 150);

    const tagCount = new Map<string, number>();
    for (const plugin of this.registry) {
      for (const tag of plugin.tags) {
        tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
      }
    }

    return Array.from(tagCount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }

  /**
   * 获取热门插件（按下载量排序）
   *
   * @param limit 返回数量（默认 10）
   */
  async getPopularPlugins(limit: number = 10): Promise<MarketplacePlugin[]> {
    const result = await this.search({
      sortBy: "popularity",
      sortOrder: "desc",
      pageSize: limit,
    });
    return result.plugins;
  }

  /**
   * 获取最近更新的插件
   *
   * @param limit 返回数量（默认 10）
   */
  async getRecentlyUpdated(limit: number = 10): Promise<MarketplacePlugin[]> {
    const result = await this.search({
      sortBy: "updated",
      sortOrder: "desc",
      pageSize: limit,
    });
    return result.plugins;
  }

  // ==================== 下载 ====================

  /**
   * 下载 Manifest
   *
   * 在模拟模式下从内存中获取，
   * 在真实模式下通过 fetch(manifestUrl) 获取。
   *
   * @param pluginId 插件 ID
   * @returns 插件 Manifest
   * @throws 如果插件不存在
   */
  async fetchManifest(pluginId: string): Promise<PluginManifest> {
    this.assertNotDisposed();

    this.emitProgress(pluginId, "manifest", 0);

    await this.simulateLatency(100, 300);
    this.emitProgress(pluginId, "manifest", 50);

    // 从内存映射中获取
    const manifest = this.manifestMap.get(pluginId);
    if (manifest) {
      this.emitProgress(pluginId, "manifest", 100);
      return { ...manifest };
    }

    // 尝试远程加载（预留接口）
    const plugin = this.registry.find((p) => p.id === pluginId);
    if (plugin && plugin.manifestUrl) {
      try {
        const response = await fetch(plugin.manifestUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = (await response.json()) as PluginManifest;
        this.emitProgress(pluginId, "manifest", 100);
        // 缓存到内存
        this.manifestMap.set(pluginId, data);
        return data;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.emitProgress(pluginId, "error", 0, `Failed to fetch manifest: ${message}`);
        throw new Error(
          `[MarketplaceService] Failed to fetch manifest for "${pluginId}": ${message}`,
        );
      }
    }

    this.emitProgress(pluginId, "error", 0, "Plugin not found");
    throw new Error(
      `[MarketplaceService] Plugin "${pluginId}" not found in marketplace.`,
    );
  }

  /**
   * 下载并加载插件代码
   *
   * 在模拟模式下从内存中获取 PluginEntry，
   * 在真实模式下通过 fetch(codeUrl) 获取并执行。
   *
   * @param pluginId 插件 ID
   * @returns 插件入口对象
   * @throws 如果插件不存在或加载失败
   */
  async loadPluginCode(pluginId: string): Promise<PluginEntry> {
    this.assertNotDisposed();

    this.emitProgress(pluginId, "code", 0);

    // 模拟下载进度（分多步推进）
    await this.simulateLatency(100, 200);
    this.emitProgress(pluginId, "code", 25);
    await this.simulateLatency(100, 200);
    this.emitProgress(pluginId, "code", 50);
    await this.simulateLatency(100, 200);
    this.emitProgress(pluginId, "code", 75);

    // 从内存映射中获取
    const entry = this.entryMap.get(pluginId);
    if (entry) {
      this.emitProgress(pluginId, "code", 100);
      this.emitProgress(pluginId, "complete", 100);

      // 模拟下载计数递增
      const plugin = this.registry.find((p) => p.id === pluginId);
      if (plugin) {
        plugin.downloadCount++;
      }

      return entry;
    }

    // 尝试远程加载
    const plugin = this.registry.find((p) => p.id === pluginId);
    if (plugin && plugin.codeUrl) {
      try {
        const response = await fetch(plugin.codeUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const codeText = await response.text();

        // 使用 Blob URL 执行代码（简化版，真实环境需要更安全的沙箱加载）
        const blob = new Blob([codeText], { type: "application/javascript" });
        const blobUrl = URL.createObjectURL(blob);
        try {
          const module = await import(/* @vite-ignore */ blobUrl);
          const loadedEntry = (module.default ?? module) as PluginEntry;

          this.emitProgress(pluginId, "code", 100);
          this.emitProgress(pluginId, "complete", 100);

          // 缓存
          this.entryMap.set(pluginId, loadedEntry);
          plugin.downloadCount++;

          return loadedEntry;
        } finally {
          URL.revokeObjectURL(blobUrl);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.emitProgress(pluginId, "error", 0, `Failed to load code: ${message}`);
        throw new Error(
          `[MarketplaceService] Failed to load code for "${pluginId}": ${message}`,
        );
      }
    }

    this.emitProgress(pluginId, "error", 0, "Plugin code not found");
    throw new Error(
      `[MarketplaceService] Plugin code for "${pluginId}" not found in marketplace.`,
    );
  }

  /**
   * 一站式下载：同时获取 Manifest 和 Code
   *
   * @param pluginId 插件 ID
   * @returns { manifest, entry }
   */
  async downloadPlugin(
    pluginId: string,
  ): Promise<{ manifest: PluginManifest; entry: PluginEntry }> {
    const manifest = await this.fetchManifest(pluginId);
    const entry = await this.loadPluginCode(pluginId);
    return { manifest, entry };
  }

  // ==================== 版本管理 ====================

  /**
   * 检查已安装的插件是否有更新
   *
   * @param installedPlugins pluginId → currentVersion 的映射
   * @returns 更新信息列表
   */
  async checkUpdates(
    installedPlugins: Map<string, string>,
  ): Promise<UpdateInfo[]> {
    this.assertNotDisposed();
    await this.simulateLatency();

    const updates: UpdateInfo[] = [];

    for (const [pluginId, currentVersion] of installedPlugins) {
      const marketplacePlugin = this.registry.find((p) => p.id === pluginId);
      if (!marketplacePlugin) continue;

      const hasUpdate = this.compareVersions(
        marketplacePlugin.version,
        currentVersion,
      ) > 0;

      updates.push({
        pluginId,
        currentVersion,
        latestVersion: marketplacePlugin.version,
        hasUpdate,
      });
    }

    return updates;
  }

  /**
   * 检查单个插件是否有更新
   *
   * @param pluginId       插件 ID
   * @param currentVersion 当前安装的版本
   * @returns 更新信息
   */
  async checkUpdate(pluginId: string, currentVersion: string): Promise<UpdateInfo | null> {
    const updates = await this.checkUpdates(new Map([[pluginId, currentVersion]]));
    return updates[0] ?? null;
  }

  // ==================== 设置进度监听器 ====================

  /**
   * 设置下载进度监听器
   */
  setProgressListener(listener: DownloadProgressListener | null): void {
    this.progressListener = listener;
  }

  // ==================== 生命周期 ====================

  /**
   * 销毁服务
   */
  dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;

    this.registry = [];
    this.entryMap.clear();
    this.manifestMap.clear();
    this.progressListener = null;
  }

  /** 是否已销毁 */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  // ==================== 诊断 ====================

  /**
   * 获取诊断信息
   */
  getDiagnostics(): MarketplaceServiceDiagnostics {
    return {
      totalPlugins: this.registry.length,
      totalEntries: this.entryMap.size,
      totalManifests: this.manifestMap.size,
      isDisposed: this._isDisposed,
      hasProgressListener: this.progressListener !== null,
      registryUrl: this.registryUrl,
      categories: [...new Set(this.registry.map((p) => p.category))],
      plugins: this.registry.map((p) => ({
        id: p.id,
        name: p.name,
        version: p.version,
        category: p.category,
        downloadCount: p.downloadCount,
        rating: p.rating,
        hasEntry: this.entryMap.has(p.id),
        hasManifest: this.manifestMap.has(p.id),
      })),
    };
  }

  // ==================== 内部方法 ====================

  /**
   * 模拟网络延迟
   */
  private async simulateLatency(minMs?: number, maxMs?: number): Promise<void> {
    const min = minMs ?? this.latencyRange[0];
    const max = maxMs ?? this.latencyRange[1];
    const delay = min + Math.random() * (max - min);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * 发送下载进度事件
   */
  private emitProgress(
    pluginId: string,
    phase: DownloadProgressEvent["phase"],
    progress: number,
    error?: string,
  ): void {
    if (!this.progressListener) return;

    try {
      this.progressListener({ pluginId, phase, progress, error });
    } catch (err) {
      console.error("[MarketplaceService] Error in progress listener:", err);
    }
  }

  /**
   * 简化版 semver 比较
   *
   * 比较两个版本号字符串（如 "1.2.3" 和 "1.3.0"）
   *
   * @returns 正数表示 a > b，负数表示 a < b，0 表示相等
   */
  private compareVersions(a: string, b: string): number {
    const partsA = a.split(".").map(Number);
    const partsB = b.split(".").map(Number);
    const maxLen = Math.max(partsA.length, partsB.length);

    for (let i = 0; i < maxLen; i++) {
      const numA = partsA[i] ?? 0;
      const numB = partsB[i] ?? 0;
      if (numA !== numB) {
        return numA - numB;
      }
    }

    return 0;
  }

  /**
   * 断言未被销毁
   */
  private assertNotDisposed(): void {
    if (this._isDisposed) {
      throw new Error("[MarketplaceService] Service has been disposed.");
    }
  }
}

// ==================== 工厂函数 ====================

/**
 * 从 V2PluginDescriptor 数组创建 MarketplacePlugin 数据
 *
 * 将现有的 Demo 插件描述转换为市场插件信息，
 * 模拟一个"从远程加载"的场景。
 *
 * @param descriptors V2PluginDescriptor 数组（从 plugins/v2/index.ts 导入）
 * @returns MarketplacePlugin 数组
 */
export function createMarketplacePluginsFromDescriptors(
  descriptors: Array<{
    manifest: PluginManifest;
    entry: PluginEntry;
    category: string;
    shortDescription: string;
  }>,
): Array<{
  plugin: MarketplacePlugin;
  manifest: PluginManifest;
  entry: PluginEntry;
}> {
  const now = Date.now();

  return descriptors.map((desc, index) => {
    const m = desc.manifest;

    const plugin: MarketplacePlugin = {
      id: m.id,
      name: m.name,
      version: m.version,
      description: m.description ?? desc.shortDescription,
      author: m.author ?? "Demo",
      icon: m.icon ?? "📦",
      category: desc.category,
      downloadCount: Math.floor(1000 + Math.random() * 9000),
      rating: Math.round((3 + Math.random() * 2) * 10) / 10,
      ratingCount: Math.floor(10 + Math.random() * 200),
      manifestUrl: `/marketplace/${m.id}/manifest.json`,
      codeUrl: `/marketplace/${m.id}/index.js`,
      tags: extractTags(m, desc.category),
      updatedAt: now - index * 86400000, // 每个插件间隔一天
      publishedAt: now - (index + 30) * 86400000,
      size: Math.floor(5000 + Math.random() * 50000),
      license: "MIT",
    };

    return {
      plugin,
      manifest: m,
      entry: desc.entry,
    };
  });
}

/**
 * 从 Manifest 中提取标签
 */
function extractTags(manifest: PluginManifest, category: string): string[] {
  const tags = new Set<string>();

  tags.add(category);

  // 从 activationEvents 推断标签
  for (const event of manifest.activationEvents) {
    if (event === "onStartup") {
      tags.add("startup");
    } else if (event.startsWith("onCommand:")) {
      tags.add("command");
    } else if (event.startsWith("onEvent:")) {
      tags.add("event-driven");
    }
  }

  // 从 permissions 推断标签
  if (manifest.permissions.some((p) => p.startsWith("editor:"))) {
    tags.add("editor");
  }
  if (manifest.permissions.some((p) => p.startsWith("statusBar:"))) {
    tags.add("statusbar");
  }
  if (manifest.permissions.includes("ui:selectionToolbar")) {
    tags.add("toolbar");
  }
  if (manifest.permissions.includes("storage:get") || manifest.permissions.includes("storage:set")) {
    tags.add("storage");
  }

  // 从 contributes 推断标签
  if (manifest.contributes) {
    if (manifest.contributes.keybindings && manifest.contributes.keybindings.length > 0) {
      tags.add("keybinding");
    }
    if (manifest.contributes.menus && manifest.contributes.menus.length > 0) {
      tags.add("context-menu");
    }
    if (manifest.contributes.configuration) {
      tags.add("configurable");
    }
    if (manifest.contributes.views) {
      tags.add("view");
    }
  }

  // 从依赖推断
  if (manifest.dependencies && manifest.dependencies.length > 0) {
    tags.add("has-dependencies");
  }

  return Array.from(tags);
}

// ==================== 诊断类型 ====================

export interface MarketplaceServiceDiagnostics {
  totalPlugins: number;
  totalEntries: number;
  totalManifests: number;
  isDisposed: boolean;
  hasProgressListener: boolean;
  registryUrl: string | null;
  categories: string[];
  plugins: Array<{
    id: string;
    name: string;
    version: string;
    category: string;
    downloadCount: number;
    rating: number;
    hasEntry: boolean;
    hasManifest: boolean;
  }>;
}
