import { WeChatReadingPluginSettings } from "./settings";
import { renderTemplate, TemplateContext } from "./template";
import { BookSyncData, NormalizedNote, SyncContext } from "./types";
import {
  ensureMarkdownFileName,
  escapeYamlString,
  formatDate,
  formatDuration,
  formatReadingStatus,
  getReadingStatus,
  getBookTitle,
  getMainCategory,
  getSubCategory,
  getWeChatReadingBookUrl,
  getWeChatReadingBookmarkUrl,
  markdownTableCell,
  sanitizeFileName,
  toBlockQuote
} from "./utils";

export function renderBookNote(data: BookSyncData, settings: WeChatReadingPluginSettings, syncTime: Date): string {
  const highlights = renderHighlights(data.notes, settings);
  const progress = data.progress?.book?.progress ?? data.notebook?.readingProgress;
  const context = buildBookContext(data, settings, syncTime, highlights, progress);
  return renderTemplate(settings.bookTemplate, context).trimEnd() + "\n";
}

export function renderHighlights(notes: NormalizedNote[], settings: WeChatReadingPluginSettings): string {
  if (notes.length === 0) {
    return "> 暂无可导出的划线或想法。\n";
  }

  return notes.map((note, index) => {
    const context: TemplateContext = {
      index: index + 1,
      index0: index,
      highlightText: note.text ? toBlockQuote(note.text) : "",
      note: note.note || "",
      chapter: note.chapter || "未识别",
      createTime: formatDate(note.createTime, settings.dateFormat),
      wechatReadingUrl: getWeChatReadingBookmarkUrl(note)
    };

    return renderTemplate(settings.highlightTemplate, context);
  }).join("\n\n");
}

export function renderSummary(context: SyncContext, settings: WeChatReadingPluginSettings, fileNames = buildBookFileNames(context.books, settings)): string {
  const shelfBooks = context.shelf.books ?? [];
  const albums = context.shelf.albums ?? [];
  const shelfTotal = shelfBooks.length + albums.length + (context.shelf.mp ? 1 : 0);
  const syncedBookIds = new Set(context.books.map((book) => book.book.bookId));
  const groupedBooks = groupBooksByReadingStatus(context.books, settings);
  const readBooks = groupedBooks.finished.length;
  const readingBooks = groupedBooks.reading;
  const booksWithNotes = context.books.filter((book) => getHighlightCount(book) > 0 || getNoteCount(book) > 0).length;
  const todaySeconds = getTodayReadSeconds(context.stats.weekly?.readTimes);
  const recentBooks = context.books
    .slice()
    .sort((a, b) => (b.book.readUpdateTime ?? 0) - (a.book.readUpdateTime ?? 0))
    .slice(0, 10);

  return [
    "# 微信读书汇总",
    "",
    `> 最近同步：${formatDate(context.syncTime, settings.dateFormat)}`,
    `> 同步状态：成功生成 ${context.books.length} 本书籍笔记，书架电子书 ${shelfBooks.length} 本，已同步 ${syncedBookIds.size} 本。`,
    "",
    "## 阅读统计",
    "",
    "| 范围 | 阅读时长 | 阅读天数 |",
    "|---|---:|---:|",
    `| 今日 | ${formatDuration(todaySeconds)} |  |`,
    `| 本周 | ${formatDuration(context.stats.weekly?.totalReadTime)} | ${context.stats.weekly?.readDays ?? ""} |`,
    `| 本月 | ${formatDuration(context.stats.monthly?.totalReadTime)} | ${context.stats.monthly?.readDays ?? ""} |`,
    `| 今年 | ${formatDuration(context.stats.annually?.totalReadTime)} | ${context.stats.annually?.readDays ?? ""} |`,
    `| 历史累计 | ${formatDuration(context.stats.overall?.totalReadTime)} | ${context.stats.overall?.readDays ?? ""} |`,
    "",
    "## 书架概览",
    "",
    "| 指标 | 数量 |",
    "|---|---:|",
    `| 书架总数 | ${shelfTotal} |`,
    `| 电子书 | ${shelfBooks.length} |`,
    `| 有声书 / 专辑 | ${albums.length} |`,
    `| 文章收藏入口 | ${context.shelf.mp ? 1 : 0} |`,
    `| 已读书籍 | ${readBooks} |`,
    `| 正在读书 | ${readingBooks.length} |`,
    `| 未开始书籍 | ${groupedBooks.unread.length} |`,
    `| 有划线 / 有想法的书籍 | ${booksWithNotes} |`,
    "",
    "## 最近阅读",
    "",
    recentBooks.length > 0
      ? recentBooks.map((book, index) => `${index + 1}. ${renderBookLink(book.book, fileNames)} · ${book.book.author || "未知作者"} · ${formatDate(book.book.readUpdateTime, "YYYY-MM-DD")}`).join("\n")
      : "暂无最近阅读记录。",
    "",
    renderBookStatusSection("阅读中", groupedBooks.reading, fileNames, settings),
    renderBookStatusSection("未开始", groupedBooks.unread, fileNames, settings),
    renderBookStatusSection("已读完", groupedBooks.finished, fileNames, settings),
    ""
  ].join("\n");
}

export function buildBookFileNames(books: BookSyncData[], settings: WeChatReadingPluginSettings): Map<string, string> {
  const rendered = new Map<string, string>();
  const nameToBookIds = new Map<string, string[]>();

  for (const book of books) {
    const baseContext = buildBookContext(book, settings, new Date(), "", book.progress?.book?.progress ?? book.notebook?.readingProgress);
    const raw = renderTemplate(settings.bookFileNameTemplate || "{{title}}", baseContext);
    const fileName = `${getMainCategory(book.book.category)}/${ensureMarkdownFileName(raw)}`;
    rendered.set(book.book.bookId, fileName);
    const list = nameToBookIds.get(fileName) ?? [];
    list.push(book.book.bookId);
    nameToBookIds.set(fileName, list);
  }

  for (const [fileName, bookIds] of nameToBookIds) {
    if (bookIds.length <= 1) continue;
    const used = new Set<string>();
    for (const bookId of bookIds) {
      const book = books.find((item) => item.book.bookId === bookId);
      if (!book) continue;
      const folder = getMainCategory(book.book.category);
      const titleAuthor = `${folder}/${ensureMarkdownFileName(`${getBookTitle(book.book)} - ${book.book.author || "未知作者"}`)}`;
      const candidate = used.has(titleAuthor) ? `${folder}/${ensureMarkdownFileName(`${getBookTitle(book.book)} - ${book.book.bookId}`)}` : titleAuthor;
      used.add(candidate);
      rendered.set(bookId, candidate);
    }
    nameToBookIds.delete(fileName);
  }

  return rendered;
}

function buildBookContext(
  data: BookSyncData,
  settings: WeChatReadingPluginSettings,
  syncTime: Date,
  highlights: string,
  progress?: number
): TemplateContext {
  const noteCount = data.reviews.filter((review) => review.review?.content?.trim()).length;
  return {
    title: escapeYamlString(getBookTitle(data.book)),
    author: escapeYamlString(data.book.author || "未知作者"),
    bookId: data.book.bookId,
    category: escapeYamlString(data.book.category || ""),
    coverUrl: data.book.cover || "",
    cover: data.coverPath || "",
    progress: formatReadingStatus(progress, settings.unreadThreshold, settings.finishedThreshold),
    highlightCount: data.bookmarks.length,
    noteCount,
    syncTime: formatDate(syncTime, settings.dateFormat),
    lastReadTime: formatDate(data.progress?.book?.updateTime ?? data.book.readUpdateTime, settings.dateFormat),
    wechatReadingUrl: getWeChatReadingBookUrl(data.book.bookId),
    highlights,
    defaultTags: settings.addDefaultTags ? "  - 微信读书\n  - 读书笔记" : "",
    index: 1,
    index0: 0
  };
}

function renderBookSummaryRow(data: BookSyncData, fileNames: Map<string, string>, settings: WeChatReadingPluginSettings): string {
  const title = getBookTitle(data.book);
  const summaryTitle = stripParentheses(title) || title;
  const progress = getBookProgress(data);
  return [
    renderWrappedBookLinks(data.book, fileNames, summaryTitle, 10),
    renderAuthorCell(data.book.author || "未知作者"),
    nowrapMarkdownTableCell(getMainCategory(data.book.category)),
    nowrapMarkdownTableCell(getSubCategory(data.book.category) || "未分类"),
    nowrapMarkdownTableCell(formatReadingStatus(progress, settings.unreadThreshold, settings.finishedThreshold)),
    nowrapMarkdownTableCell(getHighlightCount(data)),
    nowrapMarkdownTableCell(getNoteCount(data))
  ].join(" | ").replace(/^/, "| ").replace(/$/, " |");
}

function renderBookLink(book: { bookId: string; title?: string }, fileNames: Map<string, string>, label?: string): string {
  const title = book.title || `未命名书籍 ${book.bookId}`;
  const fileName = fileNames.get(book.bookId)?.replace(/\.md$/i, "") || sanitizeFileName(title);
  return `[[${fileName.replace(/\|/g, "\\|")}\\|${(label || title).replace(/\|/g, "\\|")}]]`;
}

function renderWrappedBookLinks(book: { bookId: string; title?: string }, fileNames: Map<string, string>, title: string, size: number): string {
  const fileName = getBookFileLinkPath(book, fileNames);
  return splitEvery(title, size)
    .map((part) => blockInternalLink(fileName, part))
    .join("");
}

function renderAuthorCell(author: string): string {
  return splitAuthors(author)
    .map((part) => blockMarkdownTableCell(part))
    .join("");
}

function renderBookStatusSection(title: string, books: BookSyncData[], fileNames: Map<string, string>, settings: WeChatReadingPluginSettings): string {
  const sortedBooks = sortBooks(books, settings.summarySortMode);
  const rows = sortedBooks.length > 0
    ? sortedBooks.map((book) => renderBookSummaryRow(book, fileNames, settings)).join("\n")
    : "| 暂无 |  |  |  |  |  |  |";
  return [
    `## ${title}`,
    "",
    "| 书名 | 作者 | 主分类 | 子分类 | 进度 | 划线 | 想法 |",
    "|---|---|---|---|---:|---:|---:|",
    rows,
    ""
  ].join("\n");
}

function nowrapTableCell(value: string | number): string {
  return `<span style="white-space: nowrap;">${escapeHtml(String(value))}</span>`;
}

function nowrapMarkdownTableCell(value: string | number): string {
  return nowrapTableCell(markdownTableCell(value)).replace(/&lt;br&gt;/g, "<br>");
}

function blockTableCell(value: string | number): string {
  return `<span style="display: block; white-space: nowrap;">${escapeHtml(String(value))}</span>`;
}

function blockMarkdownTableCell(value: string | number): string {
  return blockTableCell(markdownTableCell(value)).replace(/&lt;br&gt;/g, "<br>");
}

function splitEvery(value: string, size: number): string[] {
  const chars = Array.from(value);
  const chunks: string[] = [];
  for (let index = 0; index < chars.length; index += size) {
    chunks.push(chars.slice(index, index + size).join(""));
  }
  return chunks.length > 0 ? chunks : [value];
}

function getBookFileLinkPath(book: { bookId: string; title?: string }, fileNames: Map<string, string>): string {
  const title = book.title || `未命名书籍 ${book.bookId}`;
  return fileNames.get(book.bookId)?.replace(/\.md$/i, "") || sanitizeFileName(title);
}

function blockInternalLink(path: string, label: string): string {
  const escapedPath = escapeHtmlTableValue(path);
  const escapedLabel = escapeHtmlTableValue(label);
  return `<a data-href="${escapedPath}" href="${escapedPath}" class="internal-link" style="display: block; white-space: nowrap;">${escapedLabel}</a>`;
}

function stripParentheses(value: string): string {
  return value
    .replace(/（[^（）]*）/g, "")
    .replace(/\([^()]*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function splitAuthors(author: string): string[] {
  const normalized = author
    .trim()
    .replace(/\s+(?=\x5B[^]]+])/g, "\n")
    .replace(/\s*(?:、|，|,|;|；|\/|&|\band\b|\s+和\s+)\s*/gi, "\n")
    .replace(/([\p{Script=Han}）\]])\s+(?=(?:[\p{Script=Han}]|\x5B))/gu, "$1\n")
    .replace(/\s{2,}/g, "\n")
    .replace(/\s*\n+\s*/g, "\n");
  const authors = normalized.split("\n").map((item) => item.trim()).filter(Boolean);
  return authors.length > 0 ? authors : ["未知作者"];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtmlTableValue(value: string): string {
  return escapeHtml(value).replace(/\|/g, "&#124;");
}

function groupBooksByReadingStatus(books: BookSyncData[], settings: WeChatReadingPluginSettings): { reading: BookSyncData[]; unread: BookSyncData[]; finished: BookSyncData[] } {
  const groups = {
    reading: [] as BookSyncData[],
    unread: [] as BookSyncData[],
    finished: [] as BookSyncData[]
  };
  for (const book of books) {
    const status = getReadingStatus(getBookProgress(book), settings.unreadThreshold, settings.finishedThreshold);
    if (status === "已读完") groups.finished.push(book);
    else if (status === "未开始" || status === "未知") groups.unread.push(book);
    else groups.reading.push(book);
  }
  return groups;
}

function sortBooks(books: BookSyncData[], mode: WeChatReadingPluginSettings["summarySortMode"]): BookSyncData[] {
  return books.slice().sort((a, b) => {
    if (mode === "title") return getBookTitle(a.book).localeCompare(getBookTitle(b.book), "zh-Hans-CN");
    if (mode === "progress") return (getBookProgress(b) ?? 0) - (getBookProgress(a) ?? 0);
    if (mode === "notes") return (getHighlightCount(b) + getNoteCount(b)) - (getHighlightCount(a) + getNoteCount(a));
    return (b.book.readUpdateTime ?? 0) - (a.book.readUpdateTime ?? 0);
  });
}

function getBookProgress(book: BookSyncData): number | undefined {
  return book.progress?.book?.progress ?? book.notebook?.readingProgress;
}

function getHighlightCount(book: BookSyncData): number {
  return book.cachedHighlightCount ?? book.bookmarks.length;
}

function getNoteCount(book: BookSyncData): number {
  return book.cachedNoteCount ?? book.reviews.filter((review) => review.review?.content?.trim()).length;
}

function getTodayReadSeconds(readTimes?: Record<string, number>): number {
  if (!readTimes) return 0;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() / 1000;
  const end = start + 86400;
  return Object.entries(readTimes).reduce((total, [rawTs, seconds]) => {
    const ts = Number(rawTs);
    return ts >= start && ts < end ? total + seconds : total;
  }, 0);
}
