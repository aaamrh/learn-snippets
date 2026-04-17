export type MenuLocation = "editor/title" | "editor/context";

export interface CommandContribution {
  command: string;
  title: string;
  icon?: string;
  enablement?: string;
}

export interface MenuContribution {
  command: string;
  when?: string;
  group?: string;
  order?: number;
}

export interface KeybindingContribution {
  command: string;
  key: string;
  when?: string;
}

export interface ExtensionManifest {
  name: string;
  displayName: string;
  activationEvents: string[];
  contributes: {
    commands?: CommandContribution[];
    menus?: Partial<Record<MenuLocation, MenuContribution[]>>;
    keybindings?: KeybindingContribution[];
  };
}
