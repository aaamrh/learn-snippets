import type { ActivateFn, DemoExtensionDefinition } from "./ExtensionHost";
import type { ExtensionManifest } from "./manifest";

const formattingManifest: ExtensionManifest = {
  name: "demo.formatting",
  displayName: "Formatting Tools",
  activationEvents: [
    "onCommand:demo.bold",
    "onCommand:demo.italic",
    "onCommand:demo.heading",
  ],
  contributes: {
    commands: [
      {
        command: "demo.bold",
        title: "Bold",
        icon: "B",
        enablement: "hasSelection && !readOnly",
      },
      {
        command: "demo.italic",
        title: "Italic",
        icon: "I",
        enablement: "hasSelection && !readOnly",
      },
      {
        command: "demo.heading",
        title: "Heading",
        icon: "H1",
        enablement: "!readOnly",
      },
    ],
    menus: {
      "editor/title": [
        { command: "demo.bold", when: "editorFocus", order: 1 },
        { command: "demo.italic", when: "editorFocus", order: 2 },
        { command: "demo.heading", when: "editorFocus", order: 3 },
      ],
      "editor/context": [
        { command: "demo.bold", when: "hasSelection", group: "1_modification", order: 1 },
        { command: "demo.italic", when: "hasSelection", group: "1_modification", order: 2 },
        { command: "demo.heading", when: "editorFocus", group: "2_insert", order: 1 },
      ],
    },
    keybindings: [
      { command: "demo.bold", key: "ctrl+b", when: "editorFocus && hasSelection && !readOnly" },
      { command: "demo.italic", key: "ctrl+i", when: "editorFocus && hasSelection && !readOnly" },
      { command: "demo.heading", key: "ctrl+alt+1", when: "editorFocus && !readOnly" },
    ],
  },
};

const formattingActivate: ActivateFn = (api) => {
  api.registerCommand("demo.bold", (ctx) => {
    if (!ctx.selectedText) return;
    const wrapped = `**${ctx.selectedText}**`;
    const before = ctx.text.slice(0, ctx.selectionStart);
    const after = ctx.text.slice(ctx.selectionEnd);
    ctx.updateText(before + wrapped + after, ctx.selectionStart + 2, ctx.selectionEnd + 2);
  });

  api.registerCommand("demo.italic", (ctx) => {
    if (!ctx.selectedText) return;
    const wrapped = `*${ctx.selectedText}*`;
    const before = ctx.text.slice(0, ctx.selectionStart);
    const after = ctx.text.slice(ctx.selectionEnd);
    ctx.updateText(before + wrapped + after, ctx.selectionStart + 1, ctx.selectionEnd + 1);
  });

  api.registerCommand("demo.heading", (ctx) => {
    const lineStart = ctx.text.lastIndexOf("\n", ctx.selectionStart - 1) + 1;
    const before = ctx.text.slice(0, lineStart);
    const after = ctx.text.slice(lineStart);
    ctx.updateText(before + "# " + after, ctx.selectionStart + 2, ctx.selectionEnd + 2);
  });
};

const wordCountManifest: ExtensionManifest = {
  name: "demo.wordCount",
  displayName: "Word Count",
  activationEvents: ["*"],
  contributes: {},
};

const wordCountActivate: ActivateFn = (api) => {
  api.registerStatusBarItem({
    id: "demo.wordCount.words",
    alignment: "left",
    text: (ctx) => `字数: ${ctx.text.replace(/\s/g, "").length}`,
  });

  api.registerStatusBarItem({
    id: "demo.wordCount.selection",
    alignment: "right",
    text: (ctx) => `选中: ${ctx.selectedText.length}`,
  });
};

export const DEMO_EXTENSIONS: DemoExtensionDefinition[] = [
  { manifest: formattingManifest, activate: formattingActivate },
  { manifest: wordCountManifest, activate: wordCountActivate },
];
