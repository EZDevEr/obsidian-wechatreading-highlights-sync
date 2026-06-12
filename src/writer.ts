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
    options: { preserveKeepBlocks: boolean }
  ): Promise<WriteResult> {
    const path = joinVaultPath(folder, fileName);
    await this.ensureFolder(getParentPath(path));
    const existingFile = this.vault.getAbstractFileByPath(path);
    const oldContent = existingFile instanceof TFile ? await this.vault.read(existingFile) : "";
    const nextContent = options.preserveKeepBlocks && oldContent ? mergeKeepBlocks(content, oldContent) : content;
    const changed = oldContent !== nextContent;

    if (!changed) {
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

  async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
    const normalized = normalizeVaultPath(path);
    await this.ensureFolder(getParentPath(normalized));
    await this.vault.adapter.writeBinary(normalized, data);
  }

  async clearFolder(folder: string): Promise<number> {
    const normalized = normalizeVaultPath(folder);
    if (!normalized) return 0;
    const files = this.vault.getFiles()
      .filter((file) => file.path === normalized || file.path.startsWith(`${normalized}/`));

    const root = this.vault.getAbstractFileByPath(normalized);
    if (root instanceof TFolder) {
      await this.fileManager.trashFile(root);
      if (await this.vault.adapter.exists(normalized)) {
        await this.vault.adapter.rmdir(normalized, true);
      }
      return files.length;
    }

    if (await this.vault.adapter.exists(normalized)) {
      await this.vault.adapter.rmdir(normalized, true);
      return files.length;
    }

    return files.length;
  }

  async deleteFileIfExists(path: string): Promise<boolean> {
    const normalized = normalizeVaultPath(path);
    const file = this.vault.getAbstractFileByPath(normalized);
    if (!(file instanceof TFile)) return false;
    await this.fileManager.trashFile(file);
    return true;
  }

  async deleteFilesInFolderExcept(folder: string, keepPaths: Set<string>): Promise<number> {
    const normalized = normalizeVaultPath(folder);
    if (!normalized) return 0;
    const files = this.vault.getFiles()
      .filter((file) => file.path.startsWith(`${normalized}/`) && !keepPaths.has(file.path));
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
    const children = await this.vault.adapter.list(folder.path);
    if (children.files.length > 0 || children.folders.length > 0) return;
    await this.fileManager.trashFile(folder);
  }
}

function getParentPath(path: string): string {
  const normalized = normalizeVaultPath(path);
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.slice(0, index);
}
