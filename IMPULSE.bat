@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

:: ╔══════════════════════════════════════════════════════╗
:: ║  IMPULSE Dev — Double-click and go                  ║
:: ║                                                     ║
:: ║  Stavi ovaj fajl bilo gde.                          ║
:: ║  Dupli klik = sve se klonira, instalira, pokrene.   ║
:: ║  Svaki sledeci put = azurira kod i restaruje.       ║
:: ╚══════════════════════════════════════════════════════╝

title IMPULSE Dev

:: ── Gde se sve instalira ──────────────────────────────
:: Repo se klonira PORED ovog .bat fajla u "impulse-web" folder
set "SCRIPT_DIR=%~dp0"
set "INSTALL_DIR=%SCRIPT_DIR%impulse-web"
set "REPO_URL=https://github.com/panto032/impulse-web.git"

echo.
echo  ╔══════════════════════════════════════╗
echo  ║        IMPULSE Dev                   ║
echo  ╚══════════════════════════════════════╝
echo.

:: ══════════════════════════════════════════════════════
:: STEP 0: Proveri da li Git i Node postoje
:: ══════════════════════════════════════════════════════
echo [0] Proveravam alate...

where git >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo  [GRESKA] Git nije instaliran!
    echo.
    echo  Preuzmi sa: https://git-scm.com/download/win
    echo  Instaliraj, restartuj CMD, pokreni ponovo.
    echo.
    pause
    exit /b 1
)
echo     [OK] Git

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo  [GRESKA] Node.js nije instaliran!
    echo.
    echo  Preuzmi sa: https://nodejs.org
    echo  Instaliraj LTS verziju, restartuj CMD, pokreni ponovo.
    echo.
    pause
    exit /b 1
)
echo     [OK] Node.js

where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo  [GRESKA] npm nije u PATH-u!
    echo  Reinstaliraj Node.js sa https://nodejs.org
    echo.
    pause
    exit /b 1
)
echo     [OK] npm
echo.

:: ══════════════════════════════════════════════════════
:: STEP 1: Clone ili Pull
:: ══════════════════════════════════════════════════════
echo [1] Git - clone ili pull...

if not exist "%INSTALL_DIR%\.git" (
    echo     Repo ne postoji — kloniram...
    git clone "%REPO_URL%" "%INSTALL_DIR%"
    if %ERRORLEVEL% neq 0 (
        echo.
        echo  [GRESKA] Git clone nije uspeo!
        echo  Proveri internet konekciju i GitHub pristup.
        pause
        exit /b 1
    )
    echo     [OK] Repo kloniran
) else (
    echo     Repo postoji — povlacim promene...
    pushd "%INSTALL_DIR%"

    :: Stash lokalnih promena
    git diff --quiet 2>nul
    if %ERRORLEVEL% neq 0 (
        echo     [!] Lokalne promene - stash-ujem...
        git stash push -m "auto-stash IMPULSE.bat"
        set "STASHED=1"
    )

    git pull --rebase origin master
    if %ERRORLEVEL% neq 0 (
        echo     [!] Git pull greska — nastavljam sa trenutnim kodom
    ) else (
        echo     [OK] Kod azuriran
    )

    :: Pop stash
    if defined STASHED (
        git stash pop 2>nul
        if %ERRORLEVEL% equ 0 (
            echo     [OK] Lokalne promene vracene
        ) else (
            echo     [!] Stash conflict — resi rucno: git stash pop
        )
    )

    popd
)
echo.

:: ══════════════════════════════════════════════════════
:: STEP 2: .env
:: ══════════════════════════════════════════════════════
echo [2] Environment (.env)...

if not exist "%INSTALL_DIR%\.env" (
    if exist "%INSTALL_DIR%\.env.example" (
        copy "%INSTALL_DIR%\.env.example" "%INSTALL_DIR%\.env" >nul
        echo     [!] .env kreiran iz .env.example
        echo.
        echo     *** VAZNO: Otvori i popuni vrednosti: ***
        echo     %INSTALL_DIR%\.env
        echo.
        echo     COOLIFY_API_URL, COOLIFY_TOKEN, COOLIFY_SERVER_UUID
        echo     WEB_SYNC_SECRET, DASHBOARD_PASSWORD
        echo.
    ) else (
        echo COOLIFY_API_URL=> "%INSTALL_DIR%\.env"
        echo COOLIFY_TOKEN=>> "%INSTALL_DIR%\.env"
        echo COOLIFY_SERVER_UUID=>> "%INSTALL_DIR%\.env"
        echo WEB_API_URL=https://app.impulsee.dev>> "%INSTALL_DIR%\.env"
        echo WEB_SYNC_SECRET=>> "%INSTALL_DIR%\.env"
        echo DASHBOARD_PASSWORD=>> "%INSTALL_DIR%\.env"
        echo     [!] .env kreiran — popuni vrednosti
    )
) else (
    echo     [OK] .env postoji
)
echo.

:: ══════════════════════════════════════════════════════
:: STEP 3: npm install (sva 4 modula)
:: ══════════════════════════════════════════════════════
echo [3] Instaliram zavisnosti...

call :npm_install "%INSTALL_DIR%\local\backend"  "local/backend"
call :npm_install "%INSTALL_DIR%\local\frontend" "local/frontend"
call :npm_install "%INSTALL_DIR%\web\backend"    "web/backend"
call :npm_install "%INSTALL_DIR%\web\frontend"   "web/frontend"
echo.

:: ══════════════════════════════════════════════════════
:: STEP 4: Ubij stare procese
:: ══════════════════════════════════════════════════════
echo [4] Cistim stare procese...

for %%P in (3002 3003 5174 5175) do (
    for /f "tokens=5" %%A in ('netstat -ano 2^>nul ^| findstr ":%%P " ^| findstr "LISTENING"') do (
        if "%%A" neq "0" (
            taskkill /PID %%A /F >nul 2>&1
            echo     Port %%P (PID %%A) stopiran
        )
    )
)
timeout /t 2 /nobreak >nul
echo.

:: ══════════════════════════════════════════════════════
:: STEP 5: Pokreni sve servise
:: ══════════════════════════════════════════════════════
echo [5] Pokrecem servise...

:: Local Backend (port 3002)
echo     Local Backend (port 3002)...
start "" /B /D "%INSTALL_DIR%\local\backend" node server.js >nul 2>&1

:: Web Backend (port 3003)
echo     Web Backend (port 3003)...
start "" /B /D "%INSTALL_DIR%\web\backend" node server.js >nul 2>&1

timeout /t 2 /nobreak >nul

:: Local Frontend (port 5174)
echo     Local Frontend (port 5174)...
start "" /B /D "%INSTALL_DIR%\local\frontend" node node_modules\vite\bin\vite.js --port 5174 >nul 2>&1

:: Web Frontend (port 5175)
echo     Web Frontend (port 5175)...
start "" /B /D "%INSTALL_DIR%\web\frontend" node node_modules\vite\bin\vite.js --port 5175 >nul 2>&1

timeout /t 4 /nobreak >nul
echo.

:: ══════════════════════════════════════════════════════
:: STEP 6: Verifikacija
:: ══════════════════════════════════════════════════════
echo [6] Verifikacija...

set "RUNNING=0"
for %%P in (3002 3003 5174 5175) do (
    set "FOUND="
    for /f "tokens=5" %%A in ('netstat -ano 2^>nul ^| findstr ":%%P " ^| findstr "LISTENING"') do (
        if not defined FOUND (
            echo     [OK] Port %%P ^(PID %%A^)
            set "FOUND=1"
            set /a RUNNING+=1
        )
    )
    if not defined FOUND (
        echo     [FAIL] Port %%P — nije pokrenut!
    )
)

echo.
if !RUNNING! equ 4 (
    echo  ═══════════════════════════════════════
    echo   SVA 4 SERVISA RADE!
    echo  ═══════════════════════════════════════
) else (
    echo  ═══════════════════════════════════════
    echo   UPOZORENJE: !RUNNING!/4 servisa pokrenuto
    echo  ═══════════════════════════════════════
)

echo.
echo   Local App:  http://localhost:5174   (bez logina)
echo   Web App:    http://localhost:5175   (password iz .env)
echo.

:: Otvori browser automatski
timeout /t 1 /nobreak >nul
start "" "http://localhost:5174"

echo.
echo  Servisi rade u pozadini.
echo  Za STOP: dupli klik na IMPULSE-STOP.bat
echo.
timeout /t 3 /nobreak >nul
exit /b 0

:: ══════════════════════════════════════════════════════
:: FUNKCIJA: npm install ako treba
:: ══════════════════════════════════════════════════════
:npm_install
set "DIR=%~1"
set "NAME=%~2"

if not exist "%DIR%\package.json" (
    echo     [!] %NAME% — nema package.json, preskace
    goto :eof
)

if not exist "%DIR%\node_modules" (
    echo     %NAME% — instaliram...
    pushd "%DIR%"
    call npm install --silent 2>nul
    popd
    echo     [OK] %NAME%
    goto :eof
)

:: Uporedi package.json timestamp sa markerom
set "MARKER=%DIR%\node_modules\.install-marker"
if not exist "%MARKER%" (
    echo     %NAME% — instaliram (prvi put)...
    pushd "%DIR%"
    call npm install --silent 2>nul
    popd
    copy /y "%DIR%\package.json" "%MARKER%" >nul 2>&1
    echo     [OK] %NAME%
    goto :eof
)

:: Uporedi da li se package.json promenio
fc /b "%DIR%\package.json" "%MARKER%" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo     %NAME% — package.json promenjen, azuriram...
    pushd "%DIR%"
    call npm install --silent 2>nul
    popd
    copy /y "%DIR%\package.json" "%MARKER%" >nul 2>&1
    echo     [OK] %NAME%
) else (
    echo     [OK] %NAME% — sve OK, preskace
)
goto :eof
