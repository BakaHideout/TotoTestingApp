# TotoQuest for Google Play

The Play Store app is a **Trusted Web Activity**: a tiny Android app that opens the game's
website (`/TotoTestingApp/index.html?app=android`) full screen in Chrome. Game updates happen on
the website; the Android app only needs a new build when its own settings change.

* `twa-manifest.json` — the app's settings (package `com.totoquest.game`, name, colours, icons,
  start page, version). Bump `appVersionCode` (and `appVersion`) for every upload to Play.
* `.github/workflows/android.yml` — builds the app bundle on GitHub and puts the **unsigned**
  `.aab` on the `android-build` branch.
* The bundle is signed with the **upload key** (`totoquest-upload.jks`), which is kept privately
  by the game's owner and never stored here:
  `jarsigner -keystore totoquest-upload.jks -signedjar totoquest.aab totoquest-unsigned.aab upload`
* Inside the app the game hides the web store (Google Play requires its own billing for digital
  items) and the install pop-ups.
* `https://bakahideout.github.io/.well-known/assetlinks.json` (in the `bakahideout.github.io`
  repository) proves the app and the website belong together, so the app opens without a browser
  bar. It must list the upload key's SHA-256 and the **App signing key** SHA-256 from Play Console.
