# Breviary for Android (APK)

A small native Android app, built with [Capacitor](https://capacitorjs.com), that shows the Breviary web app full-screen.

- **It loads the live site** (`https://ntorrey.github.io/breviary/`). Every update to the web app reaches the Android app automatically, just like the installed web app. After the first launch, the service worker keeps it working offline.
- **The system bars are handled natively.** The bottom navigation bar is fully transparent: the page is drawn behind it and shows through, and the page is told how much space to leave (CSS variable `--bottom-inset`). The top status bar takes the app's background color for the chosen theme. Both bars' icons switch between light and dark to stay readable. See `MainActivity.java`.
- **No overscroll bounce or stretch** at the top or bottom of a page.
- **Full-screen reading is truly full screen.** It hides Android's status and navigation bars, so the text fills the whole display. Tap anywhere to show the exit button, or swipe from the edge to see the bars briefly.
- **Keep screen on while praying** works through a native call, because Android's built-in browser engine lacks the browser feature for it.

## Download

https://github.com/ntorrey/breviary/releases/download/android/Breviary.apk

(also linked in the app under Settings → About)

To install on a phone:
1. Open the link in Chrome on the phone and download **Breviary.apk**.
2. Open the downloaded file. The first time, Android asks you to allow installing apps from Chrome (or Files). Allow it for that app.
3. Tap **Install**. If Google Play Protect warns about an unknown app, choose **More details → Install anyway**. It warns because the app isn't from the Play Store.

Updates to the APK install over the old one, and your settings are kept.

## The "update available" notice

The app shows the live website, so most updates need no new APK. A new APK is needed only when the Android frame itself changes (the native code in `android-app/android/`). To tell installed apps about such a change:

1. Raise `level` in `android-app/native-release.json` by one.
2. Replace `notes` with a short description of what the new APK adds (it appears in the notice).
3. Push. The workflow builds the APK and publishes the new level.

Installed apps with a lower level then show a notice on the Today screen, with a **Download** button and **Not now**. Rebuilding the APK without raising the level shows no notice.

## How it is built

The GitHub workflow `.github/workflows/android.yml` builds a signed release APK whenever something in `android-app/` changes. You can also run it by hand from the repository's **Actions** tab (**Build Android app** → **Run workflow**). It publishes the APK to the `android` release, so the download address never changes.

## The signing key (important)

Android installs an update only if it's signed with the **same key** as the installed app. The key was created once with `npm run keystore` and lives in `android-app/signing/`, which git ignores:

- `breviary-release.p12`: the key
- `signing-info.txt`: its alias and password

**Back up this folder somewhere safe**, such as a password manager or private cloud storage. If it's lost, a new key can be made, but everyone would have to uninstall the app and install it again.

The workflow reads the key from three encrypted repository secrets. To upload them (once, or again if the key ever changes):

On Windows (PowerShell), from the project folder:

```bash
pwsh android-app/upload-signing-secrets.ps1
```

On macOS or Linux (with the GitHub CLI installed there):

```bash
bash android-app/upload-signing-secrets.sh
```

## Working on it locally

```bash
cd android-app
npm install
npx cap sync android
```

Building locally needs Android Studio, which provides the SDK and Java. Open `android-app/android` in it. The GitHub workflow doesn't need any of that.
