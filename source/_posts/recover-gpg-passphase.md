---
title: 找回忘记的GPG密码
date: 2017-04-12 11:31:33
tags: Hacks
categories:
  - 技术
---
最近打算从远程服务器传输一些私密文件回来，就用GPG给数据包加密然后百度盘下载回来。到了解密的时候，居然发现自己忘记了GPG私钥的密码，十几个G的数据可能就白白下载了。不甘心，于是打算自己黑掉自己的GPG密码。
<!-- more -->
### 什么是GPG？

> **GNU Privacy Guard**（**GnuPG**或**GPG**）是一种[加密](https://zh.wikipedia.org/wiki/%E5%8A%A0%E5%AF%86)软件，它是[PGP](https://zh.wikipedia.org/wiki/PGP)加密软件的满足[GPL](https://zh.wikipedia.org/wiki/GNU_General_Public_License)的替代物。GnuPG依照由[IETF](https://zh.wikipedia.org/wiki/%E4%BA%92%E8%81%94%E7%BD%91%E5%B7%A5%E7%A8%8B%E5%B7%A5%E4%BD%9C%E5%B0%8F%E7%BB%84)订定的[OpenPGP](https://zh.wikipedia.org/wiki/OpenPGP)技术标准设计[[2\]](https://zh.wikipedia.org/zh-hans/GnuPG#cite_note-RFC4880-2)。GnuPG用于加密、[数位签章](https://zh.wikipedia.org/wiki/%E6%95%B8%E4%BD%8D%E7%B0%BD%E7%AB%A0)及产生非对称匙对的软件。

以上是Wikipedia对于GPG的定义。

GPG实际上就是自由软件基金会开源的一款加密软件，它采用非对称加密，封装了加密、解密、签名、验证等等一系列功能。

### 我们需要破解什么？

GPG帮助我管理了我的个人私钥，并且用一个密码将私钥保护了起来。没有这个密码，我就无法使用私钥，没有私钥，我就没办法解密我的数据。

所以我就是要破解保护私钥的密码。

### JohnTheRipper

[JohnTheRipper](https://github.com/magnumripper/JohnTheRipper)是我使用的主要工具，它是一个老牌的密码破解工具。除了使用John 的本体，还需要一个它附带的小工具`gpg2john`，将gpg的加密数据转换为John可以理解的哈希文件。

在上面的Github仓库中可以找到详细的安装说明，跟着相关步骤编译、安装好JohnTheRipper以及gpg2john。

### 开始破解

接下来是破解的详细流程， 我会尽量做好每一步的说明，并且假设执行文件`john`以及`gpg2john`在PATH里面。如果出现找不到命令，你可以考虑将其加入PATH，或者将命令替换成完整的路径。

首先是gpg的密钥数据库，它位于

```
~/.gnupg/secring.gpg
```

用`gpg2john`把它转换成`john`能理解的hash值，执行

```
gpg2john ~/.gnupg/secring.gpg > hash
```

当前目录下就多出了一个名为`hash`的文件，接下来就可以使用`john`来破解这个文件了：

```
john hash
```

就这么简单，但是效率不够。

在默认参数下，`john`仅仅只会去尝试一些比较弱智的密码组合。在密码设置的非常简单的时候也许可以有效，但是在密码稍微复杂点情况下，就很难尝试出正确的密码了。

我们接下来需要做的就是生成一个密码字典，让`john`去努力的一个个尝试。

### 密码字典

根据回忆写出可能的密码组合，然后使用Python脚本给它们分别加上前缀后缀，或者再次组合。

```python
import itertools
possible_words = [
    "password", "abcefg", "123"
]
for i in itertools.permutations(possible_words):
    print(i)
```

根据具体的情况，编写出相应的变形脚本，生成出能够覆盖你常用密码以及其可能变种的字典，保存到`wordlist.txt`中。这里我生成了一个300词左右的字典。

### 再次破解

```bash
john --wordlist=wordlist.txt hash
```

很快的，John就在字典中找到了正确的密码！

这一步最需要耐心与思考，好好回忆自己常用的密码体系与规则，将可能使用的变种（大写小写，前缀后缀字符）都生成出来，一定能够尝试出正确的密码。

### 纯粹的暴力破解的可能性

在我的Early 2015 13' MBP上跑hash的速度大约是100条/s。考虑在有显卡加速的台式机上运行，取一个平均值，大约能达到5000条/s的速度。

基于这个基础，我们来估算：

1. 纯数字密码10位以内，需要100亿次尝试，需要跑555.6小时，也就是23天左右
2. 大写加小写与数字的8位密码，大约需要200万亿次尝试，需要505416.9天，也就是1384年。

可见暴力破解不可取，还是要好好的回忆密码字典。