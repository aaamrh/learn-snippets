import { PriceRule, PriceContext, DiscountDetail, Money, MemberLevel } from '../types'

// ==================== 会员折扣配置 ====================
// 数字越小折扣越大（0.8 = 八折）
const MEMBER_DISCOUNT: Record<MemberLevel, number> = {
  none:     1.00,
  bronze:   0.95,  // 九五折
  silver:   0.90,  // 九折
  gold:     0.85,  // 八五折
  platinum: 0.80,  // 八折
}

const MEMBER_LABEL: Record<MemberLevel, string> = {
  none:     '无会员',
  bronze:   '铜牌会员',
  silver:   '银牌会员',
  gold:     '金牌会员',
  platinum: '铂金会员',
}

// ==================== 会员折扣规则 ====================
/**
 * MemberRule — 会员等级折扣
 *
 * 触发条件：用户 memberLevel 不为 'none'
 * 折扣方式：按折扣率计算，减少金额 = currentPrice × (1 - discount)
 * 执行时机：priority=10，在秒杀价修正（5）之后、满减（20）之前
 *
 * 为什么排在满减之前？
 *   先打折，总价降低，可能跌破满减门槛 → 符合"先折扣再判断满减"的电商惯例
 *   （部分平台反之，这里以最常见的策略为准）
 */
export class MemberRule implements PriceRule {
  readonly id = 'member'
  readonly name = '会员折扣'
  readonly priority = 10

  isApplicable(ctx: PriceContext): boolean {
    return ctx.user.memberLevel !== 'none'
  }

  apply(ctx: PriceContext, currentPrice: Money): DiscountDetail {
    const level = ctx.user.memberLevel
    const discountRate = MEMBER_DISCOUNT[level]
    // 折扣金额 = 当前价 × (1 - 折扣率)，向下取整（对用户有利）
    const amount = Math.floor(currentPrice * (1 - discountRate))
    const percent = Math.round((1 - discountRate) * 100)

    return {
      type: 'member',
      name: `${MEMBER_LABEL[level]}折扣`,
      amount,
      rule: `${MEMBER_LABEL[level]}享 ${Math.round(discountRate * 10)} 折，节省 ${percent}%`,
    }
  }

  skipReason(ctx: PriceContext): string {
    return `当前用户「${ctx.user.name}」未开通会员`
  }
}
