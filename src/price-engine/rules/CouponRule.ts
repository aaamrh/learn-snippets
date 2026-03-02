import { PriceRule, PriceContext, DiscountDetail, Money, Coupon, CouponType } from '../types'

// ==================== 券类型标签 ====================
const COUPON_TYPE_LABEL: Record<CouponType, string> = {
  fixed:     '直减券',
  percent:   '折扣券',
  threshold: '满减券',
}

// ==================== 计算单张券的折扣金额 ====================
function calcCouponAmount(coupon: Coupon, currentPrice: Money): Money {
  switch (coupon.type) {
    case 'fixed':
      // 直减：直接减去面值，不超过当前价格
      return Math.min(coupon.value, currentPrice)

    case 'percent':
      // 折扣券：value=90 表示九折，折扣金额 = 当前价 × (100 - value) / 100
      // 向下取整，对用户有利
      return Math.floor(currentPrice * (100 - coupon.value) / 100)

    case 'threshold':
      // 满减：满 minAmount 减 value
      if (currentPrice >= (coupon.minAmount ?? 0)) {
        return Math.min(coupon.value, currentPrice)
      }
      return 0

    default:
      return 0
  }
}

// ==================== 判断券是否有效 ====================
function isCouponValid(coupon: Coupon, currentPrice: Money, timestamp: number): boolean {
  // 检查是否过期
  if (coupon.expireAt !== undefined && timestamp > coupon.expireAt) {
    return false
  }
  // threshold 类型需满足门槛
  if (coupon.type === 'threshold' && currentPrice < (coupon.minAmount ?? 0)) {
    return false
  }
  return true
}

// ==================== 优惠券规则 ====================
/**
 * CouponRule — 优惠券规则
 *
 * 支持三种券类型：
 *   - fixed     直减券：直接减去面值（如"减50元"）
 *   - percent   折扣券：按比例打折（如"九折券"，value=90）
 *   - threshold 满减券：满指定金额才可用（如"满200减30"）
 *
 * 选券策略：
 *   遍历 ctx.coupons 中所有有效券，各自计算折扣金额，取折扣最大的一张使用。
 *   这样对用户最有利，也符合大多数电商平台的"最优券自动选择"逻辑。
 *   注意：引擎本身不限制"只能用一张"，这个互斥逻辑由本规则内部实现，
 *   而非引擎层强制 —— 保持引擎的通用性。
 *
 * 执行时机：priority=30，在满减（20）之后、地区补贴（40）之前
 *
 * 为什么排在满减之后？
 *   满减降低价格 → 券的折扣基数更小 → 整体更有利于平台。
 *   但"券先还是满减先"在不同平台有不同策略，这里以常见顺序为准。
 *   只需调整 priority 即可改变顺序，不需要改任何规则代码。
 */
export class CouponRule implements PriceRule {
  readonly id = 'coupon'
  readonly name = '优惠券'
  readonly priority = 30

  isApplicable(ctx: PriceContext, currentPrice: Money): boolean {
    if (ctx.coupons.length === 0) return false
    // 至少有一张未过期且满足条件的券
    return ctx.coupons.some((c) => isCouponValid(c, currentPrice, ctx.timestamp))
  }

  apply(ctx: PriceContext, currentPrice: Money): DiscountDetail {
    const validCoupons = ctx.coupons.filter((c) =>
      isCouponValid(c, currentPrice, ctx.timestamp)
    )

    // 找折扣金额最大的一张（最优券策略）
    let bestCoupon: Coupon | null = null
    let bestAmount: Money = 0

    for (const coupon of validCoupons) {
      const amount = calcCouponAmount(coupon, currentPrice)
      if (amount > bestAmount) {
        bestAmount = amount
        bestCoupon = coupon
      }
    }

    if (!bestCoupon || bestAmount === 0) {
      return { type: 'coupon', name: '优惠券', amount: 0, rule: '无可用券' }
    }

    const typeLabel = COUPON_TYPE_LABEL[bestCoupon.type]
    let ruleDesc = ''
    switch (bestCoupon.type) {
      case 'fixed':
        ruleDesc = `${typeLabel}「${bestCoupon.name}」直减 ¥${(bestCoupon.value / 100).toFixed(2)}`
        break
      case 'percent':
        ruleDesc = `${typeLabel}「${bestCoupon.name}」打 ${bestCoupon.value / 10} 折`
        break
      case 'threshold':
        ruleDesc = `${typeLabel}「${bestCoupon.name}」满 ¥${((bestCoupon.minAmount ?? 0) / 100).toFixed(2)} 减 ¥${(bestCoupon.value / 100).toFixed(2)}`
        break
    }

    if (validCoupons.length > 1) {
      ruleDesc += `（共 ${validCoupons.length} 张可用，已自动选最优）`
    }

    return {
      type: 'coupon',
      name: `${typeLabel}优惠`,
      amount: bestAmount,
      rule: ruleDesc,
    }
  }

  skipReason(ctx: PriceContext, currentPrice: Money): string {
    if (ctx.coupons.length === 0) return '未选择任何优惠券'
    const expiredCount = ctx.coupons.filter(
      (c) => c.expireAt !== undefined && ctx.timestamp > c.expireAt
    ).length
    const thresholdCount = ctx.coupons.filter(
      (c) => c.type === 'threshold' && currentPrice < (c.minAmount ?? 0)
    ).length
    const reasons: string[] = []
    if (expiredCount > 0) reasons.push(`${expiredCount} 张已过期`)
    if (thresholdCount > 0) reasons.push(`${thresholdCount} 张未达门槛`)
    return reasons.length > 0 ? reasons.join('，') : '所有券均不可用'
  }
}
