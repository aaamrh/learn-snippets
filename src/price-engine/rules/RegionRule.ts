import { PriceRule, PriceContext, DiscountDetail, Money } from '../types'

// ==================== 地区补贴配置 ====================
interface RegionSubsidy {
  /** 补贴金额（分） */
  amount: Money
  /** 地区显示名称 */
  label: string
  /** 补贴上限比例（0~1），补贴不超过总价的此比例 */
  maxRatio: number
}

const REGION_SUBSIDY_MAP: Record<string, RegionSubsidy> = {
  'CN-XZ': { amount: 5000, label: '西藏',     maxRatio: 0.15 }, // 减50元，上限15%
  'CN-XJ': { amount: 5000, label: '新疆',     maxRatio: 0.15 }, // 减50元，上限15%
  'CN-QH': { amount: 3000, label: '青海',     maxRatio: 0.12 }, // 减30元，上限12%
  'CN-YN': { amount: 2000, label: '云南',     maxRatio: 0.10 }, // 减20元，上限10%
  'CN-GZ': { amount: 2000, label: '贵州',     maxRatio: 0.10 }, // 减20元，上限10%
  'CN-GX': { amount: 1500, label: '广西',     maxRatio: 0.10 }, // 减15元，上限10%
  'CN-NM': { amount: 3000, label: '内蒙古',   maxRatio: 0.12 }, // 减30元，上限12%
  'CN-HLJ': { amount: 2000, label: '黑龙江',  maxRatio: 0.10 }, // 减20元，上限10%
}

// ==================== 地区补贴规则 ====================
/**
 * RegionRule — 地区物流补贴
 *
 * 触发条件：
 *   ctx.region 在补贴地区列表内（偏远/欠发达地区）
 *
 * 折扣方式：
 *   固定补贴金额，但不超过 currentPrice × maxRatio（防止小额订单补贴比例过高）
 *   例如：西藏用户减 ¥50，但若订单只有 ¥80，则最多减 ¥12（80 × 15%）
 *
 * 执行时机：priority=40，最后执行
 *
 * 为什么最后执行？
 *   地区补贴是平台对物流成本的补贴，属于"兜底优惠"，
 *   应基于用户享受所有商业折扣后的最终价格来计算上限比例，
 *   避免补贴被前面的折扣"放大"。
 *
 * 设计考量：
 *   maxRatio 的存在是为了防止"薅羊毛"：
 *   若一个偏远地区用户只买 ¥5 的东西，补贴 ¥50 显然不合理，
 *   maxRatio=0.15 意味着最多补贴订单金额的 15%。
 */
export class RegionRule implements PriceRule {
  readonly id = 'region'
  readonly name = '地区补贴'
  readonly priority = 40

  isApplicable(ctx: PriceContext, _currentPrice: Money): boolean {
    return ctx.region in REGION_SUBSIDY_MAP
  }

  apply(ctx: PriceContext, currentPrice: Money): DiscountDetail {
    const subsidy = REGION_SUBSIDY_MAP[ctx.region]

    if (!subsidy) {
      return { type: 'region', name: '地区补贴', amount: 0, rule: '当前地区不在补贴范围内' }
    }

    // 补贴金额不超过 currentPrice × maxRatio
    const maxAllowed = Math.floor(currentPrice * subsidy.maxRatio)
    const amount = Math.min(subsidy.amount, maxAllowed)

    const isCapped = amount < subsidy.amount
    const cappedNote = isCapped
      ? `（订单金额较小，按 ${Math.round(subsidy.maxRatio * 100)}% 上限计算）`
      : ''

    return {
      type: 'region',
      name: `${subsidy.label}地区补贴`,
      amount,
      rule: `${subsidy.label}地区享物流补贴 ¥${(subsidy.amount / 100).toFixed(2)}${cappedNote}`,
    }
  }

  skipReason(ctx: PriceContext): string {
    return `当前地区「${ctx.region}」不在补贴范围内`
  }

  /** 获取所有补贴地区配置（供 UI 展示） */
  static getSubsidyRegions(): Array<{ code: string; label: string; amount: Money }> {
    return Object.entries(REGION_SUBSIDY_MAP).map(([code, config]) => ({
      code,
      label: config.label,
      amount: config.amount,
    }))
  }
}
