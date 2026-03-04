"use client";

import React from "react";
import { Editor } from "@/rich-editor/components/Editor";

/**
 * Rich Editor Demo 页面
 *
 * 架构对标：medium-editor + Tiptap/ProseMirror
 *
 * 核心架构模式：
 * 1. EditorState + Transaction（不可变状态流转）
 *    - 所有变更走 Transaction，保证数据流的单向性和可追溯性
 *    - 对标 ProseMirror 的 EditorState.apply(transaction)
 *
 * 2. Extension/Button/Form 三层模型（对标 medium-editor）
 *    - Extension：所有功能都是扩展，包括 Toolbar 自身
 *    - ButtonExtension：按钮扩展，与工具栏有约定
 *    - FormExtension：表单扩展，如链接输入框
 *
 * 3. Selection 驱动的 UI 更新
 *    - Selection 变化 → 爬 DOM 祖先链 → 检查每个按钮的 isAlreadyApplied
 *    - 按钮的 active 状态不是按钮自己管的，是 Toolbar 统一判断的
 *    - 浮动工具条（BubbleMenu）和固定工具栏是同一套机制的两种配置
 *
 * 功能列表：
 * - 固定工具栏：加粗、斜体、下划线、标题（H1/H2）、链接、图片、表情
 * - 浮动工具条（BubbleMenu）：加粗、斜体、下划线、翻译、复制
 * - 按钮状态与编辑器状态同步（选中粗体文字时，B 按钮高亮）
 * - 字数统计 / 行数统计（状态栏）
 * - 自动保存（localStorage）
 * - 快捷键（Ctrl+B 加粗 / Ctrl+I 斜体 / Ctrl+U 下划线 / Ctrl+S 保存）
 */
export default function RichEditorPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-56px)] bg-gray-900 overflow-hidden">
      {/* ==================== 顶部说明区 ==================== */}
      <div className="px-6 pt-5 pb-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Editor Extension
          </span>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
            Selection State
          </span>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Transaction
          </span>
        </div>
        <h2 className="text-lg font-bold text-white mb-1">
          富文本编辑器 + 选中浮动工具条
        </h2>
        <p className="text-sm text-gray-400 leading-relaxed">
          对标 medium-editor / Tiptap：Extension/Button 三层模型 ·
          Selection 驱动 UI · EditorState + Transaction 不可变状态流转 ·
          固定 Toolbar + 浮动 BubbleMenu 同一套机制
        </p>
      </div>

      {/* ==================== 架构说明卡片 ==================== */}
      <div className="px-6 pb-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ArchitectureCard
            icon="🧩"
            title="Extension 三层模型"
            description="Extension → ButtonExtension → FormExtension，Toolbar 自身也是 Extension"
            highlight="medium-editor"
          />
          <ArchitectureCard
            icon="🔄"
            title="State + Transaction"
            description="所有变更走 Transaction，不可变状态流转，保证数据流单向可追溯"
            highlight="ProseMirror"
          />
          <ArchitectureCard
            icon="📍"
            title="Selection 驱动"
            description="选区变化 → 爬 DOM 祖先链 → checkState → 按钮高亮 + BubbleMenu 定位"
            highlight="checkState"
          />
        </div>
      </div>

      {/* ==================== 编辑器区域 ==================== */}
      <div className="flex-1 px-6 pb-4 overflow-auto">
        <Editor
          initialContent={INITIAL_CONTENT}
          fixedToolbarButtons={[
            "bold",
            "italic",
            "underline",
            "heading1",
            "heading2",
            "link",
            "image",
            "emoji",
          ]}
          bubbleMenuButtons={[
            "bold",
            "italic",
            "underline",
            "translate",
            "copy",
          ]}
          placeholder="在这里开始输入... 试试选中文字查看浮动工具条 ✨"
          autoSaveInterval={5000}
          minHeight={280}
        />

        {/* ==================== 快捷键提示 ==================== */}
        <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-gray-600">
          <ShortcutHint keys="Ctrl+B" label="加粗" />
          <ShortcutHint keys="Ctrl+I" label="斜体" />
          <ShortcutHint keys="Ctrl+U" label="下划线" />
          <ShortcutHint keys="Ctrl+S" label="保存" />
          <span className="text-gray-700">|</span>
          <span className="text-gray-500">
            选中文字查看浮动工具条 · 自动保存到 localStorage
          </span>
        </div>

        {/* ==================== 架构流程图 ==================== */}
        <div className="mt-6 mb-4">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">
            📐 架构数据流
          </h3>
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 text-[11px] text-gray-400 font-mono leading-relaxed overflow-x-auto">
            <pre className="whitespace-pre select-text">{ARCHITECTURE_DIAGRAM}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== 辅助组件 ====================

function ArchitectureCard({
  icon,
  title,
  description,
  highlight,
}: {
  icon: string;
  title: string;
  description: string;
  highlight: string;
}) {
  return (
    <div className="bg-gray-800/40 border border-gray-700/60 rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-sm">{icon}</span>
        <span className="text-xs font-semibold text-gray-200">{title}</span>
      </div>
      <p className="text-[11px] text-gray-500 leading-relaxed">
        {description}
      </p>
      <span className="inline-block mt-1.5 text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-400">
        对标: {highlight}
      </span>
    </div>
  );
}

function ShortcutHint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-[10px] text-gray-400 font-mono">
        {keys}
      </kbd>
      <span className="text-gray-500">{label}</span>
    </span>
  );
}

// ==================== 常量 ====================

const INITIAL_CONTENT = `<h1>富文本编辑器 Demo</h1>
<p>这是一个对标 <b>medium-editor</b> 和 <b>Tiptap/ProseMirror</b> 的富文本编辑器演示。</p>
<h2>核心架构特性</h2>
<p>🧩 <b>Extension 三层模型</b>：所有功能都是扩展，包括工具栏自身。</p>
<p>🔄 <b>State + Transaction</b>：所有变更走 Transaction，不可变状态流转。</p>
<p>📍 <b>Selection 驱动</b>：选区变化 → 爬 DOM 祖先链 → 按钮状态自动同步。</p>
<h2>试一试</h2>
<p>👉 <b>选中这段文字</b>，查看浮动工具条（BubbleMenu）的效果。</p>
<p>👉 使用工具栏上的按钮来设置 <i>斜体</i>、<u>下划线</u> 等格式。</p>
<p>👉 试试 <b>Ctrl+B</b> 加粗、<b>Ctrl+I</b> 斜体等快捷键。</p>
<blockquote>这是一段引用文字，展示 blockquote 格式的效果。</blockquote>
<p>编辑器会自动保存内容到 localStorage，刷新页面后可以恢复。 ✨</p>`;

const ARCHITECTURE_DIAGRAM = `用户操作 (点击按钮 / 输入文字 / 选中文字)
    │
    ▼
┌─────────────────────────────────────────┐
│         EditorInstance (协调者)           │
│                                         │
│  ┌──────────┐  ┌──────────────────────┐ │
│  │ EventBus │  │ SelectionObserver    │ │
│  │ (事件总线)│  │ (监听 selectionchange│ │
│  │          │  │  爬 DOM 祖先链      │ │
│  │          │  │  检测 activeMarks)   │ │
│  └──────────┘  └──────────────────────┘ │
│                                         │
│  ┌──────────────────────────────────┐   │
│  │ Extension Registry              │   │
│  │  ├ BoldExtension (Button)       │   │
│  │  ├ ItalicExtension (Button)     │   │
│  │  ├ LinkExtension (Form)         │   │
│  │  ├ TranslateExtension (Bubble)  │   │
│  │  ├ WordCountExtension (Logic)   │   │
│  │  └ AutoSaveExtension (Logic)    │   │
│  └──────────────────────────────────┘   │
│                                         │
│  Transaction                            │
│    .toggleMark("bold")                  │
│    .insertText("hello")                 │
│    .dispatch()                          │
│        │                                │
│        ▼                                │
│  EditorState.apply(transaction)         │
│        │                                │
│        ▼                                │
│  newState { content, selection,         │
│             activeMarks, wordCount }    │
│        │                                │
│        ├──→ Toolbar checkState (高亮)   │
│        ├──→ BubbleMenu 定位/显示        │
│        ├──→ StatusBar 更新              │
│        └──→ Extensions.onStateChange()  │
└─────────────────────────────────────────┘`;
