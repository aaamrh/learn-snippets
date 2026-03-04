"use client";

import React from "react";
import type {
  AppState,
  PropertyPanelConfig,
  PropertyPanelItem,
  ColorPickerPanelItem,
  SliderPanelItem,
  ButtonGroupPanelItem,
} from "../types";
import { PRESET_COLORS } from "../types";

// ==================== Props ====================

interface SecondaryToolbarProps {
  appState: Readonly<AppState>;
  /** 当前工具的属性面板配置（由 activeTool.getPropertyPanel() 提供） */
  panelConfig: PropertyPanelConfig | null;
  /** 更新 appState 中的属性值 */
  onPropertyChange: (stateKey: keyof AppState, value: unknown) => void;
}

// ==================== 二级工具条 ====================

/**
 * SecondaryToolbar —— 二级工具条（根据当前工具动态渲染）
 *
 * 设计要点（对标 Excalidraw 的 Action.PanelComponent）：
 * - 每个工具通过 getPropertyPanel() 声明自己需要的属性面板项
 * - SecondaryToolbar 根据面板配置中的 item.type 分发渲染对应的控件
 * - 控件的值绑定到 appState 中的对应字段（通过 stateKey）
 * - 修改值通过 onPropertyChange 回调通知父组件
 *
 * 支持的面板项类型：
 * - color-picker：颜色选择器（预设色板 + 自定义颜色输入）
 * - slider：滑块（如透明度）
 * - button-group：按钮组（如线宽选择、字号选择）
 */
export function SecondaryToolbar({
  appState,
  panelConfig,
  onPropertyChange,
}: SecondaryToolbarProps) {
  // 没有面板配置或没有面板项 → 不渲染
  if (!panelConfig || panelConfig.items.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-gray-800/90 border border-gray-700 rounded-xl shadow-lg backdrop-blur-sm">
      {panelConfig.items.map((item, index) => (
        <React.Fragment key={`${item.type}-${item.stateKey}`}>
          {index > 0 && <Separator />}
          <PanelItem
            item={item}
            value={appState[item.stateKey]}
            onChange={(value) => onPropertyChange(item.stateKey, value)}
          />
        </React.Fragment>
      ))}
    </div>
  );
}

// ==================== 面板项分发 ====================

interface PanelItemProps {
  item: PropertyPanelItem;
  value: unknown;
  onChange: (value: unknown) => void;
}

function PanelItem({ item, value, onChange }: PanelItemProps) {
  switch (item.type) {
    case "color-picker":
      return (
        <ColorPickerPanel
          item={item}
          value={value as string}
          onChange={onChange}
        />
      );
    case "slider":
      return (
        <SliderPanel
          item={item}
          value={value as number}
          onChange={onChange}
        />
      );
    case "button-group":
      return (
        <ButtonGroupPanel
          item={item}
          value={value}
          onChange={onChange}
        />
      );
    default:
      return null;
  }
}

// ==================== 颜色选择器 ====================

interface ColorPickerPanelProps {
  item: ColorPickerPanelItem;
  value: string;
  onChange: (value: string) => void;
}

function ColorPickerPanel({ item, value, onChange }: ColorPickerPanelProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 whitespace-nowrap select-none">
        {item.label}
      </span>
      <div className="flex items-center gap-1 flex-wrap">
        {/* 预设颜色 */}
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            title={color}
            onClick={() => onChange(color)}
            className={`
              w-5 h-5 rounded-full border-2 transition-all duration-100
              hover:scale-125 active:scale-110
              ${
                value === color
                  ? "border-white shadow-sm shadow-white/30 scale-110"
                  : "border-gray-600 hover:border-gray-400"
              }
            `}
            style={{ backgroundColor: color }}
          />
        ))}

        {/* 透明色（特殊处理） */}
        {item.stateKey === "currentFillColor" && (
          <button
            type="button"
            title="透明"
            onClick={() => onChange("transparent")}
            className={`
              w-5 h-5 rounded-full border-2 transition-all duration-100
              hover:scale-125 active:scale-110 relative overflow-hidden
              ${
                value === "transparent"
                  ? "border-white shadow-sm shadow-white/30 scale-110"
                  : "border-gray-600 hover:border-gray-400"
              }
            `}
          >
            {/* 透明色用对角线表示 */}
            <span className="absolute inset-0 bg-gray-700" />
            <span
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(135deg, transparent 45%, #ef4444 45%, #ef4444 55%, transparent 55%)",
              }}
            />
          </button>
        )}

        {/* 自定义颜色输入 */}
        <div className="relative">
          <input
            type="color"
            value={value === "transparent" ? "#000000" : value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-5 h-5 opacity-0 cursor-pointer"
            title="自定义颜色"
          />
          <div
            className={`
              w-5 h-5 rounded-full border-2 border-dashed border-gray-500
              flex items-center justify-center text-[10px] text-gray-400
              hover:border-gray-300 hover:text-gray-300 transition-all cursor-pointer
            `}
          >
            +
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== 滑块控件 ====================

interface SliderPanelProps {
  item: SliderPanelItem;
  value: number;
  onChange: (value: number) => void;
}

function SliderPanel({ item, value, onChange }: SliderPanelProps) {
  const percentage = ((value - item.min) / (item.max - item.min)) * 100;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 whitespace-nowrap select-none">
        {item.label}
      </span>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={item.min}
          max={item.max}
          step={item.step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-20 h-1 appearance-none bg-gray-600 rounded-full cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-3
            [&::-webkit-slider-thumb]:h-3
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-blue-400
            [&::-webkit-slider-thumb]:border-2
            [&::-webkit-slider-thumb]:border-blue-300
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:hover:scale-125"
          style={{
            background: `linear-gradient(to right, #60a5fa 0%, #60a5fa ${percentage}%, #4b5563 ${percentage}%, #4b5563 100%)`,
          }}
        />
        <span className="text-xs text-gray-300 font-mono w-8 text-right tabular-nums select-none">
          {formatSliderValue(value, item)}
        </span>
      </div>
    </div>
  );
}

/**
 * 格式化滑块显示值
 */
function formatSliderValue(value: number, item: SliderPanelItem): string {
  // 透明度显示为百分比
  if (item.stateKey === "currentOpacity") {
    return `${Math.round(value * 100)}%`;
  }
  // 其他值直接显示
  if (Number.isInteger(item.step)) {
    return String(Math.round(value));
  }
  return value.toFixed(1);
}

// ==================== 按钮组控件 ====================

interface ButtonGroupPanelProps {
  item: ButtonGroupPanelItem;
  value: unknown;
  onChange: (value: unknown) => void;
}

function ButtonGroupPanel({ item, value, onChange }: ButtonGroupPanelProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 whitespace-nowrap select-none">
        {item.label}
      </span>
      <div className="flex items-center gap-0.5 bg-gray-900/50 rounded-lg p-0.5">
        {item.options.map((option) => {
          const isActive = value === option.value;

          return (
            <button
              key={String(option.value)}
              type="button"
              title={option.label}
              onClick={() => onChange(option.value)}
              className={`
                px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150
                select-none whitespace-nowrap
                ${
                  isActive
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/40 shadow-sm"
                    : "text-gray-400 hover:text-white hover:bg-gray-700/60 border border-transparent"
                }
              `}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ==================== 分隔符 ====================

function Separator() {
  return <div className="w-px h-6 bg-gray-700 mx-0.5" />;
}

export default SecondaryToolbar;
