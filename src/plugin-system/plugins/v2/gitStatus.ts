// ==================== Git Status Plugin (v2 Manifest 格式) ====================
//
// 模拟 Git 状态信息显示在状态栏
//
// 对标 VS Code 底部状态栏的 Git 分支显示：
// - 在状态栏显示当前分支名
// - 带颜色标识（绿色=干净、黄色=有修改、红色=有冲突）
// - 点击弹出 Git 详情信息（通过 toast 模拟）
// - 定时模拟 Git 状态变化
//
// Manifest（定义在 manifest-types.ts 的 EXAMPLE_GIT_STATUS_MANIFEST）：
// - id: "git-status"
// - activationEvents: ["onStartup"]
// - permissions: ["commands:register", "statusBar:update", "statusBar:setTooltip",
//                 "statusBar:setColor", "statusBar:setBackgroundColor",
//                 "statusBar:setCommand", "events:on", "events:emit"]
// - contributes.commands: [{ command: "git-status.showDetails", ... }]
// - contributes.statusBar: [{ id: "git-status.branch", text: "main", alignment: "left",
//                             priority: 200, tooltip: "当前 Git 分支", color: "#a78bfa",
//                             command: "git-status.showDetails" }]
//
// 教学要点：
// - 演示 StatusBar 增强 API（setTooltip / setColor / setBackgroundColor / setCommand）
// - 演示状态栏项的动态更新（颜色、文字、tooltip 随状态变化）
// - 演示 commands:register + events:emit 的配合使用

import type { PluginEntry, PluginAPI } from "../../manifest-types";

// ==================== 模块级变量（供 deactivate 清理） ====================

/** Git 状态轮询定时器引用 */
let pollTimer: ReturnType<typeof setInterval> | null = null;

// ==================== 模拟 Git 数据 ====================

/**
 * Git 状态类型
 */
type GitStatus = "clean" | "modified" | "conflict" | "ahead" | "behind";

/**
 * 模拟的分支列表
 */
const MOCK_BRANCHES = [
  "main",
  "develop",
  "feature/plugin-system",
  "fix/statusbar-color",
  "release/v2",
];

/**
 * 模拟的 Git 提交信息
 */
const MOCK_COMMITS = [
  { hash: "a1b2c3d", message: "feat: add StatusBar enhancement", author: "Demo", time: "2 分钟前" },
  {
    hash: "e4f5g6h",
    message: "fix: keybinding conflict resolution",
    author: "Demo",
    time: "15 分钟前",
  },
  { hash: "i7j8k9l", message: "docs: update evolution plan", author: "Demo", time: "1 小时前" },
  {
    hash: "m0n1o2p",
    message: "refactor: DisposableStore cleanup",
    author: "Demo",
    time: "3 小时前",
  },
  { hash: "q3r4s5t", message: "chore: bump version to 2.0.0", author: "Demo", time: "昨天" },
];

/**
 * 状态颜色映射
 */
const STATUS_COLORS: Record<GitStatus, string> = {
  clean: "#4ade80", // 绿色 — 干净
  modified: "#fbbf24", // 黄色 — 有修改
  conflict: "#f87171", // 红色 — 有冲突
  ahead: "#60a5fa", // 蓝色 — 领先远程
  behind: "#c084fc", // 紫色 — 落后远程
};

/**
 * 状态图标映射
 */
const STATUS_ICONS: Record<GitStatus, string> = {
  clean: "✓",
  modified: "●",
  conflict: "✕",
  ahead: "↑",
  behind: "↓",
};

/**
 * 状态描述映射
 */
const STATUS_DESCRIPTIONS: Record<GitStatus, string> = {
  clean: "工作区干净",
  modified: "有未提交的修改",
  conflict: "存在合并冲突",
  ahead: "领先远程分支",
  behind: "落后远程分支",
};

/**
 * 生成模拟的 Git 状态
 */
function generateMockGitState(): {
  branch: string;
  status: GitStatus;
  changedFiles: number;
  aheadCount: number;
  behindCount: number;
} {
  const branch = MOCK_BRANCHES[Math.floor(Math.random() * MOCK_BRANCHES.length)];

  // 随机选择状态（clean 概率更高）
  const rand = Math.random();
  let status: GitStatus;
  if (rand < 0.4) {
    status = "clean";
  } else if (rand < 0.65) {
    status = "modified";
  } else if (rand < 0.8) {
    status = "ahead";
  } else if (rand < 0.92) {
    status = "behind";
  } else {
    status = "conflict";
  }

  const changedFiles =
    status === "modified" || status === "conflict" ? Math.floor(1 + Math.random() * 8) : 0;

  const aheadCount = status === "ahead" ? Math.floor(1 + Math.random() * 5) : 0;
  const behindCount = status === "behind" ? Math.floor(1 + Math.random() * 3) : 0;

  return { branch, status, changedFiles, aheadCount, behindCount };
}

/**
 * 格式化 Git 状态栏文本
 */
function formatBranchText(
  branch: string,
  status: GitStatus,
  changedFiles: number,
  aheadCount: number,
  behindCount: number,
): string {
  let text = `${STATUS_ICONS[status]} ${branch}`;

  if (changedFiles > 0) {
    text += ` +${changedFiles}`;
  }
  if (aheadCount > 0) {
    text += ` ↑${aheadCount}`;
  }
  if (behindCount > 0) {
    text += ` ↓${behindCount}`;
  }

  return text;
}

/**
 * 格式化 Git 详情信息
 */
function formatGitDetails(
  branch: string,
  status: GitStatus,
  changedFiles: number,
  aheadCount: number,
  behindCount: number,
): string {
  const lines: string[] = [
    `🔀 Git 状态详情`,
    `─────────────────`,
    `分支: ${branch}`,
    `状态: ${STATUS_DESCRIPTIONS[status]}`,
  ];

  if (changedFiles > 0) {
    lines.push(`修改文件: ${changedFiles} 个`);
  }
  if (aheadCount > 0) {
    lines.push(`领先远程: ${aheadCount} 个提交`);
  }
  if (behindCount > 0) {
    lines.push(`落后远程: ${behindCount} 个提交`);
  }

  lines.push(`─────────────────`);
  lines.push(`最近提交:`);

  const recentCommits = MOCK_COMMITS.slice(0, 3);
  for (const commit of recentCommits) {
    lines.push(`  ${commit.hash.slice(0, 7)} ${commit.message} (${commit.time})`);
  }

  return lines.join("\n");
}

// ==================== 插件入口 ====================

const gitStatusPlugin: PluginEntry = {
  /**
   * 激活阶段
   *
   * 流程：
   * 1. 注册 git-status.showDetails 命令
   * 2. 初始化状态栏显示（分支名 + 状态图标 + 颜色）
   * 3. 定时模拟 Git 状态变化（每 15 秒）
   */
  activate(api: PluginAPI): void {
    const STATUS_BAR_ID = "git-status.branch";

    // 当前 Git 状态
    let currentState = generateMockGitState();

    /**
     * 更新状态栏显示
     */
    function updateStatusBar(): void {
      const { branch, status, changedFiles, aheadCount, behindCount } = currentState;
      const text = formatBranchText(branch, status, changedFiles, aheadCount, behindCount);
      const tooltip = `${branch} — ${STATUS_DESCRIPTIONS[status]}`;
      const color = STATUS_COLORS[status];

      // 更新状态栏文本和图标
      api.statusBar.update(STATUS_BAR_ID, {
        label: text,
        value: tooltip,
        icon: "🔀",
      });

      // 使用增强 API 设置颜色和 tooltip
      api.statusBar.setColor(STATUS_BAR_ID, color);
      api.statusBar.setTooltip(STATUS_BAR_ID, tooltip);

      // 冲突状态时设置醒目的背景色
      if (status === "conflict") {
        api.statusBar.setBackgroundColor(STATUS_BAR_ID, "rgba(239, 68, 68, 0.15)");
      } else {
        api.statusBar.setBackgroundColor(STATUS_BAR_ID, "transparent");
      }
    }

    // 1. 注册 showDetails 命令
    api.commands.registerCommand("git-status.showDetails", async () => {
      const { branch, status, changedFiles, aheadCount, behindCount } = currentState;
      const details = formatGitDetails(branch, status, changedFiles, aheadCount, behindCount);

      console.log(details);

      // 通过事件通知宿主显示 toast
      api.events.emit("ui:toast", {
        message: `🔀 ${branch} — ${STATUS_DESCRIPTIONS[status]}`,
        type: "info",
      });

      return { branch, status, changedFiles, aheadCount, behindCount };
    });

    // 2. 初始化状态栏
    updateStatusBar();

    // 3. 定时模拟 Git 状态变化
    const GIT_POLL_INTERVAL = 15000; // 15 秒
    // 清理上一次可能残留的定时器（防止重复激活时泄漏）
    if (pollTimer) {
      clearInterval(pollTimer);
    }
    pollTimer = setInterval(() => {
      currentState = generateMockGitState();
      updateStatusBar();

      console.log(`[GitStatus] Status updated: ${currentState.branch} (${currentState.status})`);
    }, GIT_POLL_INTERVAL);

    // 4. 监听内容变化事件 — 模拟"文件修改"导致 Git 状态变化
    api.events.on("content:change", () => {
      // 内容变化时，如果当前是 clean 状态，切换为 modified
      if (currentState.status === "clean") {
        currentState = {
          ...currentState,
          status: "modified",
          changedFiles: 1,
        };
        updateStatusBar();
      } else if (currentState.status === "modified") {
        // 已经是 modified 状态，增加修改文件数
        currentState = {
          ...currentState,
          changedFiles: Math.min(currentState.changedFiles + 1, 20),
        };
        updateStatusBar();
      }
    });

    console.log(
      `[GitStatus] Plugin activated. Branch: ${currentState.branch}, Status: ${currentState.status}`,
    );
  },

  /**
   * 停用阶段
   *
   * 清理定时器。
   * 事件监听和命令注册通过 Disposable 自动清理。
   */
  deactivate(): void {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    console.log("[GitStatus] Plugin deactivated. Timer cleared.");
  },
};

export default gitStatusPlugin;
