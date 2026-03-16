// ==================== Auto Save Plugin (v2 Manifest 格式) ====================
//
// 定时自动保存编辑器内容到 localStorage
//
// 对标 VS Code 的 Auto Save 功能：
// - 定时检查编辑器内容是否变化
// - 变化时自动保存到 localStorage
// - 通过 statusBar API 显示保存状态（最后保存时间）
// - 启动时自动恢复上次保存的内容（可选）
//
// Manifest（定义在 manifest-types.ts 的 EXAMPLE_AUTO_SAVE_MANIFEST）：
// - id: "auto-save"
// - activationEvents: ["onStartup"]
// - permissions: ["editor:getContent", "events:on", "storage:get", "storage:set", "statusBar:update"]
// - contributes.statusBar: [{ id: "auto-save.status", text: "自动保存: 就绪", alignment: "right", priority: 50 }]
//
// 设计要点：
// - onStartup 激活：编辑器启动后立即开始自动保存
// - 使用 storage API（不直接访问 localStorage）：保持与沙箱兼容
// - 内容指纹（hash）：通过简单 hash 比较判断内容是否变化，避免无意义的写入
// - 状态栏实时反馈：显示「已保存」/「保存中...」/「上次保存: HH:MM:SS」

import type { PluginEntry, PluginAPI } from "../../manifest-types";

// ==================== 工具函数 ====================

/**
 * 简单的字符串 hash（用于比较内容是否变化）
 *
 * 不追求密码学安全，只要能快速判断两段文本是否相同即可。
 * 使用 djb2 算法：简单、快速、碰撞率可接受。
 *
 * @param str 输入字符串
 * @returns 32 位整数 hash 值
 */
function simpleHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // hash * 33 + charCode
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * 格式化时间为 HH:MM:SS
 *
 * @param date Date 对象
 * @returns 格式化后的时间字符串
 */
function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/**
 * 格式化距离上次保存的时间
 *
 * @param lastSaveTime 上次保存的时间戳
 * @returns 人类可读的时间描述（如 "刚刚"、"1 分钟前"、"5 分钟前"）
 */
function formatTimeSince(lastSaveTime: number): string {
  const now = Date.now();
  const diffMs = now - lastSaveTime;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);

  if (diffSec < 10) {
    return "刚刚";
  }
  if (diffSec < 60) {
    return `${diffSec} 秒前`;
  }
  if (diffMin < 60) {
    return `${diffMin} 分钟前`;
  }
  // 超过 1 小时，显示具体时间
  return formatTime(new Date(lastSaveTime));
}

// ==================== 常量 ====================

/** 状态栏项 ID（必须与 Manifest contributes.statusBar 中声明的 id 一致） */
const STATUS_BAR_ID = "auto-save.status";

/** Storage key：保存的编辑器内容 */
const STORAGE_KEY_CONTENT = "editor-content";

/** Storage key：上次保存时间戳 */
const STORAGE_KEY_TIMESTAMP = "last-save-time";

/** Storage key：内容 hash（用于快速比较是否变化） */
const STORAGE_KEY_HASH = "content-hash";

/** 自动保存间隔（毫秒） */
const AUTO_SAVE_INTERVAL = 5000; // 5 秒

/** 状态栏刷新间隔（毫秒，用于更新"xx 秒前"的显示） */
const STATUS_REFRESH_INTERVAL = 10000; // 10 秒

// ==================== 模块级定时器引用（供 deactivate 清理） ====================

/** 自动保存定时器 */
let saveTimer: ReturnType<typeof setInterval> | null = null;

/** 状态栏刷新定时器 */
let statusTimer: ReturnType<typeof setInterval> | null = null;

// ==================== 插件入口 ====================

const autoSavePlugin: PluginEntry = {
  /**
   * 激活阶段
   *
   * 流程：
   * 1. 尝试从 storage 恢复上次保存的内容（通知宿主，但不自动覆盖编辑器）
   * 2. 启动定时器，每 N 秒检查内容是否变化
   * 3. 如果变化，保存到 storage 并更新状态栏
   * 4. 监听 content:change 事件，标记内容已变化（配合定时器批量保存）
   *
   * 清理策略：
   * - 定时器在 deactivate 时通过闭包内的 cleanup 清理
   * - 事件监听通过 Disposable 自动清理
   */
  activate(api: PluginAPI): void {
    // ── 状态变量 ──────────────────────────────────────────────

    /** 上次保存时的内容 hash */
    let lastSavedHash: number = 0;

    /** 上次保存的时间戳 */
    let lastSaveTime: number = 0;

    /** 内容是否已标记为「脏」（有未保存的变化） */
    let isDirty: boolean = false;

    /** 保存次数计数器 */
    let saveCount: number = 0;

    /** 可恢复的内容（激活时从 storage 读取，恢复后清空） */
    let pendingRestoreContent: string | null = null;

    // ── 核心保存函数 ──────────────────────────────────────────

    /**
     * 执行保存操作
     *
     * 1. 获取编辑器当前内容
     * 2. 计算 hash，与上次保存的 hash 比较
     * 3. 如果不同，保存到 storage
     * 4. 更新状态栏
     */
    async function doSave(): Promise<void> {
      try {
        // 1. 获取内容
        const content = await api.editor.getContent();

        if (!content && content !== "") {
          // 获取失败，跳过本次保存
          return;
        }

        // 2. 计算 hash
        const currentHash = simpleHash(content);

        // 3. 比较是否变化
        if (currentHash === lastSavedHash) {
          // 内容未变化，跳过保存
          isDirty = false;
          return;
        }

        // 4. 更新状态栏为「保存中」
        api.statusBar.update(STATUS_BAR_ID, {
          label: "自动保存: 保存中...",
          icon: "💾",
        });

        // 5. 保存到 storage
        await api.storage.set(STORAGE_KEY_CONTENT, content);
        await api.storage.set(STORAGE_KEY_TIMESTAMP, Date.now());
        await api.storage.set(STORAGE_KEY_HASH, currentHash);

        // 6. 更新状态
        lastSavedHash = currentHash;
        lastSaveTime = Date.now();
        isDirty = false;
        saveCount++;

        // 7. 更新状态栏为「已保存」
        api.statusBar.update(STATUS_BAR_ID, {
          label: `自动保存: ${formatTime(new Date())}`,
          value: `已保存 ${content.length} 字符 (第 ${saveCount} 次)`,
          icon: "💾",
        });

        console.log(
          `[AutoSave] Saved (${content.length} chars, #${saveCount}) at ${formatTime(new Date())}`,
        );
      } catch (error) {
        console.error("[AutoSave] Save failed:", error);

        api.statusBar.update(STATUS_BAR_ID, {
          label: "自动保存: 保存失败",
          value: error instanceof Error ? error.message : "未知错误",
          icon: "⚠️",
        });
      }
    }

    // ── 状态栏刷新 ──────────────────────────────────────────

    /**
     * 刷新状态栏显示（更新"xx 秒前"等相对时间）
     */
    function refreshStatusBar(): void {
      // 有待恢复内容时，优先展示恢复提示，引导用户主动点击
      if (pendingRestoreContent !== null) {
        const chars = pendingRestoreContent.length;
        const savedAt = lastSaveTime > 0 ? formatTimeSince(lastSaveTime) : "未知时间";
        api.statusBar.update(STATUS_BAR_ID, {
          label: `💾 有可恢复内容 (${chars} 字符，${savedAt})`,
          value: "点击恢复上次保存的内容",
          icon: "🔄",
        });
        return;
      }

      if (lastSaveTime === 0) {
        // 尚未保存过
        api.statusBar.update(STATUS_BAR_ID, {
          label: isDirty ? "自动保存: 待保存" : "自动保存: 就绪",
          icon: "💾",
        });
        return;
      }

      const timeSince = formatTimeSince(lastSaveTime);

      api.statusBar.update(STATUS_BAR_ID, {
        label: isDirty ? `自动保存: 待保存 (上次: ${timeSince})` : `自动保存: ${timeSince}`,
        value: `共保存 ${saveCount} 次`,
        icon: "💾",
      });
    }

    // ── 初始化 ──────────────────────────────────────────────

    // 1. 注册恢复命令 — 用户主动点击状态栏时执行
    //    插件只需 commands:register 权限，不再需要 events:emit
    api.commands.registerCommand("auto-save.restore", async () => {
      if (pendingRestoreContent === null) return;

      try {
        await api.editor.insertText(pendingRestoreContent);
        console.log(`[AutoSave] Content restored (${pendingRestoreContent.length} chars).`);
        pendingRestoreContent = null;
        // 恢复后刷新状态栏，回到正常显示
        refreshStatusBar();
      } catch (error) {
        console.error("[AutoSave] Failed to restore content:", error);
      }
    });

    // 2. 尝试从 storage 读取上次保存的信息
    (async () => {
      try {
        const savedHash = await api.storage.get(STORAGE_KEY_HASH);
        const savedTime = await api.storage.get(STORAGE_KEY_TIMESTAMP);

        if (typeof savedHash === "number") {
          lastSavedHash = savedHash;
        }
        if (typeof savedTime === "number") {
          lastSaveTime = savedTime;
        }

        // 检查是否有保存的内容可恢复
        const savedContent = await api.storage.get(STORAGE_KEY_CONTENT);
        if (typeof savedContent === "string" && savedContent.length > 0) {
          console.log(
            `[AutoSave] Found saved content (${savedContent.length} chars, ` +
              `last saved: ${lastSaveTime > 0 ? formatTimeSince(lastSaveTime) : "unknown"})`,
          );
          // 暂存到闭包变量，由用户通过状态栏点击主动恢复，不自动覆盖编辑器
          pendingRestoreContent = savedContent;
        }

        // 初始化状态栏（若有可恢复内容，会展示恢复提示）
        refreshStatusBar();
      } catch (error) {
        console.error("[AutoSave] Failed to restore saved state:", error);
      }
    })();

    // 2. 监听内容变化事件 — 标记为脏
    api.events.on("content:change", () => {
      isDirty = true;
    });

    // 3. 启动自动保存定时器
    saveTimer = setInterval(() => {
      if (isDirty) {
        doSave();
      }
    }, AUTO_SAVE_INTERVAL);

    // 4. 启动状态栏刷新定时器
    statusTimer = setInterval(() => {
      refreshStatusBar();
    }, STATUS_REFRESH_INTERVAL);

    // 5. 初始状态栏
    api.statusBar.update(STATUS_BAR_ID, {
      label: "自动保存: 就绪",
      icon: "💾",
    });

    console.log(`[AutoSave] Plugin activated. Auto-saving every ${AUTO_SAVE_INTERVAL / 1000}s.`);
  },

  /**
   * 停用阶段
   *
   * 清理定时器。
   * 事件监听通过 Disposable 自动清理。
   *
   * 清理定时器，防止停用后仍然持续保存和刷新状态栏。
   */
  deactivate(): void {
    if (saveTimer) {
      clearInterval(saveTimer);
      saveTimer = null;
    }
    if (statusTimer) {
      clearInterval(statusTimer);
      statusTimer = null;
    }
    console.log("[AutoSave] Plugin deactivated. Timers cleared.");
  },
};

export default autoSavePlugin;
