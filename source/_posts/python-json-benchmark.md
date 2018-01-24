---
title: Python 中的 Json 模块性能对比
date: 2016-11-27 11:37:41
tags: python
categories:
  - 技术
  - Python
---
Json是开发中经常用到的一种轻量级数据交换格式。我们经常用到的Json模块有`json` `simplejson` `flask.json` `ujson`。他们之间性能有多大差距呢？让我们来做个实验对比。
<!-- more -->
测试项目总共包含四项：

1. 简单Json字符解码
2. 复杂Json字符解码
3. 简单Json对象编码
4. 复杂Json对象编码

测试环境：Python 3.5.2  macOS 10.12.1 RMBP 13 Early 2015

测试代码开源于[Github](https://github.com/AZLisme/python-benchmark/blob/master/json-benchmark.py)

通过运行测试，我们得到了以下数据(各执行10万次)：

|            | simple_load   | complex_load  | simple_dump   | complex_dump   |
| ---------- | ------------- | ------------- | ------------- | -------------- |
| json       | 0.36s | 3.50s | 0.53s | 5.72s  |
| simplejson | 0.44s | 3.37s | 0.71s | 8.41s  |
| flask.json | 5.80s | 4.37s | 1.83s | 13.55s |
| ujson      | 0.08s | 2.60s | 0.08s | 2.66s  |

可以看出，`ujson`的性能最佳，`json`和`simplejson`的性能较为接近，`flask.json`的性能则比较落后了

结论：推荐使用`ujson`模块。
