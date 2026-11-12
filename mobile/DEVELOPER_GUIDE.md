# Broadzen Flutter app: developer guide

Everything you need to set up, run, test, build and release the Broadzen mobile app, plus how the code is organised and how to add new features.

| Doc | What it's for |
|---|---|
| **This guide** | How to work on the app, day to day |
| [SETUP_LOG.md](SETUP_LOG.md) | The exact history of how this PC was set up (what was installed, and the problems that were fixed) |
| [PLAN.md](PLAN.md) | Original build plan and milestones |
| [../infra/README.md](../infra/README.md) | The local backend (Docker: Postgres + API + nginx) |
| [../infra/PLAN.md](../infra/PLAN.md) | Accounts, admin approval and data-security design |
| [../design/figma/DESIGN_PLAN.md](../design/figma/DESIGN_PLAN.md) | Design system and screen specs |

All commands are **PowerShell** on Windows and are run from the `mobile` folder unless stated otherwise:
```powershell
cd "C:\my folder\Broadzen\mobile"
```

---

## 1. One-time setup (new PC)

### 1.1 Install the tools
| Tool | Where / how | Check |
|---|---|---|
| Flutter SDK (stable) | `git clone https://github.com/flutter/flutter.git -b stable C:\src\flutter`, then add `C:\src\flutter\bin` to the **user** PATH | `flutter --version` |
| Android Studio | developer.android.com/studio (also gives the Android SDK + emulator) | opens |
| Android command-line tools | Android Studio → SDK Manager → SDK Tools → *Android SDK Command-line Tools* | `sdkmanager --version` |
| JDK 17 | `C:\Program Files\Java\jdk-17` | `java -version` |
| VS Code + extensions | `code --install-extension Dart-Code.flutter` (installs Flutter + Dart) | Extensions panel |
| Docker Desktop | docker.com (only needed for the local backend) | `docker info` |

### 1.2 Point Flutter at the SDKs
```powershell
# The Android SDK path must not contain spaces. On this PC the user folder has one,
# so a junction gives a space-free path to the same SDK:
New-Item -ItemType Junction -Path C:\Android\Sdk -Target "$env:LOCALAPPDATA\Android\Sdk"
[Environment]::SetEnvironmentVariable('ANDROID_HOME','C:\Android\Sdk','User')

flutter config --android-sdk C:\Android\Sdk
flutter config --jdk-dir "C:\Program Files\Java\jdk-17"
flutter doctor --android-licenses      # answer y to everything
flutter doctor                          # should end with "No issues found!"
```

### 1.3 Get the project's packages
```powershell
flutter pub get
```

---

## 2. Run the app

### 2.1 Pick where the app gets its data (`API_BASE`)
The app reads its server address at build time:

| Target | Command flag | When |
|---|---|---|
| **Local Docker backend** | `--dart-define=API_BASE=http://10.0.2.2` | Day-to-day development. `10.0.2.2` is "this PC" as seen from the Android emulator |
| Real phone on the same Wi-Fi | `--dart-define=API_BASE=http://<PC-LAN-IP>` (e.g. `http://192.168.1.20`) | Testing on a physical device against the local backend |
| Live server | *(no flag)* → `https://www.realhubb.co.in` | Only once the live server runs the new backend |

Plain `http://` works in **debug builds only** (allowed in `android/app/src/debug/AndroidManifest.xml`); release builds are HTTPS-only.

### 2.2 Start the local backend first
```powershell
cd "C:\my folder\Broadzen\infra"
docker compose up -d          # postgres + api + nginx on http://localhost
docker compose ps             # all should be "running"
cd "C:\my folder\Broadzen\mobile"
```
Admin account: `realhubbmktg@gmail.com` (password set on first run; see `infra/README.md`).

### 2.3 Start an emulator
```powershell
flutter emulators                       # list (we use Pixel_9a)
flutter emulators --launch Pixel_9a
flutter devices                         # should show emulator-5554
```
If the emulator shows a **black screen**, start it with software graphics:
```powershell
C:\Android\Sdk\emulator\emulator.exe -avd Pixel_9a -gpu swiftshader_indirect
```

### 2.4 Run (debug, with hot reload)
**VS Code:** Run and Debug (`Ctrl+Shift+D`), then pick a configuration and press **F5**:
- **Broadzen (Flutter, local Docker)**: uses the local backend (recommended)
- **Broadzen (Flutter)**: live server
- **Broadzen (Flutter, release)**: release mode

While it runs:
- save a file to hot reload;
- `Ctrl+Shift+F5` hot restarts;
- `Shift+F5` stops.

**Terminal:**
```powershell
flutter run --dart-define=API_BASE=http://10.0.2.2
```
Keys while `flutter run` is active:

| Key | Action |
|---|---|
| `r` | Hot reload |
| `R` | Hot restart |
| `p` | Show widget layout guides |
| `o` | Toggle Android/iOS look |
| `d` | Detach |
| `q` | Quit |

**Android Studio:** Open the `mobile` folder, choose the device, then Run ▶. (Add `--dart-define=API_BASE=http://10.0.2.2` under *Run → Edit Configurations → Additional run args*.)

### 2.5 Run on a real Android phone
1. On the phone: Settings → About → tap *Build number* 7 times, then Developer options → turn on **USB debugging**.
2. Plug it in and accept the prompt on the phone.
3. Check that it's detected, then run:
   ```powershell
   flutter devices
   flutter run -d <device-id> --dart-define=API_BASE=http://<PC-LAN-IP>
   ```
4. Allow port 80 through Windows Firewall if the phone can't reach the PC.

---

## 3. Code quality: run these before every commit

```powershell
dart format lib test        # format (120-column style, set in analysis_options.yaml)
flutter analyze             # static analysis: must say "No issues found!"
flutter test                # all tests must pass
```

### 3.1 Tests
| Command | Runs |
|---|---|
| `flutter test` | Everything (77 tests) |
| `flutter test test/auth_test.dart` | One file |
| `flutter test --plain-name "refresh"` | Tests whose name contains "refresh" |
| `flutter test --coverage` | Writes `coverage/lcov.info` |

What the test files cover:

| File | Covers |
|---|---|
| `widget_test.dart` | WCAG colour contrast of every text token (light + dark), login screen, reduced-motion login, admin shell |
| `auth_test.dart` | Who may go where (signed out / normal user / admin), sign-up form validation |
| `api_client_test.dart` | Token refresh: single refresh shared by parallel requests, retry, sign-out when refresh fails |
| `format_test.dart` | ₹ formatting, phone normalising, dates |
| `dashboard_test.dart` | CPL bands, KPI totals, action queue rules |
| `inbox_test.dart` | Conversation sort/filter, unread badge, message ticks, date separators |
| `broadcasts_test.dart` | Progress %, status mapping, Meta error → "likely reason" |
| `leads_contacts_test.dart` | CSV/XLSX import parsing, phone validation, duplicates, CSV export |
| `templates_test.dart` | Template content score + advice, `{{n}}` variables, name rules |
| `settings_rcs_enquiries_test.dart` | Meta token expiry status, device labels, RCS recipients |
| `fakes.dart` | Test helpers (fake HTTP adapter, fake secure storage), not tests themselves |

### 3.2 Backend tests (from the repo root, stack running)
```powershell
cd "C:\my folder\Broadzen\infra"
docker compose run --rm migrate node scripts/test-isolation.mjs        # workspaces can't see each other (11 checks)
docker run --rm --network broadzen_default -e BASE=http://app:3000 `
  -e ADMIN_EMAIL=realhubbmktg@gmail.com -e ADMIN_PASSWORD=<admin password> `
  -v "C:\my folder\Broadzen\scripts:/s:ro" node:22-alpine node /s/test-auth-flow.mjs   # sign-up → approval → security (41 checks)
```

### 3.3 Manual test checklist (before a release)
- [ ] Sign up a new account, see the Pending screen, and confirm sign-in is blocked while pending.
- [ ] Approve it in Admin (web `/admin` or app *More → Admin*). The user can sign in and sees **only** their empty workspace.
- [ ] Sign in as the admin and open every tab plus every *More* item. Real data loads, and pull-to-refresh works.
- [ ] Reject or suspend a user. They are signed out and see the right message.
- [ ] Kill and reopen the app. It stays signed in, with no login flash.
- [ ] Light **and** dark mode (*Settings → Appearance*), and large system font size.
- [ ] Phone *Settings → Accessibility → Remove animations*: the login shows instantly.
- [ ] Airplane mode: error states with **Try again**, and no crash.

---

## 4. Build the app

| Goal | Command | Output |
|---|---|---|
| Debug APK (test installs) | `flutter build apk --debug --dart-define=API_BASE=http://10.0.2.2` | `build\app\outputs\flutter-apk\app-debug.apk` |
| Profile APK (check animation smoothness / performance) | `flutter build apk --profile --dart-define=API_BASE=http://10.0.2.2` | `...\app-profile.apk` |
| Release APK (share directly) | `flutter build apk --release --dart-define=API_BASE=https://<your-domain>` | `...\app-release.apk` |
| Smaller per-CPU APKs | `flutter build apk --release --split-per-abi --dart-define=API_BASE=https://<your-domain>` | `app-arm64-v8a-release.apk` etc. |
| **Play Store bundle** | `flutter build appbundle --release --dart-define=API_BASE=https://<your-domain>` | `build\app\outputs\bundle\release\app-release.aab` |

Install a built APK on a connected phone or emulator:
```powershell
C:\Android\Sdk\platform-tools\adb.exe install -r build\app\outputs\flutter-apk\app-debug.apk
C:\Android\Sdk\platform-tools\adb.exe shell am start -n com.broadzen.app/.MainActivity
```

### 4.1 Version number
In `pubspec.yaml`: `version: 1.0.0+1`, meaning **versionName** + **versionCode**. Raise the number after `+` for **every** build you upload to Play (it must always increase), e.g. `1.0.1+2`.

### 4.2 Release signing (do once, before the first Play upload)
Release builds are currently signed with the **debug** key (`android/app/build.gradle.kts`), which is fine for testing but **not** accepted by Play.

1. Create the upload key. **Keep this file and its passwords safe forever**: losing it means you can't update the app.
   ```powershell
   & "C:\Program Files\Java\jdk-17\bin\keytool.exe" -genkey -v -keystore C:\keys\broadzen-upload.jks `
     -keyalg RSA -keysize 2048 -validity 10000 -alias upload
   ```
2. Create `android/key.properties`. It's git-ignored, so never commit it:
   ```properties
   storePassword=<store password>
   keyPassword=<key password>
   keyAlias=upload
   storeFile=C:\\keys\\broadzen-upload.jks
   ```
3. In `android/app/build.gradle.kts`, load `key.properties` into a `signingConfigs { create("release") {...} }` block and set `buildTypes.release.signingConfig = signingConfigs.getByName("release")` (Flutter docs: *"Build and release an Android app"*).
4. In Play Console, enrol in **Play App Signing** (Google keeps the final key; yours is only the upload key).
5. Print the key's SHA-1, which Google sign-in needs:
   ```powershell
   & "C:\Program Files\Java\jdk-17\bin\keytool.exe" -list -v -keystore C:\keys\broadzen-upload.jks -alias upload
   ```

### 4.3 Play Store checklist
- [ ] Release signing set up (4.2), `versionCode` raised.
- [ ] `API_BASE` points at the HTTPS production server.
- [ ] Store icon `store/play_icon_512.png`, a 1024×500 feature graphic, and screenshots (phone + 7"/10" tablet).
- [ ] Privacy policy URL, plus the **Data safety** form (see `../play-store-data-safety.md`).
- [ ] An in-app path to account/data deletion (*Settings → Account & data*).
- [ ] Test with an internal testing track before production.

---

## 5. How the app is built (architecture)

```
lib/
  main.dart             app start: loads preferences, builds MaterialApp.router with light/dark themes
  app/
    router.dart         every route + authRedirect() (who may go where)
    providers.dart      app-wide state: theme mode, selected Meta account, SharedPreferences
  core/
    config.dart         API_BASE (from --dart-define)
    api_client.dart     Dio HTTP client: Bearer token, X-Client: mobile, 401 → refresh once → retry
    format.dart         ₹ / numbers / phones / dates helpers
  theme/
    tokens.dart         AppColors (35 colour tokens, light + dark), Space, Radii, brandGradient
    app_theme.dart      AppText type scale (Sora + Inter) and the Material theme
  widgets/
    ui.dart             shared design-system widgets: StatusBadge, StatCard, AppCard, EmptyState,
                        ErrorView, LoadingList, AlertBanner, AsyncBody, confirm(), showSnack()
    brand_mark.dart     BrandSymbol / BrandLockup / BrandWordmark (logo images)
  features/<name>/      one folder per feature: screens + its own data/models file
    auth/               login (animated), sign-up, pending, splash, session controller
    workspace/          what a normal (non-admin) user sees
    admin/              admin hub: requests, users, enquiries, login activity, audit
    shell/              bottom tabs (phone) / navigation rail (tablet)
    dashboard/ inbox/ leads/ contacts/ campaigns/ send/ broadcasts/
    templates/ enquiries/ rcs/ settings/ more/
assets/
  fonts/                Sora + Inter (bundled)
  brand/                logo PNGs (symbol, lockups, wordmarks)
```

**Main building blocks**

| Concern | Choice | Where |
|---|---|---|
| State | Riverpod 3 (`Provider`, `FutureProvider`, `Notifier`) | `ref.watch(...)` in widgets |
| Navigation | go_router: tab shell + redirects; sub-pages use `Navigator.push` | `app/router.dart` |
| HTTP | Dio via `ApiClient` (`get/post/put/delete`), errors as `ApiException(message)` | `core/api_client.dart` |
| Sign-in | Own backend: tokens in **flutter_secure_storage**, auto-refresh | `features/auth/auth_controller.dart` |
| Design | Only `context.colors`, `AppText`, `Space`, `Radii`, never raw hex | `theme/` |
| Icons | `lucide_icons_flutter` (`LucideIcons.house` etc.), same set as the web | |
| Charts | fl_chart | dashboard |

**Who sees what** (`authRedirect` in `router.dart`):

| State | Allowed |
|---|---|
| Restoring the session | `/splash` |
| Signed out | `/login`, `/signup`, `/pending` |
| Normal user | `/workspace` only (their private workspace) |
| Platform admin | the full shell, plus *More → Admin* |

---

## 6. How to add things

### 6.1 A new screen
1. Create `lib/features/<feature>/<name>_screen.dart`. Use `Scaffold` + `AppBar`, and build the body from `widgets/ui.dart` pieces.
2. Load data with a provider in `lib/features/<feature>/data.dart`:
   ```dart
   final thingsProvider = FutureProvider.autoDispose((ref) async {
     final json = await ref.read(apiClientProvider).get('/api/things');
     return (json['things'] as List).map((e) => Thing.fromJson(e)).toList();
   });
   ```
3. Show it with `AsyncBody(value: ref.watch(thingsProvider), data: (things) => ..., onRetry: () => ref.invalidate(thingsProvider))`. That gives you loading, error-with-retry and data states for free. Add `RefreshIndicator` for pull-to-refresh.
4. Route it:
   - a top-level page gets a `page('/path', const MyScreen())` in `router.dart`;
   - a sub-page uses `Navigator.of(context).push(MaterialPageRoute(builder: (_) => const MyScreen()))`.
5. Rules:
   - every list needs an **empty state with an action**;
   - every load needs an **error with Try again**;
   - tap targets are at least **48dp**;
   - icon buttons have a `tooltip`;
   - status is shown as text + icon, never colour alone.
6. Add a test in `test/<feature>_test.dart` for any logic (parsing, calculations, rules).

### 6.2 A new package
```powershell
flutter pub add <package>          # adds to pubspec.yaml + runs pub get
flutter pub outdated               # see available updates
flutter pub upgrade                # update within allowed versions
```
Prefer what's already installed. Add a package only when a few lines of code can't do the job.

### 6.3 Change colours, fonts or the logo
- **Colours:** edit `lib/theme/tokens.dart` (both `light` and `dark`). `flutter test` then re-checks text contrast automatically.
- **Fonts:** files go in `assets/fonts/`, are declared in `pubspec.yaml`, and the styles live in `AppText` in `app_theme.dart`.
- **Logo:** source files are in `../public/Broadzen Refined Logo Direction/`. The trimmed app copies are in `assets/brand/`, and the Android icons are under `android/app/src/main/res/` (`drawable-*/ic_launcher_*.png`, `mipmap-*/ic_launcher.png`, `splash_icon.png`).

### 6.4 App name and ID
| What | Where |
|---|---|
| Name under the icon | `android/app/src/main/AndroidManifest.xml` → `android:label="Broadzen"` |
| App ID (Play Store identity; never change after publishing) | `android/app/build.gradle.kts` → `applicationId = "com.broadzen.app"` |
| iOS name / bundle id | `ios/Runner/Info.plist`, `ios/Runner.xcodeproj/project.pbxproj` |

---

## 7. Debugging

| Need | How |
|---|---|
| Breakpoints | VS Code: click left of a line number, then **F5** |
| Widget tree / layout / performance | While running: `Ctrl+Shift+P` → *Flutter: Open DevTools* (Inspector, Performance, Network) |
| App logs | Debug Console in VS Code, or `flutter logs` |
| Android system log | `C:\Android\Sdk\platform-tools\adb.exe logcat -s flutter` |
| Screenshot from the emulator/phone | `adb shell screencap -p /sdcard/s.png; adb pull /sdcard/s.png` |
| Record the screen (e.g. check animations) | `adb shell screenrecord --time-limit 6 /sdcard/r.mp4; adb pull /sdcard/r.mp4` |
| Clear app data (fresh first launch) | `adb shell pm clear com.broadzen.app` |
| Force dark / light on the emulator | `adb shell cmd uimode night yes` / `no` |
| Check the backend directly | `Invoke-WebRequest http://localhost/api/auth/me` (expects 401 without a session) |

---

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| `Android SDK location currently contains spaces` | Use the `C:\Android\Sdk` junction (section 1.2) |
| `sdkmanager did not install NDK …` | `cmd /c "\"C:\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat\" \"ndk;28.2.13676358\""` |
| Build error `could not open ...\Android Studio\jbr\lib\jvm.cfg` | Android Studio's bundled Java is damaged. Run `flutter config --jdk-dir "C:\Program Files\Java\jdk-17"`, or reinstall Android Studio |
| Emulator shows a black screen | Start it with `-gpu swiftshader_indirect` (section 2.3) |
| App says "No connection" on the emulator | Is the backend up (`docker compose ps`)? Did you pass `--dart-define=API_BASE=http://10.0.2.2`? |
| `429 Too many requests` on sign-in | nginx rate limit (10 sign-in attempts/min). Wait a minute |
| "Too many failed attempts" | 5 wrong passwords lock that email for 15 minutes (by design) |
| Stuck on "waiting for approval" | Approve the account in Admin (web `/admin` or app *More → Admin*) |
| Weird build errors after switching branches | `flutter clean; flutter pub get` |
| Gradle out of date / cache problems | `cd android; .\gradlew --stop; cd ..; flutter clean` |
| Change not showing after hot reload | Press `R` (hot restart). Changes to `main()`, providers or native files need a full restart or rebuild |

---

## 9. Quick reference

```powershell
# daily
cd "C:\my folder\Broadzen\infra"; docker compose up -d; cd ..\mobile
flutter emulators --launch Pixel_9a
flutter run --dart-define=API_BASE=http://10.0.2.2

# before committing
dart format lib test; flutter analyze; flutter test

# builds
flutter build apk --debug --dart-define=API_BASE=http://10.0.2.2
flutter build appbundle --release --dart-define=API_BASE=https://<your-domain>

# when things break
flutter clean; flutter pub get; flutter doctor
```
