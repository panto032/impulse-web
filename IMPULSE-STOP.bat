@echo off
echo Zaustavljam IMPULSE servise...
for %%P in (3002 3003 5174 5175) do (
    for /f "tokens=5" %%A in ('netstat -ano 2^>nul ^| findstr ":%%P " ^| findstr "LISTENING"') do (
        if "%%A" neq "0" (
            taskkill /PID %%A /F >nul 2>&1
            echo   Port %%P (PID %%A) stopiran
        )
    )
)
echo.
echo Svi servisi stopirani.
timeout /t 2 /nobreak >nul
