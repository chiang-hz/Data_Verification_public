@echo off
setlocal enabledelayedexpansion

echo ==================================================
echo  Reconciliation Tool - Startup Script
echo ==================================================

cd /d "%~dp0"

:: -----------------------------------------------
:: [1/2] Python Backend
:: -----------------------------------------------
echo [1/2] Checking Python Backend (FastAPI)...

if not exist "python_backend\venv" (
    echo [INFO] Creating virtual environment...
    python -m venv python_backend\venv
    if errorlevel 1 (
        echo [ERROR] Failed to create venv. Is Python installed and in PATH?
        pause
        exit /b 1
    )
)

echo [INFO] Activating virtual environment...
call python_backend\venv\Scripts\activate.bat

:: Compute MD5 hash of requirements.txt.
:: Pipe certutil through findstr to extract only the hex hash line,
:: avoiding Chinese footer text (e.g. the ideographic period in success msg).
set "REQ_FILE=python_backend\requirements.txt"
set "HASH_FILE=python_backend\.requirements_hash"
set "CURRENT_HASH="
for /f "tokens=*" %%H in ('certutil -hashfile "%REQ_FILE%" MD5 2^>nul ^| findstr /r "^[0-9a-f][0-9a-f]*$"') do (
    set "CURRENT_HASH=%%H"
)

:: Read stored hash
set "STORED_HASH="
if exist "%HASH_FILE%" (
    set /p STORED_HASH=<"%HASH_FILE%"
)

:: Compare and install only when changed
if not defined CURRENT_HASH (
    echo [WARN] Could not compute hash. Running pip install to be safe...
    pip install -r "%REQ_FILE%" -q
) else (
    if "!CURRENT_HASH!"=="!STORED_HASH!" (
        echo [INFO] requirements.txt unchanged. Skipping install.
    ) else (
        echo [INFO] requirements.txt changed. Updating packages...
        pip install -r "%REQ_FILE%"
        if errorlevel 1 (
            echo [ERROR] pip install failed. Check network or requirements.txt.
            pause
            exit /b 1
        )
        echo !CURRENT_HASH!>"%HASH_FILE%"
        echo [INFO] Packages updated. Hash saved.
    )
)

echo [INFO] Starting Uvicorn server on port 8000...
start "FastAPI Backend" cmd /c "call python_backend\venv\Scripts\activate.bat && cd python_backend && uvicorn app:app --reload --host 127.0.0.1 --port 8000"

:: -----------------------------------------------
:: [2/2] React Frontend
:: -----------------------------------------------
echo [2/2] Checking React Frontend...

if not exist "node_modules" (
    echo [INFO] Installing frontend dependencies...
    call npm install --legacy-peer-deps
)

echo [INFO] Starting React dev server...
start "React Frontend" cmd /c "npm start"

echo [INFO] Opening browser in 5 seconds...
timeout /t 5 >nul
start http://localhost:3000

echo ==================================================
echo  Both services are running in separate windows.
echo  Close those windows to stop the servers.
echo ==================================================
endlocal
exit /b 0
