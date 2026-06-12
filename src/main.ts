import { addIcon, App, Notice, Plugin, PluginSettingTab, Setting, TextAreaComponent } from "obsidian";
import { DEFAULT_BOOK_TEMPLATE, DEFAULT_HIGHLIGHT_TEMPLATE, DEFAULT_SUMMARY_FILE_NAME, OLD_DEFAULT_SUMMARY_FILE_NAME, PLUGIN_NAME } from "./constants";
import { DEFAULT_SETTINGS, WeChatReadingPluginSettings } from "./settings";
import { WeChatReadingSyncService } from "./sync";
import { renderTemplate } from "./template";
import { formatDate, isApiKeyProbablyValid } from "./utils";

export default class WeChatReadingHighlightsSyncPlugin extends Plugin {
  settings!: WeChatReadingPluginSettings;
  syncService!: WeChatReadingSyncService;
  private isResyncing = false;

  async onload(): Promise<void> {
    await this.loadSettings();
    registerWeChatReadingIcons();

    this.syncService = new WeChatReadingSyncService(this.app.vault, this.app.fileManager, () => this.settings, {
      saveSettings: () => this.saveSettings(),
      updateSettings: async (updater) => {
        updater(this.settings);
        await this.saveSettings();
      }
    });

    this.addSettingTab(new WeChatReadingSettingTab(this.app, this));
    this.registerCommands();
    this.registerRibbonActions();
    this.registerAutoSync();
    console.log(`${PLUGIN_NAME} 已加载。`);
  }

  onunload(): void {
    console.log(`${PLUGIN_NAME} 已卸载。`);
  }

  async loadSettings(): Promise<void> {
    const loaded = await this.loadData() as Partial<WeChatReadingPluginSettings> | null;
    const oldVersion = loaded?.settingsVersion ?? 1;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
    let shouldSaveSettings = false;
    if (oldVersion < 2) {
      if (!loaded?.summaryFileName || loaded.summaryFileName === OLD_DEFAULT_SUMMARY_FILE_NAME) {
        this.settings.summaryFileName = DEFAULT_SUMMARY_FILE_NAME;
      }
      this.settings.onlySyncStartedBooks = true;
      this.settings.settingsVersion = 2;
      shouldSaveSettings = true;
    }
    if (oldVersion < 3) {
      this.settings.bookTemplate = migrateTemplateVariableNames(this.settings.bookTemplate);
      this.settings.highlightTemplate = migrateTemplateVariableNames(this.settings.highlightTemplate);
      this.settings.settingsVersion = 3;
      shouldSaveSettings = true;
    }
    const legacySettings = this.settings as WeChatReadingPluginSettings & { dryRun?: boolean };
    if ("dryRun" in legacySettings) {
      delete legacySettings.dryRun;
      shouldSaveSettings = true;
    }
    const migratedTemplate = ensureCoverPreviewInTemplate(this.settings.bookTemplate);
    if (migratedTemplate !== this.settings.bookTemplate) {
      this.settings.bookTemplate = migratedTemplate;
      shouldSaveSettings = true;
    }
    if (shouldSaveSettings) await this.saveSettings();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async updateSettings(updater: (settings: WeChatReadingPluginSettings) => void): Promise<void> {
    updater(this.settings);
    await this.saveSettings();
  }

  private registerCommands(): void {
    this.addCommand({
      id: "sync-all-wechatreading-notes",
      name: "微信读书：同步全部笔记",
      callback: () => void this.syncService.syncAll()
    });

    this.addCommand({
      id: "sync-current-wechatreading-book",
      name: "微信读书：同步当前书籍",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) void this.syncService.syncAll({ onlyCurrentFile: file });
        return true;
      }
    });

    this.addCommand({
      id: "regenerate-wechatreading-summary",
      name: "微信读书：重新生成汇总页",
      callback: () => void this.syncService.regenerateSummary()
    });

    this.addCommand({
      id: "resync-all-wechatreading-notes",
      name: "微信读书：清空后重新同步全部笔记",
      callback: () => this.runResyncAll()
    });

    this.addCommand({
      id: "open-wechatreading-settings",
      name: "微信读书：打开设置",
      callback: () => {
        const setting = (this.app as App & { setting?: { open: () => void; openTabById: (id: string) => void } }).setting;
        setting?.open();
        setting?.openTabById(this.manifest.id);
      }
    });

    this.addCommand({
      id: "test-wechatreading-api-key",
      name: "微信读书：测试 API Key",
      callback: () => void this.testConnectionWithNotice()
    });
  }

  private registerRibbonActions(): void {
    const ribbon = this.addRibbonIcon("wechatreading-book-sync", "同步微信读书笔记", () => {
      void this.syncService.syncAll();
    });
    ribbon.addClass("wechatreading-highlights-ribbon");
  }

  private registerAutoSync(): void {
    const runIfNeeded = () => {
      const mode = this.settings.autoSyncMode;
      if (mode === "off") return;
      const now = Date.now();
      const last = this.settings.lastAutoSyncAt || 0;
      const oneHour = 60 * 60 * 1000;
      const oneDay = 24 * 60 * 60 * 1000;
      const shouldRun = mode === "startup"
        || (mode === "hourly" && now - last >= oneHour)
        || (mode === "daily" && now - last >= oneDay)
        || (mode === "weekly" && now - last >= oneDay * 7);
      if (!shouldRun) return;

      void this.updateSettings((settings) => {
        settings.lastAutoSyncAt = now;
      }).then(() => this.syncService.syncAll({ silent: true }));
    };

    this.app.workspace.onLayoutReady(runIfNeeded);
    this.registerInterval(window.setInterval(runIfNeeded, 60 * 60 * 1000));
  }

  async testConnectionWithNotice(): Promise<void> {
    try {
      await this.syncService.testConnection();
      new Notice("微信读书：连接测试成功。");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[微信读书笔记同步] 连接测试失败", error);
      new Notice(`微信读书：连接测试失败，${message}`);
    }
  }

  runResyncAll(): void {
    if (this.isResyncing) {
      new Notice("微信读书：清空后重新同步正在进行中。");
      return;
    }
    const apiKey = this.settings.apiKey.trim();
    if (!apiKey) {
      new Notice("微信读书：API Key 为空，未执行清空。请先在设置页填写 API Key。");
      return;
    }
    if (!isApiKeyProbablyValid(apiKey)) {
      new Notice("微信读书：API Key 格式看起来不正确，未执行清空。");
      return;
    }

    this.isResyncing = true;
    console.info("[微信读书笔记同步] 用户触发清空后重新同步");
    new Notice("微信读书：开始准备远端数据，成功后会清空本地同步目录并重写。");
    void this.syncService.resyncAll()
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[微信读书笔记同步] 清空后重新同步失败", error);
        new Notice(`微信读书：清空后重新同步失败，${message}`);
      })
      .finally(() => {
        this.isResyncing = false;
      });
  }
}

class WeChatReadingSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: WeChatReadingHighlightsSyncPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("微信读书笔记同步")
      .setDesc("插件只在本地运行，API Key 会保存在当前 Obsidian 插件配置中，不会上传到任何第三方服务。建议不要把包含 API Key 的配置文件同步到公开仓库。")
      .setHeading();

    new Setting(containerEl)
      .setName("基础配置")
      .setHeading();

    new Setting(containerEl)
      .setName("微信读书 API Key")
      .setDesc("填写以 wrk- 开头的 API Key。插件调用微信读书官方 Agent Gateway 时只在本地使用它。")
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("wrk-xxxxxxxx")
          .setValue(this.plugin.settings.apiKey)
          .onChange((value) => void this.plugin.updateSettings((settings) => {
            settings.apiKey = value.trim();
          }));
      })
      .addButton((button) => button
        .setButtonText("测试连接")
        .onClick(() => void this.plugin.testConnectionWithNotice()));

    new Setting(containerEl)
      .setName("同步目录")
      .setDesc("默认会在当前仓库创建“微信读书笔记”文件夹。")
      .addText((text) => text
        .setPlaceholder("微信读书笔记")
        .setValue(this.plugin.settings.syncFolder)
        .onChange((value) => void this.plugin.updateSettings((settings) => {
          settings.syncFolder = value.trim() || "微信读书笔记";
        })));

    new Setting(containerEl)
      .setName("汇总页文件名")
      .setDesc("默认使用“微信读书汇总.md”，也可以改成你喜欢的文件名。")
      .addText((text) => text
        .setPlaceholder(DEFAULT_SUMMARY_FILE_NAME)
        .setValue(this.plugin.settings.summaryFileName)
        .onChange((value) => void this.plugin.updateSettings((settings) => {
          settings.summaryFileName = value.trim() || DEFAULT_SUMMARY_FILE_NAME;
        })));

    new Setting(containerEl)
      .setName("同步范围")
      .setHeading();

    new Setting(containerEl)
      .setName("自动同步")
      .setDesc("默认关闭，为了避免频繁请求，建议手动触发同步。")
      .addDropdown((dropdown) => dropdown
        .addOption("off", "关闭自动同步")
        .addOption("startup", "启动 Obsidian 时同步")
        .addOption("hourly", "每小时同步一次")
        .addOption("daily", "每天同步一次")
        .addOption("weekly", "每周同步一次")
        .setValue(this.plugin.settings.autoSyncMode)
        .onChange((value) => void this.plugin.updateSettings((settings) => {
          settings.autoSyncMode = value as WeChatReadingPluginSettings["autoSyncMode"];
        })));

    new Setting(containerEl)
      .setName("同步书架全部电子书")
      .setDesc("关闭后只同步微信读书笔记本概览中出现的书。")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.syncAllBooks)
        .onChange((value) => void this.plugin.updateSettings((settings) => {
          settings.syncAllBooks = value;
        })));

    new Setting(containerEl)
      .setName("只同步有划线 / 有想法的书")
      .setDesc("开启后会跳过没有可导出个人内容的书籍。")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.onlySyncBooksWithNotes)
        .onChange((value) => void this.plugin.updateSettings((settings) => {
          settings.onlySyncBooksWithNotes = value;
        })));

    new Setting(containerEl)
      .setName("只同步阅读进度大于 0% 的书籍")
      .setDesc("开启后会先读取阅读进度，跳过完全未开始的书，减少无效笔记文件。")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.onlySyncStartedBooks)
        .onChange((value) => void this.plugin.updateSettings((settings) => {
          settings.onlySyncStartedBooks = value;
        })));

    new Setting(containerEl)
      .setName("保留用户手写区域")
      .setDesc("开启后，同步时会保留 %% keep-me %% 和 %% /keep-me %% 之间的内容。")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.preserveKeepBlocks)
        .onChange((value) => void this.plugin.updateSettings((settings) => {
          settings.preserveKeepBlocks = value;
        })));

    new Setting(containerEl)
      .setName("阅读状态")
      .setHeading();

    new Setting(containerEl)
      .setName("未开始阈值")
      .setDesc("阅读进度低于该百分比时显示为“未开始”。默认 2%，例如 1% 会显示为“未开始（1%）”。")
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "0";
        text.inputEl.max = "100";
        text
          .setPlaceholder("2")
          .setValue(String(this.plugin.settings.unreadThreshold))
          .onChange((value) => void this.plugin.updateSettings((settings) => {
            settings.unreadThreshold = normalizePercentSetting(value, 2);
            if (settings.unreadThreshold > settings.finishedThreshold) {
              settings.finishedThreshold = settings.unreadThreshold;
            }
          }));
      });

    new Setting(containerEl)
      .setName("已读完阈值")
      .setDesc("阅读进度高于该百分比时显示为“已读完”。默认 95%，例如 98% 会显示为“已读完（98%）”。")
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "0";
        text.inputEl.max = "100";
        text
          .setPlaceholder("95")
          .setValue(String(this.plugin.settings.finishedThreshold))
          .onChange((value) => void this.plugin.updateSettings((settings) => {
            settings.finishedThreshold = normalizePercentSetting(value, 95);
            if (settings.finishedThreshold < settings.unreadThreshold) {
              settings.unreadThreshold = settings.finishedThreshold;
            }
          }));
      });

    new Setting(containerEl)
      .setName("高级设置")
      .setHeading();

    new Setting(containerEl)
      .setName("书籍文件名模板")
      .setDesc("支持 {{title}}、{{author}}、{{bookId}} 等变量；默认使用书名，重名时自动追加作者或 bookId。")
      .addText((text) => text
        .setPlaceholder("{{title}}")
        .setValue(this.plugin.settings.bookFileNameTemplate)
        .onChange((value) => void this.plugin.updateSettings((settings) => {
          settings.bookFileNameTemplate = value.trim() || "{{title}}";
        })));

    new Setting(containerEl)
      .setName("日期格式")
      .setDesc("支持 YYYY、MM、DD、HH、mm、ss。")
      .addText((text) => text
        .setPlaceholder("YYYY-MM-DD HH:mm")
        .setValue(this.plugin.settings.dateFormat)
        .onChange((value) => void this.plugin.updateSettings((settings) => {
          settings.dateFormat = value.trim() || "YYYY-MM-DD HH:mm";
        })));

    new Setting(containerEl)
      .setName("汇总页排序")
      .setDesc("控制汇总页中阅读状态表格的排序方式。")
      .addDropdown((dropdown) => dropdown
        .addOption("recent", "最近阅读优先")
        .addOption("title", "书名排序")
        .addOption("progress", "阅读进度优先")
        .addOption("notes", "笔记数量优先")
        .setValue(this.plugin.settings.summarySortMode)
        .onChange((value) => void this.plugin.updateSettings((settings) => {
          settings.summarySortMode = value as WeChatReadingPluginSettings["summarySortMode"];
        })));

    new Setting(containerEl)
      .setName("自动添加默认标签")
      .setDesc("开启后，默认模板会在 YAML 中加入 微信读书 和 读书笔记 标签。")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.addDefaultTags)
        .onChange((value) => void this.plugin.updateSettings((settings) => {
          settings.addDefaultTags = value;
        })));

    new Setting(containerEl)
      .setName("写入同步日志文件")
      .setDesc("开启后会在同步目录下生成或更新同步日志 Markdown，方便排查失败原因。")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.writeLogFile)
        .onChange((value) => void this.plugin.updateSettings((settings) => {
          settings.writeLogFile = value;
        })));

    new Setting(containerEl)
      .setName("同步日志文件名")
      .setDesc("默认写入“微信读书同步日志.md”。")
      .addText((text) => text
        .setPlaceholder("微信读书同步日志.md")
        .setValue(this.plugin.settings.logFileName)
        .onChange((value) => void this.plugin.updateSettings((settings) => {
          settings.logFileName = value.trim() || "微信读书同步日志.md";
        })));

    new Setting(containerEl)
      .setName("模板")
      .setDesc("支持变量：{{title}}、{{author}}、{{bookId}}、{{category}}、{{cover}}、{{coverUrl}}、{{progress}}、{{highlightCount}}、{{noteCount}}、{{syncTime}}、{{lastReadTime}}、{{wechatReadingUrl}}、{{highlights}}、{{index}}、{{index0}}。索引支持 {{index + 1}}、{{index - 1}} 这类简单加减法。")
      .setHeading();

    const templateDetails = containerEl.createEl("details", { cls: "wechatreading-settings-details" });
    templateDetails.createEl("summary", { text: "高级模板设置" });
    const templateContainer = templateDetails.createDiv({ cls: "wechatreading-settings-details-content" });
    let templateTextArea: TextAreaComponent | null = null;
    let highlightTemplateTextArea: TextAreaComponent | null = null;
    new Setting(templateContainer)
      .setName("默认模板编辑区")
      .setDesc("修改后会影响后续同步生成的单本书笔记。")
      .addTextArea((textArea) => {
        templateTextArea = textArea;
        textArea
          .setValue(this.plugin.settings.bookTemplate)
          .onChange((value) => void this.plugin.updateSettings((settings) => {
            settings.bookTemplate = value;
          }));
        textArea.inputEl.rows = 18;
        textArea.inputEl.cols = 80;
      });

    new Setting(templateContainer)
      .setName("书摘与想法条目模板")
      .setDesc("控制 {{highlights}} 中每一条书摘的渲染方式。支持 {{index}}、{{index0}}、{{highlightText}}、{{note}}、{{chapter}}、{{createTime}}、{{wechatReadingUrl}}。")
      .addTextArea((textArea) => {
        highlightTemplateTextArea = textArea;
        textArea
          .setValue(this.plugin.settings.highlightTemplate)
          .onChange((value) => void this.plugin.updateSettings((settings) => {
            settings.highlightTemplate = value;
          }));
        textArea.inputEl.rows = 12;
        textArea.inputEl.cols = 80;
      });

    new Setting(templateContainer)
      .setName("校验模板")
      .setDesc("检查书籍模板、书摘模板和文件名模板里的变量与简单表达式是否可正常解析。")
      .addButton((button) => button
        .setButtonText("校验模板")
        .onClick(() => {
          try {
            const validationContext = createTemplateValidationContext(this.plugin.settings);
            const renderedHighlights = renderTemplate(this.plugin.settings.highlightTemplate, validationContext);
            renderTemplate(this.plugin.settings.bookTemplate, {
              ...validationContext,
              highlights: renderedHighlights
            });
            renderTemplate(this.plugin.settings.bookFileNameTemplate || "{{title}}", validationContext);
            new Notice("微信读书：模板校验通过。");
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            new Notice(`微信读书：模板错误，${message}`);
          }
        }));

    new Setting(templateContainer)
      .setName("恢复默认模板")
      .setDesc("会覆盖上方两个模板编辑区，但不会修改已经生成的 Markdown 文件。")
      .addButton((button) => button
        .setButtonText("恢复默认模板")
        .onClick(() => {
          void this.plugin.updateSettings((settings) => {
            settings.bookTemplate = DEFAULT_BOOK_TEMPLATE;
            settings.highlightTemplate = DEFAULT_HIGHLIGHT_TEMPLATE;
          }).then(() => {
            templateTextArea?.setValue(DEFAULT_BOOK_TEMPLATE);
            highlightTemplateTextArea?.setValue(DEFAULT_HIGHLIGHT_TEMPLATE);
            new Notice("微信读书：已恢复默认模板。");
          });
        }));

    new Setting(containerEl)
      .setName("手动操作")
      .setHeading();
    new Setting(containerEl)
      .setName("同步全部笔记")
      .setDesc("读取书架、阅读统计、划线和想法，并生成或更新 Markdown。")
      .addButton((button) => button
        .setButtonText("开始同步")
        .setCta()
        .onClick(() => void this.plugin.syncService.syncAll()));

    new Setting(containerEl)
      .setName("重新生成汇总页")
      .setDesc("只刷新汇总页，不重写单本书笔记。")
      .addButton((button) => button
        .setButtonText("重新生成")
        .onClick(() => void this.plugin.syncService.regenerateSummary()));

    new Setting(containerEl)
      .setName("最近同步结果")
      .setHeading();
    const result = this.plugin.settings.lastSyncResult;
    containerEl.createEl("p", {
      text: result
        ? `${result.success ? "成功" : "失败"}｜${formatDate(result.time, this.plugin.settings.dateFormat)}｜${result.summary}`
        : "暂无同步记录。"
    });

    new Setting(containerEl)
      .setName("同步日志")
      .setHeading();
    let logContainer: HTMLElement | null = null;
    new Setting(containerEl)
      .setName("清空同步日志")
      .setDesc("只清空设置页里的最近日志记录，不删除已经写入仓库的日志文件。")
      .addButton((button) => button
        .setButtonText("清空日志")
        .setDisabled(this.plugin.settings.syncLogs.length === 0)
        .onClick(() => {
          void this.plugin.updateSettings((settings) => {
            settings.syncLogs = [];
          }).then(() => {
            new Notice("微信读书：已清空设置页同步日志。");
            button.setDisabled(true);
            logContainer?.empty();
            logContainer?.createEl("p", { text: "暂无日志。" });
          });
        }));
    logContainer = containerEl.createDiv({ cls: "wechatreading-sync-log" });
    const logs = this.plugin.settings.syncLogs.slice(0, 20);
    if (logs.length === 0) {
      logContainer.createEl("p", { text: "暂无日志。" });
    } else {
      for (const log of logs) {
        logContainer.createEl("div", {
          text: `[${formatDate(log.time, this.plugin.settings.dateFormat)}] ${log.level.toUpperCase()} ${log.message}`
        });
      }
    }

    new Setting(containerEl)
      .setName("危险操作")
      .setHeading();
    const resyncSetting = new Setting(containerEl)
      .setName("清空后重新同步")
      .setDesc("会删除整个同步目录，包括汇总页、书籍笔记、assets 和 keep-me 手写区域，然后从微信读书重新拉取数据。请确认重要内容已经备份。");
    resyncSetting.controlEl.empty();
    const resyncButton = resyncSetting.controlEl.createEl("button", {
      cls: "wechatreading-danger-button",
      text: "清空后重新同步"
    });
    resyncButton.type = "button";
    resyncButton.setAttr("aria-label", "清空后重新同步微信读书笔记");
    let lastTriggeredAt = 0;
    const triggerResync = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      const now = Date.now();
      if (now - lastTriggeredAt < 800) return;
      lastTriggeredAt = now;
      this.plugin.runResyncAll();
    };
    this.plugin.registerDomEvent(resyncButton, "mousedown", triggerResync);
    this.plugin.registerDomEvent(resyncButton, "click", triggerResync);
  }
}

function normalizePercentSetting(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function createTemplateValidationContext(settings: WeChatReadingPluginSettings): Record<string, string | number> {
  return {
    title: "示例书名",
    author: "示例作者",
    bookId: "sample-book-id",
    category: "计算机-数据库",
    cover: "微信读书笔记/assets/sample-book-id.jpg",
    coverUrl: "https://example.com/example-cover.jpg",
    progress: "阅读中（25%）",
    highlightCount: 2,
    noteCount: 1,
    syncTime: formatDate(new Date(), settings.dateFormat),
    lastReadTime: formatDate(new Date(), settings.dateFormat),
    wechatReadingUrl: "weread://reading?bId=sample-book-id",
    highlights: "### ✨ 书摘 1\n\n**高亮：**\n\n> 这是一条示例划线。\n\n**我的想法：**\n\n这是一条示例想法。",
    highlightText: "> 这是一条示例划线。",
    note: "这是一条示例想法。",
    chapter: "第一章 示例章节",
    createTime: formatDate(new Date(), settings.dateFormat),
    defaultTags: settings.addDefaultTags ? "  - 微信读书\n  - 读书笔记" : "",
    index: 1,
    index0: 0
  };
}

function registerWeChatReadingIcons(): void {
  addIcon("wechatreading-book-sync", `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round">
  <path d="M5.2 6.2C6.9 4.65 9.25 3.8 12 3.8c5.05 0 8.7 2.9 8.7 6.9s-3.65 6.9-8.7 6.9c-.8 0-1.58-.07-2.3-.22L5.2 20.2l1.1-4.05c-1.9-1.28-3-3.2-3-5.45 0-1.72.67-3.28 1.9-4.5Z"/>
  <circle cx="9.2" cy="10.7" r="1.05" fill="currentColor" stroke="none"/>
  <circle cx="14.8" cy="10.7" r="1.05" fill="currentColor" stroke="none"/>
</svg>`);
}

function ensureCoverPreviewInTemplate(template: string): string {
  if (template.includes("![[{{cover}}") || template.includes("![]({{cover}}")) return template;
  const coverBlock = "{{#if cover}}![[{{cover}}|180]]\n\n{{/if}}";
  if (template.includes("[打开微信读书]({{wechatReadingUrl}})")) {
    return template.replace("[打开微信读书]({{wechatReadingUrl}})", `${coverBlock}\n[打开微信读书]({{wechatReadingUrl}})`);
  }
  if (template.includes("作者：{{author}}")) {
    return template.replace("作者：{{author}}", `作者：{{author}}\n\n${coverBlock}`);
  }
  return `${template.trimEnd()}\n\n${coverBlock}\n`;
}

function migrateTemplateVariableNames(template: string): string {
  const legacyUrlVariable = ["we", "readUrl"].join("");
  return template.replace(new RegExp(`\\{\\{\\s*${legacyUrlVariable}\\s*\\}\\}`, "g"), "{{wechatReadingUrl}}");
}
