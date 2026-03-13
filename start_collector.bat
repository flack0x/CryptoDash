@echo off
echo Starting CryptoDash collector daemon...

:: Check if already running
if exist .collector.pid (
    for /f %%i in (.collector.pid) do (
        tasklist /FI "PID eq %%i" 2>NUL | find "python" >NUL
        if not errorlevel 1 (
            echo Collector is already running (PID %%i). Use stop_collector.bat first.
            exit /b 1
        )
    )
)

:: Start in background, redirect output to log file
start /B python main.py --daemon > collector.log 2>&1

:: Wait a moment for process to start, then grab PID
timeout /t 2 /nobreak >NUL

:: Find the python process running main.py
for /f "tokens=2" %%i in ('wmic process where "commandline like '%%main.py --daemon%%' and name='python.exe'" get processid /format:list 2^>NUL ^| find "="') do (
    echo %%i> .collector.pid
    echo Collector started with PID %%i
    echo Logs: collector.log
    exit /b 0
)

echo Warning: Could not capture PID. Check if python main.py --daemon is running.
echo Logs: collector.log
