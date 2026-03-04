// ==================== Outline View Plugin (v2 Manifest 格式) ====================
//
// 大纲视图插件 — 演示 Views / TreeDataProvider 机制
//
// 对标 VS Code 的 Outline View：
// - 解析编辑器内容，提取文本结构（段落、标题等）
// - 通过 TreeDataProvider 提供树形数据
// - 宿主渲染 TreeView 组件展示大纲
// - 点击大纲节点可以定位到对应位置
//
// Manifest（定义在 manifest-types.ts 的 EXAMPLE_OUTLINE_VIEW_MANIFEST）：
// - id: "outline-view"
// - activationEvents: ["onStartup"]
// - permissions: ["editor:getContent", "events:on", "commands:register", "views:register"]
// - contributes.commands: [{ command: "outline-view.refresh", title: "刷新大纲", icon: "🔄" }]
// - contributes.viewsContainers: { activitybar: [{ id: "outline-container", title: "大纲", icon: "📑" }] }
// - contributes.views: { "outline-container": [{ id: "outline-view.tree", name: "文本大纲" }] }
//
// 教学要点：
// - 演示 Views API：registerTreeDataProvider
// - 演示 TreeDataProvider 接口实现（getChildren、onDidChangeTreeData）
// - 演示 views + viewsContainers 贡献点
// - 演示插件如何响应内容变化并刷新 view

import type {
  PluginEntry,
  PluginAPI,
  TreeItem,
  TreeDataProvider,
  Disposable,
} from "../../manifest-types";

// ==================== 大纲解析 ====================

/**
 * 大纲节点类型
 */
type OutlineNodeType =
  | "heading"
  | "paragraph"
  | "list"
  | "code-block"
  | "blockquote"
  | "link"
  | "separator";

/**
 * 大纲节点（内部表示）
 */
interface OutlineNode {
  /** 节点 ID */
  id: string;
  /** 节点类型 */
  type: OutlineNodeType;
  /** 显示文本 */
  label: string;
  /** 描述信息（显示在标签右侧） */
  description?: string;
  /** 标题级别（仅 heading 类型有值，1-6） */
  level?: number;
  /** 在原文中的行号（从 1 开始） */
  lineNumber: number;
  /** 子节点 */
  children: OutlineNode[];
}

/**
 * 节点类型的图标映射
 */
const NODE_ICONS: Record<OutlineNodeType, string> = {
  heading: "📌",
  paragraph: "📄",
  list: "📋",
  "code-block": "💻",
  blockquote: "💬",
  link: "🔗",
  separator: "───",
};

/**
 * 解析文本内容，生成大纲树
 *
 * 解析规则：
 * 1. 以 # 开头的行识别为标题（支持 1-6 级）
 * 2. 以 - / * / + / 数字. 开头的行识别为列表
 * 3. 以 ``` 开头的行识别为代码块（到下一个 ``` 为止）
 * 4. 以 > 开头的行识别为引用
 * 5. 以 --- / === / *** 开头的行识别为分隔线
 * 6. 包含 http:// 或 https:// 的行提取链接
 * 7. 其他非空行识别为段落
 *
 * 标题会形成层级结构（h2 嵌套在 h1 下，h3 嵌套在 h2 下等）。
 *
 * @param text 编辑器内容
 * @returns 大纲树（根节点列表）
 */
function parseOutline(text: string): OutlineNode[] {
  if (!text || text.trim() === "") {
    return [];
  }

  const lines = text.split("\n");
  const flatNodes: OutlineNode[] = [];
  let nodeId = 0;
  let inCodeBlock = false;
  let codeBlockStartLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNumber = i + 1;

    // 跳过空行
    if (trimmed === "") continue;

    // 代码块处理
    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        // 代码块结束
        inCodeBlock = false;
        continue;
      } else {
        // 代码块开始
        inCodeBlock = true;
        codeBlockStartLine = lineNumber;
        const lang = trimmed.slice(3).trim();
        flatNodes.push({
          id: `node-${nodeId++}`,
          type: "code-block",
          label: lang ? `代码块 (${lang})` : "代码块",
          description: `行 ${lineNumber}`,
          lineNumber,
          children: [],
        });
        continue;
      }
    }

    // 在代码块内部的行，跳过
    if (inCodeBlock) continue;

    // 分隔线
    if (/^[-=*]{3,}\s*$/.test(trimmed)) {
      flatNodes.push({
        id: `node-${nodeId++}`,
        type: "separator",
        label: "────────",
        description: `行 ${lineNumber}`,
        lineNumber,
        children: [],
      });
      continue;
    }

    // 标题
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2].replace(/\s*#+\s*$/, ""); // 移除尾部 #

      flatNodes.push({
        id: `node-${nodeId++}`,
        type: "heading",
        label: title,
        description: `H${level} · 行 ${lineNumber}`,
        level,
        lineNumber,
        children: [],
      });
      continue;
    }

    // 引用
    if (trimmed.startsWith(">")) {
      const quoteText = trimmed.replace(/^>\s*/, "");
      const preview = quoteText.length > 30 ? quoteText.slice(0, 27) + "..." : quoteText;

      flatNodes.push({
        id: `node-${nodeId++}`,
        type: "blockquote",
        label: preview || "引用",
        description: `行 ${lineNumber}`,
        lineNumber,
        children: [],
      });
      continue;
    }

    // 列表项
    if (/^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
      const listText = trimmed.replace(/^[-*+]\s+/, "").replace(/^\d+\.\s+/, "");
      const preview = listText.length > 35 ? listText.slice(0, 32) + "..." : listText;

      flatNodes.push({
        id: `node-${nodeId++}`,
        type: "list",
        label: preview,
        description: `行 ${lineNumber}`,
        lineNumber,
        children: [],
      });
      continue;
    }

    // 包含链接的行
    const urlMatch = trimmed.match(/https?:\/\/[^\s<>"')\]]+/);
    if (urlMatch) {
      let linkLabel: string;
      try {
        const url = new URL(urlMatch[0]);
        linkLabel = url.hostname.replace(/^www\./, "");
      } catch {
        linkLabel = urlMatch[0].length > 30 ? urlMatch[0].slice(0, 27) + "..." : urlMatch[0];
      }

      flatNodes.push({
        id: `node-${nodeId++}`,
        type: "link",
        label: linkLabel,
        description: `行 ${lineNumber}`,
        lineNumber,
        children: [],
      });
      continue;
    }

    // 普通段落
    const preview = trimmed.length > 40 ? trimmed.slice(0, 37) + "..." : trimmed;

    flatNodes.push({
      id: `node-${nodeId++}`,
      type: "paragraph",
      label: preview,
      description: `行 ${lineNumber}`,
      lineNumber,
      children: [],
    });
  }

  // 构建层级结构：标题形成嵌套关系，非标题节点归属于最近的上级标题
  return buildHierarchy(flatNodes);
}

/**
 * 将扁平节点列表构建为层级树
 *
 * 规则：
 * - 标题按级别嵌套（h2 嵌套在 h1 下，h3 嵌套在 h2 下）
 * - 非标题节点归属于前一个标题（作为其子节点）
 * - 如果没有标题，所有节点平铺在根级别
 *
 * @param nodes 扁平节点列表
 * @returns 层级树
 */
function buildHierarchy(nodes: OutlineNode[]): OutlineNode[] {
  if (nodes.length === 0) return [];

  // 检查是否有标题节点
  const hasHeadings = nodes.some((n) => n.type === "heading");

  if (!hasHeadings) {
    // 没有标题，所有节点平铺返回
    return nodes;
  }

  const root: OutlineNode[] = [];

  // 标题栈：用于追踪当前的标题层级
  // 栈中每个元素是 { level, node }
  const headingStack: Array<{ level: number; node: OutlineNode }> = [];

  for (const node of nodes) {
    if (node.type === "heading" && node.level !== undefined) {
      // 弹出所有级别 >= 当前标题的栈元素
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= node.level) {
        headingStack.pop();
      }

      if (headingStack.length === 0) {
        // 顶级标题
        root.push(node);
      } else {
        // 嵌套在上级标题下
        headingStack[headingStack.length - 1].node.children.push(node);
      }

      headingStack.push({ level: node.level, node });
    } else {
      // 非标题节点：归属于最近的标题
      if (headingStack.length > 0) {
        headingStack[headingStack.length - 1].node.children.push(node);
      } else {
        // 在第一个标题之前的节点，放在根级别
        root.push(node);
      }
    }
  }

  return root;
}

/**
 * 将 OutlineNode 转换为 TreeItem
 *
 * @param node 大纲节点
 * @returns TreeItem（供 TreeDataProvider 返回）
 */
function nodeToTreeItem(node: OutlineNode): TreeItem {
  const hasChildren = node.children.length > 0;

  return {
    id: node.id,
    label: `${NODE_ICONS[node.type]} ${node.label}`,
    icon: NODE_ICONS[node.type],
    description: node.description,
    collapsibleState: hasChildren ? "expanded" : "none",
    command: {
      commandId: "outline-view.goToLine",
      args: [node.lineNumber],
    },
    children: hasChildren ? node.children.map(nodeToTreeItem) : undefined,
  };
}

// ==================== 模块级变量（供 deactivate 清理） ====================

/** 防抖定时器引用 */
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// ==================== 插件入口 ====================

const outlineViewPlugin: PluginEntry = {
  /**
   * 激活阶段
   *
   * 流程：
   * 1. 解析编辑器内容，生成初始大纲
   * 2. 创建 TreeDataProvider，提供大纲数据
   * 3. 注册 TreeDataProvider 到 "outline-view.tree" 视图
   * 4. 注册 outline-view.refresh 命令
   * 5. 注册 outline-view.goToLine 命令（点击节点跳转）
   * 6. 监听内容变化事件，自动刷新大纲
   */
  activate(api: PluginAPI): void {
    const VIEW_ID = "outline-view.tree";

    // 当前大纲数据
    let currentOutline: OutlineNode[] = [];

    // 变更通知回调列表
    let changeHandler: (() => void) | null = null;

    /**
     * 刷新大纲数据
     */
    async function refreshOutline(): Promise<void> {
      try {
        const content = await api.editor.getContent();
        currentOutline = parseOutline(content);

        // 通知 TreeView 刷新
        if (changeHandler) {
          changeHandler();
        }

        console.log(`[OutlineView] Refreshed outline: ${currentOutline.length} root nodes`);
      } catch (error) {
        console.error("[OutlineView] Error refreshing outline:", error);
      }
    }

    // 1. 创建 TreeDataProvider
    const provider: TreeDataProvider = {
      getChildren(parentId?: string): TreeItem[] {
        if (!parentId) {
          // 返回根节点
          return currentOutline.map(nodeToTreeItem);
        }

        // 查找父节点并返回其子节点
        const parent = findNodeById(currentOutline, parentId);
        if (parent && parent.children.length > 0) {
          return parent.children.map(nodeToTreeItem);
        }

        return [];
      },

      onDidChangeTreeData(handler: () => void): Disposable {
        changeHandler = handler;
        return {
          dispose: () => {
            changeHandler = null;
          },
        };
      },
    };

    // 2. 注册 TreeDataProvider
    api.views.registerTreeDataProvider(VIEW_ID, provider);

    // 3. 注册刷新命令
    api.commands.registerCommand("outline-view.refresh", async () => {
      await refreshOutline();
      console.log("[OutlineView] Manual refresh triggered.");
      return { nodeCount: currentOutline.length };
    });

    // 4. 注册跳转命令（点击大纲节点时调用）
    api.commands.registerCommand("outline-view.goToLine", async (...args: unknown[]) => {
      const lineNumber = args[0] as number | undefined;
      if (lineNumber) {
        console.log(`[OutlineView] Navigate to line ${lineNumber}`);
        // 在真实场景中，这里会调用编辑器 API 将光标移动到指定行
        // Demo 中只输出日志
      }
    });

    // 5. 监听内容变化，自动刷新（防抖）
    const DEBOUNCE_MS = 500;

    api.events.on("content:change", () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        refreshOutline();
        debounceTimer = null;
      }, DEBOUNCE_MS);
    });

    // 6. 初始化大纲
    refreshOutline();

    console.log("[OutlineView] Plugin activated. TreeDataProvider registered.");
  },

  /**
   * 停用阶段
   *
   * TreeDataProvider 注册和事件监听通过 Disposable 自动清理。
   * 命令注册也通过 Disposable 自动清理。
   */
  deactivate(): void {
    // 清理防抖定时器，防止停用后残余的 setTimeout 回调继续刷新
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    console.log("[OutlineView] Plugin deactivated.");
  },
};

// ==================== 工具函数 ====================

/**
 * 在大纲树中递归查找指定 ID 的节点
 *
 * @param nodes 节点列表
 * @param id    目标 ID
 * @returns 匹配的节点，未找到则返回 null
 */
function findNodeById(nodes: OutlineNode[], id: string): OutlineNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;

    if (node.children.length > 0) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }

  return null;
}

export default outlineViewPlugin;
