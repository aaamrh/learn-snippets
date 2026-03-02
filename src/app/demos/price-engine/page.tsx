"use client";

import { useState, useMemo, useCallback } from "react";
import { PriceEngine } from "@/price-engine/PriceEngine";
import { MemberRule } from "@/price-engine/rules/MemberRule";
import { CouponRule } from "@/price-engine/rules/CouponRule";
import { FullReductionRule } from "@/price-engine/rules/FullReductionRule";
import { FlashSaleRule } from "@/price-engine/rules/FlashSaleRule";
import { RegionRule } from "@/price-engine/rules/RegionRule";
import type {
  CartItem,
  User,
  Coupon,
  Promotion,
  PriceContext,
  MemberLevel,
} from "@/price-engine/types";
import type { PriceResultWithLog } from "@/price-engine/PriceEngine";

// ==================== 静态数据 ====================
const PRESET_ITEMS: CartItem[] = [
  { id: "i1", name: "机械键盘 Pro", price: 89900, quantity: 1, category: "数码", flashSale: true },
  { id: "i2", name: "人体工学椅", price: 299900, quantity: 1, category: "家具" },
  { id: "i3", name: "降噪耳机", price: 149900, quantity: 1, category: "数码", flashSale: true },
  { id: "i4", name: "显示器 27寸", price: 199900, quantity: 1, category: "数码" },
  { id: "i5", name: "无线充电板", price: 19900, quantity: 2, category: "配件" },
];

const PRESET_COUPONS: Coupon[] = [
  { id: "c1", name: "新人直减50", type: "fixed", value: 5000 },
  { id: "c2", name: "九折优惠券", type: "percent", value: 90 },
  { id: "c3", name: "满1000减80", type: "threshold", value: 8000, minAmount: 100000 },
  { id: "c4", name: "满500减30", type: "threshold", value: 3000, minAmount: 50000 },
  {
    id: "c5",
    name: "已过期券-立减100",
    type: "fixed",
    value: 10000,
    expireAt: Date.now() - 86400000,
  },
];

const PRESET_PROMOTIONS: Promotion[] = [
  {
    id: "p1",
    name: "双十一满减",
    type: "fullReduction",
  },
  {
    id: "p2",
    name: "数码闪购",
    type: "flashSale",
    startAt: Date.now() - 3600000,
    endAt: Date.now() + 3600000,
    flashPrice: 69900,
    itemIds: ["i1", "i3"],
  },
];

const MEMBER_OPTIONS: { value: MemberLevel; label: string; color: string }[] = [
  { value: "none", label: "普通用户", color: "text-gray-400" },
  { value: "bronze", label: "铜牌 (9.5折)", color: "text-amber-600" },
  { value: "silver", label: "银牌 (9折)", color: "text-gray-300" },
  { value: "gold", label: "金牌 (8.5折)", color: "text-yellow-400" },
  { value: "platinum", label: "铂金 (8折)", color: "text-purple-400" },
];

const REGION_OPTIONS = [
  { code: "CN-BJ", label: "北京" },
  { code: "CN-SH", label: "上海" },
  { code: "CN-GD", label: "广东" },
  { code: "CN-XZ", label: "西藏 (补贴¥50)" },
  { code: "CN-XJ", label: "新疆 (补贴¥50)" },
  { code: "CN-QH", label: "青海 (补贴¥30)" },
  { code: "CN-YN", label: "云南 (补贴¥20)" },
  { code: "CN-NM", label: "内蒙古 (补贴¥30)" },
];

const RULE_META = [
  {
    id: "flashSale",
    name: "限时秒杀",
    icon: "⚡",
    priority: 5,
    color: "red",
    desc: "秒杀价格修正，最先执行，重新定价后续规则基于此叠加",
  },
  {
    id: "member",
    name: "会员折扣",
    icon: "👑",
    priority: 10,
    color: "yellow",
    desc: "按会员等级打折，bronze~platinum 对应 9.5~8 折",
  },
  {
    id: "fullReduction",
    name: "满减活动",
    icon: "🎁",
    priority: 20,
    color: "blue",
    desc: "阶梯满减：满500-30 / 满1000-100 / 满2000-250 / 满3000-400",
  },
  {
    id: "coupon",
    name: "优惠券",
    icon: "🎫",
    priority: 30,
    color: "green",
    desc: "支持直减/折扣/满减三种券型，自动选最优一张",
  },
  {
    id: "region",
    name: "地区补贴",
    icon: "📍",
    priority: 40,
    color: "purple",
    desc: "偏远地区物流补贴，兜底优惠最后执行",
  },
];

// ==================== 工具函数 ====================
function fen2yuan(fen: number): string {
  return (fen / 100).toFixed(2);
}

function formatMoney(fen: number): string {
  return `¥${fen2yuan(fen)}`;
}

const RULE_COLOR_MAP: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  red: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-400",
    dot: "bg-red-400",
  },
  yellow: {
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    text: "text-yellow-400",
    dot: "bg-yellow-400",
  },
  blue: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    text: "text-blue-400",
    dot: "bg-blue-400",
  },
  green: {
    bg: "bg-green-500/10",
    border: "border-green-500/30",
    text: "text-green-400",
    dot: "bg-green-400",
  },
  purple: {
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    text: "text-purple-400",
    dot: "bg-purple-400",
  },
};

// ==================== 子组件 ====================

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
      {children}
    </h3>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-700/60 bg-gray-800/40 p-4 ${className}`}>
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
        checked ? "bg-blue-500" : "bg-gray-600"
      }`}
      aria-label={label}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4.5" : "translate-x-0.5"
        }`}
        style={{ transform: checked ? "translateX(18px)" : "translateX(2px)" }}
      />
    </button>
  );
}

// ==================== 购物车区域 ====================
function CartSection({
  items,
  selectedIds,
  onToggleItem,
  onChangeQty,
}: {
  items: CartItem[];
  selectedIds: Set<string>;
  onToggleItem: (id: string) => void;
  onChangeQty: (id: string, qty: number) => void;
}) {
  return (
    <Card>
      <SectionTitle>🛒 购物车商品</SectionTitle>
      <div className="space-y-2">
        {items.map((item) => {
          const selected = selectedIds.has(item.id);
          return (
            <div
              key={item.id}
              role="presentation"
              className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all ${
                selected
                  ? "border-blue-500/40 bg-blue-500/5"
                  : "border-gray-700/40 bg-gray-800/20 opacity-50"
              }`}
            >
              {/* 勾选区域（点击整行切换） */}
              <button
                type="button"
                aria-label={`${selected ? "取消选择" : "选择"}${item.name}`}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
                onClick={() => onToggleItem(item.id)}
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                    selected ? "bg-blue-500 border-blue-500" : "border-gray-600"
                  }`}
                  aria-hidden="true"
                >
                  {selected && (
                    <svg
                      className="w-2.5 h-2.5 text-white"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-gray-200 truncate">{item.name}</span>
                    {item.flashSale && (
                      <span className="text-xs px-1 py-0 rounded bg-red-500/20 text-red-400 border border-red-500/30 shrink-0">
                        ⚡秒杀
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">{formatMoney(item.price)}/件</span>
                </div>
              </button>

              {/* 数量控制（独立，不触发行选择） */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  aria-label="减少数量"
                  className="w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm flex items-center justify-center transition-colors disabled:opacity-30"
                  onClick={() => onChangeQty(item.id, item.quantity - 1)}
                  disabled={item.quantity <= 1}
                >
                  −
                </button>
                <span className="text-sm text-gray-200 w-4 text-center">{item.quantity}</span>
                <button
                  type="button"
                  aria-label="增加数量"
                  className="w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm flex items-center justify-center transition-colors"
                  onClick={() => onChangeQty(item.id, item.quantity + 1)}
                >
                  +
                </button>
              </div>

              {/* 小计 */}
              <span className="text-sm font-medium text-gray-300 w-20 text-right shrink-0">
                {formatMoney(item.price * item.quantity)}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ==================== 用户配置区域 ====================
function UserSection({
  user,
  region,
  onMemberChange,
  onRegionChange,
}: {
  user: User;
  region: string;
  onMemberChange: (level: MemberLevel) => void;
  onRegionChange: (code: string) => void;
}) {
  return (
    <Card>
      <SectionTitle>👤 用户配置</SectionTitle>
      <div className="space-y-3">
        <div>
          <p className="text-xs text-gray-500 mb-1.5">会员等级</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {MEMBER_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={() => onMemberChange(opt.value)}
                className={`px-2 py-1.5 rounded-lg text-xs border transition-all text-left ${
                  user.memberLevel === opt.value
                    ? "border-blue-500/60 bg-blue-500/10 text-white"
                    : "border-gray-700/50 bg-gray-800/30 text-gray-400 hover:border-gray-600 hover:text-gray-300"
                }`}
              >
                <span className={opt.color}>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="region-select" className="text-xs text-gray-500 mb-1.5 block">
            收货地区
          </label>
          <select
            id="region-select"
            value={region}
            onChange={(e) => onRegionChange(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
          >
            {REGION_OPTIONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Card>
  );
}

// ==================== 规则开关区域 ====================
function RulesSection({
  enabledRules,
  onToggleRule,
  enabledPromotions,
  onTogglePromotion,
}: {
  enabledRules: Set<string>;
  onToggleRule: (id: string) => void;
  enabledPromotions: Set<string>;
  onTogglePromotion: (id: string) => void;
}) {
  return (
    <Card>
      <SectionTitle>⚙️ 规则引擎开关</SectionTitle>
      <div className="space-y-2">
        {RULE_META.map((rule) => {
          const colors = RULE_COLOR_MAP[rule.color];
          const enabled = enabledRules.has(rule.id);
          return (
            <div
              key={rule.id}
              className={`flex items-start gap-3 p-2.5 rounded-lg border transition-all ${
                enabled ? `${colors.bg} ${colors.border}` : "border-gray-700/30 opacity-50"
              }`}
            >
              <div
                className={`w-5 h-5 rounded flex items-center justify-center text-sm shrink-0 mt-0.5`}
              >
                {rule.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-medium ${enabled ? colors.text : "text-gray-500"}`}
                  >
                    {rule.name}
                  </span>
                  <span className="text-xs text-gray-600 font-mono">P{rule.priority}</span>
                </div>
                <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{rule.desc}</p>
              </div>
              <Toggle checked={enabled} onChange={() => onToggleRule(rule.id)} label={rule.name} />
            </div>
          );
        })}
      </div>

      {/* 促销活动开关 */}
      <div className="mt-3 pt-3 border-t border-gray-700/40">
        <p className="text-xs text-gray-500 mb-2">促销活动（影响秒杀 & 满减规则）</p>
        <div className="space-y-1.5">
          {PRESET_PROMOTIONS.map((p) => (
            <label
              key={p.id}
              htmlFor={`promotion-chk-${p.id}`}
              className="flex items-center gap-2 cursor-pointer group"
            >
              <input
                id={`promotion-chk-${p.id}`}
                type="checkbox"
                checked={enabledPromotions.has(p.id)}
                onChange={() => onTogglePromotion(p.id)}
                className="w-4 h-4 rounded border border-gray-600 bg-gray-800 accent-blue-500 cursor-pointer shrink-0"
              />
              <span className="text-xs text-gray-400 group-hover:text-gray-300 transition-colors">
                {p.name}
                <span className="text-gray-600 ml-1">
                  ({p.type === "fullReduction" ? "满减" : "秒杀"})
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ==================== 优惠券选择区域 ====================
function CouponSection({
  selectedCouponIds,
  onToggleCoupon,
  currentPrice,
}: {
  selectedCouponIds: Set<string>;
  onToggleCoupon: (id: string) => void;
  currentPrice: number;
}) {
  const COUPON_TYPE_LABEL: Record<string, string> = {
    fixed: "直减",
    percent: "折扣",
    threshold: "满减",
  };
  const COUPON_TYPE_COLOR: Record<string, string> = {
    fixed: "text-green-400 bg-green-500/10 border-green-500/20",
    percent: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    threshold: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  };

  return (
    <Card>
      <SectionTitle>🎫 优惠券选择</SectionTitle>
      <div className="space-y-2">
        {PRESET_COUPONS.map((coupon) => {
          const selected = selectedCouponIds.has(coupon.id);
          const expired = coupon.expireAt !== undefined && Date.now() > coupon.expireAt;
          const notMet =
            coupon.type === "threshold" &&
            coupon.minAmount !== undefined &&
            currentPrice < coupon.minAmount;
          const invalid = expired || notMet;

          let valueLabel = "";
          if (coupon.type === "fixed") valueLabel = `减¥${fen2yuan(coupon.value)}`;
          else if (coupon.type === "percent") valueLabel = `打${coupon.value / 10}折`;
          else if (coupon.type === "threshold")
            valueLabel = `满¥${fen2yuan(coupon.minAmount ?? 0)}减¥${fen2yuan(coupon.value)}`;

          return (
            <button
              key={coupon.id}
              type="button"
              disabled={invalid}
              onClick={() => onToggleCoupon(coupon.id)}
              className={`w-full flex items-center gap-3 p-2.5 rounded-lg border transition-all text-left ${
                invalid
                  ? "border-gray-700/20 opacity-40 cursor-not-allowed"
                  : selected
                    ? "border-green-500/40 bg-green-500/5 cursor-pointer"
                    : "border-gray-700/40 bg-gray-800/20 cursor-pointer hover:border-gray-600"
              }`}
            >
              <div
                aria-hidden="true"
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                  selected && !invalid ? "bg-green-500 border-green-500" : "border-gray-600"
                }`}
              >
                {selected && !invalid && (
                  <svg
                    className="w-2.5 h-2.5 text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm text-gray-200">{coupon.name}</span>
                  <span
                    className={`text-xs px-1.5 py-0 rounded border ${COUPON_TYPE_COLOR[coupon.type]}`}
                  >
                    {COUPON_TYPE_LABEL[coupon.type]}
                  </span>
                  {expired && (
                    <span className="text-xs text-red-500 border border-red-500/30 px-1 rounded">
                      已过期
                    </span>
                  )}
                  {notMet && !expired && (
                    <span className="text-xs text-orange-500 border border-orange-500/30 px-1 rounded">
                      未达门槛
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500">{valueLabel}</span>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ==================== 价格明细区域 ====================
// ==================== 价格计算卡片（规则管道 + 价格明细 合并） ====================
function PriceCalculationCard({
  enabledRules,
  result,
}: {
  enabledRules: Set<string>;
  result: PriceResultWithLog | null;
}) {
  const sortedRules = RULE_META.filter((r) => enabledRules.has(r.id)).sort(
    (a, b) => a.priority - b.priority,
  );

  if (!result) {
    return (
      <Card className="flex items-center justify-center min-h-48">
        <p className="text-gray-600 text-sm">请先选择商品</p>
      </Card>
    );
  }

  const totalDiscount = result.discounts.reduce((sum, d) => sum + d.amount, 0);
  const discountPercent =
    result.originalPrice > 0 ? Math.round((totalDiscount / result.originalPrice) * 100) : 0;

  return (
    <Card>
      {/* 原价行 */}
      <div className="flex items-center justify-between pb-3 mb-1 border-b border-gray-700/40">
        <span className="text-sm text-gray-400">商品原价</span>
        <span className="text-sm text-gray-300 font-mono">{formatMoney(result.originalPrice)}</span>
      </div>

      {/* 规则列表（每条规则一行，触发/跳过一目了然） */}
      {sortedRules.length === 0 ? (
        <p className="text-xs text-gray-600 text-center py-4">请至少启用一条规则</p>
      ) : (
        <div className="space-y-1 py-2">
          {sortedRules.map((rule, i) => {
            const colors = RULE_COLOR_MAP[rule.color];
            const log = result.logs.find((l) => l.ruleName === rule.name);
            const triggered = log?.applicable && log.discount && log.discount.amount > 0;
            const skipped = !log?.applicable;

            return (
              <div key={rule.id}>
                {/* 主行 */}
                <div
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border transition-all ${
                    triggered
                      ? `${colors.bg} ${colors.border}`
                      : "border-gray-700/20 bg-gray-800/10 opacity-50"
                  }`}
                >
                  {/* 左：图标 + 名称 */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{rule.icon}</span>
                    <span
                      className={`text-sm font-medium ${triggered ? colors.text : "text-gray-500"}`}
                    >
                      {rule.name}
                    </span>
                  </div>
                  {/* 右：金额 or 跳过原因 */}
                  {triggered && log?.discount ? (
                    <span className={`text-sm font-mono font-semibold ${colors.text}`}>
                      -{formatMoney(log.discount.amount)}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-600 truncate max-w-40 text-right">
                      {skipped && log?.skipReason ? log.skipReason : "✗ 跳过"}
                    </span>
                  )}
                </div>

                {/* 连接箭头 */}
                {i < sortedRules.length - 1 && (
                  <div className="pl-4 py-0.5 text-gray-700 text-xs select-none">↓</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 最终价行 */}
      <div className="flex items-center justify-between pt-3 mt-1 border-t border-gray-700/40">
        <div>
          <span className="text-base font-semibold text-white">实付金额</span>
          {totalDiscount > 0 && (
            <span className="ml-2 text-xs text-green-500">
              省 {formatMoney(totalDiscount)}（{discountPercent}% off）
            </span>
          )}
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-green-400 font-mono">
            {formatMoney(result.finalPrice)}
          </div>
          {totalDiscount > 0 && (
            <div className="text-xs text-gray-600 line-through">
              {formatMoney(result.originalPrice)}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ==================== 主页面 ====================
export default function PriceEnginePage() {
  // ── 购物车状态 ──
  const [items, setItems] = useState<CartItem[]>(PRESET_ITEMS);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set(["i1", "i2", "i3"]));

  // ── 用户状态 ──
  const [user, setUser] = useState<User>({ id: "u1", name: "张三", memberLevel: "gold" });
  const [region, setRegion] = useState("CN-BJ");

  // ── 规则开关 ──
  const [enabledRules, setEnabledRules] = useState<Set<string>>(
    new Set(["flashSale", "member", "fullReduction", "coupon", "region"]),
  );

  // ── 促销活动开关 ──
  const [enabledPromotions, setEnabledPromotions] = useState<Set<string>>(new Set(["p1", "p2"]));

  // ── 优惠券选择 ──
  const [selectedCouponIds, setSelectedCouponIds] = useState<Set<string>>(new Set(["c1", "c3"]));

  // ── 事件处理 ──
  const handleToggleItem = useCallback((id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleChangeQty = useCallback((id: string, qty: number) => {
    if (qty < 1) return;
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, quantity: qty } : item)));
  }, []);

  const handleToggleRule = useCallback((id: string) => {
    setEnabledRules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleTogglePromotion = useCallback((id: string) => {
    setEnabledPromotions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleToggleCoupon = useCallback((id: string) => {
    setSelectedCouponIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // ── 构建 PriceContext ──
  const ctx = useMemo<PriceContext>(() => {
    const activeItems = items.filter((i) => selectedItemIds.has(i.id));
    const activeCoupons = PRESET_COUPONS.filter((c) => selectedCouponIds.has(c.id));
    const activePromotions = PRESET_PROMOTIONS.filter((p) => enabledPromotions.has(p.id));

    return {
      items: activeItems,
      user,
      coupons: activeCoupons,
      promotions: activePromotions,
      region,
      timestamp: Date.now(),
    };
  }, [items, selectedItemIds, user, region, selectedCouponIds, enabledPromotions]);

  // ── 当前购物车原价（供券门槛判断） ──
  const cartOriginalPrice = useMemo(() => {
    return items
      .filter((i) => selectedItemIds.has(i.id))
      .reduce((sum, i) => sum + i.price * i.quantity, 0);
  }, [items, selectedItemIds]);

  // ── 构建引擎并计算 ──
  const result = useMemo<PriceResultWithLog | null>(() => {
    if (ctx.items.length === 0) return null;

    const engine = new PriceEngine();

    if (enabledRules.has("flashSale")) {
      engine.register(new FlashSaleRule());
    }
    if (enabledRules.has("member")) {
      engine.register(new MemberRule());
    }
    if (enabledRules.has("fullReduction")) {
      engine.register(new FullReductionRule());
    }
    if (enabledRules.has("coupon")) {
      engine.register(new CouponRule());
    }
    if (enabledRules.has("region")) {
      engine.register(new RegionRule());
    }

    return engine.calculate(ctx);
  }, [ctx, enabledRules]);

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-6">
      {/* 页头 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">💰 价格计算引擎</h1>
        <p className="text-sm text-gray-500">
          左侧调整配置 → 右侧实时看每条规则是否触发、触发原因、最终价格。
        </p>
      </div>

      {/* 主体：左右布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 左侧：配置区 */}
        <div className="space-y-4">
          <CartSection
            items={items}
            selectedIds={selectedItemIds}
            onToggleItem={handleToggleItem}
            onChangeQty={handleChangeQty}
          />
          <UserSection
            user={user}
            region={region}
            onMemberChange={(level) => setUser((u) => ({ ...u, memberLevel: level }))}
            onRegionChange={setRegion}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <RulesSection
              enabledRules={enabledRules}
              onToggleRule={handleToggleRule}
              enabledPromotions={enabledPromotions}
              onTogglePromotion={handleTogglePromotion}
            />
            <CouponSection
              selectedCouponIds={selectedCouponIds}
              onToggleCoupon={handleToggleCoupon}
              currentPrice={cartOriginalPrice}
            />
          </div>
        </div>

        {/* 右侧：结果区 */}
        <div className="space-y-4">
          <PriceCalculationCard enabledRules={enabledRules} result={result} />
        </div>
      </div>
    </div>
  );
}
