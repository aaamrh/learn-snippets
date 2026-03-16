import type {
  CanvasElement,
  PenElement,
  RectElement,
  CircleElement,
  ArrowElement,
  TextElement,
  AppState,
  BoundingBox,
} from "../types";

// ==================== 主渲染函数 ====================

/**
 * renderStaticScene —— 渲染所有元素到 StaticCanvas
 *
 * 包含：棋盘格背景 + 遍历元素 + wipElement 预览
 * 仅当 Scene.nonce 变化时调用（元素增删改时）
 *
 * 对标 Excalidraw renderStaticScene
 */
export function renderStaticScene(
  ctx: CanvasRenderingContext2D,
  elements: readonly CanvasElement[],
  appState: Readonly<AppState>,
  /** 正在绘制中的临时元素（pointerMove 实时预览用） */
  wipElement?: CanvasElement | null,
): void {
  const { width, height } = ctx.canvas;

  // 清空画布
  ctx.clearRect(0, 0, width, height);

  // 绘制棋盘格背景（表示透明区域）
  drawCheckerboard(ctx, width, height);

  // 应用视口变换
  ctx.save();
  ctx.translate(appState.scrollX, appState.scrollY);
  ctx.scale(appState.zoom, appState.zoom);

  // 绘制已有元素
  for (const element of elements) {
    if (element.isDeleted) continue;
    renderElement(ctx, element);
  }

  // 绘制正在绘制中的临时元素
  if (wipElement && !wipElement.isDeleted) {
    renderElement(ctx, wipElement);
  }

  ctx.restore();
}

/**
 * renderInteractiveScene —— 渲染交互 UI 到 InteractiveCanvas
 *
 * 包含：选中框 + 缩放手柄
 * 每次 selectedElementIds 变化或指针移动时调用
 *
 * 对标 Excalidraw renderInteractiveScene
 */
export function renderInteractiveScene(
  ctx: CanvasRenderingContext2D,
  elements: readonly CanvasElement[],
  appState: Readonly<AppState>,
): void {
  const { width, height } = ctx.canvas;

  // 清空交互画布
  ctx.clearRect(0, 0, width, height);

  // 应用视口变换
  ctx.save();
  ctx.translate(appState.scrollX, appState.scrollY);
  ctx.scale(appState.zoom, appState.zoom);

  // 绘制选中元素的选中框
  for (const element of elements) {
    if (element.isDeleted) continue;
    if (appState.selectedElementIds.has(element.id)) {
      renderSelectionBox(ctx, element);
    }
  }

  ctx.restore();
}

/**
 * renderScene —— 兼容函数：将 static + interactive 渲染到同一个 canvas
 *
 * 保留供单画布场景使用（如导出、缩略图等）
 */
export function renderScene(
  ctx: CanvasRenderingContext2D,
  elements: readonly CanvasElement[],
  appState: Readonly<AppState>,
  wipElement?: CanvasElement | null,
): void {
  renderStaticScene(ctx, elements, appState, wipElement);

  // 在同一个 canvas 上叠加交互 UI
  ctx.save();
  ctx.translate(appState.scrollX, appState.scrollY);
  ctx.scale(appState.zoom, appState.zoom);

  for (const element of elements) {
    if (element.isDeleted) continue;
    if (appState.selectedElementIds.has(element.id)) {
      renderSelectionBox(ctx, element);
    }
  }

  ctx.restore();
}

// ==================== 元素分发渲染 ====================

function renderElement(
  ctx: CanvasRenderingContext2D,
  element: CanvasElement,
): void {
  ctx.save();
  ctx.globalAlpha = element.opacity;

  switch (element.type) {
    case "pen":
      renderPen(ctx, element);
      break;
    case "rect":
      renderRect(ctx, element);
      break;
    case "circle":
      renderCircle(ctx, element);
      break;
    case "arrow":
      renderArrow(ctx, element);
      break;
    case "text":
      renderText(ctx, element);
      break;
  }

  ctx.restore();
}

// ==================== 各元素类型的渲染实现 ====================

function renderPen(ctx: CanvasRenderingContext2D, el: PenElement): void {
  if (el.points.length < 2) {
    // 单个点画一个小圆
    if (el.points.length === 1) {
      const p = el.points[0];
      ctx.beginPath();
      ctx.arc(p.x, p.y, el.strokeWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = el.strokeColor;
      ctx.fill();
    }
    return;
  }

  ctx.beginPath();
  ctx.strokeStyle = el.strokeColor;
  ctx.lineWidth = el.strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const points = el.points;
  ctx.moveTo(points[0].x, points[0].y);

  // 使用二次贝塞尔曲线平滑路径
  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y);
  } else {
    for (let i = 1; i < points.length - 1; i++) {
      const midX = (points[i].x + points[i + 1].x) / 2;
      const midY = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
    }
    // 最后一段直接连到最后一个点
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
  }

  ctx.stroke();
}

function renderRect(ctx: CanvasRenderingContext2D, el: RectElement): void {
  ctx.beginPath();

  if (el.borderRadius > 0) {
    roundRect(ctx, el.x, el.y, el.width, el.height, el.borderRadius);
  } else {
    ctx.rect(el.x, el.y, el.width, el.height);
  }

  // 填充
  if (el.fillColor && el.fillColor !== "transparent") {
    ctx.fillStyle = el.fillColor;
    ctx.fill();
  }

  // 描边
  ctx.strokeStyle = el.strokeColor;
  ctx.lineWidth = el.strokeWidth;
  ctx.stroke();
}

function renderCircle(ctx: CanvasRenderingContext2D, el: CircleElement): void {
  ctx.beginPath();
  ctx.ellipse(el.x, el.y, Math.abs(el.radiusX), Math.abs(el.radiusY), 0, 0, Math.PI * 2);

  // 填充
  if (el.fillColor && el.fillColor !== "transparent") {
    ctx.fillStyle = el.fillColor;
    ctx.fill();
  }

  // 描边
  ctx.strokeStyle = el.strokeColor;
  ctx.lineWidth = el.strokeWidth;
  ctx.stroke();
}

function renderArrow(ctx: CanvasRenderingContext2D, el: ArrowElement): void {
  const { x: startX, y: startY, endX, endY } = el;

  // 画线段
  ctx.beginPath();
  ctx.strokeStyle = el.strokeColor;
  ctx.lineWidth = el.strokeWidth;
  ctx.lineCap = "round";
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  // 画箭头头部
  const angle = Math.atan2(endY - startY, endX - startX);
  const size = el.arrowheadSize;

  ctx.beginPath();
  ctx.fillStyle = el.strokeColor;
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX - size * Math.cos(angle - Math.PI / 6),
    endY - size * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    endX - size * Math.cos(angle + Math.PI / 6),
    endY - size * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
}

function renderText(ctx: CanvasRenderingContext2D, el: TextElement): void {
  ctx.font = `${el.fontSize}px ${el.fontFamily}`;
  ctx.fillStyle = el.strokeColor;
  ctx.textBaseline = "top";

  // 支持多行文本
  const lines = el.text.split("\n");
  const lineHeight = el.fontSize * 1.3;

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], el.x, el.y + i * lineHeight);
  }
}

// ==================== 选中框渲染 ====================

function renderSelectionBox(
  ctx: CanvasRenderingContext2D,
  element: CanvasElement,
): void {
  const bbox = getElementBoundingBox(element);
  if (!bbox) return;

  const padding = 4;
  const handleSize = 8;

  // 选中框虚线
  ctx.save();
  ctx.strokeStyle = "#4a90d9";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(
    bbox.x - padding,
    bbox.y - padding,
    bbox.width + padding * 2,
    bbox.height + padding * 2,
  );
  ctx.setLineDash([]);

  // 四角缩放手柄
  const handles = [
    { x: bbox.x - padding, y: bbox.y - padding }, // top-left
    { x: bbox.x + bbox.width + padding, y: bbox.y - padding }, // top-right
    { x: bbox.x - padding, y: bbox.y + bbox.height + padding }, // bottom-left
    { x: bbox.x + bbox.width + padding, y: bbox.y + bbox.height + padding }, // bottom-right
  ];

  for (const handle of handles) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#4a90d9";
    ctx.lineWidth = 1.5;
    ctx.fillRect(
      handle.x - handleSize / 2,
      handle.y - handleSize / 2,
      handleSize,
      handleSize,
    );
    ctx.strokeRect(
      handle.x - handleSize / 2,
      handle.y - handleSize / 2,
      handleSize,
      handleSize,
    );
  }

  ctx.restore();
}

// ==================== 包围盒计算 ====================

/**
 * 计算元素的包围盒（Bounding Box）
 * 用于 hitTest、选中框绘制、碰撞检测
 */
export function getElementBoundingBox(
  element: CanvasElement,
): BoundingBox | null {
  switch (element.type) {
    case "pen":
      return getPenBoundingBox(element);
    case "rect":
      return {
        x: Math.min(element.x, element.x + element.width),
        y: Math.min(element.y, element.y + element.height),
        width: Math.abs(element.width),
        height: Math.abs(element.height),
      };
    case "circle":
      return {
        x: element.x - Math.abs(element.radiusX),
        y: element.y - Math.abs(element.radiusY),
        width: Math.abs(element.radiusX) * 2,
        height: Math.abs(element.radiusY) * 2,
      };
    case "arrow":
      return {
        x: Math.min(element.x, element.endX),
        y: Math.min(element.y, element.endY),
        width: Math.abs(element.endX - element.x),
        height: Math.abs(element.endY - element.y),
      };
    case "text":
      return getTextBoundingBox(element);
    default:
      return null;
  }
}

function getPenBoundingBox(element: PenElement): BoundingBox {
  if (element.points.length === 0) {
    return { x: element.x, y: element.y, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of element.points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  // 增加线宽的余量
  const padding = element.strokeWidth / 2;
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + element.strokeWidth,
    height: maxY - minY + element.strokeWidth,
  };
}

function getTextBoundingBox(element: TextElement): BoundingBox {
  const lines = element.text.split("\n");
  const lineHeight = element.fontSize * 1.3;
  const height = lines.length * lineHeight;

  // 文字宽度的估算（精确值需要 measureText，这里用近似值）
  // 每个字符大约 0.6 倍字号宽度
  const maxLineLength = Math.max(...lines.map((l) => l.length));
  const charWidth = element.fontSize * 0.6;
  const width = maxLineLength * charWidth;

  return {
    x: element.x,
    y: element.y,
    width: Math.max(width, 20),
    height: Math.max(height, element.fontSize),
  };
}

/**
 * 使用 canvas context 精确测量文字宽度
 * （当有 ctx 可用时使用此函数替代估算）
 */
export function measureTextBoundingBox(
  ctx: CanvasRenderingContext2D,
  element: TextElement,
): BoundingBox {
  ctx.font = `${element.fontSize}px ${element.fontFamily}`;
  const lines = element.text.split("\n");
  const lineHeight = element.fontSize * 1.3;

  let maxWidth = 0;
  for (const line of lines) {
    const metrics = ctx.measureText(line);
    maxWidth = Math.max(maxWidth, metrics.width);
  }

  return {
    x: element.x,
    y: element.y,
    width: Math.max(maxWidth, 20),
    height: Math.max(lines.length * lineHeight, element.fontSize),
  };
}

// ==================== 辅助函数 ====================

/**
 * 绘制棋盘格背景（表示透明区域）
 */
function drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const size = 10;
  const color1 = "#f0f0f0";
  const color2 = "#e0e0e0";

  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      const isEven = ((x / size) + (y / size)) % 2 === 0;
      ctx.fillStyle = isEven ? color1 : color2;
      ctx.fillRect(x, y, size, size);
    }
  }
}

/**
 * 绘制圆角矩形（兼容不支持 ctx.roundRect 的浏览器）
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);

  // 规范化负宽高
  const nx = width < 0 ? x + width : x;
  const ny = height < 0 ? y + height : y;
  const nw = Math.abs(width);
  const nh = Math.abs(height);

  ctx.moveTo(nx + r, ny);
  ctx.lineTo(nx + nw - r, ny);
  ctx.arcTo(nx + nw, ny, nx + nw, ny + r, r);
  ctx.lineTo(nx + nw, ny + nh - r);
  ctx.arcTo(nx + nw, ny + nh, nx + nw - r, ny + nh, r);
  ctx.lineTo(nx + r, ny + nh);
  ctx.arcTo(nx, ny + nh, nx, ny + nh - r, r);
  ctx.lineTo(nx, ny + r);
  ctx.arcTo(nx, ny, nx + r, ny, r);
  ctx.closePath();
}
