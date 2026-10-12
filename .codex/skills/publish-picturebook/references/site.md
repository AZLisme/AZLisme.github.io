# 当前站点

- 入口：https://blog.xuanzeng.me/pbook/
- GitHub：AZLisme/AZLisme.github.io；分支 master；仅 `pbook/` 是绘本网站。
- 书目：pbook/catalog.json。每本书的 manifest：pbook/books/<id>/<revision>/book.json。
- COS：pbook-1252924514；region ap-guangzhou。
- 资源根地址：https://pbook-1252924514.cos.ap-guangzhou.myqcloud.com/
- 图片和音频：books/<id>/<revision>/images/ 与 audio/；匿名读，仅资源公开；不开放写入。
- HTML/CSS/JS 和 JSON 在 Pages 同源；图片及音频用 COS 绝对地址。这避免 JSON CORS 依赖；不要将 HTML 入口切回 COS 默认域名。
- 已验证 DROP 的 Kokoro、整书音轨、逐句重播、图上点读：schemaVersion 1.2。

## 发布步骤

先读取当前 Git HEAD、tree、catalog 与待修订 manifest。执行：

```bash
python3 scripts/pipeline.py publish-plan --book /absolute/book-package --catalog /absolute/current-catalog.json --output /absolute/plan
python3 scripts/upload_assets.py --plan /absolute/plan/upload-plan.json
```

上传凭据通过受保护环境变量 COS_SECRET_ID/COS_SECRET_KEY，或隐藏 stdin JSON（含 id/key）提供。此技能不包含密钥，也不假定此前聊天提供的密钥在新会话仍可用。不能访问可信凭据时说明资源尚未上传，不假称发布成功。

`plan/pages/` 包含相对于仓库根目录的两份文本文件；用 GitHub create_tree 的 base_tree_sha 合并，create_commit 指向当前 HEAD，update_ref 用 expected_sha 与 force=false。JSON 不要包含本机 source 路径或私密信息。每次发布读取线上最新书目。失败回退只修改该书的 manifest 指针。

COS SDK 的 Metadata 键必须包含 `x-cos-meta-` 前缀。默认域名 GET 返回 attachment，并不妨碍已验证的页面内图片/音频使用；不要使用 HEAD 状态推断浏览器顶层 HTML 能展示。浏览器实机检查仍需实际能力。

## 安全凭据的长期接入

推荐以后单独配置受保护的发布环境或 GitHub Actions secrets。仅创建 Skill 不会自动保存云密钥，也不会给新会话新增权限。当前工作模式个人 Skills 注册可能需要单独安装；仓库文件本身是可复用源，不等于已出现在个人 Skills 列表。
