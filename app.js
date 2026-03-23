class VoiceQA {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
        this.isRecording = false;

        this.apiKeyInput = document.getElementById('apiKey');
        this.recordBtn = document.getElementById('recordBtn');
        this.statusDiv = document.getElementById('status');
        this.questionResult = document.getElementById('questionResult');
        this.answerResult = document.getElementById('answerResult');
        this.logContainer = document.getElementById('logContainer');
        this.clearLogBtn = document.getElementById('clearLogBtn');

        // 从本地配置读取 API Key
        this.loadApiKeyFromConfig();

        this.initEventListeners();
        this.log('info', '应用初始化完成，等待开始录音');
    }

    loadApiKeyFromConfig() {
        // 如果有本地配置文件，自动填充 API Key
        if (typeof CONFIG !== 'undefined' && CONFIG.DOUBAN_API_KEY) {
            this.apiKeyInput.value = CONFIG.DOUBAN_API_KEY;
            this.log('info', '已从 config.local.js 加载 API Key');
        }
    }

    initEventListeners() {
        // 支持点击切换录音和长按录音两种模式
        this.recordBtn.addEventListener('click', () => {
            if (!this.isRecording) {
                this.startRecording();
            } else {
                this.stopRecording();
            }
        });

        // 支持按住录音
        this.recordBtn.addEventListener('mousedown', () => {
            if (!this.isRecording) {
                this.startRecording();
            }
        });

        document.addEventListener('mouseup', () => {
            if (this.isRecording) {
                this.stopRecording();
            }
        });

        // 移动端触摸支持
        this.recordBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (!this.isRecording) {
                this.startRecording();
            }
        });

        document.addEventListener('touchend', () => {
            if (this.isRecording) {
                this.stopRecording();
            }
        });

        // 清空日志按钮
        this.clearLogBtn.addEventListener('click', () => this.clearLogs());
    }

    log(level, message) {
        // 同时输出到控制台和页面日志
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

        // 控制台输出
        switch (level) {
            case 'error':
                console.error(`[${timeStr}]`, message);
                break;
            case 'warn':
                console.warn(`[${timeStr}]`, message);
                break;
            case 'debug':
                console.debug(`[${timeStr}]`, message);
                break;
            default:
                console.log(`[${timeStr}]`, message);
        }

        // 页面输出
        const entry = document.createElement('div');
        entry.className = `log-entry log-${level}`;
        entry.innerHTML = `<span class="log-time">[${timeStr}]</span> ${this.escapeHtml(message)}`;
        this.logContainer.appendChild(entry);
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }

    clearLogs() {
        this.logContainer.innerHTML = '';
        this.log('info', '日志已清空');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getApiKey() {
        // API Key 用于认证
        if (typeof CONFIG !== 'undefined' && CONFIG.API_KEY) {
            return CONFIG.API_KEY;
        }
        const inputKey = this.apiKeyInput.value.trim();
        if (inputKey) return inputKey;

        return null;
    }

    getAsrModelId() {
        if (typeof CONFIG !== 'undefined' && CONFIG.ASR_MODEL_ID) {
            return CONFIG.ASR_MODEL_ID;
        }
        return this.getApiKey();
    }

    getChatModelId() {
        if (typeof CONFIG !== 'undefined' && CONFIG.CHAT_MODEL_ID) {
            return CONFIG.CHAT_MODEL_ID;
        }
        return this.getApiKey();
    }

    async startRecording() {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            this.showError('请先输入豆包 API Key', this.questionResult);
            this.log('error', 'API Key 为空，请输入 API Key');
            return;
        }

        try {
            this.log('info', '正在请求麦克风权限...');
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(this.stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                    this.log('debug', `收到音频数据: ${event.data.size} bytes`);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.log('info', '录音已停止，开始处理');
                this.processAudio();
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            this.recordBtn.classList.add('recording');
            this.statusDiv.textContent = '正在录音...';
            this.log('info', '开始录音');
        } catch (error) {
            const errorMsg = `获取麦克风失败: ${error.message}`;
            this.log('error', errorMsg);
            console.error('获取麦克风失败:', error);
            this.showError('无法访问麦克风，请检查权限设置', this.questionResult);
        }
    }

    async stopRecording() {
        if (!this.isRecording || !this.mediaRecorder) return;

        this.log('info', '停止录音');
        this.mediaRecorder.stop();
        this.stream.getTracks().forEach(track => track.stop());
        this.isRecording = false;
        this.recordBtn.classList.remove('recording');
        this.statusDiv.textContent = '正在处理...';
    }

    async processAudio() {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
        this.log('info', `录音大小: ${audioBlob.size} bytes`);

        try {
            // 1. 语音识别
            this.showLoading('正在进行语音识别...', this.questionResult);
            this.log('info', '开始调用语音识别 API...');
            const questionText = await this.recognizeSpeech(audioBlob);
            this.showResult(questionText, this.questionResult);
            this.log('info', `语音识别完成，识别结果: "${questionText}"`);

            // 2. 获取回答
            this.showLoading('正在思考回答...', this.answerResult);
            this.log('info', '开始调用对话 API 获取回答...');
            const answerText = await this.getAnswer(questionText);
            this.showResult(answerText, this.answerResult);
            this.log('info', '获取回答完成');

            this.statusDiv.textContent = '处理完成，请开始下一轮提问';
        } catch (error) {
            const errorMsg = `处理失败: ${error.message}`;
            this.log('error', errorMsg);
            this.log('error', `完整错误信息: ${error.stack || '无堆栈信息'}`);
            console.error('处理失败:', error);
            this.showError(errorMsg, this.answerResult);
            this.statusDiv.textContent = '处理失败，请重试';
        }
    }

    async recognizeSpeech(audioBlob) {
        const apiKey = this.getApiKey();
        const modelId = this.getAsrModelId();

        // 使用 Ark 多模态 API 直接进行语音识别
        // 语音识别模型 endpoint
        const apiUrl = '/api/chat';

        this.log('debug', `使用 Ark 多模态识别语音，模型: ${modelId}`);

        // 将音频转为 base64
        const base64Audio = await this.blobToBase64(audioBlob);
        const base64Data = base64Audio.split(',')[1];
        this.log('debug', `Base64 长度: ${base64Data.length} characters`);

        // 使用多模态，将音频发送给豆包，让它识别文字
        // 构造一个包含音频的消息，让豆包转录
        const requestBody = {
            model: modelId,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: '请识别这一段录音中的文字内容，只输出识别出的文字，不要说其他话。'
                        },
                        {
                            type: 'audio',
                            audio: {
                                data: base64Data,
                                format: 'wav'
                            }
                        }
                    ]
                }
            ],
            temperature: 0
        };

        this.log('debug', `使用 Ark 多模态请求，model endpoint: ${apiKey}`);

        let response;
        try {
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(requestBody)
            });
        } catch (fetchError) {
            this.log('error', `Fetch 失败: ${fetchError.message}. 这通常是跨域问题`);
            throw fetchError;
        }

        this.log('debug', `API 响应状态: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text();
            this.log('error', `API 响应内容: ${errorText}`);
            throw new Error(`语音识别 API 错误: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        this.log('debug', `完整响应: ${JSON.stringify(result, null, 2)}`);

        const text = result.choices[0].message.content.trim();

        if (!text) {
            throw new Error('未识别到语音内容');
        }

        this.log('info', `多模态识别结果: "${text}"`);
        return text;
    }

    async getAnswer(question) {
        const apiKey = this.getApiKey();
        const modelId = this.getChatModelId();

        // 使用本地代理解决跨域问题
        const apiUrl = '/api/chat';

        this.log('debug', `发送对话请求到: ${apiUrl}，模型: ${modelId}`);

        const requestBody = {
            model: modelId,
            messages: [
                {
                    role: 'system',
                    content: '你是一个乐于助人的AI助手，请简洁明了地回答用户的问题。'
                },
                {
                    role: 'user',
                    content: question
                }
            ],
            temperature: 0.7
        };

        let response;
        try {
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(requestBody)
            });
        } catch (fetchError) {
            this.log('error', `Fetch 失败: ${fetchError.message}. 这通常是跨域问题`);
            throw fetchError;
        }

        this.log('debug', `API 响应状态: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text();
            this.log('error', `API 响应内容: ${errorText}`);
            throw new Error(`对话 API 错误: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        this.log('debug', `完整响应: ${JSON.stringify(result, null, 2)}`);

        return result.choices[0].message.content;
    }

    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => {
                this.log('error', 'Blob 转 Base64 失败');
                reject(reader.error);
            };
            reader.readAsDataURL(blob);
        });
    }

    extractAppIdFromApiKey(apiKey) {
        // 如果是完整的 API Key 包含 appid，可以提取出来
        // 这里处理常见格式，如果不对需要用户手动确认
        const parts = apiKey.split('_');
        if (parts.length > 1) {
            return parts[0];
        }
        // 如果是 UUID 格式，直接返回整个作为 appid
        return apiKey;
    }

    showLoading(text, element) {
        element.innerHTML = `<span class="loading">${text}</span>`;
    }

    showError(text, element) {
        element.innerHTML = `<span class="error">${text}</span>`;
    }

    showResult(text, element) {
        element.textContent = text;
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new VoiceQA();
});

// 检查浏览器支持
if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('你的浏览器不支持录音功能，请使用最新版 Chrome / Edge 浏览器');
}
