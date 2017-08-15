---
title: 在Mac上录制屏幕录像
date: 2017-04-28 11:27:55
tags: macOS, Hacks
---

TODO

QuickTime屏幕录像

生成GIF

基于FFMPEG的转换MOV2GIF

[FFMPEG技术细节](http://blog.pkh.me/p/21-high-quality-gif-with-ffmpeg.html)

生成调色板文件，生成GIF

```bash
palette="palette.png"

filters="fps=15,scale=320:-1:flags=lanczos"

ffmpeg -v warning -i $1 -vf "$filters,palettegen" -y $palette
ffmpeg -v warning -i $1 -i $palette -lavfi "$filters [x]; [x][1:v] paletteuse" -y $2
```