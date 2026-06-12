import { describe, expect, it } from "vitest";
import { renderBookNote, renderSummary } from "../src/markdown";
import { DEFAULT_SETTINGS } from "../src/settings";
import { SyncContext } from "../src/types";
import { getMainCategory, getSubCategory } from "../src/utils";

describe("汇总页渲染", () => {
  it("按阅读状态分成三个表格，并在表格内转义 wikilink 分隔符", () => {
    const context: SyncContext = {
      shelf: { books: [], albums: [] },
      notebooks: [],
      stats: {},
      syncTime: new Date("2026-06-11T12:00:00+08:00"),
      books: [
        {
          book: {
            bookId: "1",
            title: "示例书标题（典藏版）超过十个字啦",
            author: "[美]作者一 [英]作者二",
            category: "计算机-数据库"
          },
          progress: { book: { progress: 25 } },
          bookmarks: [],
          reviews: [],
          chapters: [],
          notes: []
        },
        {
          book: {
            bookId: "2",
            title: "空格作者示例",
            author: "作者甲 作者乙",
            category: "计算机-数据库"
          },
          progress: { book: { progress: 30 } },
          bookmarks: [],
          reviews: [],
          chapters: [],
          notes: []
        }
      ]
    };
    const output = renderSummary(context, DEFAULT_SETTINGS);
    expect(output).toContain("## 阅读中");
    expect(output).toContain("## 未开始");
    expect(output).toContain("## 已读完");
    expect(output).toContain("| 书名 | 作者 | 主分类 | 子分类 | 进度 | 划线 | 想法 |");
    expect(output).toContain("| <a data-href=\"计算机/示例书标题（典藏版）超过十个字啦\" href=\"计算机/示例书标题（典藏版）超过十个字啦\" class=\"internal-link\" style=\"display: block; white-space: nowrap;\">示例书标题超过十个字</a><a data-href=\"计算机/示例书标题（典藏版）超过十个字啦\" href=\"计算机/示例书标题（典藏版）超过十个字啦\" class=\"internal-link\" style=\"display: block; white-space: nowrap;\">啦</a> | <span style=\"display: block; white-space: nowrap;\">[美]作者一</span><span style=\"display: block; white-space: nowrap;\">[英]作者二</span> | <span style=\"white-space: nowrap;\">计算机</span> | <span style=\"white-space: nowrap;\">数据库</span> | <span style=\"white-space: nowrap;\">阅读中（25%）</span> | <span style=\"white-space: nowrap;\">0</span> | <span style=\"white-space: nowrap;\">0</span> |");
    expect(output).toContain("<span style=\"display: block; white-space: nowrap;\">作者甲</span><span style=\"display: block; white-space: nowrap;\">作者乙</span>");
    expect(output).not.toContain("典藏版</a>");
  });
});

describe("单书笔记渲染", () => {
  it("在正文中渲染本地封面嵌入", () => {
    const output = renderBookNote({
      book: {
        bookId: "1",
        title: "示例书",
        author: "作者",
        category: "计算机-数据库"
      },
      coverPath: "微信读书笔记/assets/1.jpg",
      progress: { book: { progress: 25 } },
      bookmarks: [],
      reviews: [],
      chapters: [],
      notes: []
    }, DEFAULT_SETTINGS, new Date("2026-06-11T12:00:00+08:00"));
    expect(output).toContain("![[微信读书笔记/assets/1.jpg|180]]");
  });
});

describe("分类路径", () => {
  it("提取主分类并兜底未分类", () => {
    expect(getMainCategory("计算机-数据库")).toBe("计算机");
    expect(getSubCategory("计算机-数据库")).toBe("数据库");
    expect(getMainCategory("")).toBe("未分类");
  });
});
