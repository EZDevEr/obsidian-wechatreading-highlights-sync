import {
  DEFAULT_BOOK_FILE_NAME_TEMPLATE,
  DEFAULT_HIGHLIGHT_TEMPLATE,
  DEFAULT_BOOK_TEMPLATE,
  DEFAULT_SUMMARY_FILE_NAME,
  DEFAULT_SYNC_FOLDER
} from "./constants";

export type AutoSyncMode = "off" | "startup" | "hourly" | "daily" | "weekly";

export type SummarySortMode = "recent" | "title" | "progress" | "notes";

export interface SyncLogEntry {
  time: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface LastSyncResult {
  time: string;
  success: boolean;
  summary: string;
  syncedBooks: number;
  skippedBooks: number;
  failedBooks: number;
}

export interface BookSyncCacheEntry {
  bookId: string;
  fingerprint: string;
  filePath: string;
  coverPath?: string;
  coverUrl?: string;
  title: string;
  author?: string;
  category?: string;
  progress?: number;
  highlightCount: number;
  noteCount: number;
  lastSyncedAt: string;
}

export interface WeChatReadingPluginSettings {
  settingsVersion: number;
  apiKey: string;
  syncFolder: string;
  summaryFileName: string;
  autoSyncMode: AutoSyncMode;
  syncAllBooks: boolean;
  onlySyncBooksWithNotes: boolean;
  onlySyncStartedBooks: boolean;
  preserveKeepBlocks: boolean;
  bookTemplate: string;
  highlightTemplate: string;
  bookFileNameTemplate: string;
  dateFormat: string;
  unreadThreshold: number;
  finishedThreshold: number;
  summarySortMode: SummarySortMode;
  addDefaultTags: boolean;
  writeLogFile: boolean;
  logFileName: string;
  lastAutoSyncAt: number;
  lastSyncResult: LastSyncResult | null;
  syncCache: Record<string, BookSyncCacheEntry>;
  syncLogs: SyncLogEntry[];
}

export const DEFAULT_SETTINGS: WeChatReadingPluginSettings = {
  settingsVersion: 3,
  apiKey: "",
  syncFolder: DEFAULT_SYNC_FOLDER,
  summaryFileName: DEFAULT_SUMMARY_FILE_NAME,
  autoSyncMode: "off",
  syncAllBooks: true,
  onlySyncBooksWithNotes: false,
  onlySyncStartedBooks: true,
  preserveKeepBlocks: true,
  bookTemplate: DEFAULT_BOOK_TEMPLATE,
  highlightTemplate: DEFAULT_HIGHLIGHT_TEMPLATE,
  bookFileNameTemplate: DEFAULT_BOOK_FILE_NAME_TEMPLATE,
  dateFormat: "YYYY-MM-DD HH:mm",
  unreadThreshold: 2,
  finishedThreshold: 95,
  summarySortMode: "recent",
  addDefaultTags: true,
  writeLogFile: true,
  logFileName: "微信读书同步日志.md",
  lastAutoSyncAt: 0,
  lastSyncResult: null,
  syncCache: {},
  syncLogs: []
};
