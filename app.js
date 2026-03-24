class VoiceQA {
    constructor() {
        this.stream = null;
        this.audioContext = null;
        this.scriptProcessor = null;
        this.sourceNode = null;
        this.isRecording = false;
        this.websocket = null;
        this.fullRecognizedText = '';
        this.audioBuffer = [];

        this.targetSampleRate = 16000;

        this.apiKeyInput = document.getElementById('apiKey');
        this.recordBtn = document.getElementById('recordBtn');
        this.statusDiv = document.getElementById('status');
        this.questionResult = document.getElementById('questionResult');
        this.answerResult = document.getElementById('answerResult');
        this.logContainer = document.getElementById('logContainer');
        this.clearLogBtn = document.getElementById('clearLogBtn');

        this.loadApiKeyFromConfig();
        this.initEventListeners();
        this.log('info', '应用初始化完成，火山流式ASR已开启，等待开始录音');
    }

    loadApiKeyFromConfig() {
        if (typeof CONFIG !== 'undefined' && CONFIG.DOUBAN_API_KEY) {
            this.apiKeyInput.value = CONFIG.DOUBAN_API_KEY;
            this.log('info', '已从 config.local.js 加载 API Key');
        }
    }

    initEventListeners() {
        this.recordBtn.addEventListener('click', () => {
            if (!this.isRecording) {
                this.startRecording();
            } else {
                this.stopRecording();
            }
        });

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

        this.clearLogBtn.addEventListener('click', () => this.clearLogs());
    }

    log(level, message) {
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

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
        if (typeof CONFIG !== 'undefined' && CONFIG.DOUBAN_API_KEY) {
            return CONFIG.DOUBAN_API_KEY;
        }
        const inputKey = this.apiKeyInput.value.trim();
        if (inputKey) return inputKey;
        return null;
    }

    getChatModelId() {
        if (typeof CONFIG !== 'undefined' && CONFIG.CHAT_MODEL_ID) {
            return CONFIG.CHAT_MODEL_ID;
        }
        return this.getApiKey();
    }

    extractAppIdFromApiKey(apiKey) {
        const parts = apiKey.split('_');
        if (parts.length > 1) {
            return parts[0];
        }
        return apiKey;
    }

    async startRecording() {
        const apiKey = this.getApiKey();
        const apiKeyRequired = typeof CONFIG === 'undefined' || !CONFIG.DOUBAN_API_KEY;
        if (apiKeyRequired && !apiKey) {
            this.showError('请先输入豆包 API Key', this.questionResult);
            this.log('error', 'API Key 为空，请输入 API Key');
            return;
        }

        try {
            this.fullRecognizedText = '';
            this.audioBuffer = [];
            this.log('info', '正在请求麦克风权限...');
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            await this.connectStreamRecognize(apiKey);

            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
            this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

            this.sourceNode.connect(this.scriptProcessor);
            this.scriptProcessor.connect(this.audioContext.destination);

            this.scriptProcessor.onaudioprocess = (event) => {
                if (this.isRecording && this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                    const inputBuffer = event.inputBuffer.getChannelData(0);
                    const resampled = this.resample(inputBuffer, this.audioContext.sampleRate, this.targetSampleRate);
                    const pcm16 = this.convertTo16BitPCM(resampled);
                    this.audioBuffer.push(...pcm16);
                    this.log('debug', `发送音频块: ${pcm16.length * 2} bytes`);
                    this.websocket.send(pcm16.buffer);
                }
            };

            this.isRecording = true;
            this.recordBtn.classList.add('recording');
            this.statusDiv.textContent = '正在录音...（流式识别中）';
            this.showLoading('正在录音，流式识别中...说话结束后停止录音', this.questionResult);
            this.log('info', '开始录音，流式识别已启动');
        } catch (error) {
            const errorMsg = `获取麦克风失败: ${error.message}`;
            this.log('error', errorMsg);
            console.error('获取麦克风失败:', error);
            this.showError('无法访问麦克风，请检查权限设置', this.questionResult);
        }
    }

    async connectStreamRecognize(apiKey) {
        return new Promise((resolve, reject) => {
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${wsProtocol}//${window.location.host}/api/ws-asr`;

            this.log('info', `连接流式识别服务: ${wsUrl}`);
            this.websocket = new WebSocket(wsUrl);

            this.websocket.onopen = () => {
                this.log('debug', 'WebSocket 连接已建立');

                const startMessage = {
                    app: {
                        appid: this.extractAppIdFromApiKey(apiKey),
                        token: apiKey,
                        cluster: 'volcengine_streaming_asr_online'
                    },
                    user: {
                        uid: 'doubao-voice-demo'
                    },
                    request: {
                        reqid: this.generateReqId(),
                        audio_format: 'pcm',
                        enable_punctuation: true,
                        enable_itn: true
                    }
                };
                this.websocket.send(JSON.stringify(startMessage));
                this.log('debug', '发送启动指令完成');
                resolve();
            };

            this.websocket.onmessage = (event) => {
                if (typeof event.data === 'string') {
                    try {
                        const message = JSON.parse(event.data);
                        this.handleStreamMessage(message);
                    } catch (e) {
                        this.log('warn', `解析JSON失败: ${e.message}, 数据长度: ${event.data.length}`);
                    }
                }
            };

            this.websocket.onerror = (error) => {
                this.log('error', `WebSocket 错误: ${error}`);
                reject(error);
            };

            this.websocket.onclose = (event) => {
                this.log('info', `WebSocket 连接关闭: code=${event.code} reason=${event.reason}`);
            };
        });
    }

    handleStreamMessage(message) {
        // 火山引擎流式ASR响应格式：
        // {
        //   "payload": {
        //     "result": {
        //       "text": "识别到的文字",
        //       "duration": 123,
        //       "done": false
        //     }
        //   }
        // }
        if (message.payload && message.payload.result) {
            const result = message.payload.result;
            if (result.text !== undefined) {
                this.fullRecognizedText = result.text;
                this.showResult(this.fullRecognizedText, this.questionResult);
                this.log('debug', `流式更新: "${this.fullRecognizedText}"`);
            }
            if (result.done) {
                this.log('info', `识别完成，最终结果: "${this.fullRecognizedText}"`);
            }
        }
    }

    resample(inputBuffer, originalSampleRate, targetSampleRate) {
        const ratio = originalSampleRate / targetSampleRate;
        const outputLength = Math.round(inputBuffer.length / ratio);
        const output = new Float32Array(outputLength);

        for (let i = 0; i < outputLength; i++) {
            const position = i * ratio;
            const index = Math.floor(position);
            const frac = position - index;
            if (index + 1 < inputBuffer.length) {
                output[i] = inputBuffer[index] * (1 - frac) + inputBuffer[index + 1] * frac;
            } else {
                output[i] = inputBuffer[index];
            }
        }
        return output;
    }

    convertTo16BitPCM(floatBuffer) {
        const output = new Int16Array(floatBuffer.length);
        for (let i = 0; i < floatBuffer.length; i++) {
            let sample = Math.max(-1, Math.min(1, floatBuffer[i]));
            output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        }
        return output;
    }

    finishStreamRecognize() {
        if (this.scriptProcessor) {
            this.scriptProcessor.disconnect();
            this.sourceNode.disconnect();
            this.scriptProcessor = null;
            this.sourceNode = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.close();
        }
        this.stream.getTracks().forEach(track => track.stop());
        this.isRecording = false;
        this.recordBtn.classList.remove('recording');

        if (!this.fullRecognizedText || this.fullRecognizedText.trim().length === 0) {
            this.log('error', '未识别到任何内容');
            this.showError('未识别到语音内容，请重试', this.questionResult);
            this.statusDiv.textContent = '识别失败，请重试';
            return;
        }

        const questionText = this.fullRecognizedText.trim();
        this.log('info', `流式识别完成，最终结果: "${questionText}"`);

        try {
            this.showLoading('正在思考回答...', this.answerResult);
            this.log('info', '开始调用对话 API 获取回答...');
            this.getAnswerStreaming(questionText).then(answerText => {
                this.showResult(answerText, this.answerResult);
                this.log('info', '获取回答完成');
                this.statusDiv.textContent = '处理完成，请开始下一轮提问';
            }).catch(error => {
                const errorMsg = `获取回答失败: ${error.message}`;
                this.log('error', errorMsg);
                this.log('error', `完整错误信息: ${error.stack || '无堆栈信息'}`);
                console.error('处理失败:', error);
                this.showError(errorMsg, this.answerResult);
                this.statusDiv.textContent = '处理失败，请重试';
            });
        } catch (error) {
            const errorMsg = `获取回答失败: ${error.message}`;
            this.log('error', errorMsg);
            this.log('error', `完整错误信息: ${error.stack || '无堆栈信息'}`);
            console.error('处理失败:', error);
            this.showError(errorMsg, this.answerResult);
            this.statusDiv.textContent = '处理失败，请重试';
        }
    }

    stopRecording() {
        if (!this.isRecording) return;

        this.log('info', '停止录音');
        this.isRecording = false;
        this.recordBtn.classList.remove('recording');
        this.statusDiv.textContent = '正在等待最终识别结果...';

        setTimeout(() => {
            this.finishStreamRecognize();
        }, 500);
    }

    async getAnswerStreaming(question) {
        const apiKey = this.getApiKey();
        const modelId = this.getChatModelId();
        const apiUrl = '/api/chat';

        this.log('debug', `发送流式对话请求到: ${apiUrl}，模型: ${modelId}`);

        const requestBody = {
            model: modelId,
            messages: [
                {
                    role: 'system',
                    content: '你现在正在面试，请简洁准确地回答面试官提出的问题。'
                },
                {
                    role: 'user',
                    content: question
                }
            ],
            stream: true,
            temperature: 0.7
        };

        let fullAnswerText = '';

        return new Promise((resolve, reject) => {
            fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(requestBody)
            }).then(response => {
                if (!response.ok) {
                    response.text().then(errorText => {
                        this.log('error', `API 错误: ${response.status} - ${errorText}`);
                        reject(new Error(`对话 API 错误: ${response.status} - ${errorText}`));
                    });
                    return;
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();

                const readChunk = () => {
                    reader.read().then(({done, value}) => {
                        if (done) {
                            this.log('debug', `流式回答完成`);
                            resolve(fullAnswerText);
                            return;
                        }

                        const chunk = decoder.decode(value, {stream: true});
                        const lines = chunk.split('\n');
                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const data = line.slice(6);
                                if (data === '[DONE]') {
                                    continue;
                                }
                                try {
                                    const json = JSON.parse(data);
                                    if (json.choices && json.choices[0].delta.content) {
                                        fullAnswerText += json.choices[0].delta.content;
                                        this.showResult(fullAnswerText, this.answerResult);
                                    }
                                } catch (e) {
                                }
                            }
                        }

                        readChunk();
                    }).catch(error => {
                        reject(error);
                    });
                };

                readChunk();
            }).catch(error => {
                this.log('error', `Fetch 失败: ${error.message}`);
                reject(error);
            });
        });
    }

    generateReqId() {
        return Math.random().toString(36).substring(2, 15);
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

document.addEventListener('DOMContentLoaded', () => {
    new VoiceQA();
});

if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('你的浏览器不支持录音功能，请使用最新版 Chrome / Edge 浏览器');
}
