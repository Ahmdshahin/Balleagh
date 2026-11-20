# Publish local changes: commit everything and push to GitHub.
# Hostinger rebuilds the site automatically on every push to the main branch.
# Usage:  .\deploy.ps1 "وصف التعديل"
param([string]$Message = "")

Set-Location $PSScriptRoot
if (-not $Message) { $Message = "تحديث " + (Get-Date -Format "yyyy-MM-dd HH:mm") }

git add -A
$changes = git status --porcelain
if (-not $changes) { Write-Host "مفيش تعديلات جديدة." -ForegroundColor Yellow; exit 0 }

git commit -m $Message
if ($LASTEXITCODE -ne 0) { Write-Host "فشل الحفظ (commit)." -ForegroundColor Red; exit 1 }

git push
if ($LASTEXITCODE -ne 0) { Write-Host "فشل الرفع (push) — راجع الاتصال أو تسجيل الدخول في GitHub." -ForegroundColor Red; exit 1 }

Write-Host "تم الرفع — Hostinger هيحدّث الموقع خلال دقيقة أو اتنين." -ForegroundColor Green
