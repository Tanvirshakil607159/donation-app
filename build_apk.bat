@echo off
title Build Foundation Monthly Donations APK
echo ========================================================
echo   Updating Web Assets and Building Android APK...
echo ========================================================
echo.

echo [1/4] Copying latest index.html to Capacitor www directory...
copy /Y index.html donation-app\www\index.html

echo.
echo [2/4] Syncing Capacitor project...
cd donation-app
call npx cap sync android

echo.
echo [3/4] Building Android APK using Gradle...
cd android
call gradlew.bat assembleDebug
cd ..

echo.
echo [4/4] Copying generated APK to the main folder...
copy /Y android\app\build\outputs\apk\debug\app-debug.apk ..\Foundation-Donations.apk
cd ..

echo.
echo ========================================================
echo   Build Complete! 
echo   Your updated APK is ready: Foundation-Donations.apk
echo ========================================================
pause
