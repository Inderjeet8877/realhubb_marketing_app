# Realhubb Flutter app: setup log

A record of every setup step, in order, so the environment can be rebuilt on another machine.
The plan lives in [PLAN.md](PLAN.md); the design is in [../design/figma/](../design/figma/).

**Machine:** Windows 11 (25H2), user folder `C:\Users\REALHUBB VENTURES\` (note the space).

---

## 2026-10-17: Milestone 0 (toolchain, project, theme)

### 1. Checked what was already installed
| Tool | Status |
|---|---|
| Android Studio | ✅ 2026.1.2 at `C:\Program Files\Android\Android Studio` |
| Java | ✅ 17.0.12 |
| git | ✅ 2.56 |
| Android SDK | ✅ at `%LOCALAPPDATA%\Android\Sdk` (platforms 36 / 36.1, build-tools 35 + 36, emulator, platform-tools) |
| Android command-line tools | ❌ missing |
| Flutter / Dart | ❌ missing |
| Emulator | ✅ AVD `Pixel_9a` (Android 37.2, Play Store image) |

### 2. Installed the Flutter SDK (stable)
```powershell
git clone https://github.com/flutter/flutter.git -b stable C:\src\flutter
# Add C:\src\flutter\bin to the *user* PATH (permanent)
[Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path','User') + ';C:\src\flutter\bin', 'User')
flutter --version   # Flutter 3.47.7 • Dart 3.13.5
```

### 3. Installed the Android command-line tools (needed by `flutter doctor` / `sdkmanager`)
- Read the latest version from Google's official repository XML (`https://dl.google.com/android/repository/repository2-3.xml`), which gave **cmdline-tools 23.0**.
- Downloaded `commandlinetools-win-16111833_latest.zip` and **checked its SHA-1** against the XML (`57d04f2d…a63e9d`, match).
- Unzipped to `%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest\`.

### 4. Fixed "Android SDK path contains spaces"
`flutter doctor` refuses an SDK path with spaces (it breaks the NDK native build tools), and the Windows user name has one.
Fix without moving anything: a **directory junction** with a space-free path.
```powershell
New-Item -ItemType Junction -Path C:\Android\Sdk -Target "$env:LOCALAPPDATA\Android\Sdk"
[Environment]::SetEnvironmentVariable('ANDROID_HOME','C:\Android\Sdk','User')
[Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT','C:\Android\Sdk','User')
flutter config --android-sdk C:\Android\Sdk --android-studio-dir "C:\Program Files\Android\Android Studio"
flutter doctor      # → No issues found!
```
Android Studio keeps using the original path. Both point at the same files.

### 5. Android Studio: Flutter + Dart plugins
```powershell
& "C:\Program Files\Android\Android Studio\bin\studio64.exe" installPlugins io.flutter Dart
```
Installed into `%APPDATA%\Google\AndroidStudio2026.1.2\plugins\` (`flutter-intellij`, `Dart`).
**Restart Android Studio** if it was open, so it picks them up.

### 6. Created the project
```powershell
cd "C:\my folder\Broadzen"
flutter create --org com.realhubb --project-name realhubb --platforms android,ios mobile
```
Then:
- **App ID** changed to `com.realhubb.app` in `android/app/build.gradle.kts` (`applicationId`). This is a new app identity, separate from the old Capacitor app `com.realhubb.marketing`. The Kotlin namespace stays `com.realhubb.realhubb` (internal only).
- **App name** set to `Realhubb` in `android/app/src/main/AndroidManifest.xml` (`android:label`).

### 7. Fonts (bundled, no runtime download)
- Downloaded static TTFs from Google Fonts: **Sora** 600/700 and **Inter** 400/500/600/700 → `assets/fonts/`. (An old Android browser user-agent makes the Google Fonts CSS API return `.ttf` instead of `.woff`.)
- Checked glyphs: **Sora has no ₹ sign** (443 glyphs), Inter has it. The theme sets `fontFamilyFallback: ['Inter']` on every Sora style, so "₹" renders in Inter automatically.
- Declared in `pubspec.yaml` under `flutter: fonts:`.

### 8. Packages (core only; others are added at the milestone that needs them)
```powershell
flutter pub add flutter_riverpod go_router dio fl_chart lucide_icons_flutter intl shared_preferences
```
| Package | Version | Use |
|---|---|---|
| flutter_riverpod | ^3.4.3 | state |
| go_router | ^18.1.0 | navigation |
| dio | ^5.11.1 | HTTP |
| fl_chart | ^1.2.0 | charts |
| lucide_icons_flutter | ^4.0.0 | icons (same set as web `lucide-react`) |
| intl | ^0.20.3 | ₹ / date formatting |
| shared_preferences | ^2.5.6 | theme + small settings |

### 9. Theme from the Figma tokens
| File | Contents |
|---|---|
| `lib/theme/tokens.dart` | `AppColors` ThemeExtension with the **35 semantic tokens**, `light` and `dark` (same names as Figma `Color · Light` / `Color · Dark`), plus `Space` and `Radii` |
| `lib/theme/app_theme.dart` | `AppText` type scale (Sora + Inter) and `buildTheme(Brightness)`: ColorScheme, buttons (48dp min), inputs, cards, NavigationBar/Rail, sheets, dialogs |
| `lib/widgets/brand_mark.dart` | App icon **Concept A** drawn in code (`BrandMark`) + `BrandLockup` (symbol + wordmark) |
| `lib/main.dart` | App with light/dark themes (follows the system) and a temporary splash screen |

### 10. Checks
```powershell
flutter analyze   # No issues found
flutter test      # 3 passed
```
`test/widget_test.dart` checks that **every text colour token passes WCAG AA (4.5:1)** in light and dark, that white on brand/success buttons is ≥ 4.5:1, and that the splash renders.

### 11. First Android build
- The first `flutter build apk --debug` failed: *"sdkmanager did not install NDK 28.2.13676358"*.
- Fixed by installing it manually. The package name must be quoted, because `sdkmanager.bat` runs through cmd, which treats `;` as a separator:
  ```powershell
  cmd /c "\"C:\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat\" --sdk_root=C:\Android\Sdk \"ndk;28.2.13676358\" < nul"
  ```
- On rebuild, Gradle also installed **CMake 3.22.1** by itself. Result: `build\app\outputs\flutter-apk\app-debug.apk` ✅
- The space in the project path (`C:\my folder\…`) is **not** a problem for the build.

### 12. Emulator
- `Pixel_9a` booted, the app installed and launched (Impeller / OpenGLES renderer).
- The first run showed a **black screen**. Logcat showed an emulator graphics service (`android.hardware…`) crashing every 5 s. This is an emulator GPU problem, not the app.
- Fix: start the emulator with software rendering:
  ```powershell
  C:\Android\Sdk\emulator\emulator.exe -avd Pixel_9a -gpu swiftshader_indirect -no-snapshot-load
  ```
  Or in Android Studio: Device Manager → Pixel_9a → Edit → *Emulated Performance → Graphics acceleration: Software*.

### 13. Result
- Splash renders correctly in **light** (blue) and **dark** (#0B1120) mode. Status-bar icons were forced to light, because they were dark on blue.
- Committed as `a13e0ca`: *feat: add Flutter app scaffold (M0) and redesign plan docs*.

---

## 2026-10-17: App renamed to **Broadzen**
| What | Before | After |
|---|---|---|
| App name (launcher, iOS display name) | Realhubb | **Broadzen** |
| Android applicationId + namespace | com.realhubb.app / com.realhubb.realhubb | **com.broadzen.app** |
| iOS bundle ID | com.realhubb.realhubb | **com.broadzen.app** |
| Dart package | `realhubb` | **`broadzen`** |
| Wordmark | realhubb | **broadzen** |
- `MainActivity.kt` moved to `android/app/src/main/kotlin/com/broadzen/app/`.
- The old `com.realhubb.app` debug build was uninstalled from the emulator.
- Checked: analyze clean, 3 tests pass, the app drawer shows "Broadzen".
- **Firebase must register `com.broadzen.app`**, not `com.realhubb.app`.

---

## How to open and run in Android Studio
1. Android Studio → **Open** → select `C:\my folder\Broadzen\mobile`.
2. If asked, set the Flutter SDK path to `C:\src\flutter` (Settings → Languages & Frameworks → Flutter).
3. Pick the device `Pixel_9a` (or a USB phone with USB debugging on) in the toolbar.
4. Press **Run ▶** (`main.dart`).

From a terminal: `cd mobile; flutter run`.
