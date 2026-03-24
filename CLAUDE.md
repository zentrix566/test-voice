# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

纯前端豆包语音问答 Demo，使用豆包多模态语音识别识别用户问题，再通过豆包大模型回答。内置本地代理服务器解决跨域问题。

- License: MIT
- Author: zentrix566

## Current Structure

```
.
├── index.html       # 主页面 UI
├── app.js           # 前端逻辑：录音 + API 调用
├── server.js        # 本地代理服务器（解决跨域问题）
├── package.json     # Node.js 依赖配置
├── README.md        # 使用说明
├── config.local.js  # 本地配置（存放 API Key，已加入 .gitignore）
└── LICENSE          # MIT License
```

## Commands

Install dependencies:
```bash
npm install
```

Start local development server (with proxy):
```bash
npm start
```

Then open `http://localhost:3000` in your browser.

For simple static serving without proxy:
```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve .
```

## Code Architecture

### Frontend (`app.js`)

**`VoiceQA` class**: Main controller that handles:
- MediaRecorder API for microphone access and audio recording
- **Streaming speech recognition** via Doubao Ark ASR WebSocket API
  - Chunked audio sends to server while recording
  - Real-time recognition results displayed incrementally
- Question answering via Doubao LLM API after recognition completes
- UI updates for status, recognition results, and answers
- Detailed logging to both page and browser console

**Interaction modes**:
- Click toggle: click to start, click again to stop
- Hold-to-record: mousedown/touchstart to start, mouseup/touchend to stop
- Supports both desktop and mobile devices

**Configuration loading**:
- API keys and model IDs loaded from `config.local.js` if available
- Falls back to user input if no config file
- Supports server-side environment variable configuration (more secure)

### Backend (`server.js`)

Local proxy server that solves CORS issues:
- Built with Node.js + `http-proxy-middleware` + `ws`
- Proxies HTTP `/api/chat` requests to `https://ark.cn-beijing.volces.com/api/v3/chat/completions`
- Proxies WebSocket `/api/ws-asr` to `wss://openspeech.bytedance.com/api/v1/asr/ws` for streaming ASR
- Serves all static frontend files
- Adds CORS headers to all API responses
- Handles OPTIONS preflight requests
- Injects API key from environment variables if configured

### API Endpoints (proxied):
- Chat: `/api/chat` → `https://ark.cn-beijing.volces.com/api/v3/chat/completions`
- Streaming ASR: `/api/ws-asr` → `wss://openspeech.bytedance.com/api/v1/asr/ws`

## Workflow (Streaming Recognition)

1. User clicks to start recording
2. WebSocket connection established for streaming recognition
3. Audio captured in small chunks (100ms) and sent incrementally via WebSocket
4. Recognition results received in real-time and displayed incrementally
5. User stops recording
6. Final recognized text question is sent to Doubao LLM chat API
7. AI answer displayed to user

## Configuration

Create `config.local.js` in the project root with:
```javascript
const CONFIG = {
    DOUBAN_API_KEY: 'your-api-key',
    ASR_MODEL_ID: 'your-asr-model-endpoint-id',
    CHAT_MODEL_ID: 'your-chat-model-endpoint-id',
};
```

## Notes

- CORS: Browser-side direct calls to Doubao API hit CORS restrictions. The included local proxy solves this.
- Requires HTTPS or localhost for microphone access (browser security requirement)
- Uses MediaRecorder API - requires modern browser (Chrome/Edge recommended)
- `config.local.js` is gitignored to prevent accidental commit of API keys
