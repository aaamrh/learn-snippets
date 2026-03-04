import type {
  CanvasElement,
  PenElement,
  ArrowElement,
  RectElement,
  CircleElement,
  TextElement,
  HandlePosition,
  BoundingBox,
} from "../types";
import { getElementBoundingBox } from "./renderer";

// ==================== 移动元素 ====================

/**
 * 移动元素到新位置（不可变更新）
 *
 * @param element 要移动的元素
 * @param deltaX X 方向偏移量
 * @param deltaY Y 方向偏移量
 * @returns 新的元素对象
 */
export function moveElement(
  element: CanvasElement,
  deltaX: number,
  deltaY: number,
): CanvasElement {
  switch (element.type) {
    case "pen":
      return movePenElement(element, deltaX, deltaY);
    case "arrow":
      return moveArrowElement(element, deltaX, deltaY);
    case "rect":
    case "circle":
    case "text":
      return {
        ...element,
        x: element.x + deltaX,
        y: element.y + deltaY,
      };
    default:
      return element;
  }
}

function movePenElement(
  element: PenElement,
  deltaX: number,
  deltaY: number,
): PenElement {
  return {
    ...element,
    x: element.x + deltaX,
    y: element.y + deltaY,
    points: element.points.map((p) => ({
      ...p,
      x: p.x + deltaX,
      y: p.y + deltaY,
    })),
  };
}

function moveArrowElement(
  element: ArrowElement,
  deltaX: number,
  deltaY: number,
): ArrowElement {
  return {
    ...element,
    x: element.x + deltaX,
    y: element.y + deltaY,
    endX: element.endX + deltaX,
    endY: element.endY + deltaY,
  };
}

/**
 * 批量移动多个元素（不可变更新）
 *
 * @param elements 所有元素
 * @param ids 需要移动的元素 ID 集合
 * @param deltaX X 方向偏移量
 * @param deltaY Y 方向偏移量
 * @returns 新的元素数组
 */
export function moveElements(
  elements: readonly CanvasElement[],
  ids: Set<string>,
  deltaX: number,
  deltaY: number,
): CanvasElement[] {
  return elements.map((el) =>
    ids.has(el.id) ? moveElement(el, deltaX, deltaY) : el,
  );
}

// ==================== 缩放元素 ====================

/**
 * 通过拖拽手柄缩放元素（不可变更新）
 *
 * @param element 要缩放的元素
 * @param handle 被拖拽的手柄位置
 * @param deltaX 手柄 X 方向偏移量（相对于拖拽起点）
 * @param deltaY 手柄 Y 方向偏移量
 * @returns 新的元素对象
 */
export function resizeElement(
  element: CanvasElement,
  handle: HandlePosition,
  deltaX: number,
  deltaY: number,
): CanvasElement {
  switch (element.type) {
    case "rect":
      return resizeRectElement(element, handle, deltaX, deltaY);
    case "circle":
      return resizeCircleElement(element, handle, deltaX, deltaY);
    case "arrow":
      return resizeArrowElement(element, handle, deltaX, deltaY);
    case "text":
      return resizeTextElement(element, handle, deltaX, deltaY);
    case "pen":
      return resizePenElement(element, handle, deltaX, deltaY);
    default:
      return element;
  }
}

// ==================== 矩形缩放 ====================

function resizeRectElement(
  element: RectElement,
  handle: HandlePosition,
  deltaX: number,
  deltaY: number,
): RectElement {
  let { x, y, width, height } = element;

  switch (handle) {
    case "top-left":
      x += deltaX;
      y += deltaY;
      width -= deltaX;
      height -= deltaY;
      break;
    case "top-right":
      y += deltaY;
      width += deltaX;
      height -= deltaY;
      break;
    case "bottom-left":
      x += deltaX;
      width -= deltaX;
      height += deltaY;
      break;
    case "bottom-right":
      width += deltaX;
      height += deltaY;
      break;
    case "top":
      y += deltaY;
      height -= deltaY;
      break;
    case "bottom":
      height += deltaY;
      break;
    case "left":
      x += deltaX;
      width -= deltaX;
      break;
    case "right":
      width += deltaX;
      break;
  }

  return { ...element, x, y, width, height };
}

// ==================== 圆形缩放 ====================

function resizeCircleElement(
  element: CircleElement,
  handle: HandlePosition,
  deltaX: number,
  deltaY: number,
): CircleElement {
  let { x: cx, y: cy, radiusX, radiusY } = element;

  switch (handle) {
    case "top-left":
      cx += deltaX / 2;
      cy += deltaY / 2;
      radiusX -= deltaX / 2;
      radiusY -= deltaY / 2;
      break;
    case "top-right":
      cx += deltaX / 2;
      cy += deltaY / 2;
      radiusX += deltaX / 2;
      radiusY -= deltaY / 2;
      break;
    case "bottom-left":
      cx += deltaX / 2;
      cy += deltaY / 2;
      radiusX -= deltaX / 2;
      radiusY += deltaY / 2;
      break;
    case "bottom-right":
      cx += deltaX / 2;
      cy += deltaY / 2;
      radiusX += deltaX / 2;
      radiusY += deltaY / 2;
      break;
    case "top":
      cy += deltaY / 2;
      radiusY -= deltaY / 2;
      break;
    case "bottom":
      cy += deltaY / 2;
      radiusY += deltaY / 2;
      break;
    case "left":
      cx += deltaX / 2;
      radiusX -= deltaX / 2;
      break;
    case "right":
      cx += deltaX / 2;
      radiusX += deltaX / 2;
      break;
  }

  // 确保半径不为负
  radiusX = Math.max(1, Math.abs(radiusX));
  radiusY = Math.max(1, Math.abs(radiusY));

  return { ...element, x: cx, y: cy, radiusX, radiusY };
}

// ==================== 箭头缩放 ====================

function resizeArrowElement(
  element: ArrowElement,
  handle: HandlePosition,
  deltaX: number,
  deltaY: number,
): ArrowElement {
  // 箭头的缩放简化为移动起点或终点
  switch (handle) {
    case "top-left":
    case "left":
    case "bottom-left":
      // 移动起点
      return {
        ...element,
        x: element.x + deltaX,
        y: element.y + deltaY,
      };
    case "top-right":
    case "right":
    case "bottom-right":
      // 移动终点
      return {
        ...element,
        endX: element.endX + deltaX,
        endY: element.endY + deltaY,
      };
    case "top":
      return {
        ...element,
        y: element.y + deltaY,
        endY: element.endY + deltaY,
      };
    case "bottom":
      return {
        ...element,
        y: element.y + deltaY,
        endY: element.endY + deltaY,
      };
    default:
      return element;
  }
}

// ==================== 文字缩放 ====================

function resizeTextElement(
  element: TextElement,
  handle: HandlePosition,
  _deltaX: number,
  deltaY: number,
): TextElement {
  // 文字的"缩放"通过调整字号实现
  // 只响应垂直方向的拖拽（上下手柄或角手柄的垂直分量）
  let fontSizeDelta = 0;

  switch (handle) {
    case "top-left":
    case "top":
    case "top-right":
      fontSizeDelta = -deltaY * 0.5;
      break;
    case "bottom-left":
    case "bottom":
    case "bottom-right":
      fontSizeDelta = deltaY * 0.5;
      break;
    default:
      return element;
  }

  const newFontSize = Math.max(8, Math.min(200, element.fontSize + fontSizeDelta));

  return { ...element, fontSize: Math.round(newFontSize) };
}

// ==================== 画笔缩放 ====================

/**
 * 画笔缩放：基于包围盒的等比缩放
 * 将所有点映射到新的包围盒中
 */
function resizePenElement(
  element: PenElement,
  handle: HandlePosition,
  deltaX: number,
  deltaY: number,
): PenElement {
  const bbox = getElementBoundingBox(element);
  if (!bbox || bbox.width === 0 || bbox.height === 0) {
    return element;
  }

  // 计算新的包围盒
  const newBBox = getResizedBBox(bbox, handle, deltaX, deltaY);

  // 将所有点从旧包围盒映射到新包围盒
  const scaleX = newBBox.width / bbox.width;
  const scaleY = newBBox.height / bbox.height;

  const newPoints = element.points.map((p) => ({
    ...p,
    x: newBBox.x + (p.x - bbox.x) * scaleX,
    y: newBBox.y + (p.y - bbox.y) * scaleY,
  }));

  // 用新的第一个点作为元素的 x, y
  const firstPoint = newPoints[0] ?? { x: element.x, y: element.y };

  return {
    ...element,
    x: firstPoint.x,
    y: firstPoint.y,
    points: newPoints,
  };
}

// ==================== 辅助函数 ====================

/**
 * 根据手柄位置和拖拽偏移量计算新的包围盒
 */
function getResizedBBox(
  bbox: BoundingBox,
  handle: HandlePosition,
  deltaX: number,
  deltaY: number,
): BoundingBox {
  let { x, y, width, height } = bbox;

  switch (handle) {
    case "top-left":
      x += deltaX;
      y += deltaY;
      width -= deltaX;
      height -= deltaY;
      break;
    case "top-right":
      y += deltaY;
      width += deltaX;
      height -= deltaY;
      break;
    case "bottom-left":
      x += deltaX;
      width -= deltaX;
      height += deltaY;
      break;
    case "bottom-right":
      width += deltaX;
      height += deltaY;
      break;
    case "top":
      y += deltaY;
      height -= deltaY;
      break;
    case "bottom":
      height += deltaY;
      break;
    case "left":
      x += deltaX;
      width -= deltaX;
      break;
    case "right":
      width += deltaX;
      break;
  }

  // 确保宽高不为负
  if (width < 1) {
    width = 1;
  }
  if (height < 1) {
    height = 1;
  }

  return { x, y, width, height };
}

/**
 * 根据手柄位置返回对应的光标样式
 */
export function getHandleCursor(handle: HandlePosition): string {
  switch (handle) {
    case "top-left":
    case "bottom-right":
      return "nwse-resize";
    case "top-right":
    case "bottom-left":
      return "nesw-resize";
    case "top":
    case "bottom":
      return "ns-resize";
    case "left":
    case "right":
      return "ew-resize";
    default:
      return "default";
  }
}
