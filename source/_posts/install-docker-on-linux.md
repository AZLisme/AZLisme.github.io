---
title: 在Linux上安装Docker
date: 2017-04-13 14:15:52
tags: Linux
categories:
  - 技术
---
通常在使用一个虚拟机后我们会在虚拟机上安装Docker，针对不同的Linux发行版安装的方式略有不同
<!-- more -->
## Ubuntu 16.04

```shell
apt update
apt install apt-transport-https ca-certificates
apt-key adv --keyserver hkp://ha.pool.sks-keyservers.net:80 --recv-keys 58118E89F3A912897C070ADBF76221572C52609D
echo "deb https://apt.dockerproject.org/repo ubuntu-xenial main" | sudo tee /etc/apt/sources.list.d/docker.list
apt update
#apt-get install linux-image-extra-$(uname -r) linux-image-extra-virtual
apt-get install docker-engine
```

将会安装好Docker，随后运行

```shell
service docker start
```

即可启动Docker服务。

## Arch Linux

在Arch Linux上安装似乎十分简单，只需要

```shell
pacman -S docker
```

不愧是备受推崇的Linux版本。