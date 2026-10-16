# Tauri + Vanilla TS

## App welcome screen

The app opens a bundled welcome screen with Sign up and Sign in buttons and a
Legal Center link at the bottom. It supports light and dark system themes and
loads without an internet connection. Account buttons open the existing website
authentication inside the app using its hash routes (`/#/signup`, `/#/login`);
authentication and workspace access require an internet connection.

Build new installers with `npm run tauri build` to distribute this change.
The adjacent `buildbench-download` project serves published installers; its
existing release links will continue to serve the old binaries until replaced.

## Security review

See [SECURITY_REPORT.md](SECURITY_REPORT.md) for the desktop security review,
local verification, and outstanding website/release checks. Run
`npm run test:security` to check the wrapper's security configuration.
The remote website has no native capabilities or application commands; changes
that add native functionality must receive a fresh permission review.

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
