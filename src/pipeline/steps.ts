import { PipeStep } from './types'

// ==================== 预置文本处理步骤 ====================
// 每个步骤只做一件事，互不依赖。
// 这正是管道模式的核心价值：步骤可以任意组合、开关、复用。

/** 步骤1：去除首尾空格 */
export const trimStep: PipeStep<string> = {
  id: 'trim',
  name: '去除空格',
  description: '移除首尾多余的空白字符',
  fn: (input) => input.trim(),
}

/** 步骤2：转为小写 */
export const toLowerCaseStep: PipeStep<string> = {
  id: 'toLowerCase',
  name: '转小写',
  description: '将所有大写字母转为小写',
  fn: (input) => input.toLowerCase(),
}

/** 步骤3：校验邮箱格式（格式不对则抛出错误） */
export const validateEmailStep: PipeStep<string> = {
  id: 'validateEmail',
  name: '校验邮箱',
  description: '检查是否符合 xxx@xxx.xx 格式，不符合则报错',
  fn: (input) => {
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)
    if (!valid) throw new Error(`"${input}" 不是有效的邮箱格式`)
    return input
  },
}

/** 步骤4：过滤敏感词（替换为 ***） */
const BAD_WORDS = ['spam', 'test123', 'admin']
export const filterBadWordsStep: PipeStep<string> = {
  id: 'filterBadWords',
  name: '过滤敏感词',
  description: `将敏感词（${BAD_WORDS.join('、')}）替换为 ***`,
  fn: (input) => {
    let result = input
    for (const word of BAD_WORDS) {
      result = result.replaceAll(word, '***')
    }
    return result
  },
}

/** 步骤5：从邮箱提取用户名（取 @ 前的部分） */
export const extractUsernameStep: PipeStep<string> = {
  id: 'extractUsername',
  name: '提取用户名',
  description: '取邮箱 @ 前的部分作为用户名',
  fn: (input) => {
    const atIndex = input.indexOf('@')
    return atIndex > 0 ? input.slice(0, atIndex) : input
  },
}

/** 所有步骤的有序列表（默认执行顺序） */
export const ALL_STEPS = [
  trimStep,
  toLowerCaseStep,
  validateEmailStep,
  filterBadWordsStep,
  extractUsernameStep,
]
