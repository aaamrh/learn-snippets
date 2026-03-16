import type { ConfigEntry } from "../../types";

function ConfigControl({
  entry,
  onChange,
}: {
  entry: ConfigEntry;
  onChange: (pluginId: string, key: string, value: unknown) => void;
}) {
  const { schema, value } = entry;

  if (schema.type === "boolean") {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(entry.pluginId, entry.key, e.target.checked)}
          className="w-3.5 h-3.5 accent-blue-500"
        />
        <span className="text-[11px] text-gray-400">{schema.description}</span>
      </label>
    );
  }

  if (schema.type === "number") {
    return (
      <div className="space-y-1">
        <div className="text-[10px] text-gray-600">{schema.description}</div>
        <input
          type="number"
          value={Number(value)}
          min={schema.minimum}
          max={schema.maximum}
          onChange={(e) => onChange(entry.pluginId, entry.key, Number(e.target.value))}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-blue-500"
        />
      </div>
    );
  }

  if (schema.type === "string" && schema.enum) {
    return (
      <div className="space-y-1">
        <div className="text-[10px] text-gray-600">{schema.description}</div>
        <select
          value={String(value)}
          onChange={(e) => onChange(entry.pluginId, entry.key, e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-blue-500"
        >
          {schema.enum.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // fallback: string input
  return (
    <div className="space-y-1">
      <div className="text-[10px] text-gray-600">{schema.description}</div>
      <input
        type="text"
        value={String(value ?? "")}
        onChange={(e) => onChange(entry.pluginId, entry.key, e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-blue-500"
      />
    </div>
  );
}

export function SettingsPanel({
  entries,
  onChange,
}: {
  entries: ConfigEntry[];
  onChange: (pluginId: string, key: string, value: unknown) => void;
}) {
  // 按插件名分组
  const grouped = new Map<string, ConfigEntry[]>();
  for (const entry of entries) {
    if (!grouped.has(entry.pluginName)) {
      grouped.set(entry.pluginName, []);
    }
    grouped.get(entry.pluginName)!.push(entry);
  }

  return (
    <>
      <div className="px-3 py-2 border-b border-gray-800 text-[10px] text-gray-500 uppercase tracking-wider shrink-0">
        ⚙️ 插件配置
      </div>
      <div className="flex-1 overflow-auto py-2 px-2 space-y-3">
        {entries.length === 0 ? (
          <div className="px-1 py-6 text-xs text-gray-700 text-center">
            <div className="text-2xl mb-2">⚙️</div>
            <div>无可配置项</div>
            <div className="text-[10px] mt-1">安装带有配置的插件后此处会显示</div>
          </div>
        ) : (
          Array.from(grouped.entries()).map(([pluginName, groupEntries]) => (
            <div key={pluginName}>
              <div className="text-[10px] text-gray-500 font-semibold mb-1.5 px-1">
                {pluginName}
              </div>
              <div className="space-y-2 bg-gray-800/30 rounded-lg p-2 border border-gray-800/50">
                {groupEntries.map((entry) => (
                  <div key={entry.key}>
                    <div className="text-[9px] text-gray-600 mb-0.5 font-mono">{entry.key}</div>
                    <ConfigControl entry={entry} onChange={onChange} />
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
