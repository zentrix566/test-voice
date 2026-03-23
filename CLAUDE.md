# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

纯前端豆包语音问答 Demo，使用豆包语音识别识别用户问题，再通过豆包大模型回答。

- License: MIT
- Author: zentrix566

## Current Structure

```
.
├── index.html   # 主页面 UI
├── app.js       # 录音 + API 调用逻辑
├── README.md    # 使用说明
└── LICENSE      # MIT License
```

## Running

No build required. Simply open `index.html` in a modern browser (Chrome/Edge recommended).

For local development, you can use any static file server:
```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve .
```

Then open `http://localhost:8000` in your browser.

## Code Architecture

- **`VoiceQA` class**: Main controller that handles:
  - MediaRecorder API for microphone access and recording
  - Speech recognition via Doubao ASR API (volcengine)
  - Question answering via Doubao LLM API
  - UI updates for status, recognition results, and answers

- **CORS**: Browser-side calls to Doubao API may hit CORS restrictions. Solutions include: browser with CORS disabled, local proxy server, or configured CORS allowlist in Volcengine console.

- **API Endpoints**:
  - ASR: `https://openspeech.bytedance.com/api/v1/asr`
  - Chat: `https://ark.cn-beijing.volces.com/api/v3/chat/completions`
