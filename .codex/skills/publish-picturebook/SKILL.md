---
name: publish-picturebook
description: 将家长上传的实体绘本照片整理成小小绘本馆的中英数字绘本，生成 Kokoro 英文配音、逐句时间轴和原图点读坐标，校验后上传腾讯云 COS 并更新 GitHub Pages。用于“把这些照片做成绘本”“上架一本书”“按小小绘本流程制作并发布”或修订已有绘本；只做翻译或只看预览时不发布。
---

# 小小绘本上架

按已经验证的格式补充内容，保留现有网站设计和阅读行为。读取 [站点配置](references/site.md) 和 [内容格式](references/format.md)；不要依赖旧对话中的文件顺序、临时目录、密钥或部署状态。

## 1. 获取最新状态与素材

- 通过 GitHub 连接读取目标仓库当前分支、提交、`pbook/catalog.json`；已有书籍修订同时读取其当前 manifest。保留书籍 ID、未更换页面 ID 和所有其他书目。
- 用 Library 技能获取上传照片及已有文本。不要凭聊天中的旧文件名猜顺序。为照片生成缩略图对照表，逐图识别封面、故事跨页、科普附页、重复页和模糊页。
- 整个跨页保留为一个阅读单元；只对原图裁切背景、旋转，不重绘、不做推测性文字修复。裁切前后检查整段文字、图边及书脊是否被截断。
- 采用有意义且安全的英文 `book.id`；修订保留原 ID，新版本使用唯一 revision。对照当前书目防止同一本重复上架。

## 2. 生成可校对 source.json

按格式参考写 `source.json`。逐页整理正文、对白、中文译文及 sentences；不要按照片文件名代替视觉判断，也不要将一个连续句子按换行硬拆。

- 故事页读正文和对白，使用原文；用 `spokenText` 记录必要的拟声词发音规范化，不能偷偷改写正文。
- 科普附页保留图和完整中文，`kind: reference`，明确不配音。封面同样不配音。
- 为每个故事片段标注 `anchor: {x,y}`，相对于裁切后图片的 0–1 坐标。放在对应文字/对白旁的空白处，不覆盖字、脸或重要插画。跨页一个句子可选择正文起始处的按钮。
- 遇到疑似缺页、无法辨识的关键文字、裁切丢字，写入 `quality.unresolved`，指出照片与问题并请家长补充；继续处理其他明确页面。未解决问题不得发布。
- 最终快速校对页序、图片裁切、对白顺序、重点科学术语和点读位置。制作带编号的缩略图进行视觉 QA。5 分钟是家长校对目标，不作无依据的完成时间保证。

执行：

```bash
python3 scripts/pipeline.py prepare --source /absolute/source.json --output /absolute/book-package --revision UNIQUE_REVISION
```

## 3. 本地配音与时间轴

读取 [配音与依赖](references/narration.md)。默认 Kokoro `af_heart`、`en-us`、speed 0.9；沿用已验证声音。模型下载仅获取公开文件，合成在本地执行。不要静默切换到 Piper、浏览器 TTS 或外部配音网站。

```bash
python3 scripts/pipeline.py narrate --book /absolute/book-package --model /absolute/kokoro-v1.0.onnx --voices /absolute/voices-v1.0.bin
python3 scripts/pipeline.py validate --book /absolute/book-package --publish
```

逐句生成并按采样数记录 start/end，再拼成整书 `audio/story.mp3`，生成逐页 MP3。自动模式使用整书音轨，句子按钮使用整书时间段。逐句检查英文完整性、时长、无空音频、全部 MP3 可解码以及点读坐标范围。发音质量不能仅凭文件存在判断；抽听或明确说明未人工听审。

## 4. 预览与发布

用户要求上架、发布，或调用本技能执行完整制作发布流程时，校验完成即在约定站点发布，不增加重复确认。用户明确仅预览/草稿时，停在本地包和预览。

- 运行 `publish-plan`，输入刚读取的最新 catalog；生成云资源计划、同源 Pages manifest 和合并后的书目。
- 用 `upload_assets.py` 上传并回读验证新版资源。只使用当前会话可信凭据或安全配置；不保存密钥到技能、source.json、日志、Git 或公开网页。凭据缺失时保留已完成绘本包，明确缺少什么。
- 上传完成后，用 GitHub 工具以当前 tree 为 base，提交且仅提交本书的新 manifest 与合并后的 catalog。使用原 HEAD 为 parent 和 expected_sha，force=false。发布中断时旧书目仍指向完整的旧版本。
- 若 HEAD 已变化，重新读取当前目录与书目，再合并；不要强制覆盖，不删除其他绘本、不更改个人博客或网站设计。
- 保留旧资源供回退，不覆盖已发布的版本路径。书架已有同名书籍的更新须通过稳定 ID 修订。
- 等 Pages 发布后，以实际 GET 检查书目包含新书、manifest 可读，以及图片/音轨可访问；支持 Range 的音轨需要检查 206 响应。HTTP 200 不等于 HTML 能在浏览器呈现，COS 默认 HTML 域名会触发下载。
- 可访问浏览器能力存在时检验真实阅读交互；没有时明确实机限制，不虚构浏览器/听审结果。

## 5. 交付

输出实际阅读地址、书名、阅读单元数、配音片段数和需要注意的具体问题。按 Library 技能保存标准成品 ZIP，原始照片备份仍由家长维护。只提供真实已生成/已上传/已验证的结果。

技能的 canonical source 在项目仓库 `.codex/skills/publish-picturebook/`。后续修改脚本或规则后测试，并只提交该技能目录再推送，保持与当前技能副本一致。
