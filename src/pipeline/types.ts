// ==================== 管道模式类型定义 ====================

/** 单个管道处理函数：接收输入，返回处理后的输出 */
export type PipeFunction<T> = (input: T) => T | Promise<T>

/** 管道步骤：函数 + 元信息（供 UI 展示） */
export interface PipeStep<T> {
  id: string
  name: string
  description: string
  fn: PipeFunction<T>
}

/** 单步执行快照（供 UI 展示每步的输入输出） */
export interface StepSnapshot {
  id: string
  name: string
  description: string
  input: string
  output: string
  /** 本步是否产生了变化 */
  changed: boolean
}

/** 管道执行结果 */
export interface PipelineResult {
  /** 原始输入 */
  original: string
  /** 最终输出 */
  final: string
  /** 每步快照，按执行顺序排列 */
  snapshots: StepSnapshot[]
}
