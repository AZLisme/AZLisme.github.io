# 小小绘本馆 · GitHub Pages 试验

页面与书目 JSON 由当前 GitHub Pages 站点提供；图片与英文 MP3 使用广州 COS 存储桶 pbook-1252924514 的公开直链。未使用 CDN。

入口为 /pbook/。HTML/CSS/JS 和 JSON 都在此目录中；不修改其他博客页面或域名配置。跨域图片通过 img，音频通过 audio 加载，未使用 fetch 读取 COS 数据，因此不依赖 JSON CORS。

COS 新桶的默认域名响应可能带有 Content-Disposition: attachment，浏览器顶层打开资源会下载；在页面内嵌图片/音频的行为需在真实 iPad Safari 验证。若出现加载问题，后续改用境外 CDN 或迁移资源。

共 18 个阅读单元，其中 15 个故事页含英文音频，封面与科普附页不配音。阅读进度保存在当前站点的浏览器本地。
