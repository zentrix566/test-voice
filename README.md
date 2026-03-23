# test-voice

豆包语音问答 Demo - 纯前端浏览器版本，支持语音提问 + AI 回答。

## 功能

- 🎤 浏览器直接录音
- 🗣️ 豆包语音识别 (ASR) 将语音转文字
- 🤖 豆包大模型自动回答问题
- 💻 纯前端实现，无需后端服务器（注意跨域限制）

## 使用方法

### 1. 安装依赖
```bash
npm install
```

### 2. 启动本地代理服务器（解决跨域问题）
```bash
npm start
```

### 3. 打开浏览器访问
```
http://localhost:3000
```

API Key 已经配置在 `config.local.js` 中，会自动加载无需手动输入。

**步骤：**
1. 点击按钮开始录音
2. 说出你的问题
3. 再次点击按钮停止录音
4. 等待语音识别和 AI 回答

## 关于跨域问题

已经内置了 Node.js 本地代理服务器，自动解决跨域问题。只要按照上面的步骤启动服务器即可正常使用。

## API Key 获取

1. 访问 [火山引擎控制台](https://console.volcengine.com/)
2. 开通豆包能力
3. 创建 API Key / AK 密钥
4. 将 API Key 填入 `config.local.js` 文件（该文件不会被 Git 提交）

## 文件结构

```
test-voice/
├── index.html       # 主页面 UI
├── app.js           # 前端逻辑（录音 + API 调用）
├── server.js        # 本地代理服务器（解决跨域）
├── config.local.js  # 本地配置（存放 API Key，已加入 .gitignore）
├── package.json     # Node.js 依赖配置
├── .gitignore       # Git 忽略规则
├── LICENSE          # MIT License
└── README.md        # 说明文档
```

## 调试

页面底部有完整的调试日志，如果遇到问题，可以查看日志了解详细错误信息。日志同时输出到浏览器控制台。
