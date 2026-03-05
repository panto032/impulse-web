@echo off
echo Zaustavljam IMPULSE servise...
for %%P in (4902 4903 4904 4905) do (
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
