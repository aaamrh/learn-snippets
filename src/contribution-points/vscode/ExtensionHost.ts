import type { ExtensionManifest } from "./manifest";

export interface EditorContext {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  selectedText: string;
  updateText: (text: string, selStart?: number, selEnd?: number) => void;
}

export interface RuntimeStatusBarItem {
  id: string;
  alignment: "left" | "right";
  text: (ctx: EditorContext) => string;
}

export interface ExtensionAPI {
  registerCommand: (id: string, handler: (ctx: EditorContext) => void) => void;
  registerStatusBarItem: (item: RuntimeStatusBarItem) => void;
}

export type ActivateFn = (api: ExtensionAPI) => void;

export interface DemoExtensionDefinition {
  manifest: ExtensionManifest;
  activate: ActivateFn;
}

interface InstalledExtension {
  manifest: ExtensionManifest;
  activate: ActivateFn;
  activated: boolean;
}

export class ExtensionHost {
  private readonly extensions = new Map<string, InstalledExtension>();
  private readonly commands = new Map<string, (ctx: EditorContext) => void>();
  private readonly statusBarItems = new Map<string, RuntimeStatusBarItem>();

  install(manifest: ExtensionManifest, activate: ActivateFn): void {
    this.extensions.set(manifest.name, {
      manifest,
      activate,
      activated: false,
    });
  }

  activateEagerExtensions(): void {
    for (const extension of this.extensions.values()) {
      if (extension.activated) continue;
      if (extension.manifest.activationEvents.includes("*")) {
        this.activate(extension.manifest.name);
      }
    }
  }

  activate(name: string): void {
    const extension = this.extensions.get(name);
    if (!extension || extension.activated) return;

    const api: ExtensionAPI = {
      registerCommand: (id, handler) => {
        this.commands.set(id, handler);
      },
      registerStatusBarItem: (item) => {
        this.statusBarItems.set(item.id, item);
      },
    };

    extension.activate(api);
    extension.activated = true;
  }

  executeCommand(id: string, ctx: EditorContext): void {
    for (const extension of this.extensions.values()) {
      if (extension.activated) continue;
      if (extension.manifest.activationEvents.includes(`onCommand:${id}`)) {
        this.activate(extension.manifest.name);
      }
    }

    const handler = this.commands.get(id);
    if (handler) {
      handler(ctx);
    }
  }

  isActivated(name: string): boolean {
    return this.extensions.get(name)?.activated ?? false;
  }

  getStatusBarItems(
    ctx: EditorContext
  ): Array<{ id: string; alignment: "left" | "right"; text: string }> {
    return [...this.statusBarItems.values()].map((item) => ({
      id: item.id,
      alignment: item.alignment,
      text: item.text(ctx),
    }));
  }
}
