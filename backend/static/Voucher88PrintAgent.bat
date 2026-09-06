@echo off
title Voucher88 Print Agent
cd /d "%~dp0"
echo ==========================================
echo   Voucher88 Print Agent (tanpa install)
echo ==========================================
echo Printer yang tersedia:
powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name"
echo.
set /p PRN=Nama printer (Enter = printer default): 
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Voucher88PrintAgent.ps1" -Printer "%PRN%"
pause
