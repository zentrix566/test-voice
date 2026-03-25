// 本地代理服务器 - 解决跨域问题
// 运行: node server.js
// 然后访问: http://localhost:3000

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
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
// 火山引擎流式ASR使用自定义二进制协议，参考官方 Python 示例

// 协议常量
const ProtocolVersion = { V1: 0b0001 };
const MessageType = {
    CLIENT_FULL_REQUEST: 0b0001,
    CLIENT_AUDIO_ONLY_REQUEST: 0b0010
};
const MessageTypeSpecificFlags = {
    NO_SEQUENCE: 0b0000,
    POS_SEQUENCE: 0b0001,
    NEG_SEQUENCE: 0b0010,
    NEG_WITH_SEQUENCE: 0b0011
};
const SerializationType = { JSON: 0b0001 };
const CompressionType = { GZIP: 0b0001 };

const wss = new WebSocket.Server({ server, path: '/api/ws-asr' });

wss.on('connection', (ws, request) => {
    console.log(`[${new Date().toLocaleTimeString()}] WebSocket 连接建立`);
    let seq = 1;
    let messageQueue = []; // 缓存消息，等待火山连接打开

    // 连接到火山引擎流式 ASR 服务 - 使用最新 v3 大模型端点
    // 需要添加认证头
    const uuid = require('uuid');

    // 获取实际的认证信息
    // 根据官方示例:
    // - X-Api-App-Key = APP ID (应用ID)
    // - X-Api-Access-Key = Access Token
    // - X-Api-Resource-Id = 资源ID (volc.* 格式)
    let appId = null;
    let accessToken = null;
    let resourceId = 'volc.bigasr.sauc.duration';

    // 从环境变量读取
    if (process.env.APP_ID) appId = process.env.APP_ID;
    if (process.env.DOUBAN_API_KEY) accessToken = process.env.DOUBAN_API_KEY;

    // 从 config.local.js 读取
    try {
        const fs = require('fs');
        const configPath = path.join(__dirname, 'config.local.js');
        if (fs.existsSync(configPath)) {
            let configContent = fs.readFileSync(configPath, 'utf8');
            const match = configContent.match(/const\s+CONFIG\s*=\s*({[^}]+});/);
            if (match) {
                try {
                    const evalConfig = eval('(' + match[1] + ')');
                    if (evalConfig.APP_ID) {
                        appId = evalConfig.APP_ID;
                    } else if (evalConfig.ASR_MODEL_ID) {
                        appId = evalConfig.ASR_MODEL_ID;
                    }
                    if (evalConfig.DOUBAN_API_KEY) {
                        accessToken = evalConfig.DOUBAN_API_KEY;
                    }
                    console.log(`[${new Date().toLocaleTimeString()}] 从 config.local.js 加载配置完成`);
                } catch (e) {
                    console.log(`[${new Date().toLocaleTimeString()}] 解析 config.local.js 失败: ${e.message}`);
                }
            }
        }
    } catch (e) {
        console.log(`[${new Date().toLocaleTimeString()}] 读取 config.local.js 失败: ${e.message}`);
    }

    // 对于 ASR 2.0 (ep- 前缀的 endpoint ID)，Resource-Id 需要使用 seedasr
    if (appId.startsWith('ep-')) {
        resourceId = 'volc.seedasr.sauc.duration';
    } else {
        resourceId = 'volc.bigasr.sauc.duration';
    }

    console.log(`[${new Date().toLocaleTimeString()}] 最终认证配置:`);
    console.log(`  X-Api-App-Key: ${appId}`);
    console.log(`  X-Api-Resource-Id: ${resourceId}`);
    console.log(`  X-Api-Access-Key: ${accessToken}`);

    // 固定 URL
    const targetWsUrl = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel';

    const reqid = uuid.v4();
    // 根据官方 Python 示例，头字段包括 X-Api-Access-Key
    const headers = {
        'X-Api-App-Key': appId,
        'X-Api-Resource-Id': resourceId,
        'X-Api-Request-Id': reqid,
        'X-Api-Access-Key': accessToken,
        'X-Api-Connect-Id': reqid
    };

    console.log(`[${new Date().toLocaleTimeString()}] 请求头:`, JSON.stringify(headers));
    console.log(`[${new Date().toLocaleTimeString()}] 连接火山 ASR: ${targetWsUrl}`);
    const targetWs = new WebSocket(targetWsUrl, { headers: headers });

    // 构建首包请求
    function buildFullRequest() {
        // 使用已经读取好的全局配置

        const payload = {
            user: {
                uid: 'doubao-voice-demo'
            },
            audio: {
                format: 'pcm',
                codec: 'raw',
                rate: 16000,
                bits: 16,
                channel: 1
            },
            request: {
                model_name: 'bigmodel',
                enable_itn: true,
                enable_punc: true,
                enable_ddc: true,
                show_utterances: true
            }
        };

        // 认证信息已经通过 HTTP Header 传递，payload 不需要重复
        const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8');
        const compressedPayload = zlib.gzipSync(payloadBytes);
        const payloadSize = compressedPayload.length;

        // 构建二进制头部
        // header: version(4) + header_size(4) | msg_type(4) | flags(4) | serialization(4) | compression(4) | reserved(8)
        const header = Buffer.alloc(4);
        header[0] = (ProtocolVersion.V1 << 4) | 1;  // version 1, header size 1 word (4 bytes)
        header[1] = (MessageType.CLIENT_FULL_REQUEST << 4) | MessageTypeSpecificFlags.POS_SEQUENCE;
        header[2] = (SerializationType.JSON << 4) | CompressionType.GZIP;
        header[3] = 0x00; // reserved

        const request = Buffer.alloc(header.length + 4 + 4 + compressedPayload.length);
        header.copy(request, 0);
        request.writeInt32BE(seq, 4);  // sequence
        request.writeUInt32BE(payloadSize, 8);
        compressedPayload.copy(request, 12);

        seq++;
        return request;
    }

    // 构建音频分包请求
    function buildAudioOnlyRequest(audioData, isLast) {
        let flags;
        let currentSeq = seq;
        if (isLast) {
            flags = MessageTypeSpecificFlags.NEG_WITH_SEQUENCE;
            currentSeq = -seq;
        } else {
            flags = MessageTypeSpecificFlags.POS_SEQUENCE;
        }

        const compressedSegment = zlib.gzipSync(audioData);
        const payloadSize = compressedSegment.length;

        const header = Buffer.alloc(4);
        header[0] = (ProtocolVersion.V1 << 4) | 1;
        header[1] = (MessageType.CLIENT_AUDIO_ONLY_REQUEST << 4) | flags;
        // Audio only request: no serialization (0b0000), payload is compressed audio bytes
        header[2] = (0 << 4) | CompressionType.GZIP;
        header[3] = 0x00;

        const request = Buffer.alloc(header.length + 4 + 4 + compressedSegment.length);
        header.copy(request, 0);
        request.writeInt32BE(currentSeq, 4);
        request.writeUInt32BE(payloadSize, 8);
        compressedSegment.copy(request, 12);

        if (!isLast) {
            seq++;
        }
        return request;
    }

    // 解析火山响应
    function parseResponse(msgBuffer) {
        let offset = 0;
        const headerSize = (msgBuffer[0] & 0x0f) * 4; // bytes
        const messageType = (msgBuffer[1] >> 4);
        const flags = msgBuffer[1] & 0x0f;
        const serializationMethod = (msgBuffer[2] >> 4);
        const compression = msgBuffer[2] & 0x0f;

        console.log(`[DEBUG] parseResponse: buffer length=${msgBuffer.length}`);
        console.log(`[DEBUG] headerSize=${headerSize}, messageType=${messageType}, flags=${flags}, serialization=${serializationMethod}, compression=${compression}`);

        offset += headerSize;

        let payloadSequence = 0;
        let isLastPackage = false;
        if ((flags & 0x01) !== 0) {
            payloadSequence = msgBuffer.readInt32BE(offset);
            console.log(`[DEBUG] flags&0x01: payloadSequence=${payloadSequence}, offset after=${offset + 4}`);
            offset += 4;
        }
        if ((flags & 0x02) !== 0) {
            isLastPackage = true;
            console.log(`[DEBUG] flags&0x02: isLastPackage=true`);
        }
        // 文档说：如果 (flags & 0x04) !== 0，则 4 字节 event 跟随
        if ((flags & 0x04) !== 0) {
            console.log(`[DEBUG] flags&0x04: skipping 4 bytes event, offset after=${offset + 4}`);
            // event 字段存在，跳过这 4 字节
            offset += 4;
        }

        let payloadSize = 0;
        if (messageType === 0b1001) { // SERVER_FULL_RESPONSE
            payloadSize = msgBuffer.readUInt32BE(offset);
            console.log(`[DEBUG] messageType=1001 (SERVER_FULL_RESPONSE): payloadSize=${payloadSize}, offset after=${offset + 4}`);
            offset += 4;
        } else if (messageType === 0b1111) { // SERVER_ERROR_RESPONSE
            const errorCode = msgBuffer.readUInt32BE(offset);
            offset += 4;
            payloadSize = msgBuffer.readUInt32BE(offset);
            offset += 4;
            console.log(`[DEBUG] messageType=1111 (SERVER_ERROR_RESPONSE): errorCode=${errorCode}, payloadSize=${payloadSize}`);
        }

        let payload;
        if (payloadSize > 0 && (messageType === 0b1001 || messageType === 0b1111)) {
            payload = msgBuffer.slice(offset, offset + payloadSize);
            console.log(`[DEBUG] sliced payload: offset=${offset}, size=${payload.length} (expected ${payloadSize})`);
        } else {
            payload = msgBuffer.slice(offset);
            console.log(`[DEBUG] sliced to end: payload size=${payload.length}`);
        }

        if (compression === CompressionType.GZIP) {
            try {
                const beforeLen = payload.length;
                payload = zlib.gunzipSync(payload);
                console.log(`[DEBUG] gunzip: compressed ${beforeLen} → uncompressed ${payload.length}`);
            } catch (e) {
                console.error('解压失败:', e);
                console.error(`offset=${offset}, payloadSize=${payloadSize}, buffer length=${msgBuffer.length}, payload length=${payload.length}`);
                return null;
            }
        }

        console.log(`[DEBUG] final payload length=${payload.length}, serializationMethod=${serializationMethod}`);

        if (serializationMethod === SerializationType.JSON) {
            try {
                console.log(`[DEBUG] payload first 100 bytes hex: ${payload.slice(0, 100).toString('hex')}`);
                console.log(`[DEBUG] payload as text: ${payload.toString('utf8').slice(0, 200)}...`);
                const json = JSON.parse(payload.toString('utf8'));
                // 转换为前端期望的格式
                // 前端期望: { payload: { result: { text, done } } }
                if (json.result && json.result.text !== undefined) {
                    return JSON.stringify({
                        payload: {
                            result: {
                                text: json.result.text,
                                done: isLastPackage
                            }
                        }
                    });
                }
                if (json.code !== 0 && json.message) {
                    console.error('火山ASR错误:', json);
                    return null;
                }
                return JSON.stringify(json);
            } catch (e) {
                console.error('解析JSON失败:', e);
                return null;
            }
        }
        return null;
    }

    // 客户端消息缓存，等待火山连接打开
    let pendingMessages = [];
    let processedFirst = false;

    // 客户端 -> 火山引擎
    ws.on('message', (message) => {
        if (targetWs.readyState !== WebSocket.OPEN) {
            pendingMessages.push(message);
            console.log(`[${new Date().toLocaleTimeString()}] 连接未就绪，消息已缓存，队列长度=${pendingMessages.length}`);
            return;
        }

        processClientMessage(message);
    });

    function processClientMessage(message) {
        if (typeof message === 'string') {
            // 这是首包JSON启动信息，需要按照火山协议重新打包
            try {
                console.log(`[${new Date().toLocaleTimeString()}] 处理客户端启动请求`);
                seq = 1;
                processedFirst = true;
                const binaryRequest = buildFullRequest();
                console.log(`[${new Date().toLocaleTimeString()}] 发送首包，大小=${binaryRequest.length} bytes`);
                targetWs.send(binaryRequest);
            } catch (e) {
                console.error('处理客户端启动消息失败:', e);
            }
        } else if (Buffer.isBuffer(message)) {
            // 这是PCM音频数据，按照火山协议打包
            // 前端会在最后一次发送一个空包表示结束
            const isLast = message.length === 0;
            const binaryRequest = buildAudioOnlyRequest(message, isLast);
            if (isLast) {
                console.log(`[${new Date().toLocaleTimeString()}] 发送最后一个音频包`);
            }
            targetWs.send(binaryRequest);
        }
    }

    // 火山连接打开后，发送所有缓存消息按顺序
    targetWs.on('open', () => {
        console.log(`[${new Date().toLocaleTimeString()}] 已成功连接火山引擎 ASR 服务`);
        console.log(`[${new Date().toLocaleTimeString()}] 发送缓存消息，共 ${pendingMessages.length} 条`);
        // 按原来的顺序依次发送
        for (const msg of pendingMessages) {
            processClientMessage(msg);
        }
        pendingMessages = null;
    });

    // 火山引擎 -> 客户端
    targetWs.on('message', (message) => {
        if (ws.readyState !== WebSocket.OPEN) {
            return;
        }
        // 火山返回二进制协议，解析出JSON文本转发给前端
        if (Buffer.isBuffer(message)) {
            const jsonText = parseResponse(message);
            if (jsonText) {
                console.log(`[${new Date().toLocaleTimeString()}] 识别结果: ${jsonText}`);
                ws.send(jsonText);
            }
        }
    });

    // 错误处理
    // (连接打开处理已经在上面了，包含缓存发送)

    targetWs.on('close', (code, reason) => {
        console.log(`[${new Date().toLocaleTimeString()}] 火山引擎 ASR 连接关闭: code=${code}, reason=${reason}`);
        ws.close();
    });

    ws.on('close', (code, reason) => {
        console.log(`[${new Date().toLocaleTimeString()}] 客户端 WebSocket 连接关闭: code=${code}, reason=${reason}`);
        targetWs.close();
    });

    ws.on('error', (error) => {
        console.error('客户端 WebSocket 错误:', error);
        targetWs.close();
    });

    targetWs.on('error', (error) => {
        console.error('火山引擎 ASR WebSocket 错误:', error);
        ws.close();
    });
});
