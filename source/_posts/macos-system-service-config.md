---
title: macOS系统服务
date: 2016-08-03 13:03:00
tags: macOS
categories: 技术
---

macOS系统服务实际上是由 launchctl 管理的一批 plist 文件。

当前用户级别的系统服务存储在

    ~/Library/LaunchAgents/

一个典型的系统服务启动项目如下：

<!-- more  -->

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.azlisme.cow</string>
    <key>ProgramArguments</key>
    <array>
      <string>/Users/azlisme/.cow/cow</string>
      <string>-rc=/Users/azlisme/.cow/rc</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
  </dict>
</plist>
```

必要的参数是 `Label` 和 `ProgramArguments`

`Label` 是服务的识别名称

`ProgramArguments` 是程序的启动脚本，如果是Shell程序则直接指定执行文件路径和参数。这里的路径全部采用绝对路径。

`RunAtLoad` 表示是否开机启动。

`KeepAlive` 表示是否让服务保持运行。

编辑完成服务项目之后，使用如下命令加载服务

```bash
launchctl load <Service Name>
```

如果配制正确，那么服务已经在后台运行了。
