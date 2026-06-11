# Wechat Reading

[![GitHub](https://img.shields.io/badge/GitHub-EZDevEr%2Fobsidian--wechatreading--highlights--sync-181717?logo=github)](https://github.com/EZDevEr/obsidian-wechatreading-highlights-sync)

Sync your WeChat Reading shelf, highlights, notes, reviews, reading progress, reading time, and reading statistics into local Markdown notes.

Wechat Reading syncs data from WeChat Reading, a Chinese reading app, so this plugin's usage guide is primarily written in Chinese.

> Privacy first: this plugin runs locally, stores your API Key only in your local plugin settings, and does not collect analytics or upload your notes to third-party services.

## 🌿 简介

Wechat Reading 是一款面向中文用户的阅读笔记整理插件。它可以把你的微信读书书架、划线、想法、书评、阅读进度和阅读统计同步为本地 Markdown 文件，并尽量保留你在笔记里手写的总结与感悟。

## ✨ 主要功能

- 📚 同步微信读书电子书书架、划线、想法、书评和阅读进度。
- 📊 生成 `微信读书汇总.md`，按 `阅读中`、`未开始`、`已读完` 分组展示。
- 📝 为每本书生成独立 Markdown 笔记，并按主分类放入子文件夹。
- 🖼️ 下载图书封面到本地 `assets/`，在正文中直接预览。
- 🧷 保留 `%% keep-me %%` 与 `%% /keep-me %%` 之间的用户手写内容。
- ⚡ 支持增量同步、清空后重新同步、同步日志、模板预览和模板校验。
- 🎛️ 支持自定义同步目录、汇总页文件名、书籍文件名模板、单书模板和书摘模板。

## 📦 安装

### 🧩 从社区插件安装

插件通过审核并收录后，可以在插件市场搜索：

```text
Wechat Reading
```

### 🛠️ 手动安装

1. 打开 [GitHub Releases](https://github.com/EZDevEr/obsidian-wechatreading-highlights-sync/releases)。
2. 下载最新版本里的 `main.js` 和 `manifest.json`。
3. 在你的仓库中创建目录：

```text
.obsidian/plugins/wechatreading-highlights/
```

4. 把 `main.js` 和 `manifest.json` 放入该目录。
5. 重启应用。
6. 在“设置 → 第三方插件”中启用 `Wechat Reading`。

## 🔑 获取微信读书 API Key

API Key 可以在微信读书 App 内获取：

1. 打开微信读书 App。
2. 点击右下角“我”。
3. 点击右上角设置按钮。
4. 在设置页面找到“微信读书 Skill”。
5. 进入后点击“获取 API Key”。
6. 复制以 `wrk-` 开头的 API Key，回到插件设置页填写。

❗️请妥善保管 API Key。

## ⚙️ 配置建议

进入：

```text
设置 → 第三方插件 → Wechat Reading
```

推荐第一次使用时按这个顺序配置：

1. 填写“微信读书 API Key”，点击“测试连接”。
2. 确认同步目录，默认 `微信读书笔记`。
3. 确认汇总页文件名，默认 `微信读书汇总.md`。
4. 先保持自动同步关闭，手动同步一次确认结果（推荐关闭自动同步，使用每次手动触发）。
5. 按需要调整筛选条件、阅读状态阈值和模板。

常用设置：

| 设置项 | 默认值 | 说明 |
|---|---:|---|
| 同步目录 | `微信读书笔记` | 汇总页、书籍笔记、封面和日志都会写到这里。 |
| 汇总页文件名 | `微信读书汇总.md` | 可以改成你喜欢的文件名。 |
| 自动同步 | 关闭 | 为避免频繁请求，建议优先手动同步。 |
| 只同步阅读进度大于 0% 的书籍 | 开启 | 跳过完全未开始阅读的书。 |
| 保留用户手写区域 | 开启 | 保留 keep-me 标记之间的内容。 |
| 写入同步日志文件 | 开启 | 生成 `微信读书同步日志.md`，方便排查问题。 |

## 🔄 如何同步

你可以通过三种方式触发同步：

- ⚙️ 设置页按钮
- 🔘 左侧 Ribbon 图标（手机端在主页面右下角菜单按钮里，点击‘同步微信读书笔记’）
- ⌘ 命令面板

命令面板支持：

| 命令 | 用途 |
|---|---|
| 微信读书：同步全部笔记 | 增量同步所有符合条件的书籍。 |
| 微信读书：同步当前书籍 | 根据当前打开的笔记同步对应书籍。 |
| 微信读书：重新生成汇总页 | 只刷新汇总页。 |
| 微信读书：清空后重新同步全部笔记 | 删除已生成内容后重新同步。 |
| 微信读书：打开设置 | 打开插件设置页。 |
| 微信读书：测试 API Key | 检查 API Key 是否可用。 |

“清空后重新同步”会删除同步目录下之前生成的汇总页、书籍笔记和 `assets/`，再从微信读书重新生成。调整筛选条件后，如果旧文件残留，可以使用这个功能。

## 🗂️ 生成的文件结构

默认结构如下：

```text
微信读书笔记/
├── 微信读书汇总.md
├── 计算机/
│   ├── 书名 A.md
│   └── 书名 B.md
├── 经济理财/
│   └── 书名 C.md
├── 未分类/
│   └── 书名 D.md
└── assets/
    └── bookId.jpg
```

没有未分类书籍时，不会创建 `未分类` 文件夹。

## 📝 单本书笔记

默认笔记包含：

- 🧾 Dataview 友好的 YAML frontmatter。
- 🖼️ 本地封面预览。
- 📊 阅读进度、划线数量、想法数量和最近阅读时间。
- ✨ 书摘与想法。
- 🧠 用户手写总结区域。

阅读进度会按阈值显示（默认：2%进度以下为未开始，95%以上为已读完）：

```text
未开始（1%）
阅读中（25%）
已读完（98%）
```

请把自己的总结写在：

```markdown
%% keep-me %%
这里写你的总结、感悟、行动项和关联知识。
%% /keep-me %%
```

后续重新同步时，插件会保留这一区域。

## 🧩 模板变量

单书模板支持：

```text
{{title}}
{{author}}
{{bookId}}
{{category}}
{{cover}}
{{coverUrl}}
{{progress}}
{{highlightCount}}
{{noteCount}}
{{syncTime}}
{{lastReadTime}}
{{wechatReadingUrl}}
{{highlights}}
{{defaultTags}}
{{index}}
{{index0}}
```

书摘条目模板支持：

```text
{{index}}
{{index0}}
{{highlightText}}
{{note}}
{{chapter}}
{{createTime}}
{{wechatReadingUrl}}
```

索引规则：

- `{{index}}` 从 1 开始。
- `{{index0}}` 从 0 开始。
- 支持简单加减法，例如 `{{index + 1}}`、`{{index - 1}}`。

条件块示例：

```markdown
{{#if note}}
**我的想法：**

{{note}}
{{/if}}
```

## 🔒 隐私说明

- 🏠 插件只在本地运行。
- 🔐 API Key 存储在本地插件配置中。
- 📉 插件不会收集分析数据。
- 🚫 插件不会主动上传你的笔记到第三方服务。
- 🔄 插件只调用同步所需的微信读书相关接口。
- 🧹 你可以随时在设置页删除 API Key。
- 🙈 不要把包含 API Key 的配置文件提交到公开仓库。

## ❓ 常见问题

### 🔑 API Key 无效怎么办？

先确认 API Key 以 `wrk-` 开头，然后在设置页点击“测试连接”。如果仍然失败，请重新在微信读书 App 中获取 API Key。

### 🎧 为什么有声书没有生成单本笔记？

当前版本主要同步电子书，因为划线、想法和阅读进度接口使用电子书 `bookId`。有声书或专辑可能会计入汇总页书架统计，但不会生成完整单本笔记。

### 🧯 同步失败会破坏已有 Markdown 吗？

不会。接口失败时插件会停止或跳过失败书籍，并保留本地已有文件。

例外是你主动点击“清空后重新同步”：这个操作会删除同步目录下已有文件后再重建。

## 🙏 参考与致谢

产品体验参考了 [Apple Books - Import Highlights](https://github.com/bandantonio/obsidian-apple-books-highlights-plugin)，尤其是“导入读书划线到笔记”和“保留用户手写区域”的使用场景。

Inspired by [Apple Books - Import Highlights](https://github.com/bandantonio/obsidian-apple-books-highlights-plugin), an MIT licensed plugin for importing Apple Books highlights.

## 📄 License

MIT License.

## ⚠️ 免责声明

本项目不是微信读书官方出品。请遵守微信读书相关服务条款，仅同步和整理你自己的阅读数据。
