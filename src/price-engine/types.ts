// ==================== 价格引擎类型定义 ====================

/** 货币单位：以分为单位，避免浮点精度问题。展示时 / 100 */
export type Money = number

// ==================== 购物车商品 ====================
export interface CartItem {
  id: string
  name: string
  /** 单价（分） */
  price: Money
  quantity: number
  /** 商品分类，用于部分促销规则的匹配 */
  category?: string
  /** 标记该商品是否参与秒杀 */
  flashSale?: boolean
}

// ==================== 用户 ====================
export type MemberLevel = 'none' | 'bronze' | 'silver' | 'gold' | 'platinum'

export interface User {
  id: string
  name: string
  memberLevel: MemberLevel
}

// ==================== 优惠券 ====================
export type CouponType = 'fixed' | 'percent' | 'threshold'

export interface Coupon {
  id: string
  name: string
  type: CouponType
  /** fixed: 直减金额（分）；percent: 折扣百分比（如 90 = 九折）；threshold: 满减-减少金额（分） */
  value: number
  /** threshold 类型的门槛金额（分） */
  minAmount?: Money
  /** 过期时间戳（ms），undefined 表示永久有效 */
  expireAt?: number
}

// ==================== 促销活动 ====================
export type PromotionType = 'fullReduction' | 'flashSale'

export interface Promotion {
  id: string
  name: string
  type: PromotionType
  /** 活动开始时间戳（ms） */
  startAt?: number
  /** 活动结束时间戳（ms） */
  endAt?: number
  /** flashSale: 活动价格（分） */
  flashPrice?: Money
  /** flashSale: 参与活动的商品 id 列表 */
  itemIds?: string[]
}

// ==================== 价格计算上下文 ====================
export interface PriceContext {
  items: CartItem[]
  user: User
  /** 用户选中的优惠券列表 */
  coupons: Coupon[]
  /** 当前生效的促销活动列表 */
  promotions: Promotion[]
  /** 地区代码，如 'CN-BJ' / 'CN-XZ' */
  region: string
  /** 当前时间戳（ms），用于判断活动/券是否有效 */
  timestamp: number
}

// ==================== 折扣明细 ====================
export interface DiscountDetail {
  /** 规则类型标识 */
  type: string
  /** 展示名称 */
  name: string
  /** 减少的金额（分），正数 */
  amount: Money
  /** 规则描述（用于日志展示） */
  rule: string
}

// ==================== 计算结果 ====================
export interface PriceResult {
  /** 原始总价（分） */
  originalPrice: Money
  /** 最终价（分），最低为 0 */
  finalPrice: Money
  /** 折扣明细列表，按规则执行顺序排列 */
  discounts: DiscountDetail[]
}

// ==================== 规则日志（供 UI 展示调试信息） ====================
export interface RuleLog {
  ruleName: string
  priority: number
  applicable: boolean
  /** applicable=true 时有值 */
  discount?: DiscountDetail
  /** 跳过原因 */
  skipReason?: string
}

// ==================== 价格规则接口 ====================
export interface PriceRule {
  /** 规则唯一标识 */
  id: string
  /** 展示名称 */
  name: string
  /**
   * 执行优先级，数字越小越先执行
   * 建议：FlashSale=5, Member=10, FullReduction=20, Coupon=30, Region=40
   */
  priority: number
  /**
   * 判断当前上下文 + 当前价格下，该规则是否适用
   * @param ctx     完整的价格上下文
   * @param currentPrice 当前已经被前面规则处理过的价格
   */
  isApplicable(ctx: PriceContext, currentPrice: Money): boolean
  /**
   * 应用规则，返回折扣明细（amount 可为 0，引擎会过滤掉 amount=0 的结果）
   */
  apply(ctx: PriceContext, currentPrice: Money): DiscountDetail
  /**
   * 返回该规则跳过时的原因描述（用于日志）
   */
  skipReason?(ctx: PriceContext, currentPrice: Money): string
}
