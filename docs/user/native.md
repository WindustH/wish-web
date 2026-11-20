# Wish native client

The Tauri 2 app bundles the Wish UI with a Rust client. On first launch choose SSH or HTTP(S). To use SSH, enter the server's SSH address, generate a key, copy its public key into the backend's allowlist, then compare the displayed fingerprint with the backend startup log. The backend API port field defaults to 9780. The app can also use a system key on desktop. For an existing Wish deployment, use HTTP(S) with its reachable address and access token if required. On a phone, 127.0.0.1 refers to the phone itself.

The WebView stores its non-exportable P-256 key under the packaged app's origin. Previously generated Ed25519 keys are also supported in WebViews with Ed25519 support. Clearing app storage deletes these keys. When the app returns to the foreground, it checks the tunnel and reconnects with the saved identity and pinned host key if needed. It also restores a previously signed-in SSH connection after a process restart. Wish clients negotiate compression after authentication and before encryption when the SSH server supports it. Requests, event streams, downloads and terminal WebSockets use the same native connection through a private, per-login loopback URL. The app has no Node.js runtime dependency.

## Build

Install the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your host and the [Wish Web build dependencies](deployment.md). From the wish-web checkout, install JavaScript dependencies with the package manager version in package.json. Build commands below use the pinned Tauri CLI. The build hook generates platform icons from the paper crane SVG. On Android it also restores the Gradle 9.6.1 wrapper JAR using a pinned SHA-256 digest. For an offline build, place that JAR from the matching Gradle distribution in `src-tauri/gen/android/gradle/wrapper/` before building.

| Target | Command | Output |
| --- | --- | --- |
| Linux x86-64 | `pnpm tauri build --bundles deb` | Executable under `src-tauri/target/release/` and Debian package under `bundle/deb/` |
| Android ARM64 | `pnpm tauri android build --target aarch64 --apk` | Release APK under `src-tauri/gen/android/app/build/outputs/apk/` |
| Windows | `pnpm tauri build --bundles nsis` on Windows with MSVC and WebView2 | NSIS installer |
| macOS | `pnpm tauri build --bundles dmg` on a Mac with Xcode command-line tools | App and disk image |
| iOS | Run `pnpm tauri ios init` on macOS, configure the signing team in Xcode, then `pnpm tauri ios build` | Xcode archive and signed application according to the selected export method |

The Android project targets SDK 36. Set ANDROID_HOME, NDK_HOME and JAVA_HOME, and install the Rust target for the desired ABI, e.g. `rustup target add aarch64-linux-android`. To produce an installable development APK with the local Android debug signer, use `pnpm tauri android build --debug --target aarch64 --apk`. Release APKs need [Android signing](https://v2.tauri.app/distribute/sign/android/) before installation. Use `adb install -r path/to/Wish.apk` on an authorized test device.

Linux uses the distribution's GTK 3 and WebKitGTK 4.1. Build on the oldest Linux distribution you plan to support, since binaries inherit the build host's glibc and system library requirements.

After signing out, select a saved account card to reconnect with its address and credentials, or use the **+** tile to add an account. The settings gear opens the device’s Interface, Keyboard shortcuts and Debug preferences even while signed out. These preferences apply to every backend account on the device. Each account retains its own response cache. Removing a card forgets its saved login. SSH keys are managed separately in the connection form.
