export type ContextValue = boolean | string | number | undefined;

export class ContextKeyService {
  private values = new Map<string, ContextValue>();

  set(key: string, value: ContextValue): void {
    this.values.set(key, value);
  }

  get(key: string): ContextValue {
    return this.values.get(key);
  }

  matches(expression?: string): boolean {
    if (!expression) return true;

    return expression
      .split("||")
      .some((orPart) =>
        orPart
          .split("&&")
          .every((term) => this.evaluateTerm(term.trim()))
      );
  }

  snapshot(): Record<string, ContextValue> {
    return Object.fromEntries(this.values.entries());
  }

  private evaluateTerm(term: string): boolean {
    if (!term || term === "true") return true;
    if (term === "false") return false;

    if (term.startsWith("!")) {
      return !this.evaluateTerm(term.slice(1).trim());
    }

    if (term.includes("==")) {
      const [left, right] = term.split("==").map((part) => part.trim());
      const leftValue = this.get(left);
      if (leftValue === undefined) return false;
      return String(leftValue) === this.normalizeLiteral(right);
    }

    if (term.includes("!=")) {
      const [left, right] = term.split("!=").map((part) => part.trim());
      const leftValue = this.get(left);
      if (leftValue === undefined) return false;
      return String(leftValue) !== this.normalizeLiteral(right);
    }

    return Boolean(this.get(term));
  }

  private normalizeLiteral(input: string): string {
    return input.replace(/^['"]|['"]$/g, "");
  }
}
