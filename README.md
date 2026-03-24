# test-voice

豆包语音问答 Demo - 纯前端浏览器版本 + 本地代理，支持流式语音识别 + AI 回答。专为面试场景设计，边说边识别，说完立即得到回答。

## 功能

- 🎤 浏览器直接录音
- 🗣️ **火山引擎原生流式语音识别** - 边录边识别，实时出结果
- ⚡ 低延迟，面试官说完问题就得到完整文字
- 🤖 豆包大模型流式回答，边输出边显示
- 🔒 支持环境变量配置 API Key，不暴露在前端
- 🚀 内置本地代理解决跨域，一键启动

## 使用方法

### 1. 安装依赖
```bash
npm install
```

### 2. 配置

**方式一：环境变量（推荐，生产部署）**
```bash
# Linux/macOS
DOUBAN_API_KEY=your-api-key \
ASR_MODEL_ID=your-appid \
CHAT_MODEL_ID=your-chat-model-endpoint \
npm start

# Windows CMD
set DOUBAN_API_KEY=your-api-key
set ASR_MODEL_ID=your-appid
set CHAT_MODEL_ID=your-chat-model-endpoint
npm start

# Windows PowerShell
$env:DOUBAN_API_KEY="your-api-key"
$env:ASR_MODEL_ID="your-appid"
$env:CHAT_MODEL_ID="your-chat-model-endpoint"
npm start
```

**方式二：配置文件**
创建 `config.local.js`:
```javascript
const CONFIG = {
    DOUBAN_API_KEY: 'your-api-key',
    ASR_MODEL_ID: 'your-asr-appid',
    CHAT_MODEL_ID: 'your-chat-model-endpoint',
};
```

### 3. 启动本地代理服务器
```bash
npm start
```

### 4. 打开浏览器访问
```
http://localhost:3000
```

**使用步骤：**
1. 点击按钮开始录音
2. 说出你的问题（面试官说话）
3. 再次点击按钮停止录音
4. 已经识别出完整文字，同时AI开始流式回答
5. 坐等答案 ✌️

## 关于环境变量

环境变量 | 说明 | 是否必须
---|---|---
`DOUBAN_API_KEY` | 你的火山 API Key / Token | 可选（配置文件配置则不需要）
`ASR_MODEL_ID` | 语音识别 AppID / 接入点 | 可选（默认从 API Key 提取）
`CHAT_MODEL_ID` | 对话模型接入点 ID | 可选（默认使用配置文件）
`PORT` | 本地服务端口，默认 `3000` | 可选

## 获取 API Key 和接入点

1. 访问 [火山引擎控制台](https://console.volcengine.com/)
2. 开通语音识别（ASR）能力，获取 AppID / Token
3. 在 [方舟](https://console.volcengine.com/ark/) 创建对话模型接入点
4. 按上面方式配置到环境变量或 `config.local.js`

## 文件结构

```
test-voice/
├── index.html       # 主页面 UI
├── app.js           # 前端逻辑：录音 + 流式识别 + UI
├── server.js        # 本地代理服务器 + WebSocket 代理（解决跨域）
├── package.json     # Node.js 依赖配置
├── config.local.js  # 本地配置（存放 API Key，已加入 .gitignore）
├── .gitignore       # Git 忽略规则
├── LICENSE          # MIT License
└── README.md        # 说明文档
```

## 调试

页面底部有完整的调试日志，如果遇到问题，可以查看日志了解详细错误信息。日志同时输出到浏览器控制台。

## 技术栈

- 前端：原生 JavaScript + MediaRecorder + Web Audio API
- 流式识别：火山引擎流式ASR WebSocket API
- 对话：豆包方舟 OpenAI 兼容格式 API (SSE 流式输出)
- 后端：Node.js + ws + http-proxy-middleware

## License

MIT
