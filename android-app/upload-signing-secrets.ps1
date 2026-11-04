# Uploads the Android signing key (android-app/signing/) to the GitHub repository
# as encrypted Actions secrets, so the "Build Android app" workflow can sign the APK.
# Windows / PowerShell version of upload-signing-secrets.sh. Run from the project folder:
#   pwsh android-app/upload-signing-secrets.ps1
# Requires the GitHub CLI (gh), logged in to an account that owns the repository.
$ErrorActionPreference = 'Stop'
$repo = 'ntorrey/breviary'
$dir = Join-Path $PSScriptRoot 'signing'
$ks = Join-Path $dir 'breviary-release.p12'
$info = Get-Content (Join-Path $dir 'signing-info.txt')
if (-not (Test-Path $ks)) { throw "No keystore at $ks. Run: npm run keystore (in android-app)" }

$keystoreB64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($ks))
$password = (($info | Where-Object { $_ -like 'Password (keystore and key): *' }) -replace '^Password \(keystore and key\): ', '').Trim()
$alias = (($info | Where-Object { $_ -like 'Key alias: *' }) -replace '^Key alias: ', '').Trim()
if (-not $password -or -not $alias) { throw 'Could not read the alias or password from signing-info.txt' }

gh secret set BREVIARY_KEYSTORE_BASE64 -R $repo --body $keystoreB64
if ($LASTEXITCODE) { throw 'Uploading BREVIARY_KEYSTORE_BASE64 failed' }
gh secret set BREVIARY_KEYSTORE_PASSWORD -R $repo --body $password
if ($LASTEXITCODE) { throw 'Uploading BREVIARY_KEYSTORE_PASSWORD failed' }
gh secret set BREVIARY_KEY_ALIAS -R $repo --body $alias
if ($LASTEXITCODE) { throw 'Uploading BREVIARY_KEY_ALIAS failed' }

Write-Output 'Secrets uploaded:'
gh secret list -R $repo
