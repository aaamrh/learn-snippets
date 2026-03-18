// ==================== VSCode 模式 ====================
// 核心差异：Manifest（静态 JSON）与 Activation（动态代码）分离
// Manifest 可以在不执行代码的情况下被读取 → 实现懒加载、Marketplace 展示

export interface CommandDeclaration {
  command: string;
  title: string;
  icon?: string;
  keybinding?: string;
}

export interface MenuContribution {
  command: string;
  when?: string; // e.g. "hasSelection", "!readOnly"
  group?: string;
  order?: number;
}

export interface StatusBarContribution {
  id: string;
  alignment: "left" | "right";
  priority?: number;
}

// ---- Manifest: 纯数据，JSON 可序列化，不含任何函数 ----
export interface ExtensionManifest {
  name: string;
  displayName: string;
  activationEvents: string[]; // e.g. ["onCommand:bold", "*"]
  contributes: {
    commands?: CommandDeclaration[];
    menus?: {
      "editor/toolbar"?: MenuContribution[];
      "editor/context"?: MenuContribution[];
    };
    statusBar?: StatusBarContribution[];
  };
}

export interface EditorContext {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  selectedText: string;
  updateText: (text: string, selStart?: number, selEnd?: number) => void;
}

// ---- Extension API: 激活时传给扩展的接口 ----
export interface ExtensionAPI {
  registerCommand: (id: string, handler: (ctx: EditorContext) => void) => void;
  registerStatusBarProvider: (
    id: string,
    render: (ctx: EditorContext) => string
  ) => void;
}

export type ActivateFn = (api: ExtensionAPI) => void;

interface InstalledExtension {
  manifest: ExtensionManifest;
  activate: ActivateFn;
  activated: boolean;
}

// ==================== ExtensionHost ====================

export class ExtensionHost {
  private extensions = new Map<string, InstalledExtension>();
  private commands = new Map<string, (ctx: EditorContext) => void>();
  private statusBarProviders = new Map<
    string,
    (ctx: EditorContext) => string
  >();
  private contextKeys = new Map<string, boolean>();

  install(manifest: ExtensionManifest, activate: ActivateFn): void {
    this.extensions.set(manifest.name, {
      manifest,
      activate,
      activated: false,
    });
  }

  uninstall(name: string): void {
    const ext = this.extensions.get(name);
    if (!ext) return;
    // Remove commands declared by this extension
    for (const cmd of ext.manifest.contributes.commands ?? []) {
      this.commands.delete(cmd.command);
    }
    for (const sb of ext.manifest.contributes.statusBar ?? []) {
      this.statusBarProviders.delete(sb.id);
    }
    this.extensions.delete(name);
  }

  activate(name: string): void {
    const ext = this.extensions.get(name);
    if (!ext || ext.activated) return;

    const api: ExtensionAPI = {
      registerCommand: (id, handler) => this.commands.set(id, handler),
      registerStatusBarProvider: (id, render) =>
        this.statusBarProviders.set(id, render),
    };

    ext.activate(api);
    ext.activated = true;
  }

  // ---- Context Keys (for "when" clause evaluation) ----

  setContextKey(key: string, value: boolean): void {
    this.contextKeys.set(key, value);
  }

  private evaluateWhen(when?: string): boolean {
    if (!when) return true;
    // Simple evaluator: supports "key" and "!key"
    return when.split("&&").every((clause) => {
      const trimmed = clause.trim();
      if (trimmed.startsWith("!")) {
        return !this.contextKeys.get(trimmed.slice(1));
      }
      return !!this.contextKeys.get(trimmed);
    });
  }

  // ---- Host Queries ----

  getToolbarItems(): Array<{
    command: string;
    title: string;
    icon?: string;
    keybinding?: string;
    visible: boolean;
    when?: string;
  }> {
    const items: Array<{
      command: string;
      title: string;
      icon?: string;
      keybinding?: string;
      visible: boolean;
      when?: string;
      order: number;
    }> = [];

    for (const ext of this.extensions.values()) {
      const menuItems = ext.manifest.contributes.menus?.["editor/toolbar"] ?? [];
      for (const mi of menuItems) {
        const cmd = (ext.manifest.contributes.commands ?? []).find(
          (c) => c.command === mi.command
        );
        if (cmd) {
          items.push({
            command: cmd.command,
            title: cmd.title,
            icon: cmd.icon,
            keybinding: cmd.keybinding,
            visible: this.evaluateWhen(mi.when),
            when: mi.when,
            order: mi.order ?? 0,
          });
        }
      }
    }

    return items.sort((a, b) => a.order - b.order);
  }

  getContextMenuItems(): Array<{
    command: string;
    title: string;
    visible: boolean;
    when?: string;
    group?: string;
    keybinding?: string;
  }> {
    const items: Array<{
      command: string;
      title: string;
      visible: boolean;
      when?: string;
      group?: string;
      keybinding?: string;
    }> = [];

    for (const ext of this.extensions.values()) {
      const menuItems = ext.manifest.contributes.menus?.["editor/context"] ?? [];
      for (const mi of menuItems) {
        const cmd = (ext.manifest.contributes.commands ?? []).find(
          (c) => c.command === mi.command
        );
        if (cmd) {
          items.push({
            command: cmd.command,
            title: cmd.title,
            visible: this.evaluateWhen(mi.when),
            when: mi.when,
            group: mi.group,
            keybinding: cmd.keybinding,
          });
        }
      }
    }

    return items;
  }

  getStatusBarItems(
    ctx: EditorContext
  ): Array<{ id: string; text: string; alignment: "left" | "right" }> {
    const items: Array<{
      id: string;
      text: string;
      alignment: "left" | "right";
    }> = [];

    for (const ext of this.extensions.values()) {
      for (const sb of ext.manifest.contributes.statusBar ?? []) {
        const provider = this.statusBarProviders.get(sb.id);
        if (provider) {
          items.push({
            id: sb.id,
            text: provider(ctx),
            alignment: sb.alignment,
          });
        }
      }
    }

    return items;
  }

  executeCommand(id: string, ctx: EditorContext): void {
    // Auto-activate extensions that declare "onCommand:<id>"
    for (const ext of this.extensions.values()) {
      if (
        !ext.activated &&
        ext.manifest.activationEvents.includes(`onCommand:${id}`)
      ) {
        this.activate(ext.manifest.name);
      }
    }
    const handler = this.commands.get(id);
    if (handler) handler(ctx);
  }

  findByKeybinding(combo: string): string | undefined {
    for (const ext of this.extensions.values()) {
      for (const cmd of ext.manifest.contributes.commands ?? []) {
        if (cmd.keybinding === combo) return cmd.command;
      }
    }
    return undefined;
  }

  // ---- Inspection ----

  getExtensions(): Array<{
    name: string;
    displayName: string;
    activated: boolean;
    manifest: ExtensionManifest;
  }> {
    return [...this.extensions.values()].map((ext) => ({
      name: ext.manifest.name,
      displayName: ext.manifest.displayName,
      activated: ext.activated,
      manifest: ext.manifest,
    }));
  }
}
