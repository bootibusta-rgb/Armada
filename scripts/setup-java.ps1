# Install JDK 17 for Android builds (run as Administrator if winget fails)
Write-Host "Installing Microsoft OpenJDK 17..." -ForegroundColor Cyan
winget install Microsoft.OpenJDK.17 --accept-package-agreements --accept-source-agreements

if ($LASTEXITCODE -eq 0) {
    $jdkPath = (Get-ChildItem "C:\Program Files\Microsoft\jdk-*" -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1).FullName
    if ($jdkPath) {
        [Environment]::SetEnvironmentVariable("JAVA_HOME", $jdkPath, "User")
        $env:JAVA_HOME = $jdkPath
        Write-Host "`nJAVA_HOME set to: $jdkPath" -ForegroundColor Green
        Write-Host "Close and reopen your terminal, then run: npm run run:android" -ForegroundColor Yellow
    }
} else {
    Write-Host "`nwinget failed. Install manually:" -ForegroundColor Red
    Write-Host "  https://learn.microsoft.com/en-us/java/openjdk/download#openjdk-17" -ForegroundColor Yellow
}
