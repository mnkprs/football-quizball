# Firebase MCP Setup — iOS + Project Config

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Firebase integration — iOS Crashlytics + Analytics (matching Android), project-level `firebase.json`, and MCP connectivity.

**Architecture:** Native-only Firebase integration via CocoaPods (iOS) and Gradle (Android, already done). No Capacitor Firebase plugins — Firebase SDKs are initialized at the native layer only. MCP provides CLI tooling for project management.

**Tech Stack:** Firebase iOS SDK (via CocoaPods), Firebase Crashlytics, Firebase Analytics, Firebase CLI (via MCP)

---

### Task 1: Authenticate Firebase CLI via MCP

**Why:** All MCP tools require authentication. The user must complete a browser-based OAuth flow.

- [ ] **Step 1: Initiate Firebase login**

Run MCP tool: `firebase_login` (no parameters)

This will return a URL. Open it in the browser, sign in with Google, and paste the authorization code back.

- [ ] **Step 2: Verify authentication**

Run MCP tool: `firebase_get_environment`

Expected: `Authenticated User` shows your Google email, no longer `<NONE>`.

---

### Task 2: Link Firebase Project & Register iOS App

**Why:** The project needs to be linked to `stepovr-cb448` so MCP tools work. The iOS app may not be registered in Firebase yet.

- [ ] **Step 1: Set active project**

Run MCP tool: `firebase_update_environment` with:
```json
{
  "active_project": "stepovr-cb448",
  "project_dir": "/Users/instashop/Projects/football-quizball"
}
```

- [ ] **Step 2: Check existing apps**

Run MCP tool: `firebase_list_apps` with `platform: "all"`

Look for an iOS app with bundle ID `com.stepovr.app`. If it exists, note its `appId`. If not, proceed to Step 3.

- [ ] **Step 3: Register iOS app (if not found in Step 2)**

Run MCP tool: `firebase_create_app` with:
```json
{
  "platform": "ios",
  "display_name": "StepOvr iOS",
  "ios_config": {
    "bundle_id": "com.stepovr.app"
  }
}
```

- [ ] **Step 4: Get iOS SDK config**

Run MCP tool: `firebase_get_sdk_config` with `platform: "ios"`

This returns the Firebase config values. However, the `GoogleService-Info.plist` file must be downloaded manually from the Firebase Console:

1. Go to https://console.firebase.google.com/project/stepovr-cb448/settings/general
2. Find the iOS app (`com.stepovr.app`)
3. Click "Download GoogleService-Info.plist"
4. Save it to: `frontend/ios/App/App/GoogleService-Info.plist`

**USER ACTION REQUIRED:** Download `GoogleService-Info.plist` from Firebase Console and place it at `frontend/ios/App/App/GoogleService-Info.plist`.

---

### Task 3: Add Firebase Pods to iOS Podfile

**Files:**
- Modify: `frontend/ios/App/Podfile`

- [ ] **Step 1: Add Firebase pods**

In `frontend/ios/App/Podfile`, add Firebase pods inside the `capacitor_pods` function:

```ruby
def capacitor_pods
  pod 'Capacitor', :path => '../../node_modules/@capacitor/ios'
  pod 'CapacitorCordova', :path => '../../node_modules/@capacitor/ios'
  pod 'CapacitorCommunityAdmob', :path => '../../node_modules/@capacitor-community/admob'
  pod 'CapacitorCommunityAppleSignIn', :path => '../../node_modules/@capacitor-community/apple-sign-in'
  pod 'CapacitorApp', :path => '../../node_modules/@capacitor/app'
  pod 'CapacitorHaptics', :path => '../../node_modules/@capacitor/haptics'
  pod 'SouthdevsCapacitorGoogleAuth', :path => '../../node_modules/@southdevs/capacitor-google-auth'
  pod 'CordovaPlugins', :path => '../capacitor-cordova-ios-plugins'
end

target 'App' do
  capacitor_pods
  # Firebase
  pod 'FirebaseAnalytics'
  pod 'FirebaseCrashlytics'
end
```

Note: Firebase pods go in the `target 'App'` block (not inside `capacitor_pods`), so they're resolved from the public CocoaPods repo.

- [ ] **Step 2: Run pod install**

```bash
cd frontend/ios/App && pod install
```

Expected: Pods for `FirebaseAnalytics` and `FirebaseCrashlytics` are downloaded and installed successfully.

- [ ] **Step 3: Commit**

```bash
git add frontend/ios/App/Podfile frontend/ios/App/Podfile.lock
git commit -m "feat: add Firebase Analytics + Crashlytics pods for iOS"
```

---

### Task 4: Initialize Firebase in iOS AppDelegate

**Files:**
- Modify: `frontend/ios/App/App/AppDelegate.swift`

- [ ] **Step 1: Add Firebase import and initialization**

Replace the contents of `frontend/ios/App/App/AppDelegate.swift` with:

```swift
import UIKit
import Capacitor
import FirebaseCore

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        FirebaseApp.configure()
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
```

The key changes are:
1. `import FirebaseCore` at the top
2. `FirebaseApp.configure()` as the first line in `didFinishLaunchingWithOptions`

- [ ] **Step 2: Verify GoogleService-Info.plist is in place**

```bash
ls -la frontend/ios/App/App/GoogleService-Info.plist
```

Expected: File exists. If not, go back to Task 2 Step 4 and download it.

- [ ] **Step 3: Add GoogleService-Info.plist to Xcode project**

**USER ACTION REQUIRED:** Open `frontend/ios/App/App.xcworkspace` in Xcode. Drag `GoogleService-Info.plist` from Finder into the `App` group in Xcode's project navigator. Ensure "Copy items if needed" is checked and the `App` target is selected.

This step cannot be done via CLI — Xcode must register the file in the `.pbxproj`.

- [ ] **Step 4: Commit**

```bash
git add frontend/ios/App/App/AppDelegate.swift frontend/ios/App/App/GoogleService-Info.plist
git commit -m "feat: initialize Firebase Crashlytics + Analytics on iOS"
```

---

### Task 5: Add Crashlytics Build Phase for dSYM Upload (iOS)

**Why:** Crashlytics needs dSYM files uploaded to symbolicate crash reports. This requires a Run Script build phase in Xcode.

- [ ] **Step 1: Add dSYM upload script in Xcode**

**USER ACTION REQUIRED:** In Xcode, open `App.xcworkspace`:

1. Select the `App` target → **Build Phases**
2. Click **+** → **New Run Script Phase**
3. Drag it to be the **last** build phase
4. Set the shell to `/bin/sh`
5. Paste this script:

```bash
"${PODS_ROOT}/FirebaseCrashlytics/run"
```

6. Add these Input Files:
   - `${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}`
   - `${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}/Contents/Resources/DWARF/${PRODUCT_NAME}`
   - `${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}/Contents/Info.plist`
   - `$(TARGET_BUILD_DIR)/$(UNLOCALIZED_RESOURCES_FOLDER_PATH)/GoogleService-Info.plist`

7. Uncheck "Based on dependency analysis" (so it runs every build)

- [ ] **Step 2: Enable dSYM generation for Release**

In Xcode: `App` target → **Build Settings** → search "Debug Information Format":
- Set **Release** to `DWARF with dSYM File` (should already be default, verify)

- [ ] **Step 3: Commit the pbxproj changes**

```bash
git add frontend/ios/App/App.xcodeproj/project.pbxproj
git commit -m "feat: add Crashlytics dSYM upload build phase for iOS"
```

---

### Task 6: Create firebase.json for Project-Level Config

**Files:**
- Create: `frontend/firebase.json` (or project root — depends on MCP init)

- [ ] **Step 1: Initialize Firebase project config via MCP**

Run MCP tool: `firebase_init` with minimal features. Since we only use Crashlytics + Analytics (no Firestore, no Hosting, no RTDB from Firebase), we just need the base config:

```json
{
  "features": {}
}
```

This creates a `firebase.json` in the project directory, linking it to `stepovr-cb448`.

- [ ] **Step 2: Verify firebase.json was created**

```bash
cat firebase.json
```

Expected: A valid JSON file referencing the project.

- [ ] **Step 3: Create .firebaserc if not created by init**

If `firebase_init` didn't create `.firebaserc`, create it manually:

```json
{
  "projects": {
    "default": "stepovr-cb448"
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add firebase.json .firebaserc
git commit -m "chore: add firebase.json project config"
```

---

### Task 7: Verify Full Setup

- [ ] **Step 1: Verify MCP connectivity**

Run MCP tool: `firebase_get_environment`

Expected:
- `Active Project ID: stepovr-cb448`
- `Authenticated User: <your email>`

- [ ] **Step 2: Verify both apps registered**

Run MCP tool: `firebase_list_apps` with `platform: "all"`

Expected: Both Android (`com.stepovr.app`) and iOS (`com.stepovr.app`) apps listed.

- [ ] **Step 3: Build iOS to verify Firebase initializes**

**USER ACTION REQUIRED:** Build and run the iOS app via Xcode. Check the console for:
```
[GoogleUtilities/AppDelegateSwizzler] Firebase App Delegate Proxy enabled
```

No crashes on launch = success.

- [ ] **Step 4: Verify Crashlytics in Firebase Console**

Go to https://console.firebase.google.com/project/stepovr-cb448/crashlytics

Both Android and iOS apps should appear. iOS may show "Waiting for your first crash report" — this is expected until the first real crash or test crash.

---

## Summary of User Actions Required (Outside MCP Scope)

| Step | Action |
|------|--------|
| Task 1, Step 1 | Complete browser OAuth flow for Firebase login |
| Task 2, Step 4 | Download `GoogleService-Info.plist` from Firebase Console |
| Task 4, Step 3 | Drag `GoogleService-Info.plist` into Xcode project |
| Task 5, Step 1-2 | Add Crashlytics Run Script build phase + verify dSYM settings in Xcode |
| Task 7, Step 3 | Build and run iOS app to verify |
