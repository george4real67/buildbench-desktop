# Tauri + Vanilla TS

This template should help get you started developing with Tauri in vanilla HTML, CSS and Typescript.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## macOS installer

The manual `Build macOS installer` GitHub Actions workflow builds a universal
DMG for Apple Silicon and Intel Macs, verifies both architectures and the ad-hoc
code signature, then uploads it to the existing release matching the app version.
Run it from GitHub Actions, or with:

```sh
gh workflow run macos-release.yml
```

The current workflow uses ad-hoc signing, not Developer ID signing/notarization.
macOS may block the downloaded app with an unverified-developer warning.
For public distribution without that warning, configure Apple Developer signing
and notarization before publishing a replacement installer.
