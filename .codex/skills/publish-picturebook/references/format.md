# source.json 和网站格式

source.json 使用 UTF-8，不包含密钥。例：

```json
{
  "id": "ocean-adventure",
  "title": "海洋冒险",
  "subtitle": "和海洋动物一起探索",
  "author": "Original Author",
  "coverPageId": "cover",
  "quality": {"unresolved": []},
  "pages": [
    {"id":"cover","title":"封面","kind":"cover","photo":"photos/01.jpg","text":{"en":"Ocean Adventure","zh":"海洋冒险"}},
    {"id":"p01","title":"认识海龟","kind":"story","photo":"photos/02.jpg","crop":[0,0,1,1],"rotate":0,
     "text":{"en":"This is a turtle. Hello!","zh":"这是一只海龟。你好！"},
     "sentences":[
       {"id":"p01-s01","text":"This is a turtle.","spokenText":"This is a turtle.","anchor":{"x":0.2,"y":0.15}},
       {"id":"p01-s02","text":"Hello!","anchor":{"x":0.7,"y":0.5}}
     ]}
  ]
}
```

photo 相对于 source.json 所在目录，也允许明确提供的本地绝对路径。crop 是对 EXIF 纠正和 rotate 完成后图片的归一化矩形 `[left,top,right,bottom]`；rotate 为顺时针角度 0/90/180/270。anchor 以裁切后的成品图为基准，不是原照片坐标。

- book.id、revision、page.id 和 sentence.id 只使用字母、数字、连字符、下划线，不能含路径符号。
- 同一本书保留 book.id；新增版本不得复用已发布 revision。页面 ID 不按调整后的页序重新编号。
- 仅 story 页配音；cover/reference 明确 omitted。各 story 页至少一个 sentence，拼接 sentence.text 必须与 text.en 一致（忽略重复空白）。
- 无法确定的内容列入 quality.unresolved，publish 检查阻止上线。
- 图片路径为 images/<page-id>.jpg；音频为 audio/<page-id>.mp3、audio/story.mp3。
- narration.pages 是整书音轨的页级 start/end；sentences 的 start/end 相对于同一整书音轨，以秒表示。
- 当前阅读器按 kind 和 audio.status 判断行为。不要为科普附页生成音频或制造空文件。

成品 manifest 使用 schemaVersion 1.2，text.zh 在中文弹层显示。publish-plan 将图片、逐页音频、整书音轨和封面改为 COS 绝对地址，manifest 继续保留在 GitHub Pages 同源目录。书目保留所有旧书、推荐顺序；新书默认追加，不冒充家长推荐。
