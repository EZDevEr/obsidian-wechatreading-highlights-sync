import { KEEP_END, KEEP_START } from "./constants";

export type TemplateValue = string | number | boolean | null | undefined;

export interface TemplateContext {
  [key: string]: TemplateValue;
}

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateError";
  }
}

export function renderTemplate(template: string, context: TemplateContext): string {
  const withConditionals = template.replace(/\{\{#if\s+([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_match, key: string, body: string) => {
    return isTruthy(context[key]) ? renderTemplate(body, context) : "";
  });

  return withConditionals.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, expression: string) => {
    return String(evaluateExpression(expression.trim(), context));
  });
}

export function evaluateExpression(expression: string, context: TemplateContext): TemplateValue {
  const simple = /^[a-zA-Z0-9_]+$/.exec(expression);
  if (simple) {
    const key = simple[0];
    return context[key] ?? "";
  }

  const arithmetic = /^([a-zA-Z0-9_]+)\s*([+-])\s*(-?\d+)$/.exec(expression);
  if (arithmetic) {
    const [, key, operator, rawDelta] = arithmetic;
    const base = Number(context[key]);
    const delta = Number(rawDelta);
    if (!Number.isFinite(base)) {
      throw new TemplateError(`模板变量 {{${key}}} 不是数字，无法计算 {{${expression}}}。`);
    }
    return operator === "+" ? base + delta : base - delta;
  }

  throw new TemplateError(`不支持的模板表达式：{{${expression}}}`);
}

export function mergeKeepBlocks(newContent: string, oldContent: string): string {
  const oldBlock = extractKeepBlock(oldContent);
  if (!oldBlock) return newContent;

  const newPattern = new RegExp(`${escapeRegExp(KEEP_START)}[\\s\\S]*?${escapeRegExp(KEEP_END)}`);
  if (!newPattern.test(newContent)) return newContent;
  return newContent.replace(newPattern, oldBlock);
}

export function extractKeepBlock(content: string): string | null {
  const start = content.indexOf(KEEP_START);
  const end = content.indexOf(KEEP_END, start + KEEP_START.length);
  if (start === -1 || end === -1) return null;
  return content.slice(start, end + KEEP_END.length);
}

function isTruthy(value: TemplateValue): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  return Boolean(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
