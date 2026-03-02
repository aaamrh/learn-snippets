import { PriceContext, PriceResult, PriceRule, Money, RuleLog } from './types'

// ==================== 带日志的计算结果 ====================
export interface PriceResultWithLog extends PriceResult {
  /** 每条规则的执行日志，用于 UI 展示调试信息 */
  logs: RuleLog[]
}

// ==================== 价格引擎 ====================
/**
 * 规则引擎：策略模式的典型应用
 *
 * 设计原则：
 * 1. 引擎本身不含任何业务逻辑，只负责：注册规则、按优先级排序、依次执行
 * 2. 每条规则完全自治：自己判断是否适用（isApplicable）、自己计算折扣（apply）
 * 3. 引擎是纯函数风格：calculate 不修改入参，currentPrice 是局部变量
 * 4. 规则之间通过 currentPrice 传递状态（前一条规则的结果影响后一条规则的输入）
 *
 * 与"一堆 if/else"的本质区别：
 *   - 新增规则只需 register(new XxxRule())，不需要改引擎代码（开闭原则）
 *   - 规则可以独立测试，不依赖其他规则的存在
 *   - priority 控制执行顺序，业务语义清晰
 */
export class PriceEngine {
  private rules: PriceRule[] = []

  /**
   * 注册一条价格规则
   * 每次注册后自动按 priority 升序重排（数字小 = 优先级高 = 先执行）
   *
   * 链式调用：engine.register(ruleA).register(ruleB)
   */
  register(rule: PriceRule): this {
    this.rules.push(rule)
    this.rules.sort((a, b) => a.priority - b.priority)
    return this
  }

  /**
   * 移除一条规则（按 id）
   * 用于动态开关某条规则（对应 Demo 里的规则开关 UI）
   */
  unregister(ruleId: string): this {
    this.rules = this.rules.filter((r) => r.id !== ruleId)
    return this
  }

  /**
   * 获取当前已注册的规则列表（只读副本）
   * 供 UI 展示"当前引擎状态"
   */
  getRules(): ReadonlyArray<PriceRule> {
    return [...this.rules]
  }

  /**
   * 计算最终价格
   *
   * 执行流程：
   * 1. 计算原始总价（∑ item.price * item.quantity）
   * 2. currentPrice = originalPrice
   * 3. 按 priority 升序遍历所有规则：
   *    a. isApplicable(ctx, currentPrice) → false → 记录 skip 日志，跳过
   *    b. apply(ctx, currentPrice) → 得到 DiscountDetail
   *    c. discount.amount > 0 → currentPrice -= discount.amount，记录日志
   * 4. finalPrice = max(0, currentPrice)
   *
   * 注意：currentPrice 会随规则执行逐步减小，
   * 后面的规则拿到的是"已被前面规则折扣过的价格"，
   * 这符合电商实际：先算秒杀价，再算会员折，再算满减
   */
  calculate(ctx: PriceContext): PriceResultWithLog {
    const result: PriceResultWithLog = {
      originalPrice: this.sumOriginal(ctx.items),
      finalPrice: 0,
      discounts: [],
      logs: [],
    }

    let currentPrice = result.originalPrice

    for (const rule of this.rules) {
      if (rule.isApplicable(ctx, currentPrice)) {
        const discount = rule.apply(ctx, currentPrice)

        if (discount.amount > 0) {
          currentPrice -= discount.amount
          result.discounts.push(discount)
        }

        result.logs.push({
          ruleName: rule.name,
          priority: rule.priority,
          applicable: true,
          discount: discount.amount > 0 ? discount : undefined,
        })
      } else {
        const skipReason = rule.skipReason?.(ctx, currentPrice) ?? '条件不满足'
        result.logs.push({
          ruleName: rule.name,
          priority: rule.priority,
          applicable: false,
          skipReason,
        })
      }
    }

    result.finalPrice = Math.max(0, currentPrice)
    return result
  }

  /**
   * 计算购物车原始总价
   * ∑ (单价 × 数量)，单位：分
   */
  private sumOriginal(items: { price: Money; quantity: number }[]): Money {
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  }
}
