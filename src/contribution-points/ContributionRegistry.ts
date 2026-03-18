import type { FC } from "react";

// ==================== Types ====================

export interface EditorContext {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  selectedText: string;
  updateText: (newText: string, newSelStart?: number, newSelEnd?: number) => void;
}

export interface PanelProps {
  context: EditorContext;
  onClose: () => void;
}

export interface Extension {
  id: string;
  label: string;
  execute: (ctx: EditorContext) => void;
  keybinding?: string;
  // ---- Contribution Points (each is an optional UI slot declaration) ----
  toolbar?: { icon: string; label: string; order: number };
  statusBar?: {
    position: "left" | "right";
    render: (ctx: EditorContext) => string;
  };
  contextMenu?: { label: string; group: string };
  Panel?: FC<PanelProps>;
}

// ==================== Registry ====================

export class ContributionRegistry {
  private extensions = new Map<string, Extension>();

  register(ext: Extension): void {
    this.extensions.set(ext.id, ext);
  }

  unregister(id: string): void {
    this.extensions.delete(id);
  }

  execute(id: string, ctx: EditorContext): void {
    const ext = this.extensions.get(id);
    if (ext) {
      ext.execute(ctx);
    }
  }

  findByKeybinding(combo: string): Extension | undefined {
    for (const ext of this.extensions.values()) {
      if (ext.keybinding === combo) {
        return ext;
      }
    }
    return undefined;
  }

  getToolbarItems(): Extension[] {
    return [...this.extensions.values()]
      .filter((ext) => ext.toolbar != null)
      .sort((a, b) => a.toolbar!.order - b.toolbar!.order);
  }

  getStatusBarItems(): Extension[] {
    return [...this.extensions.values()].filter(
      (ext) => ext.statusBar != null
    );
  }

  getContextMenuItems(): Extension[] {
    return [...this.extensions.values()].filter(
      (ext) => ext.contextMenu != null
    );
  }

  getExtension(id: string): Extension | undefined {
    return this.extensions.get(id);
  }

  getAll(): Extension[] {
    return [...this.extensions.values()];
  }
}
