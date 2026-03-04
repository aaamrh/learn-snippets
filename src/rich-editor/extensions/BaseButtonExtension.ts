import type {
  ButtonExtension,
  EditorInstance,
  EditorState,
  MarkType,
} from "../types";

/**
 * BaseButtonExtension —— 按钮扩展基类
 *
 * 对标 medium-editor 的 Button：
 * - 提供 isActive / isAlreadyApplied / setActive / setInactive / handleClick 的默认实现
 * - active 状态不是按钮自己管的，是 Toolbar 通过爬 DOM 树统一判断的
 * - 子类只需声明 command / label / icon / tagNames / style 即可
 *
 * 设计要点：
 * - isAlreadyApplied(node)：检查给定 DOM 节点是否匹配按钮的 tagNames 或 style
 * - handleClick()：默认调用 editor.execCommand(command)
 * - setActive/setInactive：切换内部 _active 标记，供 UI 渲染使用
 */
export abstract class BaseButtonExtension implements ButtonExtension {
  // ==================== 子类必须实现 ====================

  abstract readonly name: string;
  abstract readonly command: string;
  abstract readonly label: string;
  abstract readonly icon: string;

  // ==================== 可选配置（子类可覆写） ====================

  shortcut?: string;
  tagNames?: string[];
  style?: { prop: string; value: string };

  // ==================== 内部状态 ====================

  /** 编辑器实例引用（init 时注入） */
  protected editor: EditorInstance | null = null;

  /** 当前是否激活 */
  private _active = false;

  // ==================== 生命周期 ====================

  /**
   * 初始化：保存 editor 引用
   * 子类覆写时应调用 super.init(editor)
   */
  init(editor: EditorInstance): void {
    this.editor = editor;
  }

  /**
   * 销毁：清理引用
   * 子类覆写时应调用 super.destroy()
   */
  destroy(): void {
    this.editor = null;
    this._active = false;
  }

  // ==================== 状态检查 ====================

  /**
   * 当前按钮是否处于激活状态
   */
  isActive(): boolean {
    return this._active;
  }

  /**
   * 设置为激活状态
   * 由 Toolbar 的 checkActiveButtons 调用
   */
  setActive(): void {
    this._active = true;
  }

  /**
   * 设置为非激活状态
   * 由 Toolbar 的 checkActiveButtons 调用
   */
  setInactive(): void {
    this._active = false;
  }

  /**
   * 检查给定 DOM 节点是否表示此按钮的格式已应用
   *
   * 对标 medium-editor 的 Button.isAlreadyApplied()：
   * - 检查节点的 tagName 是否在 tagNames 列表中
   * - 检查节点的 CSS 样式是否匹配 style 配置
   *
   * Toolbar 爬 DOM 祖先链时会对每个节点调用此方法
   *
   * @param node DOM 节点
   * @returns 是否匹配
   */
  isAlreadyApplied(node: Node): boolean {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    const element = node as HTMLElement;
    const tagName = element.tagName.toLowerCase();

    // 1. 检查 tagNames
    if (this.tagNames && this.tagNames.length > 0) {
      if (this.tagNames.includes(tagName)) {
        return true;
      }
    }

    // 2. 检查 CSS style
    if (this.style) {
      const { prop, value } = this.style;
      const computedValue = element.style.getPropertyValue(prop);

      if (computedValue) {
        // value 可能是多个可选值，用 | 分隔（如 "700|bold"）
        const acceptableValues = value.split("|").map((v) => v.trim().toLowerCase());
        if (acceptableValues.includes(computedValue.toLowerCase())) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Selection 变化时的状态检查
   *
   * 默认实现：通过 EditorState.activeMarks 判断是否激活
   * 子类可以覆写以实现更复杂的逻辑
   */
  checkState(state: EditorState): void {
    // 根据 command 名称映射到 MarkType
    const commandToMark: Record<string, MarkType> = {
      bold: "bold",
      italic: "italic",
      underline: "underline",
      strikeThrough: "strikethrough",
      strikethrough: "strikethrough",
    };

    const markType = commandToMark[this.command];
    if (markType && state.activeMarks.has(markType)) {
      this.setActive();
    } else {
      this.setInactive();
    }
  }

  // ==================== 事件处理 ====================

  /**
   * 按钮点击处理
   *
   * 默认实现：调用 editor.execCommand(command)
   * 子类可以覆写以实现特殊行为（如弹出表单）
   */
  handleClick(_event?: MouseEvent): void {
    if (!this.editor) {
      console.warn(`[${this.name}] handleClick called before init`);
      return;
    }

    this.editor.execCommand(this.command);
  }

  // ==================== 代理方法 ====================

  /**
   * 执行编辑命令的快捷方法
   */
  protected execCommand(command: string, value?: string): void {
    this.editor?.execCommand(command, value);
  }

  /**
   * 订阅编辑器事件的快捷方法
   */
  protected subscribe(event: string, handler: (...args: unknown[]) => void): void {
    this.editor?.on(event, handler);
  }

  /**
   * 触发编辑器事件的快捷方法
   */
  protected trigger(event: string, ...args: unknown[]): void {
    this.editor?.emit(event, ...args);
  }

  // ==================== 辅助方法 ====================

  /**
   * 返回此扩展管理的 DOM 元素
   * 默认返回空数组（按钮本身的 DOM 由 Toolbar 管理）
   */
  getInteractionElements(): HTMLElement[] {
    return [];
  }

  /**
   * State 变化时调用（默认无操作，子类可覆写）
   */
  onStateChange?(_state: EditorState): void;
}
