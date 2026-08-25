@echo off
title Foundation ERP System
echo ==============================================
echo   Starting Foundation ERP System (Vite)
echo ==============================================
echo.
echo Please wait, starting local web server...
echo The app will open in your default browser.
echo.
echo Press Ctrl+C to stop the server when done.
echo.
start http://localhost:5173
cd frontend
npm run dev
pause
