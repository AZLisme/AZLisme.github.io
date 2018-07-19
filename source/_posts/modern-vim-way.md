---
title: 现代化Vim之路
date: 2018-07-19 10:02:27
tags: vim
categories: 技术
---

如何使用Vim 8 来打造现代的Vim开发体验？

持续更新中……

<!-- more -->

## 升级到 Vim 8

### Ubuntu 16.04

```bash
sudo apt install software-properties-common
sudo add-apt-repository ppa:jonathonf/vim
sudo apt update
sudo apt install vim
```
## 使用Vim-Plug管理插件

[Github链接](https://github.com/junegunn/vim-plug)

安装脚本：

```bash
curl -fLo ~/.vim/autoload/plug.vim --create-dirs \
https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim
```
