// ==================== Tiptap 模式 ====================
// 核心差异：Extension.create() 工厂模式 + 链式命令 + Transaction 不可变状态
// 命令可链式调用：editor.chain().focus().toggleBold().run()
// 可以用 can() 提前检查命令是否可执行

export interface EditorState {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

type CommandFn = (state: EditorState) => EditorState | false;

export interface ExtensionConfig<
  Options extends Record<string, unknown> = Record<string, unknown>,
  Storage extends Record<string, unknown> = Record<string, unknown>,
> {
  name: string;
  addOptions?: () => Options;
  addStorage?: () => Storage;
  addCommands?: () => Record<string, (...args: unknown[]) => CommandFn>;
  addKeyboardShortcuts?: () => Record<string, string>; // key → command name
  onSelectionUpdate?: (state: EditorState, storage: Storage) => void;
}

// ==================== Extension ====================

export class Extension<
  Options extends Record<string, unknown> = Record<string, unknown>,
  Storage extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly name: string;
  readonly options: Options;
  readonly storage: Storage;
  private commandFactories: Record<string, (...args: unknown[]) => CommandFn>;
  private shortcuts: Record<string, string>;
  private selectionHandler?: (state: EditorState, storage: Storage) => void;

  private constructor(config: ExtensionConfig<Options, Storage>) {
    this.name = config.name;
    this.options = config.addOptions?.() ?? ({} as Options);
    this.storage = config.addStorage?.() ?? ({} as Storage);
    this.commandFactories = config.addCommands?.() ?? {};
    this.shortcuts = config.addKeyboardShortcuts?.() ?? {};
    this.selectionHandler = config.onSelectionUpdate;
  }

  static create<
    O extends Record<string, unknown> = Record<string, unknown>,
    S extends Record<string, unknown> = Record<string, unknown>,
  >(config: ExtensionConfig<O, S>): Extension<O, S> {
    return new Extension(config);
  }

  getCommandNames(): string[] {
    return Object.keys(this.commandFactories);
  }

  getCommand(name: string): ((...args: unknown[]) => CommandFn) | undefined {
    return this.commandFactories[name];
  }

  getShortcuts(): Record<string, string> {
    return { ...this.shortcuts };
  }

  notifySelectionUpdate(state: EditorState): void {
    this.selectionHandler?.(state, this.storage);
  }
}

// ==================== CommandChain ====================

class CommandChain {
  private commands: Array<{ name: string; fn: CommandFn }> = [];
  private currentState: EditorState;
  private editor: TiptapEditor;
  private dryRun: boolean;

  constructor(editor: TiptapEditor, state: EditorState, dryRun: boolean) {
    this.editor = editor;
    this.currentState = { ...state };
    this.dryRun = dryRun;
  }

  // 动态添加命令到链
  [key: string]: unknown;

  focus(): this {
    // focus 在我们的简化模型中是 no-op
    return this;
  }

  run(): boolean {
    if (this.dryRun) {
      // can() 模式：检查所有命令是否可执行
      let state = { ...this.currentState };
      for (const { fn } of this.commands) {
        const result = fn(state);
        if (result === false) return false;
        state = result;
      }
      return true;
    }

    // 实际执行
    let state = { ...this.currentState };
    for (const { fn } of this.commands) {
      const result = fn(state);
      if (result === false) return false;
      state = result;
    }
    this.editor.applyState(state);
    return true;
  }

  addCommand(name: string, fn: CommandFn): this {
    this.commands.push({ name, fn });
    return this;
  }
}

// ==================== TiptapEditor ====================

export class TiptapEditor {
  private extensions: Extension[] = [];
  private _state: EditorState;
  private onUpdate?: (state: EditorState) => void;
  private _commandLog: Array<{ chain: string; success: boolean }> = [];

  constructor(config: {
    extensions: Extension[];
    content: string;
    onUpdate?: (state: EditorState) => void;
  }) {
    this.extensions = config.extensions;
    this._state = {
      text: config.content,
      selectionStart: 0,
      selectionEnd: 0,
    };
    this.onUpdate = config.onUpdate;
  }

  get state(): EditorState {
    return { ...this._state };
  }

  get commandLog(): Array<{ chain: string; success: boolean }> {
    return [...this._commandLog];
  }

  updateSelection(start: number, end: number): void {
    this._state = { ...this._state, selectionStart: start, selectionEnd: end };
    for (const ext of this.extensions) {
      ext.notifySelectionUpdate(this._state);
    }
  }

  updateText(text: string): void {
    this._state = { ...this._state, text };
    this.onUpdate?.(this._state);
  }

  applyState(state: EditorState): void {
    this._state = { ...state };
    this.onUpdate?.(this._state);
  }

  chain(): CommandChain {
    return this.buildChain(false);
  }

  can(): { chain: () => CommandChain } {
    return {
      chain: () => this.buildChain(true),
    };
  }

  private buildChain(dryRun: boolean): CommandChain {
    const chain = new CommandChain(this, this._state, dryRun);

    // Attach all commands from all extensions to the chain as methods
    for (const ext of this.extensions) {
      for (const cmdName of ext.getCommandNames()) {
        const factory = ext.getCommand(cmdName)!;
        (chain as Record<string, unknown>)[cmdName] = (
          ...args: unknown[]
        ): CommandChain => {
          const fn = factory(...args);
          return chain.addCommand(`${ext.name}.${cmdName}`, fn);
        };
      }
    }

    return chain;
  }

  handleKeyDown(combo: string): boolean {
    for (const ext of this.extensions) {
      const shortcuts = ext.getShortcuts();
      const cmdName = shortcuts[combo];
      if (cmdName) {
        const chainNames: string[] = [];
        const c = this.chain();
        // Execute the command through chain
        const factory = ext.getCommand(cmdName);
        if (factory) {
          const fn = factory();
          (c as unknown as CommandChain).addCommand(
            `${ext.name}.${cmdName}`,
            fn
          );
          chainNames.push(cmdName);
        }
        const success = c.run();
        this._commandLog.push({
          chain: `chain().${chainNames.join(".")}.run()`,
          success,
        });
        return success;
      }
    }
    return false;
  }

  executeCommand(extName: string, cmdName: string): boolean {
    const ext = this.extensions.find((e) => e.name === extName);
    if (!ext) return false;
    const factory = ext.getCommand(cmdName);
    if (!factory) return false;

    const fn = factory();
    const c = this.chain();
    (c as unknown as CommandChain).addCommand(`${extName}.${cmdName}`, fn);
    const success = c.run();

    this._commandLog.push({
      chain: `chain().${cmdName}().run()`,
      success,
    });
    return success;
  }

  getExtensions(): Extension[] {
    return [...this.extensions];
  }
}
