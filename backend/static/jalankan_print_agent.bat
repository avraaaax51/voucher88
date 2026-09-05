@echo off
title Voucher88 Print Agent
cd /d "%~dp0"
where python >nul 2>nul || (echo Python belum terpasang. Unduh dari https://www.python.org/downloads/ lalu centang "Add Python to PATH". & pause & exit /b 1)
python -c "import win32print" 2>nul || pip install pywin32
set /p PRN=Nama printer (Enter = printer default): 
python voucher_print_agent.py "%PRN%"
pause
