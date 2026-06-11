import { FileManager, normalizePath, TFile, TFolder, Vault } from "obsidian";
import { mergeKeepBlocks } from "./template";
import { joinVaultPath, normalizeVaultPath } from "./utils";

export interface WriteResult {
  path: string;
  changed: boolean;
  created: boolean;
}

export class MarkdownWriter {
  constructor(private readonly vault: Vault, private readonly fileManager: FileManager) {}

  async ensureFolder(path: string): Promise<void> {
    const normalized = normalizePath(path);
    if (!normalized || normalized === "/") return;
    const parts = normalized.split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!(await this.vault.adapter.exists(current))) {
        await this.vault.createFolder(current);
      }
    }
  }

  async writeMarkdown(
    folder: string,
    fileName: string,
    content: string,
    options: { preserveKeepBlocks: boolean; dryRun: boolean }
  ): Promise<WriteResult> {
    const path = joinVaultPath(folder, fileName);
    await this.ensureFolder(getParentPath(path));
    const existingFile = this.vault.getAbstractFileByPath(path);
    const oldContent = existingFile instanceof TFile ? await this.vault.read(existingFile) : "";
    const nextContent = options.preserveKeepBlocks && oldContent ? mergeKeepBlocks(content, oldContent) : content;
    const changed = oldContent !== nextContent;

    if (!changed || options.dryRun) {
      return {
        path,
        changed,
        created: !(existingFile instanceof TFile)
      };
    }

    if (existingFile instanceof TFile) {
      await this.vault.modify(existingFile, nextContent);
      return { path, changed: true, created: false };
    }

    await this.vault.create(path, nextContent);
    return { path, changed: true, created: true };
  }

  async writeBinary(path: string, data: ArrayBuffer, dryRun: boolean): Promise<void> {
    const normalized = normalizeVaultPath(path);
    await this.ensureFolder(getParentPath(normalized));
    if (dryRun) return;
    await this.vault.adapter.writeBinary(normalized, data);
  }

  async clearFolder(folder: string, dryRun: boolean): Promise<number> {
    const normalized = normalizeVaultPath(folder);
    if (!normalized) return 0;
    const files = this.vault.getFiles()
      .filter((file) => file.path === normalized || file.path.startsWith(`${normalized}/`));
    if (dryRun) return files.length;

    for (const file of files) {
      await this.fileManager.trashFile(file);
    }

    const folders = this.vault.getAllLoadedFiles()
      .filter((item): item is TFolder => item instanceof TFolder && item.path.startsWith(`${normalized}/`))
      .sort((a, b) => b.path.length - a.path.length);
    for (const folderItem of folders) {
      await this.deleteFolderIfEmpty(folderItem);
    }
    return files.length;
  }

  async deleteFileIfExists(path: string, dryRun: boolean): Promise<boolean> {
    const normalized = normalizeVaultPath(path);
    const file = this.vault.getAbstractFileByPath(normalized);
    if (!(file instanceof TFile)) return false;
    if (!dryRun) await this.fileManager.trashFile(file);
    return true;
  }

  async deleteFilesInFolderExcept(folder: string, keepPaths: Set<string>, dryRun: boolean): Promise<number> {
    const normalized = normalizeVaultPath(folder);
    if (!normalized) return 0;
    const files = this.vault.getFiles()
      .filter((file) => file.path.startsWith(`${normalized}/`) && !keepPaths.has(file.path));
    if (dryRun) return files.length;
    for (const file of files) {
      await this.fileManager.trashFile(file);
    }
    const folderItem = this.vault.getAbstractFileByPath(normalized);
    if (folderItem instanceof TFolder) {
      await this.deleteFolderIfEmpty(folderItem);
    }
    return files.length;
  }

  private async deleteFolderIfEmpty(folder: TFolder): Promise<void> {
    const children = folder.children;
    if (children.length > 0) return;
    await this.fileManager.trashFile(folder);
  }
}

function getParentPath(path: string): string {
  const normalized = normalizeVaultPath(path);
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.slice(0, index);
}
