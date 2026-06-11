export interface WeChatReadingBook {
  bookId: string;
  title: string;
  author?: string;
  cover?: string;
  category?: string;
  readUpdateTime?: number;
  finishReading?: number;
  updateTime?: number;
  isTop?: number;
  secret?: number;
}

export interface WeChatReadingAlbum {
  albumInfo?: {
    albumId?: string;
    name?: string;
    authorName?: string;
    cover?: string;
    trackCount?: number;
    finishStatus?: string;
    finish?: number;
    updateTime?: number;
  };
  albumInfoExtra?: {
    secret?: number;
    lectureReadUpdateTime?: number;
    isTop?: number;
  };
}

export interface ShelfResponse {
  books?: WeChatReadingBook[];
  albums?: WeChatReadingAlbum[];
  mp?: unknown;
  archive?: Array<{ name?: string; bookIds?: string[] }>;
  bookCount?: number;
}

export interface NotebookBook {
  bookId: string;
  book?: WeChatReadingBook;
  reviewCount?: number;
  noteCount?: number;
  bookmarkCount?: number;
  readingProgress?: number;
  markedStatus?: number;
  sort?: number;
}

export interface NotebooksResponse {
  totalBookCount?: number;
  totalNoteCount?: number;
  hasMore?: number;
  books?: NotebookBook[];
}

export interface ChapterInfo {
  bookId?: string;
  chapterUid?: number;
  chapterIdx?: number;
  title?: string;
}

export interface BookmarkItem {
  bookmarkId?: string;
  bookId?: string;
  chapterUid?: number;
  markText?: string;
  createTime?: number;
  type?: number;
  range?: string;
  colorStyle?: number;
}

export interface BookmarkListResponse {
  updated?: BookmarkItem[];
  chapters?: ChapterInfo[];
  book?: WeChatReadingBook;
}

export interface MineReview {
  review?: {
    reviewId?: string;
    bookId?: string;
    content?: string;
    createTime?: number;
    star?: number;
    chapterName?: string;
    chapterUid?: number;
    range?: string;
    abstract?: string;
    isFinish?: number;
  };
}

export interface MineReviewsResponse {
  reviews?: MineReview[];
  totalCount?: number;
  hasMore?: number;
  synckey?: number;
}

export interface ProgressResponse {
  bookId?: string;
  book?: {
    chapterUid?: number;
    chapterOffset?: number;
    progress?: number;
    updateTime?: number;
    recordReadingTime?: number;
    finishTime?: number;
    isStartReading?: number;
  };
  timestamp?: number;
}

export interface ReadDataResponse {
  baseTime?: number;
  readTimes?: Record<string, number>;
  dailyReadTimes?: Record<string, number>;
  readDays?: number;
  totalReadTime?: number;
  dayAverageReadTime?: number;
  readLongest?: Array<{
    book?: WeChatReadingBook;
    albumInfo?: WeChatReadingAlbum["albumInfo"];
    readTime?: number;
    tags?: string[];
  }>;
  readStat?: Array<{
    stat?: string;
    counts?: string;
    scheme?: string;
  }>;
  rank?: {
    text?: string;
    scheme?: string;
  };
}

export interface NormalizedNote {
  id: string;
  bookId: string;
  type: "highlight" | "review";
  text: string;
  note?: string;
  chapter?: string;
  chapterUid?: number;
  range?: string;
  createTime?: number;
  sortKey: string;
}

export interface BookSyncData {
  book: WeChatReadingBook;
  progress?: ProgressResponse;
  bookmarks: BookmarkItem[];
  reviews: MineReview[];
  chapters: ChapterInfo[];
  notebook?: NotebookBook;
  notes: NormalizedNote[];
  coverPath?: string;
  skippedByCache?: boolean;
  cachedHighlightCount?: number;
  cachedNoteCount?: number;
}

export interface SyncStats {
  weekly?: ReadDataResponse;
  monthly?: ReadDataResponse;
  annually?: ReadDataResponse;
  overall?: ReadDataResponse;
}

export interface SyncContext {
  shelf: ShelfResponse;
  notebooks: NotebookBook[];
  stats: SyncStats;
  books: BookSyncData[];
  syncTime: Date;
}
