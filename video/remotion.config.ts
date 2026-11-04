import { Config } from '@remotion/cli/config'

// ภาพหน้าจอเป็น PNG ความละเอียดสูง — ใช้ jpeg ระหว่างเรนเดอร์เฟรมเพื่อความเร็ว คุณภาพสูงพอสำหรับ Full HD
Config.setVideoImageFormat('jpeg')
Config.setJpegQuality(92)
Config.setOverwriteOutput(true)
Config.setBrowserExecutable('C:/Program Files/Google/Chrome/Application/chrome.exe')
