# 小小绘本馆 · GitHub Pages 试验

页面与书目 JSON 由当前 GitHub Pages 站点提供；图片与英文 MP3 使用广州 COS 存储桶 pbook-1252924514 的公开直链。未使用 CDN。

入口为 /pbook/。HTML/CSS/JS 和 JSON 都在此目录中；不修改其他博客页面或域名配置。跨域图片通过 img，音频通过 audio 加载，未使用 fetch 读取 COS 数据，因此不依赖 JSON CORS。

COS 新桶的默认域名响应可能带有 Content-Disposition: attachment，浏览器顶层打开资源会下载；在页面内嵌图片/音频的行为需在真实 iPad Safari 验证。若出现加载问题，后续改用境外 CDN 或迁移资源。

共 18 个阅读单元，其中 15 个故事页含英文音频，封面与科普附页不配音。阅读进度保存在当前站点的浏览器本地。

## 第三版：自动播放与逐句听

新增自动模式：点击自动后，从当前或后续第一个故事页开始，使用连续音轨按时间轴自动翻页。封面和科普页跳过，最后一个故事页结束后停止。点击逐句按钮退出自动模式，只播指定句子。手动翻页或回书架停止播放。

15 个故事页重制为 Kokoro-82M / af_heart 美式英文配音，speed=0.9；共有 92 个句子或对白片段。每页点“逐句听”可展开本页句子按钮；播放时高亮对应句子。片段由合成时采样长度定位，不使用估算时间轴。

数据格式扩展为 schemaVersion 1.1：每页 sentences 包含 id、text、spokenText、start、end，时间相对于 narration.src 的整书音轨；narration.pages 包含各故事页的起止时间。旧 v2 文件保留。

网页元数据在 pbook/books/drop/v3/book.json，音频在 COS books/drop/v3/audio/。页面内音频仍使用直接 audio 播放，不依赖 CORS fetch。Piper 已替换为 Kokoro，本地推理，不将文本发送外部配音服务。

已验证播放控制器的自动翻页、跳过无音频页、终点停止、单句停止、暂停恢复、手动操作中断及播放拒绝回退，并检查全部 MP3 解码和时间轴范围。没有真实 iPad 或人工听审测试。
