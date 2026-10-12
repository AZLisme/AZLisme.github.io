# 配音与依赖

已用于当前站点：kokoro-onnx 0.6.1，Kokoro-82M v1.0，voice af_heart，lang en-us，speed 0.9。它是本地神经配音，不需要将绘本文字交给外部网站。

在隔离环境安装 Pillow、numpy、soundfile、onnxruntime、kokoro-onnx==0.6.1、cos-python-sdk-v5。系统需有 ffmpeg 和 ffprobe。使用当前 runtime 已提供的依赖，避免修改系统 Python；没有依赖时用 venv 或独立 --target 目录。

公开模型文件（下载不包含私人文字）：

- https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.onnx
- https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin

可重用已有模型，检查文件完整与可加载；不要把大模型放进网站或绘本包。库、模型更新时核对官方接口并先生成小样，不盲目更换声音。

scripts/pipeline.py narrate 采用每句生成、采样数确定边界，句间留 0.32 秒、页间留 0.65 秒，再拼整书音轨并编码 160kbps MP3。正文用原文显示，拟声词可写单独 spokenText；科学术语、人名和过长句须重点试听。

清晰自然是目标，模型名称不能证明实际听感。至少抽查短对白、长句和拟声词；无听审能力时诚实报告。用户指定云配音时，先核实工具/账号权限和已授权的外部接收方，不静默上传私人照片或文字。
