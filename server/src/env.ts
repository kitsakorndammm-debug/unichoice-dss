// โหลดค่าจากไฟล์ server/.env (ถ้ามี) ก่อนโมดูลอื่นอ่าน process.env
try { process.loadEnvFile?.(); } catch { /* ไม่มีไฟล์ .env ก็ใช้ค่าเริ่มต้น */ }
