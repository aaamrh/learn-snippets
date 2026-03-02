import { PriceRule, PriceContext, DiscountDetail, Money } from '../types'

// ==================== 限时秒杀规则 ====================
/**
 * FlashSaleRule — 限时秒杀
 *
 * 触发条件：
 *   1. ctx.promotions 中存在 type='flashSale' 的活动
 *   2. ctx.timestamp 在活动 startAt ~ endAt 时间窗口内
 *   3. ctx.items 中至少有一个商品的 id 在 promotion.itemIds 列表里
 *
 * 折扣方式：
 *   将命中秒杀的商品单价替换为 flashPrice，
 *   折扣金额 = ∑(原价 - 秒杀价) × 数量
 *   不命中秒杀的商品按原价计算。
 *
 * 执行时机：priority=5，最先执行
 *
 * 为什么最先执行？
 *   秒杀价是对"原始定价"的修正，相当于重新定价，
 *   后续规则（会员折扣、满减、券）应基于秒杀后的价格继续叠加，
 *   而不是基于原价 —— 这符合用户预期和电商平台的实际逻辑。
 *
 * 注意：
 *   引擎传入的 currentPrice 是所有商品的汇总价，
 *   本规则内部重新计算"秒杀后的总价"与 currentPrice 的差值作为折扣金额，
 *   而非直接修改 ctx.items（ctx 应保持不可变）。
 */
export class FlashSaleRule implements PriceRule {
  readonly id = 'flashSale'
  readonly name = '限时秒杀'
  readonly priority = 5

  isApplicable(ctx: PriceContext, _currentPrice: Money): boolean {
    return ctx.promotions.some((p) => {
      if (p.type !== 'flashSale') return false

      // 检查时间窗口
      if (p.startAt !== undefined && ctx.timestamp < p.startAt) return false
      if (p.endAt !== undefined && ctx.timestamp > p.endAt) return false

      // 检查购物车中是否有参与秒杀的商品
      const itemIds = new Set(p.itemIds ?? [])
      return ctx.items.some((item) => itemIds.has(item.id))
    })
  }

  apply(ctx: PriceContext, currentPrice: Money): DiscountDetail {
    // 找到所有生效的秒杀活动（时间内 + 商品匹配）
    const activeFlashSales = ctx.promotions.filter((p) => {
      if (p.type !== 'flashSale') return false
      if (p.startAt !== undefined && ctx.timestamp < p.startAt) return false
      if (p.endAt !== undefined && ctx.timestamp > p.endAt) return false
      const itemIds = new Set(p.itemIds ?? [])
      return ctx.items.some((item) => itemIds.has(item.id))
    })

    if (activeFlashSales.length === 0 || currentPrice <= 0) {
      return { type: 'flashSale', name: '限时秒杀', amount: 0, rule: '无秒杀活动' }
    }

    // 构建 商品id -> 秒杀价 的映射（多个秒杀活动时，取最低价）
    const flashPriceMap = new Map<string, Money>()
    for (const promotion of activeFlashSales) {
      const itemIds = promotion.itemIds ?? []
      for (const itemId of itemIds) {
        const existing = flashPriceMap.get(itemId)
        if (promotion.flashPrice !== undefined) {
          if (existing === undefined || promotion.flashPrice < existing) {
            flashPriceMap.set(itemId, promotion.flashPrice)
          }
        }
      }
    }

    // 计算秒杀节省的总金额
    // 节省额 = ∑ (原单价 - 秒杀单价) × 数量，只计算命中秒杀的商品
    let totalSaved: Money = 0
    const hitItems: string[] = []

    for (const item of ctx.items) {
      const flashPrice = flashPriceMap.get(item.id)
      if (flashPrice !== undefined && flashPrice < item.price) {
        const saved = (item.price - flashPrice) * item.quantity
        totalSaved += saved
        hitItems.push(item.name)
      }
    }

    // 不能超过 currentPrice（防止折扣后为负数，兜底保护）
    const amount = Math.min(totalSaved, currentPrice)

    const promoNames = activeFlashSales.map((p) => p.name).join('、')
    const itemNames = hitItems.slice(0, 3).join('、') + (hitItems.length > 3 ? '等' : '')

    return {
      type: 'flashSale',
      name: '限时秒杀',
      amount,
      rule: `活动「${promoNames}」命中商品：${itemNames}，共节省 ¥${(amount / 100).toFixed(2)}`,
    }
  }

  skipReason(ctx: PriceContext, _currentPrice: Money): string {
    const flashPromos = ctx.promotions.filter((p) => p.type === 'flashSale')
    if (flashPromos.length === 0) return '当前无秒杀活动'

    for (const p of flashPromos) {
      if (p.startAt !== undefined && ctx.timestamp < p.startAt) {
        const remaining = Math.ceil((p.startAt - ctx.timestamp) / 60000)
        return `活动「${p.name}」尚未开始，还有约 ${remaining} 分钟`
      }
      if (p.endAt !== undefined && ctx.timestamp > p.endAt) {
        return `活动「${p.name}」已结束`
      }
      // 时间内但商品不匹配
      const itemIds = new Set(p.itemIds ?? [])
      const hasMatch = ctx.items.some((item) => itemIds.has(item.id))
      if (!hasMatch) return `购物车中无参与「${p.name}」的商品`
    }

    return '秒杀条件不满足'
  }
}
