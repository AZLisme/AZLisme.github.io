---
title: MarkIndex - 标题索引小工具
date: 2017-04-28 15:37:24
tags: 
  - Github
  - Utils
categories:
  - 技术
  - Projects
---

今天在写一个巨大的Markdown文件的时候，需要给标题添加一个数字序号，方便组织整理，但纯粹用手打效率太低了一点，于是便写一个小工具来自动为Markdown文件的标题按照层级添加索引，日后还可以加上自动生成Table of content的小功能。

<!-- more -->

源代码查看这里[Github地址](https://github.com/AZLisme/markindex)

使用方法很简单，这是原始的Markdown文件:

![origin](https://github.com/AZLisme/markindex/raw/master/img/before.png)

然后对它执行:

```bash
python markindex.py example.md
```

随后脚本生成了一个新的Markdown文件（为了不覆盖原文件）：example-1.md，它的内容是：

![after](https://github.com/AZLisme/markindex/raw/master/img/after.png)

脚本自动为您的Markdown文件的标题添加了数字索引，按照1.1, 1.1.1这样的格式。

注意此处一级标题被忽略了，因为他们通常是总标题，无须添加索引。

您可以使用-h, --help选项来查看更多操作：

```bash
usage: markindex.py [-h] [-r] [-f] markdown [markdown ...]

Add Index to markdown titles.

positional arguments:
  markdown     markdown files to modify

optional arguments:
  -h, --help   show this help message and exit
  -r, --rm     remove index, instead of adding it.
  -f, --force  cover the original file, use with caution.
```

还可以添加若干小功能，这就之后再说吧