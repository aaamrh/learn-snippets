import type {
  CanvasElement,
  PenElement,
  RectElement,
  CircleElement,
  ArrowElement,
  TextElement,
  AppState,
  HitTestResult,
  HandlePosition,
  BoundingBox,
} from "../types";
import { getElementBoundingBox } from "./renderer";

// ==================== 常量 ====================

/** 点击容差（像素），线条/点附近多少像素算命中 */
const HIT_TOLERANCE = 6;

/** 选中手柄的大小（与 renderer 中的 handleSize 保持一致） */
const HANDLE_SIZE = 8;

/** 选中框的 padding（与 renderer 中的 padding 保持一致） */
const SELECTION_PADDING = 4;

// ==================== 主 hitTest 函数 ====================

/**
 * 给定画布坐标 (x, y)，返回被点击的元素 ID
 *
 * 设计要点：
 * - 从后往前遍历（后绘制的元素在上层，应优先命中）
 * - 跳过 isDeleted 的元素
 * - 如果有选中元素，先检查是否命中了选中框的缩放手柄
 * - 考虑视口偏移（scrollX/scrollY）和缩放（zoom）
 *
 * @param x 画布坐标 x（已经过视口变换的原始坐标）
 * @param y 画布坐标 y
 * @param elements 所有元素
 * @param appState 应用状态（用于读取 selectedElementIds、zoom 等）
 */
export function hitTest(
  x: number,
  y: number,
  elements: readonly CanvasElement[],
  appState: Readonly<AppState>,
): HitTestResult {
  // 将屏幕坐标转换为场景坐标
  const sceneX = (x - appState.scrollX) / appState.zoom;
  const sceneY = (y - appState.scrollY) / appState.zoom;

  // 1. 先检查选中元素的缩放手柄
  for (const element of elements) {
    if (element.isDeleted) continue;
    if (!appState.selectedElementIds.has(element.id)) continue;

    const handle = hitTestHandles(sceneX, sceneY, element);
    if (handle) {
      return { elementId: element.id, handle };
    }
  }

  // 2. 从后往前遍历检查元素本体
  for (let i = elements.length - 1; i >= 0; i--) {
    const element = elements[i];
    if (element.isDeleted) continue;

    if (hitTestElement(sceneX, sceneY, element)) {
      return { elementId: element.id };
    }
  }

  // 3. 未命中任何元素
  return { elementId: null };
}

/**
 * 将屏幕坐标（如 pointer event 的 offsetX/offsetY）转换为场景坐标
 */
export function screenToScene(
  screenX: number,
  screenY: number,
  appState: Readonly<AppState>,
): { x: number; y: number } {
  return {
    x: (screenX - appState.scrollX) / appState.zoom,
    y: (screenY - appState.scrollY) / appState.zoom,
  };
}

// ==================== 缩放手柄 hitTest ====================

function hitTestHandles(
  x: number,
  y: number,
  element: CanvasElement,
): HandlePosition | undefined {
  const bbox = getElementBoundingBox(element);
  if (!bbox) return undefined;

  const handles = getHandlePositions(bbox);

  for (const [position, hx, hy] of handles) {
    if (isPointInHandle(x, y, hx, hy)) {
      return position;
    }
  }

  return undefined;
}

function getHandlePositions(
  bbox: BoundingBox,
): Array<[HandlePosition, number, number]> {
  const p = SELECTION_PADDING;
  const left = bbox.x - p;
  const right = bbox.x + bbox.width + p;
  const top = bbox.y - p;
  const bottom = bbox.y + bbox.height + p;
  const midX = bbox.x + bbox.width / 2;
  const midY = bbox.y + bbox.height / 2;

  return [
    ["top-left", left, top],
    ["top-right", right, top],
    ["bottom-left", left, bottom],
    ["bottom-right", right, bottom],
    ["top", midX, top],
    ["bottom", midX, bottom],
    ["left", left, midY],
    ["right", right, midY],
  ];
}

function isPointInHandle(
  px: number,
  py: number,
  handleX: number,
  handleY: number,
): boolean {
  const half = HANDLE_SIZE / 2 + 2; // 稍微扩大命中区域
  return (
    px >= handleX - half &&
    px <= handleX + half &&
    py >= handleY - half &&
    py <= handleY + half
  );
}

// ==================== 元素本体 hitTest ====================

function hitTestElement(
  x: number,
  y: number,
  element: CanvasElement,
): boolean {
  switch (element.type) {
    case "pen":
      return hitTestPen(x, y, element);
    case "rect":
      return hitTestRect(x, y, element);
    case "circle":
      return hitTestCircle(x, y, element);
    case "arrow":
      return hitTestArrow(x, y, element);
    case "text":
      return hitTestText(x, y, element);
    default:
      return false;
  }
}

// ==================== 各元素类型的 hitTest 实现 ====================

/**
 * 画笔 hitTest：检查 (x, y) 是否在任意两个相邻点构成的线段附近
 */
function hitTestPen(x: number, y: number, el: PenElement): boolean {
  const points = el.points;
  if (points.length === 0) return false;

  // 单个点：检查距离
  if (points.length === 1) {
    return distanceToPoint(x, y, points[0].x, points[0].y) <= HIT_TOLERANCE + el.strokeWidth / 2;
  }

  // 多个点：逐段检查
  const tolerance = HIT_TOLERANCE + el.strokeWidth / 2;
  for (let i = 0; i < points.length - 1; i++) {
    const dist = distanceToLineSegment(
      x,
      y,
      points[i].x,
      points[i].y,
      points[i + 1].x,
      points[i + 1].y,
    );
    if (dist <= tolerance) {
      return true;
    }
  }

  return false;
}

/**
 * 矩形 hitTest：
 * - 有填充时，检查点是否在矩形内部
 * - 无填充时，检查点是否在矩形边线附近
 */
function hitTestRect(x: number, y: number, el: RectElement): boolean {
  // 规范化负宽高
  const rx = Math.min(el.x, el.x + el.width);
  const ry = Math.min(el.y, el.y + el.height);
  const rw = Math.abs(el.width);
  const rh = Math.abs(el.height);

  const hasFill = el.fillColor && el.fillColor !== "transparent";

  if (hasFill) {
    // 有填充：点在矩形内部（含容差）
    return (
      x >= rx - HIT_TOLERANCE &&
      x <= rx + rw + HIT_TOLERANCE &&
      y >= ry - HIT_TOLERANCE &&
      y <= ry + rh + HIT_TOLERANCE
    );
  }

  // 无填充：检查四条边
  const tolerance = HIT_TOLERANCE + el.strokeWidth / 2;
  return (
    distanceToLineSegment(x, y, rx, ry, rx + rw, ry) <= tolerance || // top
    distanceToLineSegment(x, y, rx + rw, ry, rx + rw, ry + rh) <= tolerance || // right
    distanceToLineSegment(x, y, rx + rw, ry + rh, rx, ry + rh) <= tolerance || // bottom
    distanceToLineSegment(x, y, rx, ry + rh, rx, ry) <= tolerance // left
  );
}

/**
 * 圆形/椭圆 hitTest：
 * - 有填充时，检查点是否在椭圆内部
 * - 无填充时，检查点是否在椭圆边线附近
 */
function hitTestCircle(x: number, y: number, el: CircleElement): boolean {
  const cx = el.x;
  const cy = el.y;
  const rx = Math.abs(el.radiusX);
  const ry = Math.abs(el.radiusY);

  if (rx === 0 || ry === 0) return false;

  // 椭圆方程：((x-cx)/rx)^2 + ((y-cy)/ry)^2 = 1
  const normalizedDist =
    ((x - cx) * (x - cx)) / (rx * rx) + ((y - cy) * (y - cy)) / (ry * ry);

  const hasFill = el.fillColor && el.fillColor !== "transparent";

  if (hasFill) {
    // 有填充：点在椭圆内部（含容差）
    const outerRx = rx + HIT_TOLERANCE;
    const outerRy = ry + HIT_TOLERANCE;
    const outerDist =
      ((x - cx) * (x - cx)) / (outerRx * outerRx) +
      ((y - cy) * (y - cy)) / (outerRy * outerRy);
    return outerDist <= 1;
  }

  // 无填充：检查是否在椭圆边线附近
  // 近似方法：检查到椭圆的"归一化距离"与 1 的差值
  const tolerance = HIT_TOLERANCE / Math.min(rx, ry);
  return Math.abs(normalizedDist - 1) <= tolerance;
}

/**
 * 箭头 hitTest：检查 (x, y) 是否在线段或箭头头部附近
 */
function hitTestArrow(x: number, y: number, el: ArrowElement): boolean {
  const tolerance = HIT_TOLERANCE + el.strokeWidth / 2;

  // 检查线段
  const lineDist = distanceToLineSegment(x, y, el.x, el.y, el.endX, el.endY);
  if (lineDist <= tolerance) {
    return true;
  }

  // 检查箭头头部三角形区域
  const angle = Math.atan2(el.endY - el.y, el.endX - el.x);
  const size = el.arrowheadSize;

  const ax = el.endX;
  const ay = el.endY;
  const bx = el.endX - size * Math.cos(angle - Math.PI / 6);
  const by = el.endY - size * Math.sin(angle - Math.PI / 6);
  const cx2 = el.endX - size * Math.cos(angle + Math.PI / 6);
  const cy2 = el.endY - size * Math.sin(angle + Math.PI / 6);

  return isPointInTriangle(x, y, ax, ay, bx, by, cx2, cy2);
}

/**
 * 文字 hitTest：检查 (x, y) 是否在文字包围盒内
 */
function hitTestText(x: number, y: number, el: TextElement): boolean {
  const bbox = getElementBoundingBox(el);
  if (!bbox) return false;

  return (
    x >= bbox.x - HIT_TOLERANCE &&
    x <= bbox.x + bbox.width + HIT_TOLERANCE &&
    y >= bbox.y - HIT_TOLERANCE &&
    y <= bbox.y + bbox.height + HIT_TOLERANCE
  );
}

// ==================== 几何辅助函数 ====================

/**
 * 计算点到线段的最短距离
 */
function distanceToLineSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    // 线段退化为点
    return distanceToPoint(px, py, x1, y1);
  }

  // 投影参数 t，限制在 [0, 1]
  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));

  // 投影点
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;

  return distanceToPoint(px, py, projX, projY);
}

/**
 * 计算两点之间的距离
 */
function distanceToPoint(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 判断点是否在三角形内（用于箭头头部检测）
 * 使用面积法：如果点在三角形内，三个子三角形的面积之和等于原三角形面积
 */
function isPointInTriangle(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): boolean {
  const areaOrig = Math.abs(triangleArea(ax, ay, bx, by, cx, cy));
  const area1 = Math.abs(triangleArea(px, py, bx, by, cx, cy));
  const area2 = Math.abs(triangleArea(ax, ay, px, py, cx, cy));
  const area3 = Math.abs(triangleArea(ax, ay, bx, by, px, py));

  // 允许一点误差
  return Math.abs(areaOrig - (area1 + area2 + area3)) < 1;
}

/**
 * 计算三角形面积（有符号面积的两倍）
 */
function triangleArea(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
): number {
  return (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2)) / 2;
}
