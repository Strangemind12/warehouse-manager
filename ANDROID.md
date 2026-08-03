# Building the Android app (APK / AAB)

The web app is already Capacitor-ready. Because the app has a server side
(database, auth, server functions), the Android shell loads the published web
app defined in `capacitor.config.ts` → `server.url`.

## One-time setup (on your machine, after cloning from GitHub)

```bash
npm install
npx cap add android          # creates the native android/ project
npx cap sync android
```

`npx cap add android` must be run once locally (it generates the `android/`
folder, which is not committed). Everything else — app id, app name, splash
screen, status bar and the published URL — is already configured.

## App icon & splash screen

Put a 1024×1024 `icon.png` and a 2732×2732 `splash.png` in `resources/`, then:

```bash
npm i -D @capacitor/assets
npx capacitor-assets generate --android
```

## Permissions

The installed plugins add their Android permissions automatically when you run
`npx cap sync`:

| Capability | Plugin | Android permission |
| --- | --- | --- |
| Camera (product photos) | `@capacitor/camera` | `CAMERA` |
| Gallery / files | `@capacitor/camera`, `@capacitor/filesystem` | `READ_MEDIA_IMAGES` |
| Network status | `@capacitor/network` | `ACCESS_NETWORK_STATE` |
| Loading the app | Capacitor core | `INTERNET` |

Photo capture in the app uses a standard `<input type="file" capture>`, which
the Android WebView routes to the camera or gallery, so no extra code is needed.

## Build

```bash
npx cap open android         # opens Android Studio
```

In Android Studio: **Build → Build Bundle(s)/APK(s)** for an APK, or
**Build → Generate Signed Bundle** for a Play Store AAB.

Or from the command line:

```bash
cd android && ./gradlew assembleDebug        # APK
cd android && ./gradlew bundleRelease        # AAB (needs signing config)
```

## Notes

- Publish the web app first (or update `server.url` to your custom domain) —
  the Android app loads that URL.
- After any change to `capacitor.config.ts`, run `npx cap sync android`.
