#!/usr/bin/env python3
# 创建一个 3 秒 16kHz 16bit 单声道 静音 WAV 测试文件

import struct
import wave

# 参数
sample_rate = 16000
duration = 3  # 秒
channels = 1
bits_per_sample = 16

# 创建 WAV 文件
with wave.open('silent-test.wav', 'wb') as wf:
    wf.setnchannels(channels)
    wf.setsampwidth(bits_per_sample // 8)
    wf.setframerate(sample_rate)

    # 生成静音样本（全零）
    num_samples = sample_rate * duration * channels
    for _ in range(num_samples):
        wf.writeframes(struct.pack('<h', 0))

print(f"已创建 silent-test.wav: {duration}秒 静音测试音频")
print(f"格式: {sample_rate}Hz {bits_per_sample}bit 单声道")
