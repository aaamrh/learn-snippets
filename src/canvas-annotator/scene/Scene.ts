import type { CanvasElement } from "../types";

/**
 * Scene -- 元素集合管理器（对标 Excalidraw Scene）
 *
 * 核心职责：
 * 1. 维护元素数组和 O(1) 的 ID -> Element 查找 Map
 * 2. 通过 nonce 机制提供缓存失效信号（每次 replaceElements 递增 nonce）
 * 3. 提供 memoized 的 getVisibleElements（仅 nonce 变化时重新过滤）
 *
 * 设计要点：
 * - replaceElements() 接收不可变数组，重建内部 Map
 * - Scene 不持有 React state，由外部（page.tsx）管理实例生命周期
 * - 对标 Excalidraw packages/excalidraw/scene/Scene.ts
 */
export class Scene {
  private elementsMap: Map<string, CanvasElement> = new Map();
  private elements: readonly CanvasElement[] = [];
  private nonce = 0;

  /** 可见元素缓存 */
  private visibleElementsCache: readonly CanvasElement[] = [];
  private visibleElementsCacheNonce = -1;

  /**
   * 替换全部元素（不可变 -- 传入新数组）
   * 每次调用重建 elementsMap 并递增 nonce
   */
  replaceElements(nextElements: readonly CanvasElement[]): void {
    this.elements = nextElements;
    this.elementsMap = new Map(nextElements.map((el) => [el.id, el]));
    this.nonce += 1;
  }

  /**
   * O(1) 按 ID 查找元素
   */
  getElement(id: string): CanvasElement | undefined {
    return this.elementsMap.get(id);
  }

  /**
   * 返回所有元素（包括已删除的）
   */
  getElements(): readonly CanvasElement[] {
    return this.elements;
  }

  /**
   * 返回可见元素（!isDeleted）
   * 内部缓存：仅当 nonce 变化时重新过滤
   */
  getVisibleElements(): readonly CanvasElement[] {
    if (this.visibleElementsCacheNonce !== this.nonce) {
      this.visibleElementsCache = this.elements.filter((el) => !el.isDeleted);
      this.visibleElementsCacheNonce = this.nonce;
    }
    return this.visibleElementsCache;
  }

  /**
   * 返回当前 nonce（用于外部缓存失效判断）
   * nonce 在每次 replaceElements 时递增
   */
  getNonce(): number {
    return this.nonce;
  }
}
