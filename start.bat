@echo off
title SCMS - Do An Tot Nghiep
color 0A

echo ==========================================
echo    SCMS - Supply Chain Management System
echo       DO AN TOT NGHIEP - 2026
echo ==========================================
echo.
echo  Domain co dinh:
echo  https://bethany-phonatory-dominica.ngrok-free.dev
echo ==========================================
echo.

REM === 1. Start Backend Server ===
echo [1/3] Khoi dong Backend (port 5001)...
start "SCMS Backend" cmd /k "cd /d "%~dp0server" && node index.js"
echo     Dang cho backend khoi dong...
timeout /t 5 /nobreak >nul

REM === 2. Start Frontend ===
echo [2/3] Khoi dong Frontend (port 3000)...
start "SCMS Frontend" cmd /k "cd /d "%~dp0client" && npm run dev"
timeout /t 3 /nobreak >nul

REM === 3. Start Ngrok Tunnel (Fixed Domain) ===
echo [3/3] Ket noi Ngrok Tunnel...
echo.
echo ==========================================
echo   LINK CONG KHAI CO DINH:
echo   https://bethany-phonatory-dominica.ngrok-free.dev
echo ==========================================
echo.
echo   (Nhan Ctrl+C de tat tunnel)
echo.

C:\ngrok\ngrok.exe http --domain=bethany-phonatory-dominica.ngrok-free.dev 5001

pause
