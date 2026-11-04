#!/usr/bin/env bash
# Uploads the Android signing key (android-app/signing/) to the GitHub repository
# as encrypted Actions secrets, so the "Build Android app" workflow can sign the APK.
# Run once, from the android-app folder:   bash upload-signing-secrets.sh
# Requires the GitHub CLI (gh), logged in to an account that owns the repository.
set -euo pipefail
cd "$(dirname "$0")"
REPO="ntorrey/breviary"
KS="signing/breviary-release.p12"
INFO="signing/signing-info.txt"
[ -f "$KS" ] || { echo "No keystore at $KS. Run: npm run keystore"; exit 1; }

base64 -w0 "$KS" | gh secret set BREVIARY_KEYSTORE_BASE64 -R "$REPO"
sed -n 's/^Password (keystore and key): //p' "$INFO" | tr -d '\r\n' | gh secret set BREVIARY_KEYSTORE_PASSWORD -R "$REPO"
sed -n 's/^Key alias: //p' "$INFO" | tr -d '\r\n' | gh secret set BREVIARY_KEY_ALIAS -R "$REPO"
echo "Secrets uploaded:"
gh secret list -R "$REPO"
