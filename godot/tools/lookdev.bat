@echo off
setlocal
rem Space War lookdev (V0): render fixed shots, old lighting (left) vs V1 lighting (right), with GPU ms.
rem Double-click this file. First run asks for the Godot exe (drag it into the window). Output: godot\lookdev_out
set "HERE=%~dp0"
set "PROJ=%HERE%.."
set "OUT=%HERE%..\lookdev_out"
set "CFG=%HERE%godot_path.txt"
set "GODOT="
if exist "%CFG%" set /p GODOT=<"%CFG%"
if defined GODOT if exist "%GODOT%" goto run
echo.
echo  Drag Godot_v4.7-stable_win64.exe into this window, then press Enter:
set /p GODOT=
set GODOT=%GODOT:"=%
if not exist "%GODOT%" (
  echo  Not found: %GODOT%
  pause
  exit /b 1
)
> "%CFG%" echo %GODOT%
:run
if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%OUT%"
echo  Rendering shots... (about 1-2 minutes, do not touch the window)
start "" /wait "%GODOT%" --path "%PROJ%" -- --lookdev "--out=%OUT%" %*
start "" "%OUT%"
type "%OUT%\report.txt"
pause
