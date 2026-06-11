import { requestUrl } from "obsidian";
import { WECHAT_READING_GATEWAY_URL, WECHAT_READING_SKILL_VERSION } from "./constants";
import {
  BookmarkListResponse,
  MineReviewsResponse,
  NotebookBook,
  NotebooksResponse,
  ProgressResponse,
  ReadDataResponse,
  ShelfResponse
} from "./types";

interface GatewayErrorBody {
  errcode?: number;
  errmsg?: string;
  message?: string;
  upgrade_info?: {
    message?: string;
  };
}

export class WeChatReadingApiError extends Error {
  constructor(message: string, public readonly detail?: unknown) {
    super(message);
    this.name = "WeChatReadingApiError";
  }
}

export class WeChatReadingApiClient {
  constructor(
    private readonly apiKey: string,
    private readonly skillVersion = WECHAT_READING_SKILL_VERSION
  ) {}

  async testConnection(): Promise<void> {
    await this.getShelf();
  }

  async getShelf(): Promise<ShelfResponse> {
    return this.call<ShelfResponse>("/shelf/sync");
  }

  async getProgress(bookId: string): Promise<ProgressResponse> {
    return this.call<ProgressResponse>("/book/getprogress", { bookId });
  }

  async getBookmarks(bookId: string): Promise<BookmarkListResponse> {
    return this.call<BookmarkListResponse>("/book/bookmarklist", { bookId });
  }

  async getReadData(mode: "weekly" | "monthly" | "annually" | "overall"): Promise<ReadDataResponse> {
    return this.call<ReadDataResponse>("/readdata/detail", { mode, baseTime: mode === "overall" ? 0 : undefined });
  }

  async getAllNotebooks(count = 100): Promise<NotebookBook[]> {
    const books: NotebookBook[] = [];
    let lastSort: number | undefined;

    for (let page = 0; page < 100; page += 1) {
      const response = await this.call<NotebooksResponse>("/user/notebooks", {
        count,
        lastSort
      });
      const pageBooks = response.books ?? [];
      books.push(...pageBooks);
      if (!response.hasMore || pageBooks.length === 0) break;
      lastSort = pageBooks[pageBooks.length - 1].sort;
      if (lastSort === undefined) break;
    }

    return books;
  }

  async getAllMineReviews(bookId: string, count = 100): Promise<MineReviewsResponse["reviews"]> {
    const reviews: NonNullable<MineReviewsResponse["reviews"]> = [];
    let synckey = 0;

    for (let page = 0; page < 100; page += 1) {
      const response = await this.call<MineReviewsResponse>("/review/list/mine", {
        bookid: bookId,
        synckey,
        count
      });
      reviews.push(...(response.reviews ?? []));
      if (!response.hasMore) break;
      if (typeof response.synckey !== "number" || response.synckey === synckey) break;
      synckey = response.synckey;
    }

    return reviews;
  }

  private async call<T>(apiName: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.apiKey.trim()) {
      throw new WeChatReadingApiError("微信读书 API Key 为空，请先在设置页填写。");
    }

    const body = Object.fromEntries(
      Object.entries({
        api_name: apiName,
        skill_version: this.skillVersion,
        ...params
      }).filter(([, value]) => value !== undefined)
    );

    let json: T & GatewayErrorBody;
    try {
      const response = await requestUrl({
        url: WECHAT_READING_GATEWAY_URL,
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey.trim()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        throw: false
      });

      if (response.status < 200 || response.status >= 300) {
        throw new WeChatReadingApiError(`微信读书接口请求失败：HTTP ${response.status}`, response.text);
      }
      json = response.json as T & GatewayErrorBody;
    } catch (error) {
      if (error instanceof WeChatReadingApiError) throw error;
      throw new WeChatReadingApiError("网络请求失败，请检查网络连接或稍后重试。", error);
    }

    if (json.upgrade_info?.message) {
      throw new WeChatReadingApiError(`微信读书 skill 需要升级：${json.upgrade_info.message}`, json);
    }

    if (typeof json.errcode === "number" && json.errcode !== 0) {
      throw new WeChatReadingApiError(json.errmsg || json.message || `微信读书接口返回异常：${json.errcode}`, json);
    }

    return json as T;
  }
}
