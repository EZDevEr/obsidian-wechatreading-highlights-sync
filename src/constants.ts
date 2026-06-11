export const PLUGIN_NAME = "微信读书笔记同步";

export const WECHAT_READING_GATEWAY_URL = "https://i.weread.qq.com/api/agent/gateway";

export const WECHAT_READING_SKILL_VERSION = "1.0.3";

export const DEFAULT_SYNC_FOLDER = "微信读书笔记";

export const OLD_DEFAULT_SUMMARY_FILE_NAME = "00 微信读书汇总.md";

export const DEFAULT_SUMMARY_FILE_NAME = "微信读书汇总.md";

export const DEFAULT_BOOK_FILE_NAME_TEMPLATE = "{{title}}";

export const DEFAULT_HIGHLIGHT_TEMPLATE = `---

### ✨ 书摘 {{index}}

{{#if highlightText}}**高亮：**

{{highlightText}}

{{/if}}{{#if note}}**我的想法：**

{{note}}

{{/if}}**章节：** {{chapter}}

**时间：** {{createTime}}

[打开位置]({{wechatReadingUrl}})`;

export const KEEP_START = "%% keep-me %%";

export const KEEP_END = "%% /keep-me %%";

export const DEFAULT_BOOK_TEMPLATE = `---
书名: "{{title}}"
作者: "{{author}}"
来源: "微信读书"
bookId: "{{bookId}}"
分类: "{{category}}"
封面: "{{cover}}"
封面链接: "{{coverUrl}}"
阅读进度: "{{progress}}"
划线数量: {{highlightCount}}
想法数量: {{noteCount}}
{{#if defaultTags}}标签:
{{defaultTags}}
{{/if}}
最后同步: "{{syncTime}}"
---

# 📚 {{title}}

作者：{{author}}

{{#if cover}}![[{{cover}}|180]]

{{/if}}
[打开微信读书]({{wechatReadingUrl}})

## 📝 阅读总结

%% keep-me %%
在这里记录你的总结、感悟、行动项和关联知识。
%% /keep-me %%

---

## 📊 阅读信息

| 项目 | 内容 |
|---|---|
| 阅读进度 | {{progress}} |
| 划线数量 | {{highlightCount}} |
| 想法数量 | {{noteCount}} |
| 最近阅读 | {{lastReadTime}} |

---

## 📌 书摘与想法

{{highlights}}
`;
