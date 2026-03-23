// 本地代理服务器 - 解决跨域问题
// 运行: node server.js
// 然后访问: http://localhost:3000

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const PORT = 3000;

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
            const bodyData = JSON.stringify(req.body);
            proxyReq.setHeader('Content-Type', 'application/json');
            if (req.headers.authorization) {
                proxyReq.setHeader('Authorization', req.headers.authorization);
            }
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
    console.log(`
===========================================
    豆包语音问答 Demo - 本地代理服务器
===========================================
服务器已启动: http://localhost:${PORT}

请在浏览器中打开上述地址，即可使用。
API Key 已从 config.local.js 读取，无需手动输入。

解决跨域问题: 通过本代理转发请求到豆包 API
===========================================
`);
});
