@echo off
setlocal enabledelayedexpansion

:: Parse hq://launch?project=SLUG&name=NAME from %1
set "URL=%~1"
set "URL=%URL:hq://launch?=%"

:: Extract project
for /f "tokens=1,2 delims=&" %%a in ("%URL%") do (
    set "PART1=%%a"
    set "PART2=%%b"
)

set "PROJECT="
set "NAME="

:: Parse key=value pairs
for /f "tokens=1,2 delims==" %%x in ("%PART1%") do (
    if /i "%%x"=="project" set "PROJECT=%%y"
    if /i "%%x"=="name" set "NAME=%%y"
)
for /f "tokens=1,2 delims==" %%x in ("%PART2%") do (
    if /i "%%x"=="project" set "PROJECT=%%y"
    if /i "%%x"=="name" set "NAME=%%y"
)

if "%PROJECT%"=="" (
    echo No project specified.
    pause
    exit /b 1
)

:: URL decode NAME (basic: replace + with space, %20 with space)
set "NAME=%NAME:+= %"
set "NAME=%NAME:%%20= %"

if "%NAME%"=="" set "NAME=%PROJECT%"

:: Build the claude command
set "CMD=claude --dangerously-skip-permissions -p \"I am working on %NAME%. Run /run-project %PROJECT% to check the status and determine our next steps.\""

:: Try Windows Terminal first, fall back to cmd
where wt >nul 2>&1
if %ERRORLEVEL% equ 0 (
    start "" wt -d "C:\hq" cmd /k %CMD%
) else (
    start "" cmd /k "cd /d C:\hq && %CMD%"
)
