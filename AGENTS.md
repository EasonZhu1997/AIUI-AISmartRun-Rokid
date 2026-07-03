# Agent Manifest — SmartRun

AI 跑步教练（AIUI 眼镜端）。眼镜直连标准 BLE 运动外设（心率/步频/功率/器械），
实时 HUD 显示 + 结合实时数据的 AI 语音教练。

## Identity
- **Name**: SmartRun
- **Version**: 0.1.0
- **Description**: 眼镜端跑步 HUD + 结合实时心率/配速的 AI 语音教练；直连标准蓝牙运动设备。
- **Author**: Eason

## Capabilities
- **Permissions**:
  - bluetooth      # 直连标准 GATT 外设：心率 0x180D / RSC 0x1814 / CSC 0x1816 / 功率 0x1818 / FTMS 0x1826 / 血氧 0x1822
  - accelerometer  # 无蓝牙设备时用眼镜自带 IMU 计步 → 步频/步数/估距
  - microphone     # 语音教练 ASR
  - audio          # 语音教练 TTS 播报
  - network        # LLM / EverMind 教练后端（HTTPS）

## Pages
- `pages/index/index`   入口
- `pages/run_hud/index` 跑步实时 HUD（BLE 心率直连 + 会话聚合）
- `pages/coach/index`   AI 语音教练（唤醒/点按 → ASR → LLM/兜底 → TTS）

## 设计约束（见 .claude/skills/aiui-dev）
- 宽 480px、高 120-380px、黑底、绿色主题 token、无 emoji、卡片式
- 数据刷新只用 setData，事件回调 + 1s 聚合，onUnload/onHide 清理
- BLE connect/startNotifications 要求 InkView 交互态 → 由用户点击触发
