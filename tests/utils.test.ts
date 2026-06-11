import { describe, expect, it } from "vitest";
import { ensureMarkdownFileName, formatDuration, formatReadingStatus, getReadingStatus, sanitizeFileName } from "../src/utils";

describe("工具函数", () => {
  it("清理 Obsidian 不适合使用的文件名字符", () => {
    expect(sanitizeFileName('/\\:*?"<>|')).toBe("未命名书籍");
    expect(sanitizeFileName('书名: A / B')).toBe("书名 A B");
  });

  it("保证 Markdown 后缀", () => {
    expect(ensureMarkdownFileName("三体")).toBe("三体.md");
    expect(ensureMarkdownFileName("三体.md")).toBe("三体.md");
  });

  it("把秒数转换成中文阅读时长", () => {
    expect(formatDuration(0)).toBe("0 分钟");
    expect(formatDuration(59)).toBe("不足 1 分钟");
    expect(formatDuration(3600 + 23 * 60)).toBe("1 小时 23 分钟");
  });

  it("按用户阈值显示阅读状态", () => {
    expect(formatReadingStatus(1, 2, 95)).toBe("未开始（1%）");
    expect(formatReadingStatus(25, 2, 95)).toBe("阅读中（25%）");
    expect(formatReadingStatus(98, 2, 95)).toBe("已读完（98%）");
    expect(getReadingStatus(95, 2, 95)).toBe("阅读中");
  });
});
