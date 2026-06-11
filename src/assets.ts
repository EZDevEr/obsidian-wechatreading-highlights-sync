import { requestUrl } from "obsidian";
import { WeChatReadingPluginSettings } from "./settings";
import { WeChatReadingBook } from "./types";
import { joinVaultPath } from "./utils";
import { MarkdownWriter } from "./writer";

export class AssetManager {
  constructor(private readonly writer: MarkdownWriter) {}

  async downloadCover(book: WeChatReadingBook, settings: WeChatReadingPluginSettings): Promise<string | undefined> {
    if (!book.cover) return undefined;
    const extension = inferImageExtension(book.cover);
    const path = joinVaultPath(settings.syncFolder, "assets", `${book.bookId}.${extension}`);

    try {
      const response = await requestUrl({
        url: book.cover,
        method: "GET",
        throw: false
      });
      if (response.status < 200 || response.status >= 300 || !response.arrayBuffer) {
        return undefined;
      }
      await this.writer.writeBinary(path, response.arrayBuffer, settings.dryRun);
      return path;
    } catch {
      return undefined;
    }
  }
}

function inferImageExtension(url: string): string {
  const cleanUrl = url.split("?")[0] ?? url;
  const match = /\.(png|jpe?g|webp|gif)$/i.exec(cleanUrl);
  if (!match) return "jpg";
  const ext = match[1].toLowerCase();
  return ext === "jpeg" ? "jpg" : ext;
}
