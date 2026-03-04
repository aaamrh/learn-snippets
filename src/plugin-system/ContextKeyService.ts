// ==================== ContextKeyService ====================
//
// 对标 VS Code 的 ContextKeyService：
// - 管理上下文变量（Context Keys），如 editorHasSelection、selection.length 等
// - 解析和求值 `when` 条件表达式
// - 支持变量引用、比较运算、逻辑运算（&&、||、!）、括号分组
//
// VS Code 的 when 表达式语法参考：
// https://code.visualstudio.com/api/references/when-clause-contexts
//
// 支持的语法：
//   变量引用:     editorHasSelection, selection.length, pluginActive.translate
//   逻辑运算:     expr && expr, expr || expr, !expr
//   比较运算:     key == value, key != value, key > value, key >= value, key < value, key <= value
//   括号分组:     (expr && expr) || expr
//   字面量:       true, false, 数字, 带引号的字符串
//
// 实现方式：递归下降解析器（Recursive Descent Parser）
//   tokenize → parse → evaluate
//   不依赖 eval()，安全且可控

import type { ContextKeys } from "./manifest-types";

// ==================== Token 定义 ====================

type TokenType =
  | "IDENTIFIER"    // 变量名：editorHasSelection, selection.length
  | "STRING"        // 字符串字面量：'hello', "world"
  | "NUMBER"        // 数字字面量：0, 42, 3.14
  | "BOOLEAN"       // true, false
  | "AND"           // &&
  | "OR"            // ||
  | "NOT"           // !
  | "EQ"            // ==
  | "NEQ"           // !=
  | "GT"            // >
  | "GTE"           // >=
  | "LT"            // <
  | "LTE"           // <=
  | "LPAREN"        // (
  | "RPAREN"        // )
  | "IN"            // in（成员检测，VS Code 支持但我们简化处理）
  | "NOT_IN"        // not in
  | "REGEX_MATCH"   // =~（正则匹配，VS Code 支持）
  | "EOF";          // 表达式结束

interface Token {
  type: TokenType;
  value: string;
  position: number;
}

// ==================== AST 节点定义 ====================

type ASTNode =
  | LiteralNode
  | IdentifierNode
  | UnaryNode
  | BinaryNode;

interface LiteralNode {
  kind: "literal";
  value: string | number | boolean;
}

interface IdentifierNode {
  kind: "identifier";
  name: string;
}

interface UnaryNode {
  kind: "unary";
  operator: "!";
  operand: ASTNode;
}

interface BinaryNode {
  kind: "binary";
  operator: "&&" | "||" | "==" | "!=" | ">" | ">=" | "<" | "<=" | "in" | "not in" | "=~";
  left: ASTNode;
  right: ASTNode;
}

// ==================== Tokenizer ====================

/**
 * 将 when 表达式字符串拆分为 Token 序列
 *
 * 设计决策：
 * - 支持点号分隔的标识符（如 selection.length）作为单个 IDENTIFIER token
 * - 支持单引号和双引号字符串
 * - 空白字符作为分隔符，不产生 token
 */
function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expression.length) {
    const ch = expression[i];

    // 跳过空白
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // 双字符运算符（必须先检查，否则 > 会被误匹配为 GT）
    const twoChar = expression.slice(i, i + 2);
    if (twoChar === "&&") {
      tokens.push({ type: "AND", value: "&&", position: i });
      i += 2;
      continue;
    }
    if (twoChar === "||") {
      tokens.push({ type: "OR", value: "||", position: i });
      i += 2;
      continue;
    }
    if (twoChar === "==") {
      tokens.push({ type: "EQ", value: "==", position: i });
      i += 2;
      continue;
    }
    if (twoChar === "!=") {
      tokens.push({ type: "NEQ", value: "!=", position: i });
      i += 2;
      continue;
    }
    if (twoChar === ">=") {
      tokens.push({ type: "GTE", value: ">=", position: i });
      i += 2;
      continue;
    }
    if (twoChar === "<=") {
      tokens.push({ type: "LTE", value: "<=", position: i });
      i += 2;
      continue;
    }
    if (twoChar === "=~") {
      tokens.push({ type: "REGEX_MATCH", value: "=~", position: i });
      i += 2;
      continue;
    }

    // 单字符运算符
    if (ch === ">") {
      tokens.push({ type: "GT", value: ">", position: i });
      i++;
      continue;
    }
    if (ch === "<") {
      tokens.push({ type: "LT", value: "<", position: i });
      i++;
      continue;
    }
    if (ch === "!") {
      tokens.push({ type: "NOT", value: "!", position: i });
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "LPAREN", value: "(", position: i });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "RPAREN", value: ")", position: i });
      i++;
      continue;
    }

    // 字符串字面量（单引号或双引号）
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let str = "";
      i++; // 跳过开引号
      while (i < expression.length && expression[i] !== quote) {
        if (expression[i] === "\\" && i + 1 < expression.length) {
          // 转义字符
          i++;
          str += expression[i];
        } else {
          str += expression[i];
        }
        i++;
      }
      if (i >= expression.length) {
        throw new ContextKeyParseError(
          `Unterminated string literal starting at position ${i - str.length - 1}`,
          expression
        );
      }
      i++; // 跳过闭引号
      tokens.push({ type: "STRING", value: str, position: i - str.length - 2 });
      continue;
    }

    // 数字字面量
    if (/[0-9]/.test(ch) || (ch === "-" && i + 1 < expression.length && /[0-9]/.test(expression[i + 1]))) {
      let num = ch;
      i++;
      let hasDot = false;
      while (i < expression.length && (/[0-9]/.test(expression[i]) || (expression[i] === "." && !hasDot))) {
        if (expression[i] === ".") {
          // 检查点号后面是否是数字，如果不是则不属于数字（可能是标识符分隔符场景）
          if (i + 1 < expression.length && /[0-9]/.test(expression[i + 1])) {
            hasDot = true;
            num += expression[i];
          } else {
            break;
          }
        } else {
          num += expression[i];
        }
        i++;
      }
      tokens.push({ type: "NUMBER", value: num, position: i - num.length });
      continue;
    }

    // 标识符或关键字（支持点号分隔，如 selection.length、pluginActive.translate）
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = ch;
      i++;
      while (i < expression.length && /[a-zA-Z0-9_.]/.test(expression[i])) {
        ident += expression[i];
        i++;
      }

      // 去掉尾部的点号（防止 "foo." 这种情况）
      while (ident.endsWith(".")) {
        ident = ident.slice(0, -1);
        i--;
      }

      // 关键字检测
      if (ident === "true" || ident === "false") {
        tokens.push({ type: "BOOLEAN", value: ident, position: i - ident.length });
      } else if (ident === "in") {
        tokens.push({ type: "IN", value: "in", position: i - 2 });
      } else if (ident === "not") {
        // 检查后面是否紧跟 "in"（组成 "not in"）
        const remaining = expression.slice(i).trimStart();
        if (remaining.startsWith("in") && (remaining.length === 2 || !/[a-zA-Z0-9_]/.test(remaining[2]))) {
          const spacesSkipped = expression.slice(i).indexOf("i");
          i += spacesSkipped + 2; // 跳过 "in"
          tokens.push({ type: "NOT_IN", value: "not in", position: i - 6 });
        } else {
          tokens.push({ type: "IDENTIFIER", value: ident, position: i - ident.length });
        }
      } else {
        tokens.push({ type: "IDENTIFIER", value: ident, position: i - ident.length });
      }
      continue;
    }

    // 正则字面量（在 =~ 运算符后面使用，这里跳过斜杠开头的正则）
    if (ch === "/") {
      let regex = "";
      i++; // 跳过开头的 /
      while (i < expression.length && expression[i] !== "/") {
        if (expression[i] === "\\" && i + 1 < expression.length) {
          regex += expression[i];
          i++;
          regex += expression[i];
        } else {
          regex += expression[i];
        }
        i++;
      }
      if (i < expression.length) {
        i++; // 跳过结尾的 /
      }
      // 读取修饰符（flags）
      let flags = "";
      while (i < expression.length && /[gimsuy]/.test(expression[i])) {
        flags += expression[i];
        i++;
      }
      tokens.push({ type: "STRING", value: `/${regex}/${flags}`, position: i - regex.length - flags.length - 2 });
      continue;
    }

    throw new ContextKeyParseError(
      `Unexpected character '${ch}' at position ${i}`,
      expression
    );
  }

  tokens.push({ type: "EOF", value: "", position: i });
  return tokens;
}

// ==================== Parser（递归下降） ====================

/**
 * 递归下降解析器
 *
 * 文法（优先级从低到高）：
 *   expression  → or_expr
 *   or_expr     → and_expr ( "||" and_expr )*
 *   and_expr    → not_expr ( "&&" not_expr )*
 *   not_expr    → "!" not_expr | comparison
 *   comparison  → primary ( ( "==" | "!=" | ">" | ">=" | "<" | "<=" | "in" | "not in" | "=~" ) primary )?
 *   primary     → IDENTIFIER | STRING | NUMBER | BOOLEAN | "(" expression ")"
 */
class Parser {
  private tokens: Token[];
  private pos: number;
  private expression: string;

  constructor(tokens: Token[], expression: string) {
    this.tokens = tokens;
    this.pos = 0;
    this.expression = expression;
  }

  parse(): ASTNode {
    const node = this.parseOrExpr();
    if (this.current().type !== "EOF") {
      throw new ContextKeyParseError(
        `Unexpected token '${this.current().value}' at position ${this.current().position}`,
        this.expression
      );
    }
    return node;
  }

  private current(): Token {
    return this.tokens[this.pos] || { type: "EOF" as const, value: "", position: -1 };
  }

  private advance(): Token {
    const token = this.current();
    this.pos++;
    return token;
  }

  private expect(type: TokenType): Token {
    const token = this.current();
    if (token.type !== type) {
      throw new ContextKeyParseError(
        `Expected ${type} but got ${token.type} ('${token.value}') at position ${token.position}`,
        this.expression
      );
    }
    return this.advance();
  }

  // or_expr → and_expr ( "||" and_expr )*
  private parseOrExpr(): ASTNode {
    let left = this.parseAndExpr();
    while (this.current().type === "OR") {
      this.advance();
      const right = this.parseAndExpr();
      left = { kind: "binary", operator: "||", left, right };
    }
    return left;
  }

  // and_expr → not_expr ( "&&" not_expr )*
  private parseAndExpr(): ASTNode {
    let left = this.parseNotExpr();
    while (this.current().type === "AND") {
      this.advance();
      const right = this.parseNotExpr();
      left = { kind: "binary", operator: "&&", left, right };
    }
    return left;
  }

  // not_expr → "!" not_expr | comparison
  private parseNotExpr(): ASTNode {
    if (this.current().type === "NOT") {
      this.advance();
      const operand = this.parseNotExpr();
      return { kind: "unary", operator: "!", operand };
    }
    return this.parseComparison();
  }

  // comparison → primary ( ( "==" | "!=" | ">" | ">=" | "<" | "<=" | "in" | "not in" | "=~" ) primary )?
  private parseComparison(): ASTNode {
    const left = this.parsePrimary();

    const comparisonOps: TokenType[] = ["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "IN", "NOT_IN", "REGEX_MATCH"];
    if (comparisonOps.includes(this.current().type)) {
      const opToken = this.advance();
      const opMap: Record<string, BinaryNode["operator"]> = {
        "==": "==",
        "!=": "!=",
        ">": ">",
        ">=": ">=",
        "<": "<",
        "<=": "<=",
        "in": "in",
        "not in": "not in",
        "=~": "=~",
      };
      const operator = opMap[opToken.value];
      if (!operator) {
        throw new ContextKeyParseError(
          `Unknown operator '${opToken.value}' at position ${opToken.position}`,
          this.expression
        );
      }
      const right = this.parsePrimary();
      return { kind: "binary", operator, left, right };
    }

    return left;
  }

  // primary → IDENTIFIER | STRING | NUMBER | BOOLEAN | "(" expression ")"
  private parsePrimary(): ASTNode {
    const token = this.current();

    switch (token.type) {
      case "IDENTIFIER":
        this.advance();
        return { kind: "identifier", name: token.value };

      case "STRING":
        this.advance();
        return { kind: "literal", value: token.value };

      case "NUMBER":
        this.advance();
        return { kind: "literal", value: parseFloat(token.value) };

      case "BOOLEAN":
        this.advance();
        return { kind: "literal", value: token.value === "true" };

      case "LPAREN": {
        this.advance(); // 跳过 (
        const expr = this.parseOrExpr();
        this.expect("RPAREN"); // 期望 )
        return expr;
      }

      default:
        throw new ContextKeyParseError(
          `Unexpected token '${token.value}' (${token.type}) at position ${token.position}, expected a value or expression`,
          this.expression
        );
    }
  }
}

// ==================== 求值器 ====================

/**
 * 对 AST 节点求值
 *
 * @param node  AST 节点
 * @param keys  上下文变量映射（从 ContextKeys 读取）
 * @returns     求值结果（可能是 boolean / number / string）
 */
function evaluateNode(node: ASTNode, keys: Record<string, unknown>): unknown {
  switch (node.kind) {
    case "literal":
      return node.value;

    case "identifier":
      // 从上下文中查找变量值
      // 支持嵌套属性访问（如 selection.length 作为整体 key）
      if (node.name in keys) {
        return keys[node.name];
      }
      // 如果整体 key 找不到，尝试按点号拆分逐层访问
      // 例如 context 中有 { selection: { length: 5 } }
      // 表达式写了 selection.length → 先查找整体 key "selection.length"，
      // 找不到再拆分成 selection -> length 逐层访问
      const parts = node.name.split(".");
      if (parts.length > 1) {
        let current: unknown = keys;
        for (const part of parts) {
          if (current != null && typeof current === "object" && part in (current as Record<string, unknown>)) {
            current = (current as Record<string, unknown>)[part];
          } else {
            // 路径不存在，返回 undefined（在布尔上下文中视为 false）
            return undefined;
          }
        }
        return current;
      }
      // 变量不存在，返回 undefined
      return undefined;

    case "unary":
      if (node.operator === "!") {
        return !toBool(evaluateNode(node.operand, keys));
      }
      return undefined;

    case "binary":
      return evaluateBinary(node, keys);
  }
}

/**
 * 对二元运算节点求值
 */
function evaluateBinary(node: BinaryNode, keys: Record<string, unknown>): unknown {
  // 短路求值：&& 和 || 不需要提前求值右操作数
  if (node.operator === "&&") {
    const leftVal = evaluateNode(node.left, keys);
    if (!toBool(leftVal)) return false;
    return toBool(evaluateNode(node.right, keys));
  }

  if (node.operator === "||") {
    const leftVal = evaluateNode(node.left, keys);
    if (toBool(leftVal)) return true;
    return toBool(evaluateNode(node.right, keys));
  }

  const leftVal = evaluateNode(node.left, keys);
  const rightVal = evaluateNode(node.right, keys);

  switch (node.operator) {
    case "==":
      // eslint-disable-next-line eqeqeq
      return leftVal == rightVal;

    case "!=":
      // eslint-disable-next-line eqeqeq
      return leftVal != rightVal;

    case ">":
      return toNumber(leftVal) > toNumber(rightVal);

    case ">=":
      return toNumber(leftVal) >= toNumber(rightVal);

    case "<":
      return toNumber(leftVal) < toNumber(rightVal);

    case "<=":
      return toNumber(leftVal) <= toNumber(rightVal);

    case "in": {
      // "value in listVariable" — 检查 listVariable 是否包含 value
      if (Array.isArray(rightVal)) {
        return (rightVal as unknown[]).includes(leftVal);
      }
      if (typeof rightVal === "string") {
        return rightVal.includes(String(leftVal));
      }
      if (rightVal != null && typeof rightVal === "object") {
        return String(leftVal) in (rightVal as Record<string, unknown>);
      }
      return false;
    }

    case "not in": {
      if (Array.isArray(rightVal)) {
        return !(rightVal as unknown[]).includes(leftVal);
      }
      if (typeof rightVal === "string") {
        return !rightVal.includes(String(leftVal));
      }
      if (rightVal != null && typeof rightVal === "object") {
        return !(String(leftVal) in (rightVal as Record<string, unknown>));
      }
      return true;
    }

    case "=~": {
      // 正则匹配：leftVal =~ /pattern/flags
      const leftStr = String(leftVal ?? "");
      const rightStr = String(rightVal ?? "");
      // 解析正则字面量（如 "/pattern/gi"）
      const regexMatch = rightStr.match(/^\/(.+)\/([gimsuy]*)$/);
      if (regexMatch) {
        try {
          const regex = new RegExp(regexMatch[1], regexMatch[2]);
          return regex.test(leftStr);
        } catch {
          return false;
        }
      }
      // 如果不是正则格式，当作普通字符串包含检测
      return leftStr.includes(rightStr);
    }

    default:
      return false;
  }
}

// ==================== 类型转换工具函数 ====================

/**
 * 将任意值转换为布尔值
 *
 * 规则：
 * - undefined / null → false
 * - 0 / NaN / "" → false
 * - 其他 → true
 *
 * 这与 JavaScript 的 truthy/falsy 规则一致
 */
function toBool(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0 && !isNaN(value);
  if (typeof value === "string") return value.length > 0;
  return true;
}

/**
 * 将任意值转换为数字（用于比较运算）
 */
function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const n = parseFloat(value);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

// ==================== 错误类型 ====================

/**
 * when 表达式解析错误
 */
export class ContextKeyParseError extends Error {
  public expression: string;

  constructor(message: string, expression: string) {
    super(`ContextKey parse error: ${message} in expression "${expression}"`);
    this.name = "ContextKeyParseError";
    this.expression = expression;
  }
}

// ==================== ContextKeyService 主类 ====================

/**
 * ContextKeyService — 上下文变量管理 + when 条件表达式求值
 *
 * 对标 VS Code 的 IContextKeyService：
 * - 维护一组上下文变量（Context Keys）
 * - 提供 evaluate(expression) 方法，对 when 表达式求值
 * - 支持监听上下文变量变化（onChange）
 *
 * 使用示例：
 * ```ts
 * const service = new ContextKeyService();
 * service.set("editorHasSelection", true);
 * service.set("selection.length", 42);
 *
 * service.evaluate("editorHasSelection");                           // true
 * service.evaluate("selection.length > 0");                         // true
 * service.evaluate("editorHasSelection && selection.length > 10");  // true
 * service.evaluate("!editorHasSelection");                          // false
 * service.evaluate("editorHasSelection || pluginActive.translate"); // true
 * ```
 *
 * 在 Plugin Host 中的使用场景：
 * - ContributionManager 查询 selectionToolbar 时，用 ContextKeyService 过滤 when 条件
 * - ActivationManager 检查 onEvent 的上下文条件
 * - SelectionToolbar 组件决定哪些按钮可见
 */
export class ContextKeyService {
  /**
   * 上下文变量存储
   * key 是变量名（如 "editorHasSelection"），value 是任意值
   */
  private keys: Map<string, unknown> = new Map();

  /**
   * 变化监听器
   * 当任何上下文变量发生变化时通知监听器
   */
  private listeners: Set<ContextKeyChangeListener> = new Set();

  /**
   * 表达式 AST 缓存
   *
   * 为什么需要缓存？
   * - 同一个 when 表达式可能在每次 selection 变化时都要求值
   * - tokenize + parse 虽然不贵，但高频调用时仍值得缓存
   * - 缓存 AST（不是结果），因为上下文变量变化时需要重新求值
   */
  private astCache: Map<string, ASTNode> = new Map();

  /**
   * AST 缓存大小上限（防止内存泄漏）
   */
  private static readonly MAX_CACHE_SIZE = 256;

  // ==================== 上下文变量操作 ====================

  /**
   * 设置上下文变量
   *
   * @param key   变量名（如 "editorHasSelection"、"selection.length"）
   * @param value 变量值（任意类型）
   */
  set(key: string, value: unknown): void {
    const oldValue = this.keys.get(key);
    if (oldValue === value) return; // 值未变化，跳过

    this.keys.set(key, value);
    this.notifyChange(key, value, oldValue);
  }

  /**
   * 批量设置上下文变量（合并为一次通知）
   *
   * 适用场景：selection 变化时需要同时更新多个变量
   * ```ts
   * service.setMany({
   *   editorHasSelection: true,
   *   "selection.length": text.length,
   *   "selection.text": text,
   * });
   * ```
   */
  setMany(entries: Partial<ContextKeys> | Record<string, unknown>): void {
    const changes: Array<{ key: string; newValue: unknown; oldValue: unknown }> = [];

    for (const [key, value] of Object.entries(entries)) {
      const oldValue = this.keys.get(key);
      if (oldValue !== value) {
        this.keys.set(key, value);
        changes.push({ key, newValue: value, oldValue });
      }
    }

    // 批量通知（每个变化单独通知，但减少了不必要的通知）
    for (const change of changes) {
      this.notifyChange(change.key, change.newValue, change.oldValue);
    }
  }

  /**
   * 获取上下文变量值
   */
  get(key: string): unknown {
    return this.keys.get(key);
  }

  /**
   * 删除上下文变量
   */
  delete(key: string): void {
    if (this.keys.has(key)) {
      const oldValue = this.keys.get(key);
      this.keys.delete(key);
      this.notifyChange(key, undefined, oldValue);
    }
  }

  /**
   * 检查上下文变量是否存在
   */
  has(key: string): boolean {
    return this.keys.has(key);
  }

  /**
   * 获取所有上下文变量的快照（只读）
   */
  getAll(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of this.keys) {
      result[key] = value;
    }
    return result;
  }

  /**
   * 重置所有上下文变量
   */
  reset(): void {
    this.keys.clear();
    this.astCache.clear();
  }

  // ==================== when 表达式求值 ====================

  /**
   * 求值 when 条件表达式
   *
   * @param expression  when 表达式字符串（如 "editorHasSelection && selection.length > 0"）
   * @returns           求值结果转为 boolean
   *
   * 设计决策：
   * - 空字符串/undefined/null → true（无条件，始终可见）
   * - 解析或求值失败 → false（安全降级，不显示）
   * - 结果总是 boolean（通过 toBool 转换）
   */
  evaluate(expression: string | undefined | null): boolean {
    // 无 when 条件 → 始终为真（对标 VS Code：when 缺失表示无条件）
    if (!expression || expression.trim() === "") {
      return true;
    }

    try {
      const ast = this.getAST(expression);
      const keysObj = this.getKeysObject();
      const result = evaluateNode(ast, keysObj);
      return toBool(result);
    } catch (error) {
      // 解析失败，安全降级为 false
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[ContextKeyService] Failed to evaluate when expression: "${expression}"`,
          error
        );
      }
      return false;
    }
  }

  /**
   * 求值表达式并返回原始值（不转换为 boolean）
   * 主要用于调试和测试
   */
  evaluateRaw(expression: string): unknown {
    const ast = this.getAST(expression);
    const keysObj = this.getKeysObject();
    return evaluateNode(ast, keysObj);
  }

  // ==================== 变化监听 ====================

  /**
   * 监听上下文变量变化
   *
   * @param listener 变化监听器
   * @returns 取消监听的函数
   */
  onChange(listener: ContextKeyChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ==================== 内部方法 ====================

  /**
   * 获取或缓存 AST
   */
  private getAST(expression: string): ASTNode {
    const trimmed = expression.trim();
    let ast = this.astCache.get(trimmed);
    if (!ast) {
      // 缓存满了，清除最早的一半（简单的缓存淘汰策略）
      if (this.astCache.size >= ContextKeyService.MAX_CACHE_SIZE) {
        const entries = Array.from(this.astCache.keys());
        const removeCount = Math.floor(entries.length / 2);
        for (let i = 0; i < removeCount; i++) {
          this.astCache.delete(entries[i]);
        }
      }

      const tokens = tokenize(trimmed);
      const parser = new Parser(tokens, trimmed);
      ast = parser.parse();
      this.astCache.set(trimmed, ast);
    }
    return ast;
  }

  /**
   * 将 Map 转换为普通对象（供求值器使用）
   */
  private getKeysObject(): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (const [key, value] of this.keys) {
      obj[key] = value;
    }
    return obj;
  }

  /**
   * 通知变化监听器
   */
  private notifyChange(key: string, newValue: unknown, oldValue: unknown): void {
    for (const listener of this.listeners) {
      try {
        listener(key, newValue, oldValue);
      } catch (error) {
        console.error(`[ContextKeyService] Error in change listener for key "${key}":`, error);
      }
    }
  }
}

// ==================== 监听器类型 ====================

/**
 * 上下文变量变化监听器
 *
 * @param key      变量名
 * @param newValue 新值
 * @param oldValue 旧值
 */
export type ContextKeyChangeListener = (
  key: string,
  newValue: unknown,
  oldValue: unknown
) => void;

// ==================== 工具函数（导出供外部使用） ====================

/**
 * 快速检查 when 表达式是否合法（不求值，只解析）
 *
 * @param expression when 表达式
 * @returns 解析结果（valid 为 true 表示语法正确）
 */
export function validateWhenExpression(
  expression: string
): { valid: boolean; error?: string } {
  if (!expression || expression.trim() === "") {
    return { valid: true };
  }
  try {
    const tokens = tokenize(expression.trim());
    const parser = new Parser(tokens, expression.trim());
    parser.parse();
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 从 when 表达式中提取引用的上下文变量名列表
 *
 * 用途：
 * - ActivationManager 需要知道某个 when 表达式依赖哪些变量，
 *   以便在这些变量变化时重新求值
 * - 调试时查看一个表达式依赖了哪些上下文
 *
 * @param expression when 表达式
 * @returns 引用的变量名数组（去重）
 */
export function extractReferencedKeys(expression: string): string[] {
  if (!expression || expression.trim() === "") {
    return [];
  }
  try {
    const tokens = tokenize(expression.trim());
    const keys: Set<string> = new Set();
    for (const token of tokens) {
      if (token.type === "IDENTIFIER") {
        keys.add(token.value);
      }
    }
    return Array.from(keys);
  } catch {
    return [];
  }
}
