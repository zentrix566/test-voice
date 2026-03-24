// 本地代理服务器 - 解决跨域问题
// 运行: node server.js
// 然后访问: http://localhost:3000

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.DOUBAN_API_KEY;
const ASR_MODEL_ID = process.env.ASR_MODEL_ID;
const CHAT_MODEL_ID = process.env.CHAT_MODEL_ID;

// MIME types
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
};

// 创建代理 - 需要解析 body 才能正确转发
const asrProxy = createProxyMiddleware({
    target: 'https://openspeech.bytedance.com',
    changeOrigin: true,
    pathRewrite: {
        '^/api/asr$': '/api/v1/asr'
    },
    onProxyReq: (proxyReq, req, res) => {
        console.log(`[${new Date().toLocaleTimeString()}] ASR 请求转发`);
        // 如果 body 已经被解析，重新发送
        if (req.body) {
            // 如果环境变量中配置了 API Key，使用环境变量的
            if (API_KEY) {
                if (req.body.header) {
                    req.body.header.token = API_KEY;
                }
            }
            const bodyData = JSON.stringify(req.body);
            proxyReq.setHeader('Content-Type', 'application/json');
            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
        }
    },
    onProxyRes: (proxyRes, req, res) => {
        // 添加 CORS 头
        proxyRes.headers['access-control-allow-origin'] = '*';
        proxyRes.headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
        proxyRes.headers['access-control-allow-headers'] = 'Content-Type';
    },
    onError: (err, req, res) => {
        console.error('代理错误:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Proxy error', message: err.message }));
    }
});

const chatProxy = createProxyMiddleware({
    target: 'https://ark.cn-beijing.volces.com',
    changeOrigin: true,
    pathRewrite: {
        '^/api/chat$': '/api/v3/chat/completions'
    },
    onProxyReq: (proxyReq, req, res) => {
        console.log(`[${new Date().toLocaleTimeString()}] 对话请求转发`);
        if (req.body) {
            // 如果环境变量中配置了 API Key，使用环境变量的
            if (API_KEY) {
                proxyReq.setHeader('Authorization', `Bearer ${API_KEY}`);
            } else if (req.headers.authorization) {
                proxyReq.setHeader('Authorization', req.headers.authorization);
            }
            // 如果环境变量中配置了模型 ID，覆盖请求中的 model
            if (CHAT_MODEL_ID && req.body && typeof req.body === 'object') {
                req.body.model = CHAT_MODEL_ID;
            }
            const bodyData = JSON.stringify(req.body);
            proxyReq.setHeader('Content-Type', 'application/json');
            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
        }
    },
    onProxyRes: (proxyRes, req, res) => {
        proxyRes.headers['access-control-allow-origin'] = '*';
        proxyRes.headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
        proxyRes.headers['access-control-allow-headers'] = 'Content-Type, Authorization';
    },
    onError: (err, req, res) => {
        console.error('代理错误:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Proxy error', message: err.message }));
    }
});

// 处理 OPTIONS 预检请求
function handleOptions(req, res) {
    res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
    });
    res.end();
}

// 解析 JSON 请求体
function parseBody(req, callback) {
    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });
    req.on('end', () => {
        if (body) {
            try {
                req.body = JSON.parse(body);
            } catch (e) {
                req.body = body;
            }
        }
        callback();
    });
}

// 创建服务器
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);

    // 处理 OPTIONS
    if (req.method === 'OPTIONS') {
        handleOptions(req, res);
        return;
    }

    // API 代理
    if (parsedUrl.pathname === '/api/asr') {
        parseBody(req, () => {
            asrProxy(req, res);
        });
        return;
    }

    if (parsedUrl.pathname === '/api/chat') {
        parseBody(req, () => {
            chatProxy(req, res);
        });
        return;
    }

    // 静态文件服务
    let pathname = parsedUrl.pathname;
    if (pathname === '/') {
        pathname = '/index.html';
    }

    const extname = String(path.extname(pathname)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    const fullPath = path.join(__dirname, pathname);

    fs.readFile(fullPath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File Not Found');
            } else {
                res.writeHead(500);
                res.end('Server Error: ' + error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    const hasApiKey = API_KEY ? '✓ 已从环境变量 DOUBAN_API_KEY 加载' : 'x 未配置（使用前端配置）';
    console.log(`
===========================================
    豆包语音问答 Demo - 本地代理服务器
===========================================
服务器已启动: http://localhost:${PORT}

流式语音识别: 已启用（边录边识别）

配置状态:
  API Key: ${hasApiKey}

解决跨域问题: 通过本代理转发请求到豆包 API
===========================================
`);
});

// WebSocket 代理 - 转发流式语音识别请求到火山引擎
const wss = new WebSocket.Server({ server, path: '/api/ws-asr' });
wss.on('connection', (ws, request) => {
    console.log(`[${new Date().toLocaleTimeString()}] WebSocket 连接建立`);

    // 连接到火山引擎流式 ASR 服务
    const targetWsUrl = 'wss://openspeech.bytedance.com/api/v1/asr/ws';
    const targetWs = new WebSocket(targetWsUrl);

    // 客户端 -> 火山引擎
    ws.on('message', (message) => {
        if (targetWs.readyState === WebSocket.OPEN) {
            // 如果是 JSON 启动指令且环境变量配置了 API Key，注入认证信息
            if (typeof message === 'string' && API_KEY) {
                try {
                    const json = JSON.parse(message);
                    if (json.app && API_KEY) {
                        json.app.token = API_KEY;
                        if (ASR_MODEL_ID) {
                            json.app.appid = ASR_MODEL_ID;
                        }
                        message = JSON.stringify(json);
                    }
                } catch (e) {
                    // 不是 JSON，直接发送
                }
            }
            targetWs.send(message);
        }
    });

    // 火山引擎 -> 客户端
    targetWs.on('message', (message) => {
        if (ws.readyState === WebSocket.OPEN) {
            // 火山引擎返回 JSON，直接转发
            if (typeof message === 'string') {
                ws.send(message);
            } else {
                // 二进制响应，日志
                console.log('收到二进制响应，大小:', message.length);
            }
        }
    });

    // 错误处理
    ws.on('close', () => {
        console.log(`[${new Date().toLocaleTimeString()}] WebSocket 连接关闭`);
        targetWs.close();
    });

    targetWs.on('close', () => {
        ws.close();
    });

    ws.on('error', (error) => {
        console.error('客户端 WebSocket 错误:', error);
        targetWs.close();
    });

    targetWs.on('error', (error) => {
        console.error('目标服务器 WebSocket 错误:', error);
        ws.close();
    });
});
