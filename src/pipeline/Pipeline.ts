import { PipeStep, PipelineResult, StepSnapshot } from './types'

// ==================== 管道核心 ====================
/**
 * Pipeline<T> — 管道模式
 *
 * 核心思想：
 *   把一个复杂的处理流程，拆成一组独立的小步骤。
 *   数据从第一步流入，每步的输出作为下一步的输入，最终得到结果。
 *
 * 与"一堆 if/else"的区别：
 *   - 每个步骤只做一件事，互不依赖，可以独立测试
 *   - 新增/删除/调换步骤顺序，不需要改其他步骤的代码
 *   - pipe() 链式调用，执行流程一目了然
 *
 * 执行时会记录每步的「输入→输出」快照，供 UI 展示数据如何被逐步变换。
 */
export class Pipeline {
  private steps: PipeStep<string>[] = []

  /** 添加一个处理步骤，返回 this 支持链式调用 */
  pipe(step: PipeStep<string>): this {
    this.steps.push(step)
    return this
  }

  /** 条件添加：condition 为 false 时跳过该步骤 */
  pipeIf(condition: boolean, step: PipeStep<string>): this {
    if (condition) this.steps.push(step)
    return this
  }

  /** 获取当前步骤列表（只读副本，供 UI 展示） */
  getSteps(): ReadonlyArray<PipeStep<string>> {
    return [...this.steps]
  }

  /**
   * 执行管道
   * 逐步执行每个步骤，记录每步的输入/输出快照。
   * 即使某步抛出异常，也会记录错误信息并继续（容错模式）。
   */
  async process(input: string): Promise<PipelineResult> {
    const snapshots: StepSnapshot[] = []
    let current = input

    for (const step of this.steps) {
      const stepInput = current
      let stepOutput = current

      try {
        const result = await step.fn(current)
        stepOutput = result
      } catch (err) {
        // 某步出错时，输出错误信息，不中断后续步骤
        stepOutput = `[错误: ${err instanceof Error ? err.message : String(err)}]`
      }

      snapshots.push({
        id: step.id,
        name: step.name,
        description: step.description,
        input: stepInput,
        output: stepOutput,
        changed: stepInput !== stepOutput,
      })

      current = stepOutput
    }

    return {
      original: input,
      final: current,
      snapshots,
    }
  }
}
