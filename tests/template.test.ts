import { describe, expect, it } from "vitest";
import { extractKeepBlock, mergeKeepBlocks, renderTemplate, TemplateError } from "../src/template";

describe("模板渲染", () => {
  it("支持从 1 开始的 index 和简单加减法", () => {
    const output = renderTemplate("{{index}}/{{index0}}/{{index + 1}}/{{index0 - 1}}", {
      index: 1,
      index0: 0
    });
    expect(output).toBe("1/0/2/-1");
  });

  it("支持简单条件块", () => {
    expect(renderTemplate("A{{#if note}}:{{note}}{{/if}}", { note: "想法" })).toBe("A:想法");
    expect(renderTemplate("A{{#if note}}:{{note}}{{/if}}", { note: "" })).toBe("A");
  });

  it("遇到不支持的表达式时抛出中文错误", () => {
    expect(() => renderTemplate("{{index * 2}}", { index: 1 })).toThrow(TemplateError);
  });
});

describe("keep-me 区域", () => {
  it("可以提取旧内容中的 keep-me 区域", () => {
    expect(extractKeepBlock("a\n%% keep-me %%\n用户内容\n%% /keep-me %%\nb")).toContain("用户内容");
  });

  it("同步时保留旧的 keep-me 区域", () => {
    const oldContent = "# 旧\n%% keep-me %%\n用户写的总结\n%% /keep-me %%";
    const newContent = "# 新\n%% keep-me %%\n默认提示\n%% /keep-me %%";
    expect(mergeKeepBlocks(newContent, oldContent)).toContain("用户写的总结");
    expect(mergeKeepBlocks(newContent, oldContent)).not.toContain("默认提示");
  });
});
