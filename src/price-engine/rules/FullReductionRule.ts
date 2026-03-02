import { PriceRule, PriceContext, DiscountDetail, Money } from '../types'

// ==================== 阶梯满减配置 ====================
// 按门槛从大到小排列，命中最高档
interface Tier {
  threshold: Money  // 满多少（分）
  reduction: Money  // 减多少（分）
  label: string
}

const DEFAULT_TIERS: Tier[] = [
  { threshold: 300000, reduction: 40000, label: '满3000减400' },
  { threshold: 200000, reduction: 25000, label: '满2000减250' },
  { threshold: 100000, reduction: 10000, label: '满1000减100' },
  { threshold:  50000, reduction:  3000, label: '满500减30'   },
]

// ==================== 满减活动规则 ====================
/**
 * FullReductionRule — 阶梯满减活动
 *
 * 触发条件：
 *   ctx.promotions 中存在 type='fullReduction' 的活动，
 *   且当前价格 currentPrice 达到最低门槛（50000分 = ¥500）
 *
 * 折扣方式：
 *   命中价格所在的最高档阶梯，减去对应金额。
 *   例如：¥2500 → 命中"满2000减250"，而非"满1000减100"。
 *   只取一档（最高档），不叠加多档。
 *
 * 执行时机：priority=20，在会员折扣（10）之后、优惠券（30）之前
 *
 * 阶梯设计理由：
 *   满减的核心目的是"拉高客单价"，阶梯越多档位越能精准引导。
 *   只取最高档而非累加，是因为累加实现复杂且容易出 bug，
 *   大多数平台（淘宝/京东）的满减也是"取最高档"逻辑。
 */
export class FullReductionRule implements PriceRule {
  readonly id = 'fullReduction'
  readonly name = '满减活动'
  readonly priority = 20

  private tiers: Tier[]

  constructor(tiers: Tier[] = DEFAULT_TIERS) {
    // 确保从大到小排列，方便找最高档
    this.tiers = [...tiers].sort((a, b) => b.threshold - a.threshold)
  }

  isApplicable(ctx: PriceContext, currentPrice: Money): boolean {
    // 必须有 fullReduction 类型的促销活动
    const hasPromotion = ctx.promotions.some((p) => p.type === 'fullReduction')
    if (!hasPromotion) return false
    // 必须达到最低门槛
    const lowestThreshold = this.tiers[this.tiers.length - 1]?.threshold ?? Infinity
    return currentPrice >= lowestThreshold
  }

  apply(ctx: PriceContext, currentPrice: Money): DiscountDetail {
    // 找到当前价格命中的最高阶梯
    const hitTier = this.tiers.find((tier) => currentPrice >= tier.threshold)

    if (!hitTier) {
      return {
        type: 'promotion',
        name: '满减活动',
        amount: 0,
        rule: '未达到任何满减门槛',
      }
    }

    // 找到当前促销活动名称（取第一个 fullReduction 活动）
    const promotion = ctx.promotions.find((p) => p.type === 'fullReduction')
    const promoName = promotion?.name ?? '满减活动'

    // 计算下一档（用于提示用户"再买多少可以享受更高档"）
    const nextTierIndex = this.tiers.indexOf(hitTier) - 1
    const nextTier = nextTierIndex >= 0 ? this.tiers[nextTierIndex] : null
    const nextTipSuffix = nextTier
      ? `（再消费 ¥${((nextTier.threshold - currentPrice) / 100).toFixed(2)} 可享${nextTier.label}）`
      : '（已享最高档满减）'

    return {
      type: 'promotion',
      name: promoName,
      amount: hitTier.reduction,
      rule: `命中「${hitTier.label}」${nextTipSuffix}`,
    }
  }

  skipReason(ctx: PriceContext, currentPrice: Money): string {
    const hasPromotion = ctx.promotions.some((p) => p.type === 'fullReduction')
    if (!hasPromotion) return '当前无满减促销活动'
    const lowestThreshold = this.tiers[this.tiers.length - 1]?.threshold ?? 0
    const gap = lowestThreshold - currentPrice
    return `未达最低门槛，还差 ¥${(gap / 100).toFixed(2)}`
  }

  /** 获取所有阶梯配置（供 UI 展示） */
  getTiers(): ReadonlyArray<Tier> {
    return [...this.tiers].reverse() // 从低到高展示更直观
  }
}
