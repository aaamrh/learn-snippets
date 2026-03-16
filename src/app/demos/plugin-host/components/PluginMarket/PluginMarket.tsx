import { useState } from "react";
import type { PluginManifest } from "@/plugin-system/manifest-types";
import {
  ALL_V2_PLUGINS,
  getCategoryIcon,
  getCategoryLabel,
  getPluginsByCategory,
} from "@/plugin-system/plugins/v2";
import type { V2PluginDescriptor } from "@/plugin-system/plugins/v2";

// ==================== PluginMarket 组件 ====================

export function PluginMarket({
  installedPlugins,
  activePlugins,
  pluginErrors,
  onInstall: handleInstall,
  onUninstall,
  onActivate,
  onDeactivate,
}: {
  installedPlugins: Set<string>;
  activePlugins: Set<string>;
  pluginErrors: Map<string, string>;
  onInstall: (manifest: PluginManifest) => void;
  onUninstall: (pluginId: string) => void;
  onActivate: (pluginId: string) => void;
  onDeactivate: (pluginId: string) => void;
}) {
  const categories = getPluginsByCategory();

  return (
    <div className="space-y-4">
      {Array.from(categories.entries()).map(([category, categoryPlugins]) => (
        <div key={category}>
          <h3 className="text-[11px] font-semibold text-gray-500 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
            <span>{getCategoryIcon(category)}</span>
            <span>{getCategoryLabel(category)}</span>
            <span className="text-gray-700">({categoryPlugins.length})</span>
          </h3>

          <div className="space-y-2">
            {categoryPlugins.map((plugin) => {
              const id = plugin.manifest.id;
              const isInstalled = installedPlugins.has(id);
              const isActive = activePlugins.has(id);
              const error = pluginErrors.get(id);

              return (
                <PluginCard
                  key={id}
                  plugin={plugin}
                  isInstalled={isInstalled}
                  isActive={isActive}
                  error={error}
                  onInstall={() => handleInstall(plugin.manifest)}
                  onUninstall={() => onUninstall(id)}
                  onActivate={() => onActivate(id)}
                  onDeactivate={() => onDeactivate(id)}
                  installedPlugins={installedPlugins}
                />
              );
            })}
          </div>
        </div>
      ))}

      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 text-[10px] text-gray-600 leading-relaxed space-y-1">
        <h4 className="text-gray-400 font-semibold text-[11px]">📐 架构说明</h4>
        <ul className="list-disc list-inside space-y-0.5">
          <li>
            <code className="text-purple-400/70 bg-gray-800 px-0.5 rounded text-[9px]">
              PluginManifest
            </code>{" "}
            声明贡献点和权限
          </li>
          <li>
            <code className="text-purple-400/70 bg-gray-800 px-0.5 rounded text-[9px]">
              ActivationManager
            </code>{" "}
            按 activationEvents 按需激活
          </li>
          <li>
            <code className="text-purple-400/70 bg-gray-800 px-0.5 rounded text-[9px]">
              PermissionGuard
            </code>{" "}
            拦截未授权 API 调用
          </li>
          <li>
            <code className="text-purple-400/70 bg-gray-800 px-0.5 rounded text-[9px]">
              ContributionManager
            </code>{" "}
            驱动 UI 贡献点
          </li>
          <li>
            <code className="text-purple-400/70 bg-gray-800 px-0.5 rounded text-[9px]">
              EditorTabManager
            </code>{" "}
            多 Tab 编辑器状态
          </li>
          <li>
            <code className="text-purple-400/70 bg-gray-800 px-0.5 rounded text-[9px]">
              ConfigurationService
            </code>{" "}
            插件配置管理
          </li>
          <li>
            <code className="text-purple-400/70 bg-gray-800 px-0.5 rounded text-[9px]">
              TreeDataProvider
            </code>{" "}
            侧栏大纲视图
          </li>
        </ul>
      </div>
    </div>
  );
}

// ==================== PluginCard 组件 ====================

function PluginCard({
  plugin,
  isInstalled,
  isActive,
  error,
  onInstall,
  onUninstall,
  onActivate,
  onDeactivate,
  installedPlugins,
}: {
  plugin: V2PluginDescriptor;
  isInstalled: boolean;
  isActive: boolean;
  error?: string;
  onInstall: () => void;
  onUninstall: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  installedPlugins: Set<string>;
}) {
  const m = plugin.manifest;
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div
      className={`
        relative rounded-lg border p-3 transition-all text-xs
        ${isActive ? "border-green-600/40 bg-green-950/20" : ""}
        ${isInstalled && !isActive ? "border-gray-700/60 bg-gray-900/40" : ""}
        ${!isInstalled ? "border-gray-800 bg-gray-900/20 opacity-60" : ""}
        ${error ? "border-red-600/40 bg-red-950/10" : ""}
      `}
    >
      {/* 头部 */}
      <div className="flex items-start gap-2.5 mb-2">
        <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-base shrink-0 border border-gray-700/50">
          {m.icon ?? "📦"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h4 className="text-[12px] font-semibold text-white truncate">{m.name}</h4>
            <span className="text-[9px] text-gray-700 font-mono">v{m.version}</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1 wrap-break-word">
            {plugin.shortDescription}
          </p>
        </div>
      </div>

      {/* 状态标签 */}
      <div className="flex flex-wrap gap-1 mb-2">
        {isActive && (
          <span className="text-[9px] px-1 py-px rounded bg-green-500/15 text-green-400 border border-green-500/20">
            ● 已激活
          </span>
        )}
        {isInstalled && !isActive && (
          <span className="text-[9px] px-1 py-px rounded bg-gray-700/50 text-gray-400 border border-gray-600/30">
            ○ 已安装
          </span>
        )}
        {!isInstalled && (
          <span className="text-[9px] px-1 py-px rounded bg-gray-800 text-gray-600 border border-gray-700/30">
            未安装
          </span>
        )}
        {error && (
          <span className="text-[9px] px-1 py-px rounded bg-red-500/15 text-red-400 border border-red-500/20">
            ⚠ 错误
          </span>
        )}
        {m.activationEvents.map((ae) => (
          <span
            key={ae}
            className="text-[9px] px-1 py-px rounded bg-blue-500/10 text-blue-400/60 border border-blue-500/15 font-mono"
          >
            {ae}
          </span>
        ))}
      </div>

      {error && (
        <div className="text-[10px] text-red-400 bg-red-950/30 border border-red-900/30 rounded p-1.5 mb-2 wrap-break-word">
          {error}
        </div>
      )}

      {/* 详情展开 */}
      <button
        type="button"
        onClick={() => setShowDetails(!showDetails)}
        className="text-[10px] text-gray-700 hover:text-gray-400 transition-colors mb-1.5"
      >
        {showDetails ? "▾ 收起" : "▸ 详情"}
      </button>

      {showDetails && (
        <div className="text-[10px] space-y-1.5 mb-2 text-gray-500 bg-gray-800/30 rounded-lg p-2 border border-gray-800">
          {/* 权限 */}
          <div>
            <span className="text-gray-400 font-medium">权限:</span>
            <div className="flex flex-wrap gap-0.5 mt-0.5">
              {m.permissions.map((p) => (
                <span
                  key={p}
                  className="px-1 py-px rounded bg-amber-500/10 text-amber-400/60 border border-amber-500/15 font-mono text-[9px]"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>

          {/* 命令 */}
          {m.contributes?.commands && m.contributes.commands.length > 0 && (
            <div>
              <span className="text-gray-400 font-medium">命令:</span>
              <div className="mt-0.5 space-y-0.5">
                {m.contributes.commands.map((cmd) => (
                  <div key={cmd.command} className="flex items-center gap-1">
                    <span className="text-[10px]">{cmd.icon ?? "⚡"}</span>
                    <span className="font-mono text-[9px] text-gray-500">{cmd.command}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 快捷键 */}
          {m.contributes?.keybindings && m.contributes.keybindings.length > 0 && (
            <div>
              <span className="text-gray-400 font-medium">快捷键:</span>
              <div className="mt-0.5 space-y-0.5">
                {m.contributes.keybindings.map((kb) => (
                  <div key={kb.command + kb.key} className="flex items-center gap-1">
                    <kbd className="px-1 py-px rounded bg-gray-700 text-gray-400 text-[9px] font-mono border border-gray-600">
                      {kb.key}
                    </kbd>
                    <span className="text-gray-600">→ {kb.command}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 状态栏 */}
          {m.contributes?.statusBar && m.contributes.statusBar.length > 0 && (
            <div>
              <span className="text-gray-400 font-medium">状态栏:</span>
              {m.contributes.statusBar.map((sb) => (
                <div key={sb.id} className="font-mono text-[9px] text-gray-600 mt-0.5">
                  {sb.id} ({sb.alignment ?? "left"})
                </div>
              ))}
            </div>
          )}

          {/* 选中工具条 */}
          {m.contributes?.selectionToolbar && m.contributes.selectionToolbar.length > 0 && (
            <div>
              <span className="text-gray-400 font-medium">选中工具条:</span>
              {m.contributes.selectionToolbar.map((st) => (
                <div key={st.command} className="flex items-center gap-1 text-[9px] mt-0.5">
                  <span>{st.icon ?? "🔧"}</span>
                  <span className="text-gray-500">{st.title}</span>
                  {st.when && <span className="text-gray-700 font-mono">(when: {st.when})</span>}
                </div>
              ))}
            </div>
          )}

          {/* 右键菜单 */}
          {m.contributes?.menus && m.contributes.menus.length > 0 && (
            <div>
              <span className="text-gray-400 font-medium">右键菜单:</span>
              {m.contributes.menus.map((menu) => (
                <div key={menu.command} className="font-mono text-[9px] text-gray-600 mt-0.5">
                  {menu.command} → {menu.group ?? "default"}
                </div>
              ))}
            </div>
          )}

          {/* 依赖关系 */}
          {m.dependencies && m.dependencies.length > 0 && (
            <div>
              <span className="text-gray-400 font-medium">依赖:</span>
              <div className="flex flex-wrap gap-0.5 mt-0.5">
                {m.dependencies.map((dep) => {
                  const depInstalled = installedPlugins.has(dep);
                  return (
                    <span
                      key={dep}
                      className={`px-1 py-px rounded font-mono text-[9px] border ${
                        depInstalled
                          ? "bg-green-500/10 text-green-400/70 border-green-500/20"
                          : "bg-red-500/10 text-red-400/70 border-red-500/20"
                      }`}
                    >
                      {depInstalled ? "✓" : "✗"} {dep}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* 配置项 */}
          {m.contributes?.configuration && (
            <div>
              <span className="text-gray-400 font-medium">
                配置 ({Object.keys(m.contributes.configuration.properties).length} 项):
              </span>
              <div className="mt-0.5 space-y-0.5">
                {Object.entries(m.contributes.configuration.properties).map(([key, schema]) => (
                  <div key={key} className="text-[9px] text-gray-600">
                    <span className="font-mono text-gray-500">{key}</span>
                    <span className="text-gray-700 ml-1">
                      ({schema.type}, 默认: {String(schema.default)})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 视图面板 */}
          {m.contributes?.viewsContainers?.activitybar &&
            m.contributes.viewsContainers.activitybar.length > 0 && (
              <div>
                <span className="text-gray-400 font-medium">视图面板:</span>
                {m.contributes.viewsContainers.activitybar.map((vc) => (
                  <div key={vc.id} className="text-[9px] text-gray-600 mt-0.5">
                    {vc.icon} {vc.title} <span className="font-mono text-gray-700">({vc.id})</span>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-1.5">
        {!isInstalled && (
          <button
            type="button"
            onClick={onInstall}
            className="px-2.5 py-1 text-[10px] rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors"
          >
            安装
          </button>
        )}

        {isInstalled && !isActive && (
          <>
            <button
              type="button"
              onClick={onActivate}
              className="px-2.5 py-1 text-[10px] rounded-md bg-green-600 text-white hover:bg-green-500 transition-colors"
            >
              激活
            </button>
            <button
              type="button"
              onClick={onUninstall}
              className="px-2.5 py-1 text-[10px] rounded-md bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
            >
              卸载
            </button>
          </>
        )}

        {isInstalled && isActive && (
          <>
            <button
              type="button"
              onClick={onDeactivate}
              className="px-2.5 py-1 text-[10px] rounded-md bg-amber-600 text-white hover:bg-amber-500 transition-colors"
            >
              停用
            </button>
            <button
              type="button"
              onClick={onUninstall}
              className="px-2.5 py-1 text-[10px] rounded-md bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
            >
              卸载
            </button>
          </>
        )}
      </div>
    </div>
  );
}
