import { BookSyncData, ChapterInfo, MineReview, NormalizedNote, WeChatReadingBook } from "./types";

export function isApiKeyProbablyValid(apiKey: string): boolean {
  return /^wrk-[A-Za-z0-9_-]+$/.test(apiKey.trim());
}

export function sanitizeFileName(input: string): string {
  const fallback = "未命名书籍";
  const cleaned = input
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+$/, "");
  return cleaned || fallback;
}

export function getMainCategory(category?: string): string {
  const raw = category?.split("-")[0]?.trim();
  return sanitizeFileName(raw || "未分类");
}

export function getSubCategory(category?: string): string {
  const parts = category?.split("-").map((part) => part.trim()).filter(Boolean) ?? [];
  return parts.length > 1 ? parts.slice(1).join("-") : "";
}

export function ensureMarkdownFileName(fileName: string): string {
  const sanitized = sanitizeFileName(fileName);
  return sanitized.toLowerCase().endsWith(".md") ? sanitized : `${sanitized}.md`;
}

export function joinVaultPath(...parts: string[]): string {
  return normalizeVaultPath(parts.filter(Boolean).join("/"));
}

export function normalizeVaultPath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\//, "")
    .replace(/\/$/, "");
}

export function formatDuration(totalSeconds?: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds ?? 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours} 小时 ${minutes} 分钟`;
  if (hours > 0) return `${hours} 小时`;
  if (minutes > 0) return `${minutes} 分钟`;
  if (seconds > 0) return "不足 1 分钟";
  return "0 分钟";
}

export function normalizeProgress(progress?: number): number | undefined {
  if (typeof progress !== "number" || Number.isNaN(progress)) return undefined;
  return Math.max(0, Math.min(100, Math.round(progress)));
}

export function formatReadingStatus(progress?: number, unreadThreshold = 2, finishedThreshold = 95): string {
  const normalized = normalizeProgress(progress);
  if (normalized === undefined) return "未知";
  const safeUnread = Math.max(0, Math.min(100, unreadThreshold));
  const safeFinished = Math.max(safeUnread, Math.min(100, finishedThreshold));
  const status = normalized < safeUnread ? "未开始" : normalized > safeFinished ? "已读完" : "阅读中";
  return `${status}（${normalized}%）`;
}

export function getReadingStatus(progress?: number, unreadThreshold = 2, finishedThreshold = 95): "未开始" | "阅读中" | "已读完" | "未知" {
  const normalized = normalizeProgress(progress);
  if (normalized === undefined) return "未知";
  const safeUnread = Math.max(0, Math.min(100, unreadThreshold));
  const safeFinished = Math.max(safeUnread, Math.min(100, finishedThreshold));
  if (normalized < safeUnread) return "未开始";
  if (normalized > safeFinished) return "已读完";
  return "阅读中";
}

export function formatDate(value?: number | Date | string, pattern = "YYYY-MM-DD HH:mm"): string {
  if (value === undefined || value === null || value === "") return "未知";
  const date = value instanceof Date
    ? value
    : typeof value === "number"
      ? new Date(value < 10_000_000_000 ? value * 1000 : value)
      : new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  const pad = (n: number) => String(n).padStart(2, "0");
  return pattern
    .replace(/YYYY/g, String(date.getFullYear()))
    .replace(/MM/g, pad(date.getMonth() + 1))
    .replace(/DD/g, pad(date.getDate()))
    .replace(/HH/g, pad(date.getHours()))
    .replace(/mm/g, pad(date.getMinutes()))
    .replace(/ss/g, pad(date.getSeconds()));
}

export function markdownTableCell(value?: string | number): string {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br>");
}

export function escapeYamlString(value?: string | number): string {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function toBlockQuote(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
}

export function getChapterTitle(chapters: ChapterInfo[], chapterUid?: number): string {
  if (chapterUid === undefined) return "未识别";
  return chapters.find((chapter) => chapter.chapterUid === chapterUid)?.title || "未识别";
}

export function getWeChatReadingBookUrl(bookId: string): string {
  return `weread://reading?bId=${encodeURIComponent(bookId)}`;
}

export function getWeChatReadingBookmarkUrl(note: NormalizedNote): string {
  const range = parseRange(note.range);
  if (!note.chapterUid || !range) return getWeChatReadingBookUrl(note.bookId);
  return `weread://bestbookmark?bookId=${encodeURIComponent(note.bookId)}&chapterUid=${note.chapterUid}&rangeStart=${range.start}&rangeEnd=${range.end}`;
}

export function parseRange(range?: string): { start: number; end: number } | null {
  const match = /^(\d+)-(\d+)$/.exec(range ?? "");
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]) };
}

export function normalizeNotes(data: BookSyncData): NormalizedNote[] {
  const chapters = data.chapters;
  const reviewByRange = new Map<string, MineReview[]>();
  const standaloneReviews: MineReview[] = [];

  for (const review of data.reviews) {
    const range = review.review?.range;
    if (range) {
      const list = reviewByRange.get(range) ?? [];
      list.push(review);
      reviewByRange.set(range, list);
    } else {
      standaloneReviews.push(review);
    }
  }

  const highlights: NormalizedNote[] = data.bookmarks
    .filter((bookmark) => bookmark.markText?.trim())
    .map((bookmark) => {
      const attachedReviews = bookmark.range ? reviewByRange.get(bookmark.range) ?? [] : [];
      const note = attachedReviews
        .map((review) => review.review?.content?.trim())
        .filter((content): content is string => Boolean(content))
        .join("\n\n");
      return {
        id: bookmark.bookmarkId || `${bookmark.bookId}-${bookmark.chapterUid}-${bookmark.range}-${bookmark.createTime}`,
        bookId: data.book.bookId,
        type: "highlight",
        text: bookmark.markText ?? "",
        note: note || undefined,
        chapter: getChapterTitle(chapters, bookmark.chapterUid),
        chapterUid: bookmark.chapterUid,
        range: bookmark.range,
        createTime: bookmark.createTime,
        sortKey: `${bookmark.chapterUid ?? 0}:${parseRange(bookmark.range)?.start ?? 0}:${bookmark.createTime ?? 0}`
      };
    });

  const highlightRanges = new Set(data.bookmarks.map((bookmark) => bookmark.range).filter(Boolean));
  const reviews = standaloneReviews
    .concat(data.reviews.filter((review) => review.review?.range && !highlightRanges.has(review.review.range)))
    .filter((review) => review.review?.content?.trim())
    .map<NormalizedNote>((review) => ({
      id: review.review?.reviewId || `${data.book.bookId}-review-${review.review?.createTime ?? ""}-${review.review?.content ?? ""}`,
      bookId: data.book.bookId,
      type: "review",
      text: review.review?.abstract || "",
      note: review.review?.content || "",
      chapter: review.review?.chapterName || getChapterTitle(chapters, review.review?.chapterUid),
      chapterUid: review.review?.chapterUid,
      range: review.review?.range,
      createTime: review.review?.createTime,
      sortKey: `${review.review?.chapterUid ?? 999999}:${parseRange(review.review?.range)?.start ?? 999999999}:${review.review?.createTime ?? 0}`
    }));

  const seen = new Set<string>();
  return highlights
    .concat(reviews)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .filter((note) => {
      const key = `${note.type}:${note.bookId}:${note.range ?? ""}:${note.text}:${note.note ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function getBookTitle(book: WeChatReadingBook): string {
  return book.title?.trim() || `未命名书籍 ${book.bookId}`;
}
