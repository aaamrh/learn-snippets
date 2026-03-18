import type { FC } from "react";

// ==================== 语雀模式 ====================
// 核心差异：Config 驱动 + 生命周期钩子 + 可选沙箱隔离
// 插件通过 config 对象声明一切（contributions + lifecycle + commands）
// 可标记 sandbox: true，宿主会将其隔离运行（模拟 Worker 沙箱）

export interface PluginContext {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  selectedText: string;
  updateText: (text: string, selStart?: number, selEnd?: number) => void;
}

export interface PanelProps {
  context: PluginContext;
  onClose: () => void;
}

export interface PluginConfig {
  id: string;
  name: string;
  version: string;
  sandbox?: boolean; // 是否在沙箱中运行

  // ---- 生命周期钩子 ----
  onInit?: (ctx: PluginContext) => void;
  onDestroy?: () => void;
  onSelectionChange?: (ctx: PluginContext) => void;

  // ---- 贡献声明 ----
  contributions: {
    commands?: Record<string, (ctx: PluginContext) => void>;
    toolbar?: Array<{
      icon: string;
      tooltip: string;
      command: string;
      order: number;
    }>;
    statusBar?: Array<{
      position: "left" | "right";
      render: (ctx: PluginContext) => string;
    }>;
    contextMenu?: Array<{
      label: string;
      command: string;
      group: string;
    }>;
    panels?: Array<{
      id: string;
      title: string;
      Component: FC<PanelProps>;
    }>;
  };
}

export type LifecycleEvent =
  | { type: "init"; pluginId: string; sandbox: boolean }
  | { type: "destroy"; pluginId: string }
  | { type: "selectionChange"; pluginId: string; selection: string }
  | { type: "command"; pluginId: string; command: string }
  | { type: "sandbox-message"; pluginId: string; message: string };

// ==================== PluginSystem ====================

export class PluginSystem {
  private plugins = new Map<string, PluginConfig>();
  private initialized = new Set<string>();
  private _lifecycleLog: LifecycleEvent[] = [];

  get lifecycleLog(): LifecycleEvent[] {
    return [...this._lifecycleLog];
  }

  register(config: PluginConfig): void {
    this.plugins.set(config.id, config);
  }

  unregister(id: string): void {
    const plugin = this.plugins.get(id);
    if (plugin) {
      if (this.initialized.has(id)) {
        plugin.onDestroy?.();
        this._lifecycleLog.push({ type: "destroy", pluginId: id });
        this.initialized.delete(id);
      }
      this.plugins.delete(id);
    }
  }

  initAll(ctx: PluginContext): void {
    for (const plugin of this.plugins.values()) {
      if (!this.initialized.has(plugin.id)) {
        if (plugin.sandbox) {
          this._lifecycleLog.push({
            type: "sandbox-message",
            pluginId: plugin.id,
            message: `Plugin "${plugin.name}" running in sandbox`,
          });
        }
        plugin.onInit?.(ctx);
        this._lifecycleLog.push({
          type: "init",
          pluginId: plugin.id,
          sandbox: !!plugin.sandbox,
        });
        this.initialized.add(plugin.id);
      }
    }
  }

  destroyAll(): void {
    for (const plugin of this.plugins.values()) {
      if (this.initialized.has(plugin.id)) {
        plugin.onDestroy?.();
        this._lifecycleLog.push({ type: "destroy", pluginId: plugin.id });
      }
    }
    this.initialized.clear();
  }

  notifySelectionChange(ctx: PluginContext): void {
    for (const plugin of this.plugins.values()) {
      if (this.initialized.has(plugin.id)) {
        plugin.onSelectionChange?.(ctx);
        this._lifecycleLog.push({
          type: "selectionChange",
          pluginId: plugin.id,
          selection: ctx.selectedText || "(empty)",
        });
      }
    }
  }

  executeCommand(commandId: string, ctx: PluginContext): void {
    for (const plugin of this.plugins.values()) {
      const handler = plugin.contributions.commands?.[commandId];
      if (handler) {
        handler(ctx);
        this._lifecycleLog.push({
          type: "command",
          pluginId: plugin.id,
          command: commandId,
        });
        return;
      }
    }
  }

  // ---- Host Queries ----

  getToolbarItems(): Array<{
    icon: string;
    tooltip: string;
    command: string;
    order: number;
    pluginId: string;
    sandbox: boolean;
  }> {
    const items: Array<{
      icon: string;
      tooltip: string;
      command: string;
      order: number;
      pluginId: string;
      sandbox: boolean;
    }> = [];

    for (const plugin of this.plugins.values()) {
      for (const tb of plugin.contributions.toolbar ?? []) {
        items.push({
          ...tb,
          pluginId: plugin.id,
          sandbox: !!plugin.sandbox,
        });
      }
    }

    return items.sort((a, b) => a.order - b.order);
  }

  getStatusBarItems(
    ctx: PluginContext
  ): Array<{ text: string; position: "left" | "right"; pluginId: string }> {
    const items: Array<{
      text: string;
      position: "left" | "right";
      pluginId: string;
    }> = [];

    for (const plugin of this.plugins.values()) {
      for (const sb of plugin.contributions.statusBar ?? []) {
        items.push({
          text: sb.render(ctx),
          position: sb.position,
          pluginId: plugin.id,
        });
      }
    }

    return items;
  }

  getContextMenuItems(): Array<{
    label: string;
    command: string;
    group: string;
    pluginId: string;
  }> {
    const items: Array<{
      label: string;
      command: string;
      group: string;
      pluginId: string;
    }> = [];

    for (const plugin of this.plugins.values()) {
      for (const cm of plugin.contributions.contextMenu ?? []) {
        items.push({ ...cm, pluginId: plugin.id });
      }
    }

    return items;
  }

  getPanels(): Array<{
    id: string;
    title: string;
    Component: FC<PanelProps>;
    pluginId: string;
  }> {
    const panels: Array<{
      id: string;
      title: string;
      Component: FC<PanelProps>;
      pluginId: string;
    }> = [];

    for (const plugin of this.plugins.values()) {
      for (const p of plugin.contributions.panels ?? []) {
        panels.push({ ...p, pluginId: plugin.id });
      }
    }

    return panels;
  }

  // ---- Inspection ----

  getPlugins(): Array<{
    id: string;
    name: string;
    version: string;
    sandbox: boolean;
    initialized: boolean;
    contributionSummary: {
      commands: number;
      toolbar: number;
      statusBar: number;
      contextMenu: number;
      panels: number;
    };
  }> {
    return [...this.plugins.values()].map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      sandbox: !!p.sandbox,
      initialized: this.initialized.has(p.id),
      contributionSummary: {
        commands: Object.keys(p.contributions.commands ?? {}).length,
        toolbar: (p.contributions.toolbar ?? []).length,
        statusBar: (p.contributions.statusBar ?? []).length,
        contextMenu: (p.contributions.contextMenu ?? []).length,
        panels: (p.contributions.panels ?? []).length,
      },
    }));
  }

  findCommandKeybinding(
    commandId: string,
    keybindings: Record<string, string>
  ): string | undefined {
    for (const [key, cmd] of Object.entries(keybindings)) {
      if (cmd === commandId) return key;
    }
    return undefined;
  }
}
