import type {
  PenElement,
  RectElement,
  CircleElement,
  ArrowElement,
  TextElement,
  CanvasElement,
  AppState,
  Point,
} from "../types";

// ==================== ID 生成 ====================

let idCounter = 0;

/**
 * 生成唯一 ID
 * 使用时间戳 + 自增计数器，确保在单次会话中不会重复
 */
function generateId(): string {
  idCounter += 1;
  return `el_${Date.now()}_${idCounter}`;
}

/**
 * 重置 ID 计数器（仅用于测试）
 */
export function resetIdCounter(): void {
  idCounter = 0;
}

// ==================== 基础属性提取 ====================

/**
 * 从 AppState 中提取当前绘制属性，作为新元素的默认值
 */
function getBaseProps(
  x: number,
  y: number,
  state: Readonly<AppState>,
): Omit<PenElement, "type" | "points"> &
  Omit<RectElement, "type" | "width" | "height" | "borderRadius"> {
  return {
    id: generateId(),
    x,
    y,
    strokeColor: state.currentStrokeColor,
    strokeWidth: state.currentStrokeWidth,
    fillColor: state.currentFillColor,
    opacity: state.currentOpacity,
    isDeleted: false,
  };
}

// ==================== 工厂函数 ====================

/**
 * 创建画笔元素
 */
export function createPenElement(
  startPoint: Point,
  state: Readonly<AppState>,
): PenElement {
  return {
    ...getBaseProps(startPoint.x, startPoint.y, state),
    type: "pen",
    points: [{ x: startPoint.x, y: startPoint.y, pressure: startPoint.pressure }],
  };
}

/**
 * 创建矩形元素
 */
export function createRectElement(
  x: number,
  y: number,
  width: number,
  height: number,
  state: Readonly<AppState>,
): RectElement {
  return {
    ...getBaseProps(x, y, state),
    type: "rect",
    width,
    height,
    borderRadius: 0,
  };
}

/**
 * 创建圆形（椭圆）元素
 */
export function createCircleElement(
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  state: Readonly<AppState>,
): CircleElement {
  return {
    ...getBaseProps(x, y, state),
    type: "circle",
    radiusX,
    radiusY,
  };
}

/**
 * 创建箭头元素
 */
export function createArrowElement(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  state: Readonly<AppState>,
): ArrowElement {
  return {
    ...getBaseProps(startX, startY, state),
    type: "arrow",
    endX,
    endY,
    arrowheadSize: Math.max(8, state.currentStrokeWidth * 3),
  };
}

/**
 * 创建文字元素
 */
export function createTextElement(
  x: number,
  y: number,
  text: string,
  state: Readonly<AppState>,
): TextElement {
  return {
    ...getBaseProps(x, y, state),
    type: "text",
    text,
    fontSize: state.currentFontSize,
    fontFamily: "sans-serif",
  };
}

// ==================== 元素复制 ====================

/**
 * 复制元素（生成新 ID，可选偏移）
 */
export function duplicateElement(
  element: CanvasElement,
  offsetX = 10,
  offsetY = 10,
): CanvasElement {
  const newElement = { ...element };
  newElement.id = generateId();
  newElement.x += offsetX;
  newElement.y += offsetY;

  // 箭头元素需要同时偏移终点
  if (newElement.type === "arrow") {
    (newElement as ArrowElement).endX += offsetX;
    (newElement as ArrowElement).endY += offsetY;
  }

  // 画笔元素需要偏移所有点
  if (newElement.type === "pen") {
    (newElement as PenElement).points = (newElement as PenElement).points.map(
      (p) => ({
        ...p,
        x: p.x + offsetX,
        y: p.y + offsetY,
      }),
    );
  }

  return newElement;
}

// ==================== 元素更新（不可变） ====================

/**
 * 不可变地更新元素的部分属性
 */
export function updateElement<T extends CanvasElement>(
  element: T,
  updates: Partial<T>,
): T {
  return { ...element, ...updates };
}

/**
 * 在元素数组中标记指定 ID 的元素为已删除（不可变）
 */
export function markElementDeleted(
  elements: readonly CanvasElement[],
  id: string,
): CanvasElement[] {
  return elements.map((el) =>
    el.id === id ? { ...el, isDeleted: true } : el,
  );
}

