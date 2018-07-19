---
title: macOS 编译带有OpenSSL的程序
date: 2018-07-17 13:31:27
tags:
  - macOS
  - OpenSSL
categories:
  - 技术
---

在macOS上编译带有OpenSSL的程序时，往往可能会遇到报错找不到openssl头文件的错误。

<!-- more -->

这是因为Apple为了推广自己的加密标准而隐藏了系统中OpenSSL的头文件，这个时候就需要手动设置头文件地址。可以使用如下命令来设置环境变量，指定系统中OpenSSL头文件的位置。


```bash
export LDFLAGS="-L/usr/local/opt/openssl/lib"
export CPPFLAGS="-I/usr/local/opt/openssl/include"
```
