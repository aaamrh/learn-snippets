// ==================== Translate Plugin (v2 Manifest 格式) ====================
//
// 选中文字后翻译为英文（模拟翻译，实际可对接翻译 API）
//
// 对标 VS Code 插件的 extension.ts：
// - 导出 activate / deactivate
// - 在 activate 中通过 api.commands.registerCommand 注册命令处理器
// - 命令 ID 必须与 Manifest contributes.commands 中声明的一致
//
// Manifest（定义在 manifest-types.ts 的 EXAMPLE_TRANSLATE_MANIFEST）：
// - id: "translate"
// - activationEvents: ["onCommand:translate.translateSelection"]
// - permissions: ["editor:getSelectedText", "editor:replaceSelection", "commands:register", "ui:selectionToolbar"]
// - contributes.commands: [{ command: "translate.translateSelection", title: "翻译选中文字", icon: "🌐" }]
// - contributes.selectionToolbar: [{ command: "translate.translateSelection", title: "翻译", icon: "🌐", when: "editorHasSelection" }]
// - contributes.keybindings: [{ command: "translate.translateSelection", key: "Ctrl+Shift+T", when: "editorHasSelection" }]

import type { PluginEntry, PluginAPI } from "../../manifest-types";

// ==================== 模拟翻译引擎 ====================

/**
 * 简单的中英文词典（模拟翻译）
 *
 * 在真实场景中，这里会调用翻译 API（Google Translate / DeepL / 百度翻译等）
 * Demo 中用词典 + 规则模拟，避免外部依赖
 */
const DICT: Record<string, string> = {
  // 常见中文 → 英文
  "你好": "Hello",
  "世界": "World",
  "前端": "Frontend",
  "架构": "Architecture",
  "插件": "Plugin",
  "系统": "System",
  "翻译": "Translate",
  "选中": "Selected",
  "文字": "Text",
  "编辑器": "Editor",
  "工具": "Tool",
  "按钮": "Button",
  "命令": "Command",
  "事件": "Event",
  "权限": "Permission",
  "沙箱": "Sandbox",
  "设计": "Design",
  "模式": "Pattern",
  "注册": "Register",
  "激活": "Activate",
  "状态": "State",
  "组件": "Component",
  "函数": "Function",
  "接口": "Interface",
  "类型": "Type",
  "管理": "Management",
  "配置": "Configuration",
  "测试": "Test",
  "调试": "Debug",
  "日志": "Log",
  "错误": "Error",
  "成功": "Success",
  "加载": "Loading",
  "保存": "Save",
  "删除": "Delete",
  "创建": "Create",
  "更新": "Update",
  "查询": "Query",
  "数据": "Data",
  "列表": "List",
  "页面": "Page",
  "用户": "User",
  "密码": "Password",
  "登录": "Login",
  "退出": "Logout",
  "搜索": "Search",
  "设置": "Settings",
  "帮助": "Help",
  "关于": "About",
  "首页": "Home",
  "返回": "Back",
  "下一步": "Next",
  "上一步": "Previous",
  "确认": "Confirm",
  "取消": "Cancel",
  "提交": "Submit",
  "重置": "Reset",
};

/**
 * 模拟翻译函数
 *
 * 规则：
 * 1. 如果输入包含中文字符，尝试词典翻译，未命中则标记 [Translated]
 * 2. 如果输入是纯英文，模拟「翻译为中文」的效果
 * 3. 模拟 200-500ms 的网络延迟
 */
async function simulateTranslation(text: string): Promise<string> {
  // 模拟网络延迟
  await new Promise((resolve) =>
    setTimeout(resolve, 200 + Math.random() * 300)
  );

  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  // 检测是否包含中文
  const hasChinese = /[\u4e00-\u9fff]/.test(trimmed);

  if (hasChinese) {
    // 尝试词典逐词翻译
    let result = trimmed;
    let translated = false;

    for (const [cn, en] of Object.entries(DICT)) {
      if (result.includes(cn)) {
        result = result.replaceAll(cn, en);
        translated = true;
      }
    }

    if (translated) {
      return result;
    }

    // 词典未命中，标记翻译
    return `[Translated] ${trimmed}`;
  }

  // 英文输入，返回带标记的「翻译」
  return `[已翻译] ${trimmed}`;
}

// ==================== 插件入口 ====================

const translatePlugin: PluginEntry = {
  /**
   * 激活阶段
   *
   * 注册 "translate.translateSelection" 命令的处理器。
   * 当用户点击 SelectionToolbar 的「翻译」按钮或按 Ctrl+Shift+T 时，
   * PluginHost 会调用此命令。
   *
   * 流程：
   * 1. 获取选中文字（api.editor.getSelectedText）
   * 2. 调用模拟翻译
   * 3. 用翻译结果替换选中文字（api.editor.replaceSelection）
   * 4. 通过状态栏显示翻译结果（如果有状态栏权限的话）
   */
  activate(api: PluginAPI): void {
    // 注册命令处理器
    api.commands.registerCommand(
      "translate.translateSelection",
      async () => {
        // 1. 获取选中文字
        const selectedText = await api.editor.getSelectedText();

        if (!selectedText || selectedText.trim() === "") {
          console.log("[Translate] No text selected, skipping translation.");
          return;
        }

        console.log(`[Translate] Translating: "${selectedText}"`);

        try {
          // 2. 调用翻译
          const translated = await simulateTranslation(selectedText);

          // 3. 替换选中文字
          await api.editor.replaceSelection(translated);

          console.log(
            `[Translate] Translation complete: "${selectedText}" → "${translated}"`
          );
        } catch (error) {
          console.error("[Translate] Translation failed:", error);
        }
      }
    );

    console.log("[Translate] Plugin activated. Command registered.");
  },

  /**
   * 停用阶段
   *
   * 命令处理器通过 Disposable 自动清理，
   * 此处不需要额外清理逻辑。
   */
  deactivate(): void {
    console.log("[Translate] Plugin deactivated.");
  },
};

export default translatePlugin;
