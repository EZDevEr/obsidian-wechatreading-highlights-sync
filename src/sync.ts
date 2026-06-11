import { FileManager, Notice, TFile, Vault } from "obsidian";
import { WeChatReadingApiClient, WeChatReadingApiError } from "./api";
import { AssetManager } from "./assets";
import { DEFAULT_SUMMARY_FILE_NAME, OLD_DEFAULT_SUMMARY_FILE_NAME } from "./constants";
import { buildBookFileNames, renderBookNote, renderSummary } from "./markdown";
import { BookSyncCacheEntry, WeChatReadingPluginSettings } from "./settings";
import { BookSyncData, NotebookBook, ProgressResponse, SyncContext, SyncStats, WeChatReadingBook } from "./types";
import { getBookTitle, isApiKeyProbablyValid, joinVaultPath, normalizeNotes, normalizeProgress, sanitizeFileName } from "./utils";
import { MarkdownWriter } from "./writer";

export interface SyncCallbacks {
  saveSettings: () => Promise<void>;
  updateSettings: (updater: (settings: WeChatReadingPluginSettings) => void) => Promise<void>;
}

export interface SyncOptions {
  onlyCurrentFile?: TFile | null;
  summaryOnly?: boolean;
  silent?: boolean;
  forceRefresh?: boolean;
  clearBeforeSync?: boolean;
}

export class WeChatReadingSyncService {
  private readonly writer: MarkdownWriter;
  private readonly assets: AssetManager;

  constructor(
    private readonly vault: Vault,
    fileManager: FileManager,
    private readonly getSettings: () => WeChatReadingPluginSettings,
    private readonly callbacks: SyncCallbacks
  ) {
    this.writer = new MarkdownWriter(vault, fileManager);
    this.assets = new AssetManager(this.writer);
  }

  async testConnection(): Promise<void> {
    const settings = this.getSettings();
    this.assertApiKey(settings);
    await new WeChatReadingApiClient(settings.apiKey).testConnection();
  }

  async syncAll(options: SyncOptions = {}): Promise<void> {
    const settings = this.getSettings();
    this.assertApiKey(settings);

    const syncTime = new Date();
    const client = new WeChatReadingApiClient(settings.apiKey);
    const started = Date.now();
    let failedBooks = 0;
    let skippedByProgress = 0;
    let skippedByCache = 0;
    const progressNotice = options.silent ? null : new Notice("微信读书：准备同步...", 0);

    this.updateProgress(progressNotice, "微信读书：开始读取书架和统计。");

    try {
      if (options.clearBeforeSync) {
        const deleted = await this.writer.clearFolder(settings.syncFolder, settings.dryRun);
        await this.callbacks.updateSettings((current) => {
          current.syncCache = {};
        });
        this.log("info", settings.dryRun ? `预览模式：将清理 ${deleted} 个已同步文件。` : `已清理 ${deleted} 个旧同步文件。`);
      }

      const [shelf, notebooks, stats] = await Promise.all([
        client.getShelf(),
        client.getAllNotebooks(),
        this.loadStats(client)
      ]);

      const notebookByBookId = new Map(notebooks.map((item) => [item.bookId, item]));
      const candidateBooks = await this.selectBooks(shelf.books ?? [], notebookByBookId, settings, options.onlyCurrentFile);
      const bookData: BookSyncData[] = [];
      const fingerprints = new Map<string, string>();

      for (const [index, book] of candidateBooks.entries()) {
        this.updateProgress(progressNotice, `微信读书：同步 ${index + 1}/${candidateBooks.length}《${book.title || book.bookId}》`);
        try {
          const preloadedProgress = await client.getProgress(book.bookId);
          if (settings.onlySyncStartedBooks && (normalizeProgress(preloadedProgress.book?.progress) ?? 0) <= 0) {
            skippedByProgress += 1;
            continue;
          }

          const notebook = notebookByBookId.get(book.bookId);
          const fingerprint = this.buildFingerprint(book, notebook, preloadedProgress, settings);
          fingerprints.set(book.bookId, fingerprint);
          const cached = settings.syncCache[book.bookId];
          if (!options.forceRefresh && !options.clearBeforeSync && await this.canUseCache(cached, fingerprint)) {
            bookData.push(this.createCachedBookData(book, notebook, preloadedProgress, cached));
            skippedByCache += 1;
            continue;
          }

          const data = await this.loadBookData(client, book, notebook, preloadedProgress);
          data.coverPath = await this.assets.downloadCover(book, settings) || cached?.coverPath;
          bookData.push(data);
        } catch (error) {
          failedBooks += 1;
          this.log("error", `同步《${book.title}》失败：${error instanceof Error ? error.message : String(error)}`);
          console.error("[Wechat Reading] 单本书同步失败", book, error);
        }
      }

      const context: SyncContext = {
        shelf,
        notebooks,
        stats,
        books: bookData,
        syncTime
      };
      const fileNames = buildBookFileNames(bookData, settings);
      let changedBooks = 0;
      let createdBooks = 0;

      if (!options.summaryOnly) {
        for (const [index, data] of bookData.entries()) {
          if (data.skippedByCache) continue;
          this.updateProgress(progressNotice, `微信读书：写入 ${index + 1}/${bookData.length}《${data.book.title || data.book.bookId}》`);
          const fileName = fileNames.get(data.book.bookId) ?? `${sanitizeFileName(data.book.title)}.md`;
          const content = renderBookNote(data, settings, syncTime);
          const result = await this.writer.writeMarkdown(settings.syncFolder, fileName, content, {
            preserveKeepBlocks: settings.preserveKeepBlocks,
            dryRun: settings.dryRun
          });
          if (result.changed) changedBooks += 1;
          if (result.created) createdBooks += 1;
          await this.updateBookCache(data, fingerprints.get(data.book.bookId) ?? "", joinVaultPath(settings.syncFolder, fileName), syncTime);
        }
      }

      const summaryFileName = settings.summaryFileName || DEFAULT_SUMMARY_FILE_NAME;
      if (summaryFileName !== OLD_DEFAULT_SUMMARY_FILE_NAME) {
        await this.writer.deleteFileIfExists(joinVaultPath(settings.syncFolder, OLD_DEFAULT_SUMMARY_FILE_NAME), settings.dryRun);
      }

      const summaryContent = renderSummary(context, settings, fileNames);
      this.updateProgress(progressNotice, "微信读书：更新汇总页和日志。");
      const summaryResult = await this.writer.writeMarkdown(
        settings.syncFolder,
        summaryFileName,
        summaryContent,
        { preserveKeepBlocks: false, dryRun: settings.dryRun }
      );
      const cleanedCovers = await this.cleanupUnusedCovers(settings);

      const summary = [
        settings.dryRun ? "预览模式，未写入文件" : `更新 ${changedBooks} 本，新增 ${createdBooks} 本`,
        skippedByCache > 0 ? `缓存跳过 ${skippedByCache} 本` : "缓存跳过 0 本",
        skippedByProgress > 0 ? `未开始跳过 ${skippedByProgress} 本` : "未开始跳过 0 本",
        cleanedCovers > 0 ? `清理封面 ${cleanedCovers} 个` : "清理封面 0 个",
        summaryResult.changed ? "汇总页已更新" : "汇总页无变化",
        failedBooks > 0 ? `${failedBooks} 本失败` : "无失败"
      ].join("；");

      await this.recordResult({
        time: syncTime.toISOString(),
        success: failedBooks === 0,
        summary,
        syncedBooks: bookData.length,
        skippedBooks: skippedByProgress + skippedByCache,
        failedBooks
      });

      this.log("info", `同步完成：${summary}，耗时 ${Math.round((Date.now() - started) / 1000)} 秒。`);
      await this.writeLogFile(settings);
      this.updateProgress(progressNotice, `微信读书：同步完成，${summary}。`, 8000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log("error", `同步失败：${message}`);
      await this.recordResult({
        time: syncTime.toISOString(),
        success: false,
        summary: message,
        syncedBooks: 0,
        skippedBooks: 0,
        failedBooks: 0
      });
      console.error("[Wechat Reading] 同步失败", error);
      await this.writeLogFile(settings);
      this.updateProgress(progressNotice, `微信读书：同步失败，${message}`, 10000);
    }
  }

  async regenerateSummary(): Promise<void> {
    await this.syncAll({ summaryOnly: true });
  }

  async resyncAll(): Promise<void> {
    await this.syncAll({ forceRefresh: true, clearBeforeSync: true });
  }

  private assertApiKey(settings: WeChatReadingPluginSettings): void {
    if (!settings.apiKey.trim()) {
      throw new WeChatReadingApiError("微信读书 API Key 为空，请先在设置页填写。");
    }
    if (!isApiKeyProbablyValid(settings.apiKey)) {
      throw new WeChatReadingApiError("微信读书 API Key 格式看起来不正确，通常应以 wrk- 开头。");
    }
  }

  private async loadStats(client: WeChatReadingApiClient): Promise<SyncStats> {
    const modes = ["weekly", "monthly", "annually", "overall"] as const;
    const results = await Promise.allSettled(modes.map((mode) => client.getReadData(mode)));
    const stats: SyncStats = {};
    results.forEach((result, index) => {
      const mode = modes[index];
      if (result.status === "fulfilled") {
        stats[mode] = result.value;
      } else {
        this.log("warn", `读取${mode}阅读统计失败：${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
      }
    });
    return stats;
  }

  private async selectBooks(
    shelfBooks: WeChatReadingBook[],
    notebookByBookId: Map<string, NotebookBook>,
    settings: WeChatReadingPluginSettings,
    currentFile?: TFile | null
  ): Promise<WeChatReadingBook[]> {
    let books = settings.syncAllBooks ? shelfBooks : shelfBooks.filter((book) => notebookByBookId.has(book.bookId));
    if (settings.onlySyncBooksWithNotes) {
      books = books.filter((book) => {
        const notebook = notebookByBookId.get(book.bookId);
        return (notebook?.noteCount ?? 0) > 0 || (notebook?.reviewCount ?? 0) > 0;
      });
    }

    if (currentFile) {
      const currentBookId = await this.readBookIdFromFile(currentFile);
      if (currentBookId) {
        const matched = books.filter((book) => book.bookId === currentBookId);
        if (matched.length > 0) return matched;
      }
      const baseName = currentFile.basename;
      books = books.filter((book) => {
        const title = sanitizeFileName(book.title || "");
        return baseName === title || baseName.includes(title) || title.includes(baseName);
      });
    }

    return books;
  }

  private async loadBookData(client: WeChatReadingApiClient, book: WeChatReadingBook, notebook?: NotebookBook, preloadedProgress?: ProgressResponse): Promise<BookSyncData> {
    const [progressResult, bookmarkResult, reviewsResult] = await Promise.allSettled([
      preloadedProgress ? Promise.resolve(preloadedProgress) : client.getProgress(book.bookId),
      client.getBookmarks(book.bookId),
      client.getAllMineReviews(book.bookId)
    ]);

    if (bookmarkResult.status === "rejected" && reviewsResult.status === "rejected") {
      throw bookmarkResult.reason;
    }

    const data: BookSyncData = {
      book,
      progress: progressResult.status === "fulfilled" ? progressResult.value : undefined,
      bookmarks: bookmarkResult.status === "fulfilled" ? bookmarkResult.value.updated ?? [] : [],
      reviews: reviewsResult.status === "fulfilled" ? reviewsResult.value ?? [] : [],
      chapters: bookmarkResult.status === "fulfilled" ? bookmarkResult.value.chapters ?? [] : [],
      notebook,
      notes: []
    };
    data.notes = normalizeNotes(data);

    if (progressResult.status === "rejected") {
      this.log("warn", `读取《${book.title}》阅读进度失败：${progressResult.reason instanceof Error ? progressResult.reason.message : String(progressResult.reason)}`);
    }
    if (bookmarkResult.status === "rejected") {
      this.log("warn", `读取《${book.title}》划线失败：${bookmarkResult.reason instanceof Error ? bookmarkResult.reason.message : String(bookmarkResult.reason)}`);
    }
    if (reviewsResult.status === "rejected") {
      this.log("warn", `读取《${book.title}》想法失败：${reviewsResult.reason instanceof Error ? reviewsResult.reason.message : String(reviewsResult.reason)}`);
    }

    return data;
  }

  private createCachedBookData(book: WeChatReadingBook, notebook: NotebookBook | undefined, progress: ProgressResponse, cached: BookSyncCacheEntry): BookSyncData {
    return {
      book,
      progress,
      bookmarks: [],
      reviews: [],
      chapters: [],
      notebook,
      notes: [],
      coverPath: cached.coverPath,
      skippedByCache: true,
      cachedHighlightCount: cached.highlightCount,
      cachedNoteCount: cached.noteCount
    };
  }

  private buildFingerprint(book: WeChatReadingBook, notebook: NotebookBook | undefined, progress: ProgressResponse, settings: WeChatReadingPluginSettings): string {
    return JSON.stringify({
      bookId: book.bookId,
      updateTime: book.updateTime ?? 0,
      readUpdateTime: book.readUpdateTime ?? 0,
      title: book.title ?? "",
      author: book.author ?? "",
      category: book.category ?? "",
      cover: book.cover ?? "",
      noteCount: notebook?.noteCount ?? 0,
      reviewCount: notebook?.reviewCount ?? 0,
      bookmarkCount: notebook?.bookmarkCount ?? 0,
      sort: notebook?.sort ?? 0,
      progress: normalizeProgress(progress.book?.progress) ?? notebook?.readingProgress ?? 0,
      progressUpdateTime: progress.book?.updateTime ?? 0,
      bookTemplate: settings.bookTemplate,
      highlightTemplate: settings.highlightTemplate,
      bookFileNameTemplate: settings.bookFileNameTemplate,
      dateFormat: settings.dateFormat,
      unreadThreshold: settings.unreadThreshold,
      finishedThreshold: settings.finishedThreshold,
      addDefaultTags: settings.addDefaultTags
    });
  }

  private async canUseCache(cached: BookSyncCacheEntry | undefined, fingerprint: string): Promise<boolean> {
    if (!cached || cached.fingerprint !== fingerprint) return false;
    if (!(await this.vault.adapter.exists(cached.filePath))) return false;
    if (cached.coverPath && !(await this.vault.adapter.exists(cached.coverPath))) return false;
    return true;
  }

  private async updateBookCache(data: BookSyncData, fingerprint: string, filePath: string, syncTime: Date): Promise<void> {
    const highlightCount = data.bookmarks.length;
    const noteCount = data.reviews.filter((review) => review.review?.content?.trim()).length;
    await this.callbacks.updateSettings((settings) => {
      settings.syncCache[data.book.bookId] = {
        bookId: data.book.bookId,
        fingerprint,
        filePath,
        coverPath: data.coverPath,
        coverUrl: data.book.cover,
        title: getBookTitle(data.book),
        author: data.book.author,
        category: data.book.category,
        progress: normalizeProgress(data.progress?.book?.progress ?? data.notebook?.readingProgress),
        highlightCount,
        noteCount,
        lastSyncedAt: syncTime.toISOString()
      };
    });
  }

  private async cleanupUnusedCovers(settings: WeChatReadingPluginSettings): Promise<number> {
    const keepPaths = new Set(
      Object.values(this.getSettings().syncCache)
        .map((entry) => entry.coverPath)
        .filter((path): path is string => Boolean(path))
    );
    return this.writer.deleteFilesInFolderExcept(joinVaultPath(settings.syncFolder, "assets"), keepPaths, settings.dryRun);
  }

  private async readBookIdFromFile(file: TFile): Promise<string | null> {
    try {
      const content = await this.vault.read(file);
      const yamlMatch = /^---\n([\s\S]*?)\n---/.exec(content);
      if (!yamlMatch) return null;
      const quoted = /^bookId:\s*["']?([^"'\n]+)["']?\s*$/m.exec(yamlMatch[1]);
      return quoted?.[1]?.trim() || null;
    } catch (error) {
      this.log("warn", `读取当前文件 bookId 失败：${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private async recordResult(result: NonNullable<WeChatReadingPluginSettings["lastSyncResult"]>): Promise<void> {
    await this.callbacks.updateSettings((settings) => {
      settings.lastSyncResult = result;
    });
  }

  private log(level: "info" | "warn" | "error", message: string): void {
    void this.callbacks.updateSettings((settings) => {
      settings.syncLogs = [
        { time: new Date().toISOString(), level, message },
        ...settings.syncLogs
      ].slice(0, 100);
    });
  }

  private updateProgress(notice: Notice | null, message: string, timeout?: number): void {
    if (!notice) return;
    notice.setMessage(message);
    if (timeout !== undefined) {
      window.setTimeout(() => notice.hide(), timeout);
    }
  }

  private async writeLogFile(settings: WeChatReadingPluginSettings): Promise<void> {
    if (!settings.writeLogFile) return;
    const logs = this.getSettings().syncLogs.slice(0, 100);
    const content = [
      "# 微信读书同步日志",
      "",
      `> 最近更新：${new Date().toLocaleString("zh-CN")}`,
      "",
      "| 时间 | 级别 | 信息 |",
      "|---|---|---|",
      ...logs.map((log) => `| ${log.time} | ${log.level} | ${String(log.message).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>")} |`),
      ""
    ].join("\n");
    await this.writer.writeMarkdown(settings.syncFolder, settings.logFileName || "微信读书同步日志.md", content, {
      preserveKeepBlocks: false,
      dryRun: settings.dryRun
    });
  }
}
