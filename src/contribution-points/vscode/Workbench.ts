import type {
  CommandContribution,
  ExtensionManifest,
  KeybindingContribution,
  MenuContribution,
  MenuLocation,
} from "./manifest";
import { ContextKeyService } from "./when";

export interface WorkbenchMenuItem {
  command: string;
  title: string;
  icon?: string;
  group?: string;
  order: number;
  when?: string;
  enablement?: string;
  keybinding?: string;
  sourceExtension: string;
  visible: boolean;
  enabled: boolean;
}

export interface ResolvedKeybinding {
  command: string;
  enabled: boolean;
}

export class Workbench {
  private manifests = new Map<string, ExtensionManifest>();
  private readonly contextKeys = new ContextKeyService();

  install(manifest: ExtensionManifest): void {
    this.manifests.set(manifest.name, manifest);
  }

  setContextKey(key: string, value: boolean | string | number | undefined): void {
    this.contextKeys.set(key, value);
  }

  getContextSnapshot(): Record<string, boolean | string | number | undefined> {
    return this.contextKeys.snapshot();
  }

  getMenuItems(location: MenuLocation): WorkbenchMenuItem[] {
    const items: WorkbenchMenuItem[] = [];

    for (const manifest of this.manifests.values()) {
      const menuItems = manifest.contributes.menus?.[location] ?? [];
      for (const menuItem of menuItems) {
        const command = this.findCommand(manifest, menuItem.command);
        if (!command) continue;

        items.push(this.resolveMenuItem(manifest, command, menuItem));
      }
    }

    return items
      .filter((item) => item.visible)
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  }

  findCommandByKeybinding(combo: string): ResolvedKeybinding | undefined {
    for (const manifest of this.manifests.values()) {
      for (const keybinding of manifest.contributes.keybindings ?? []) {
        if (keybinding.key.toLowerCase() !== combo.toLowerCase()) continue;
        if (!this.contextKeys.matches(keybinding.when)) continue;

        const command = this.findCommand(manifest, keybinding.command);
        if (!command) continue;

        return {
          command: keybinding.command,
          enabled: this.contextKeys.matches(command.enablement),
        };
      }
    }

    return undefined;
  }

  getExtensions(): Array<{
    name: string;
    displayName: string;
    activationEvents: string[];
    commandCount: number;
    keybindingCount: number;
    editorTitleMenuCount: number;
    editorContextMenuCount: number;
  }> {
    return [...this.manifests.values()].map((manifest) => ({
      name: manifest.name,
      displayName: manifest.displayName,
      activationEvents: manifest.activationEvents,
      commandCount: manifest.contributes.commands?.length ?? 0,
      keybindingCount: manifest.contributes.keybindings?.length ?? 0,
      editorTitleMenuCount: manifest.contributes.menus?.["editor/title"]?.length ?? 0,
      editorContextMenuCount: manifest.contributes.menus?.["editor/context"]?.length ?? 0,
    }));
  }

  private resolveMenuItem(
    manifest: ExtensionManifest,
    command: CommandContribution,
    menuItem: MenuContribution
  ): WorkbenchMenuItem {
    const keybinding = this.findKeybinding(manifest, menuItem.command);

    return {
      command: command.command,
      title: command.title,
      icon: command.icon,
      group: menuItem.group,
      order: menuItem.order ?? 0,
      when: menuItem.when,
      enablement: command.enablement,
      keybinding: keybinding?.key,
      sourceExtension: manifest.name,
      visible: this.contextKeys.matches(menuItem.when),
      enabled: this.contextKeys.matches(command.enablement),
    };
  }

  private findCommand(
    manifest: ExtensionManifest,
    commandId: string
  ): CommandContribution | undefined {
    return (manifest.contributes.commands ?? []).find(
      (command) => command.command === commandId
    );
  }

  private findKeybinding(
    manifest: ExtensionManifest,
    commandId: string
  ): KeybindingContribution | undefined {
    return (manifest.contributes.keybindings ?? []).find(
      (keybinding) => keybinding.command === commandId
    );
  }
}
