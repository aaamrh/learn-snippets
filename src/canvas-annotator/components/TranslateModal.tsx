"use client";

import React, { useState, useCallback, useRef, useEffect, useId } from "react";

// ==================== Types ====================

export interface TranslatePopoverProps {
  /** 触发按钮的 DOM ref，Popover 锚定到它的下方 */
  anchorRef: React.RefObject<HTMLElement | null>;
  isOpen: boolean;
  onClose: () => void;
  /**
   * 目标语言（受控，来自 appState.translateTargetLang）
   * 通过 SplitButton 选语言 → changeTranslateTargetLang Action →
   * appState.translateTargetLang 变化 → 这里同步更新
   */
  targetLangProp?: string;
}

type LangOption = { value: string; label: string; flag: string };

// ==================== 语言列表 ====================

export const TRANSLATE_LANGS: LangOption[] = [
  { value: "zh", label: "中文", flag: "🇨🇳" },
  { value: "en", label: "英语", flag: "🇺🇸" },
  { value: "ja", label: "日语", flag: "🇯🇵" },
  { value: "ko", label: "韩语", flag: "🇰🇷" },
  { value: "fr", label: "法语", flag: "🇫🇷" },
  { value: "de", label: "德语", flag: "🇩🇪" },
  { value: "es", label: "西班牙语", flag: "🇪🇸" },
  { value: "ru", label: "俄语", flag: "🇷🇺" },
  { value: "pt", label: "葡萄牙语", flag: "🇵🇹" },
  { value: "ar", label: "阿拉伯语", flag: "🇸🇦" },
  { value: "it", label: "意大利语", flag: "🇮🇹" },
  { value: "th", label: "泰语", flag: "🇹🇭" },
];

// ==================== MyMemory API ====================

async function callTranslateApi(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  const from = sourceLang === "auto" ? "" : sourceLang;
  const langPair = from ? `${from}|${targetLang}` : `|${targetLang}`;

  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", text);
  url.searchParams.set("langpair", langPair);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  if (data.responseStatus !== 200) {
    throw new Error(data.responseDetails ?? "翻译失败");
  }

  return data.responseData.translatedText as string;
}

// ==================== usePopoverPosition ====================

/**
 * 根据 anchorRef 计算 Popover 的左上角坐标，始终锚定在按钮正下方居中。
 * 同时处理视口边界溢出（左右翻转）。
 */
function usePopoverPosition(
  anchorRef: React.RefObject<HTMLElement | null>,
  isOpen: boolean,
  popoverWidth: number,
) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!isOpen || !anchorRef.current) {
      setPos(null);
      return;
    }

    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const gap = 8; // px between button bottom and popover top

      let left = rect.left + rect.width / 2 - popoverWidth / 2;
      // 防止溢出右侧
      if (left + popoverWidth > window.innerWidth - 8) {
        left = window.innerWidth - 8 - popoverWidth;
      }
      // 防止溢出左侧
      if (left < 8) left = 8;

      setPos({ top: rect.bottom + gap, left });
    };

    update();

    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [isOpen, anchorRef, popoverWidth]);

  return pos;
}

// ==================== TranslatePopover ====================

const POPOVER_WIDTH = 480;
const MAX_CHARS = 500;

/**
 * TranslatePopover —— 翻译浮层
 *
 * 设计要点（对标 Excalidraw Island/Popover 模式）：
 * - 不是全屏 Modal，而是锚定在触发按钮正下方的浮层（Island 风格）
 * - 左右分栏：源文本 | 翻译结果
 * - 顶部有源语言（含"自动检测"）→ ⇄ → 目标语言选择栏
 * - Ctrl+Enter 快捷翻译，Esc 关闭
 * - 点击浮层外部关闭
 * - 翻译结果可一键复制
 */
export function TranslatePopover({
  anchorRef,
  isOpen,
  onClose,
  targetLangProp = "en",
}: TranslatePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  const [sourceText, setSourceText] = useState("");
  const [resultText, setResultText] = useState("");
  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState(targetLangProp);

  // 当外部语言（appState.translateTargetLang）变化时同步到内部
  // 对标 Excalidraw 的 openDialog 受控模式：状态来源于 appState，组件只是视图
  useEffect(() => {
    setTargetLang(targetLangProp);
  }, [targetLangProp]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resultId = useId();

  const pos = usePopoverPosition(anchorRef, isOpen, POPOVER_WIDTH);

  // ---- 打开时聚焦，关闭时清理 ----
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    } else {
      setResultText("");
      setError(null);
      setCopied(false);
    }
  }, [isOpen]);

  // ---- ESC 关闭 ----
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isOpen, onClose]);

  // ---- 点击外部关闭 ----
  useEffect(() => {
    if (!isOpen) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        anchorRef.current &&
        !anchorRef.current.contains(target)
      ) {
        onClose();
      }
    };
    // 用 capture 阶段、延迟一帧避免和触发按钮的 click 冲突
    const id = requestAnimationFrame(() => {
      window.addEventListener("pointerdown", onPointer, true);
    });
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, [isOpen, onClose, anchorRef]);

  // ---- 翻译 ----
  const handleTranslate = useCallback(async () => {
    const text = sourceText.trim();
    if (!text || isLoading) return;

    setIsLoading(true);
    setError(null);
    setResultText("");
    try {
      const result = await callTranslateApi(text, sourceLang, targetLang);
      setResultText(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误，请重试");
    } finally {
      setIsLoading(false);
    }
  }, [sourceText, sourceLang, targetLang, isLoading]);

  // ---- 输入变化 ----
  const handleSourceChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      if (val.length > MAX_CHARS) return;
      setSourceText(val);
      if (resultText || error) {
        setResultText("");
        setError(null);
      }
    },
    [resultText, error],
  );

  // ---- Ctrl/Cmd + Enter 触发翻译 ----
  const handleTextareaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleTranslate();
      }
    },
    [handleTranslate],
  );

  // ---- 交换语言 ----
  const handleSwap = useCallback(() => {
    if (sourceLang === "auto") return;
    const prevSource = sourceLang;
    const prevTarget = targetLang;
    setSourceLang(prevTarget);
    setTargetLang(prevSource);
    if (resultText) {
      setSourceText(resultText);
      setResultText(sourceText);
    }
  }, [sourceLang, targetLang, sourceText, resultText]);

  // ---- 清空 ----
  const handleClear = useCallback(() => {
    setSourceText("");
    setResultText("");
    setError(null);
    textareaRef.current?.focus();
  }, []);

  // ---- 复制 ----
  const handleCopy = useCallback(async () => {
    if (!resultText) return;
    try {
      await navigator.clipboard.writeText(resultText);
    } catch {
      const el = document.createElement("textarea");
      el.value = resultText;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [resultText]);

  if (!isOpen || !pos) return null;

  const canSwap = sourceLang !== "auto";
  const canTranslate = sourceText.trim().length > 0 && !isLoading;

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="翻译"
      className="fixed z-50"
      style={{
        top: pos.top,
        left: pos.left,
        width: POPOVER_WIDTH,
      }}
    >
      {/* Island 容器：对标 Excalidraw Island 的卡片风格 */}
      <div className="bg-gray-900 border border-gray-700/80 rounded-xl shadow-2xl overflow-hidden">
        {/* ── 语言选择栏 ── */}
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/60 border-b border-gray-700/60">
          {/* 源语言 */}
          <LangSelect
            value={sourceLang}
            onChange={setSourceLang}
            options={[{ value: "auto", label: "自动检测", flag: "🔍" }, ...TRANSLATE_LANGS]}
          />

          {/* 交换按钮 */}
          <button
            type="button"
            onClick={handleSwap}
            disabled={!canSwap}
            title={canSwap ? "交换语言" : "自动检测时无法交换"}
            className={`
              flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-md
              border transition-all duration-100
              ${
                canSwap
                  ? "border-gray-600 text-gray-400 hover:text-white hover:border-gray-500 hover:bg-gray-700/60 active:scale-90"
                  : "border-gray-700 text-gray-600 cursor-not-allowed opacity-40"
              }
            `}
          >
            <SwapIcon />
          </button>

          {/* 目标语言 */}
          <LangSelect value={targetLang} onChange={setTargetLang} options={TRANSLATE_LANGS} />

          {/* 右侧关闭按钮 */}
          <button
            type="button"
            onClick={onClose}
            title="关闭 (Esc)"
            className="flex-shrink-0 ml-auto flex items-center justify-center w-6 h-6
              rounded-md text-gray-500 hover:text-gray-200 hover:bg-gray-700/60
              transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        {/* ── 内容区（左：输入 | 右：结果）── */}
        <div className="grid grid-cols-2 divide-x divide-gray-700/60" style={{ minHeight: 140 }}>
          {/* 左栏：源文本输入 */}
          <div className="flex flex-col">
            <textarea
              ref={textareaRef}
              value={sourceText}
              onChange={handleSourceChange}
              onKeyDown={handleTextareaKeyDown}
              placeholder="输入要翻译的文字..."
              className="flex-1 w-full bg-transparent resize-none outline-none
                px-3 pt-2.5 pb-1 text-sm text-gray-200 placeholder-gray-600
                leading-relaxed"
              style={{ minHeight: 100, fontFamily: "inherit" }}
            />
            {/* 输入区底栏 */}
            <div className="flex items-center justify-between px-3 py-1.5">
              <span
                className={`text-[10px] font-mono tabular-nums select-none ${
                  sourceText.length > MAX_CHARS * 0.85 ? "text-yellow-500" : "text-gray-600"
                }`}
              >
                {sourceText.length}/{MAX_CHARS}
              </span>
              <div className="flex items-center gap-1">
                {sourceText && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="text-[11px] text-gray-500 hover:text-gray-300 px-1.5 py-0.5 rounded transition-colors select-none"
                  >
                    清空
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleTranslate}
                  disabled={!canTranslate}
                  title="翻译 (Ctrl+Enter)"
                  className={`
                    flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium
                    transition-all duration-100 select-none
                    ${
                      canTranslate
                        ? "bg-blue-500 hover:bg-blue-400 text-white active:scale-95"
                        : "bg-gray-700/60 text-gray-500 cursor-not-allowed"
                    }
                  `}
                >
                  {isLoading ? <SmallSpinner /> : <span>🌐</span>}
                  {isLoading ? "翻译中…" : "翻译"}
                </button>
              </div>
            </div>
          </div>

          {/* 右栏：翻译结果 */}
          <div className="flex flex-col bg-gray-800/25">
            <div className="relative flex-1">
              {/* loading */}
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-1.5">
                    <LargeSpinner />
                    <span className="text-[11px] text-gray-500">翻译中…</span>
                  </div>
                </div>
              )}
              {/* 错误 */}
              {!isLoading && error && (
                <div className="absolute inset-0 flex items-center justify-center p-4">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <span className="text-xl">⚠️</span>
                    <span className="text-xs text-red-400 leading-relaxed">{error}</span>
                    <button
                      type="button"
                      onClick={handleTranslate}
                      className="text-[11px] text-blue-400 hover:text-blue-300 underline"
                    >
                      重试
                    </button>
                  </div>
                </div>
              )}
              {/* 空态 */}
              {!isLoading && !error && !resultText && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-xs text-gray-600 select-none">翻译结果将显示在这里</p>
                </div>
              )}
              {/* 结果 */}
              {!isLoading && !error && resultText && (
                <div
                  id={resultId}
                  className="w-full h-full px-3 pt-2.5 pb-1 text-sm text-gray-100
                    leading-relaxed overflow-y-auto select-text whitespace-pre-wrap break-words"
                  style={{ minHeight: 100 }}
                >
                  {resultText}
                </div>
              )}
            </div>
            {/* 结果区底栏 */}
            <div className="flex items-center justify-end px-3 py-1.5 min-h-[32px]">
              {resultText && !isLoading && (
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`
                    flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px]
                    transition-all duration-100 select-none
                    ${
                      copied
                        ? "text-green-400 bg-green-500/10"
                        : "text-gray-500 hover:text-gray-200 hover:bg-gray-700/60"
                    }
                  `}
                >
                  {copied ? <CheckIcon /> : <CopyIcon />}
                  {copied ? "已复制" : "复制"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── 底部提示栏 ── */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-700/60 bg-gray-800/40">
          <span className="text-[10px] text-gray-600 select-none">
            MyMemory · 免费 5000 字符/天
          </span>
          <span className="text-[10px] text-gray-600 select-none">Ctrl+Enter 翻译</span>
        </div>
      </div>

      {/* 小三角指向触发按钮 */}
      <Caret anchorRef={anchorRef} popoverLeft={pos.left} />
    </div>
  );
}

// ==================== Caret（小三角） ====================

function Caret({
  anchorRef,
  popoverLeft,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  popoverLeft: number;
}) {
  const [caretLeft, setCaretLeft] = useState<number | null>(null);

  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const anchorCenter = rect.left + rect.width / 2;
    setCaretLeft(anchorCenter - popoverLeft);
  }, [anchorRef, popoverLeft]);

  if (caretLeft === null) return null;

  return (
    <div
      className="absolute -top-[7px] w-3.5 h-3.5 bg-gray-900 border-l border-t border-gray-700/80 rounded-sm"
      style={{
        left: caretLeft,
        transform: "translateX(-50%) rotate(45deg)",
      }}
    />
  );
}

// ==================== LangSelect ====================

function LangSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: LangOption[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex-1 min-w-0 bg-gray-800 border border-gray-700/80 rounded-lg
        px-2 py-1 text-xs text-gray-200 outline-none cursor-pointer
        hover:border-gray-600 focus:border-blue-500/60 transition-colors"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.flag} {o.label}
        </option>
      ))}
    </select>
  );
}

// ==================== Icons ====================

function SwapIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 5h12M11 2l3 3-3 3" />
      <path d="M14 11H2M5 8l-3 3 3 3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <path d="M1 1l8 8M9 1L1 9" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <path d="M8 4V2a1 1 0 00-1-1H2a1 1 0 00-1 1v5a1 1 0 001 1h2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 6l4 4 6-8" />
    </svg>
  );
}

function SmallSpinner() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="none"
      className="animate-spin"
      style={{ flexShrink: 0 }}
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
      <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function LargeSpinner() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" className="animate-spin">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
      <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default TranslatePopover;
