# Admin Setup Guide for Claude Code
# Run this script in PowerShell AS ADMINISTRATOR

Write-Host "=== Claude Code Admin Setup ===" -ForegroundColor Cyan
Write-Host ""

# Check if running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host ""
    Write-Host "To run as admin:" -ForegroundColor Yellow
    Write-Host "  1. Right-click PowerShell" -ForegroundColor Gray
    Write-Host "  2. Select 'Run as Administrator'" -ForegroundColor Gray
    Write-Host "  3. Navigate to this directory and run the script again" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

Write-Host "Running as Administrator - OK" -ForegroundColor Green
Write-Host ""

# Get npm global path
$npmPrefix = npm config get prefix
Write-Host "Current npm global prefix: $npmPrefix" -ForegroundColor Yellow
Write-Host ""

# Get current PATH
$machinePath = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
$userPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")

# Check if npm path is in User PATH
if ($userPath -like "*$npmPrefix*") {
    Write-Host "npm path already in User PATH - OK" -ForegroundColor Green
} else {
    Write-Host "Adding npm path to User PATH..." -ForegroundColor Yellow
    $newUserPath = "$userPath;$npmPrefix"
    [System.Environment]::SetEnvironmentVariable("PATH", $newUserPath, "User")
    Write-Host "npm path added to User PATH - OK" -ForegroundColor Green
}

Write-Host ""
Write-Host "Checking Claude installation..." -ForegroundColor Yellow

# Check if Claude is installed globally
$claudeInstalled = npm list -g --depth=0 2>&1 | Select-String "claude-code"

if ($claudeInstalled) {
    Write-Host "Claude Code is installed globally - OK" -ForegroundColor Green

    # Reinstall to ensure proper setup
    Write-Host ""
    $reinstall = Read-Host "Do you want to reinstall Claude to ensure proper setup? (y/n)"
    if ($reinstall -eq "y") {
        Write-Host "Reinstalling Claude Code..." -ForegroundColor Yellow
        npm install -g claude-code@latest
        Write-Host "Claude reinstalled - OK" -ForegroundColor Green
    }
} else {
    Write-Host "Claude Code not found. Installing..." -ForegroundColor Yellow
    npm install -g claude-code@latest
    Write-Host "Claude installed - OK" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Close ALL PowerShell windows" -ForegroundColor Gray
Write-Host "  2. Open a NEW PowerShell window (not as admin)" -ForegroundColor Gray
Write-Host "  3. Run: claude --version" -ForegroundColor Gray
Write-Host ""
Write-Host "If 'claude' still doesn't work after restarting PowerShell:" -ForegroundColor Yellow
Write-Host "  - Log out and log back in to Windows" -ForegroundColor Gray
Write-Host "  - Or restart your computer" -ForegroundColor Gray
Write-Host ""
