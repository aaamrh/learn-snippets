"use client";

import { useState, useMemo, useEffect } from "react";
import { ConfigCenter, ConfigProvider, useConfig } from "@/config-center/ConfigCenter";

// ==================== 配置类型定义 ====================

interface AppConfig {
  theme: "light" | "dark" | "system";
  language: "zh" | "en" | "ja";
  notifications: {
    email: boolean;
    push: boolean;
    sms: boolean;
  };
  trading: {
    defaultLeverage: number;
    confirmBeforeOrder: boolean;
    soundEnabled: boolean;
  };
  display: {
    fontSize: "small" | "medium" | "large";
    compactMode: boolean;
    showBalance: boolean;
  };
}

// ==================== 默认配置 ====================

const DEFAULT_CONFIG: AppConfig = {
  theme: "dark",
  language: "zh",
  notifications: {
    email: true,
    push: true,
    sms: false,
  },
  trading: {
    defaultLeverage: 1,
    confirmBeforeOrder: true,
    soundEnabled: true,
  },
  display: {
    fontSize: "medium",
    compactMode: false,
    showBalance: true,
  },
};

// ==================== 环境配置（模拟服务端下发） ====================

const ENV_CONFIG: Partial<AppConfig> = {
  trading: {
    defaultLeverage: 5, // 服务端配置默认杠杆
    confirmBeforeOrder: true,
    soundEnabled: true,
  },
};

// ==================== Demo 内容组件 ====================

function ConfigDemo() {
  const { config, set, reset } = useConfig<AppConfig>();
  const [changeLog, setChangeLog] = useState<{ time: string; key: string; value: string }[]>([]);

  // 记录变更
  const logChange = (key: string, value: unknown) => {
    setChangeLog((prev) => [
      { time: new Date().toLocaleTimeString(), key, value: JSON.stringify(value) },
      ...prev.slice(0, 9),
    ]);
  };

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* 左侧：配置面板 */}
      <div className="space-y-4">
        {/* 主题设置 */}
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <h3 className="text-sm font-medium text-gray-300 mb-3">🎨 外观设置</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">主题</label>
              <div className="flex gap-2">
                {(["light", "dark", "system"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      set("theme", t);
                      logChange("theme", t);
                    }}
                    className={`flex-1 px-2 py-1.5 rounded text-xs ${
                      config.theme === t
                        ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                        : "bg-gray-700/50 text-gray-400"
                    }`}
                  >
                    {t === "light" ? "☀️ 浅色" : t === "dark" ? "🌙 深色" : "💻 跟随系统"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">语言</label>
              <select
                value={config.language}
                onChange={(e) => {
                  set("language", e.target.value as AppConfig["language"]);
                  logChange("language", e.target.value);
                }}
                className="w-full px-3 py-1.5 rounded bg-gray-700/50 text-sm text-gray-300 border border-gray-600"
              >
                <option value="zh">中文</option>
                <option value="en">English</option>
                <option value="ja">日本語</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">字号</label>
              <div className="flex gap-2">
                {(["small", "medium", "large"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      set("display", { ...config.display, fontSize: s });
                      logChange("display.fontSize", s);
                    }}
                    className={`flex-1 px-2 py-1.5 rounded text-xs ${
                      config.display.fontSize === s
                        ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                        : "bg-gray-700/50 text-gray-400"
                    }`}
                  >
                    {s === "small" ? "小" : s === "medium" ? "中" : "大"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 通知设置 */}
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <h3 className="text-sm font-medium text-gray-300 mb-3">🔔 通知设置</h3>
          <div className="space-y-2">
            {[
              { key: "email", label: "邮件通知" },
              { key: "push", label: "推送通知" },
              { key: "sms", label: "短信通知" },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center justify-between">
                <span className="text-sm text-gray-400">{label}</span>
                <button
                  onClick={() => {
                    const newValue = !config.notifications[key as keyof typeof config.notifications];
                    set("notifications", { ...config.notifications, [key]: newValue });
                    logChange(`notifications.${key}`, newValue);
                  }}
                  className={`w-10 h-5 rounded-full transition-colors ${
                    config.notifications[key as keyof typeof config.notifications]
                      ? "bg-blue-500"
                      : "bg-gray-600"
                  }`}
                >
                  <span
                    className="block w-4 h-4 rounded-full bg-white shadow transition-transform"
                    style={{
                      transform: config.notifications[key as keyof typeof config.notifications]
                        ? "translateX(22px)"
                        : "translateX(2px)",
                    }}
                  />
                </button>
              </label>
            ))}
          </div>
        </div>

        {/* 交易设置 */}
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <h3 className="text-sm font-medium text-gray-300 mb-3">📈 交易设置</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">默认杠杆</label>
              <input
                type="range"
                min="1"
                max="100"
                value={config.trading.defaultLeverage}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  set("trading", { ...config.trading, defaultLeverage: value });
                  logChange("trading.defaultLeverage", value);
                }}
                className="w-full"
              />
              <div className="text-center text-sm text-blue-400">
                {config.trading.defaultLeverage}x
              </div>
            </div>
            <label className="flex items-center justify-between">
              <span className="text-sm text-gray-400">下单前确认</span>
              <button
                onClick={() => {
                  const newValue = !config.trading.confirmBeforeOrder;
                  set("trading", { ...config.trading, confirmBeforeOrder: newValue });
                  logChange("trading.confirmBeforeOrder", newValue);
                }}
                className={`w-10 h-5 rounded-full transition-colors ${
                  config.trading.confirmBeforeOrder ? "bg-blue-500" : "bg-gray-600"
                }`}
              >
                <span
                  className="block w-4 h-4 rounded-full bg-white shadow transition-transform"
                  style={{
                    transform: config.trading.confirmBeforeOrder
                      ? "translateX(22px)"
                      : "translateX(2px)",
                  }}
                />
              </button>
            </label>
          </div>
        </div>

        {/* 重置按钮 */}
        <button
          onClick={() => {
            reset();
            logChange("*", "reset to defaults");
          }}
          className="w-full py-2 rounded-lg text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30"
        >
          重置所有设置
        </button>
      </div>

      {/* 中间：当前配置 */}
      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
        <h3 className="text-sm font-medium text-gray-300 mb-3">📋 当前配置</h3>
        <pre className="font-mono text-xs text-gray-400 overflow-auto max-h-[500px]">
          {JSON.stringify(config, null, 2)}
        </pre>
      </div>

      {/* 右侧：变更日志 + 层级信息 */}
      <div className="space-y-4">
        {/* 配置层级 */}
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <h3 className="text-sm font-medium text-gray-300 mb-3">📚 配置层级</h3>
          <div className="space-y-2 font-mono text-xs">
            <div className="p-2 rounded bg-gray-700/30">
              <div className="text-gray-500">优先级 0</div>
              <div className="text-blue-400">defaults</div>
              <div className="text-gray-600 text-[10px]">代码默认值</div>
            </div>
            <div className="text-center text-gray-600">↓ 覆盖</div>
            <div className="p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
              <div className="text-gray-500">优先级 50</div>
              <div className="text-yellow-400">env</div>
              <div className="text-gray-600 text-[10px]">服务端/环境配置</div>
            </div>
            <div className="text-center text-gray-600">↓ 覆盖</div>
            <div className="p-2 rounded bg-green-500/10 border border-green-500/20">
              <div className="text-gray-500">优先级 100</div>
              <div className="text-green-400">user</div>
              <div className="text-gray-600 text-[10px]">用户偏好 (持久化)</div>
            </div>
          </div>
        </div>

        {/* 变更日志 */}
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <h3 className="text-sm font-medium text-gray-300 mb-3">📝 变更日志</h3>
          <div className="space-y-1 font-mono text-xs max-h-48 overflow-auto">
            {changeLog.length > 0 ? (
              changeLog.map((log, i) => (
                <div key={i} className="p-1.5 rounded bg-gray-900/50">
                  <span className="text-gray-500">{log.time}</span>
                  <span className="text-blue-400 ml-2">{log.key}</span>
                  <span className="text-gray-400 ml-2">= {log.value}</span>
                </div>
              ))
            ) : (
              <div className="text-gray-600">修改配置查看日志...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== 页面组件 ====================

export default function ConfigCenterPage() {
  const configCenter = useMemo(() => {
    const center = new ConfigCenter(DEFAULT_CONFIG);
    center.setEnv(ENV_CONFIG);
    center.enablePersistence("app-config-demo");
    return center;
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* 页头 */}
      <h1 className="text-2xl font-bold text-white mb-1">⚙️ 配置中心</h1>
      <p className="text-sm text-gray-500 mb-6">
        分层配置 + 类型安全 + 热更新 + 持久化，告别配置混乱。
      </p>

      <ConfigProvider config={configCenter}>
        <ConfigDemo />
      </ConfigProvider>

      {/* 底部说明 */}
      <div className="mt-8 p-4 bg-gray-800/30 rounded-xl border border-gray-700/30">
        <h3 className="text-sm font-medium text-gray-300 mb-2">💡 架构要点</h3>
        <ul className="text-xs text-gray-500 space-y-1">
          <li>• <span className="text-gray-300">分层覆盖</span> - defaults → env → user，高优先级覆盖低优先级</li>
          <li>• <span className="text-gray-300">深度合并</span> - 嵌套对象自动合并，而非整体覆盖</li>
          <li>• <span className="text-gray-300">类型安全</span> - TypeScript 泛型确保配置类型正确</li>
          <li>• <span className="text-gray-300">持久化</span> - 用户配置自动保存到 localStorage</li>
          <li>• <span className="text-gray-300">订阅机制</span> - 配置变化自动通知 UI 更新</li>
        </ul>
      </div>
    </div>
  );
}
