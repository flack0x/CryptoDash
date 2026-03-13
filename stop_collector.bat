@echo off
if not exist .collector.pid (
    echo No .collector.pid file found. Collector may not be running.
    echo Trying to find and kill any running collector...
    wmic process where "commandline like '%%main.py --daemon%%' and name='python.exe'" call terminate >NUL 2>&1
    echo Done.
    exit /b 0
)

for /f %%i in (.collector.pid) do (
    echo Stopping collector (PID %%i)...
    taskkill /PID %%i /F >NUL 2>&1
    if not errorlevel 1 (
        echo Collector stopped.
    ) else (
        echo Process %%i not found. May have already stopped.
    )
)

del .collector.pid
echo Cleaned up PID file.
