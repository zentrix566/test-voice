@echo off
echo 使用 ffmpeg 从麦克风录制 5 秒测试音频...
echo.
ffmpeg -f dshow -i audio="麦克风" -t 5 -ar 16000 -ac 1 test.wav
echo.
echo 录制完成，保存为 test.wav
pause
