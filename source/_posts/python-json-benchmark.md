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
| json       | 0.3685871550s | 3.5037089190s | 0.5351724010s | 5.7298631030s  |
| simplejson | 0.4454641150s | 3.3724430370s | 0.7197391490s | 8.4193971230s  |
| flask.json | 5.8086269110s | 4.3750356400s | 1.8348164410s | 13.5542005590s |
| ujson      | 0.0840294960s | 2.6091285940s | 0.0891953310s | 2.6698443140s  |

可以看出，`ujson`的性能最佳，`json`和`simplejson`的性能较为接近，`flask.json`的性能则比较落后了



结论：推荐使用`ujson`模块。