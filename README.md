# Tauri + Vanilla TS

## App welcome screen

The app opens a bundled welcome screen with Sign up and Sign in buttons and a
Legal Center link at the bottom. It supports light and dark system themes and
loads without an internet connection. Account buttons open the existing website
authentication inside the app using its hash routes (`/#/signup`, `/#/login`);
authentication and workspace access require an internet connection.

The top-right Update control lives in a separate local webview, so it remains
available after signing in. It checks the latest release, asks before installing,
shows download progress, verifies the signature and signed version, and restarts.
The website receives no native updater, filesystem, or dialog permissions.

## Publish an update

1. Increment versions in `package.json` / `package-lock.json`,
   `src-tauri/Cargo.toml` / `Cargo.lock`, and `src-tauri/tauri.conf.json`.
2. Commit and push the source to `master`.
3. Run `npm run release` on Windows with the local signing key available.

The release script builds signed Windows installers, starts the universal Mac
build, downloads and signs its updater archive locally, prepares a draft release
with `latest.json`, then publishes it. Existing download-site links are refreshed
to serve this version too. A failed build does not advertise a new update.

The signing key is `.release-keys/buildbench-updater.key` (gitignored), or the
path in `BUILDBENCH_UPDATER_KEY`. Keep a secure backup of this key: existing apps
trust its public key. Never commit it or replace it casually. No signing key is
sent to GitHub; CI only builds the Mac artifacts. To build locally outside the
release script, set `TAURI_SIGNING_PRIVATE_KEY` to the key's absolute path first.

Users on 0.1.0 need one manual installation to receive the updater. Subsequent
higher versions can be installed through Update.

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
code signature, then preserves the DMG and updater archive as workflow artifacts
for local signing and publication by `npm run release`.
Run it from GitHub Actions, or with:

```sh
gh workflow run macos-release.yml
```

The current workflow uses ad-hoc signing, not Developer ID signing/notarization.
macOS may block the downloaded app with an unverified-developer warning.
For public distribution without that warning, configure Apple Developer signing
and notarization before publishing a replacement installer.
