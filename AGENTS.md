# Agent Manifest — AISmartRun

## 平台描述 / Store Description

中文：AISmartRun 是 Rokid 眼镜上的跑步助手。首页显示单眼镜就绪和心率就绪状态；点一下即可开始跑步，开跑后自动接入已记住的标准蓝牙心率设备，眼镜会显示时间、步频、估算距离和配速。跑步中也可以向 AI 教练提问，它会用简短语音给出节奏和安全提醒。首次使用需在设备页完成一次配对授权，之后开跑会自动接入已记住的设备。

English: AISmartRun is a running assistant for Rokid glasses. The home page shows glasses-ready and heart-rate readiness states; start a run with one tap and the run screen automatically connects the remembered standard Bluetooth heart-rate device, showing time, step rate, estimated distance and running pace. During a run, you can ask the AI coach for short voice guidance about rhythm and safety. First-time use requires one pairing authorization on the device page; after that, runs connect the remembered device automatically.

## Identity
- **Name**: AISmartRun
- **Version**: 0.1.0
- **Description**: 中文：Rokid 眼镜跑步助手，一键开跑后自动接入已记住的标准蓝牙心率设备，显示时间、步频、估算距离和配速；接入心率后同屏显示心率，并提供简短 AI 语音建议。 / English: A running assistant for Rokid glasses with one-tap start and automatic remembered heart-rate device connection after the run starts, showing time, step rate, estimated distance and pace; heart rate appears in the same panel, with short AI voice guidance.
- **Author**: Eason

## Capabilities
- **Permissions**:
  - bluetooth      # 连接常见心率手表、心率带和跑步设备
  - accelerometer  # 没有外设时，用眼镜估算步数、步频和距离
  - microphone     # 接收跑步中的语音提问
  - audio          # 播放 AI 教练的语音建议
  - network        # 获取历史跑步记忆，并写入 AI 教练问答记录

### 运行时能力
- `wx storage`：跑前设置、首选设备、实时快照（带时间戳，10 秒过期）
- `LanguageModel`：AI 教练主回答链路（宿主注入，预期官方 DeepSeek 配置）
- `SpeechRecognition`：教练页语音提问
- TTS（`wx.speech.playTTS` 或 Web Speech）：教练回答和主动提示播报
- 语音唤醒（`onVoiceWakeup`）：首页等同开跑，教练页等同开始提问

## Pages
- `pages/index/index`   正式首页
- `pages/run_hud/index` 跑步实时数据页（心率、配速、步频、时间、距离）
- `pages/bluetooth/index` 蓝牙设备页（搜索、记住和清除首选心率设备）
- `pages/settings/index` 跑前配置页（步长、自动心率、语音提示、记忆增强）
- `pages/coach/index`   AI 语音教练（询问配速、心率和节奏）

## 设计约束（见 .claude/skills/aiui-dev）
- 宽 480px、高 120-380px、黑底、单绿色主题 token、无 emoji、卡片式
- Rokid 单绿色硬件不能使用蓝/红/橙等第二色；警告和异常也用绿色透明度、边框粗细表达
- 眼镜卡片内不使用小号说明字；跑步页只保留大号绿色数据和必要状态
- 数据刷新只用 setData，事件回调 + 1s 聚合，onUnload/onHide 清理
- 跑步 HUD 是纯展示卡片，不在卡片内放点击按钮；心率是可选数据源，未接入时显示单眼镜模式，接入后同一面板补充心率
- 息屏/切页（onHide）自动暂停记录，回来（onShow）自动继续，时长与距离口径一致
- 心率 GATT 断连或 8 秒无新数据时静默回退单眼镜模式，跑步不中断
- 配置页独立于跑步 HUD；允许跑前调整基础偏好，默认入口为正式首页，开跑动作仍保持一键
- 蓝牙设备页独立于跑步 HUD；首页只显示就绪状态不建立连接，连接由跑步 HUD 开跑后完成；首选设备只在设备页显式配对时写入
- Rokid 物理 Backspace 必须显式处理：首页退出，设备/设置返回，HUD 跑步中需 3 秒内双击确认（第一次显示“再按一次结束”）后释放资源返回，教练页先取消当前语音轮次
- EverMind 默认由后端配置；AIUI 端只传 `app_id=AISmartRun` 与匿名设备 ID，不携带 EverMind 密钥
