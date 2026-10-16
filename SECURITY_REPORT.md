# BuildBench desktop security review

Date: 2026-10-16 (Asia/Karachi)

## Subsequent updater implementation (0.1.1)

This section supersedes the earlier zero-plugin architecture below. Native Rust
now registers the updater and dialog plugins. No JavaScript commands are exposed:
capabilities remain empty and remote website content receives no IPC access.
A separate local toolbar webview remains above the content. Its navigation
handler accepts only its bundled origin and intercepts one exact update action;
it never sends that action to the network. Native code uses one fixed HTTPS
GitHub endpoint and a pinned public key, requires version-bound signatures, asks
for confirmation before download/install, and serializes update attempts.

The private signing key stays local in a gitignored directory; the Mac CI job
only builds and validates artifacts. The release script signs Mac artifacts
locally and uploads public signatures. It advertises a release only after all
supported platforms have installers and manifest entries. Updater signatures
are distinct from OS publisher signing/notarization. The earlier OS-signing and
website audit limitations still apply.

Subsequent welcome-screen change: the startup window now loads bundled
`index.html`, with HTTPS links to the existing website hash routes for signup
and login, and to Legal Center. The CSP and native permissions are unchanged.
The direct remote startup architecture described below records the earlier
audit state.

## Result and scope

The available desktop source was reviewed and unnecessary native privileges were removed. No authentication bypass, token disclosure, injection exploit, unauthorized account access, or credit/payment manipulation was demonstrated. This is a source/configuration audit with local regression checks, **not a completed end-to-end penetration test or production security certification**.

Scope: Rust entry points, Tauri configuration and capabilities, bundled HTML/TypeScript, dependency manifests/lockfiles, Vite configuration, and the macOS release workflow. The adjacent download Worker was inspected read-only to identify its role; it is an installer proxy, not the application's authentication/payment backend. No changes were made there.

The initial audit attempted a normal unauthenticated homepage read through curl and the web tool; both failed before any page content or headers could be inspected. After scope clarification, no further live-site requests were made. No exploit payloads, scans, account actions, payment actions, or disruptive tests were sent to production. No user browser profile, cookies, or stored credentials were read. No deployment or installer publication occurred.

## Architecture and trust boundaries

The production window loads `https://buildbench.online` directly. The packaged `index.html` is not the website's application code. The Rust code originally registered only a template `greet` command and the opener plugin. There is no custom Rust HTTP client, authentication implementation, token store, payment implementation, database, or business API handler in this repository.

Authentication, API calls, browser storage, cookies, and payment UI are implemented by the remote website. WebView persistence follows platform browser behavior; absence of storage code here does not mean website credentials are absent from disk. No website JavaScript or authenticated session was available for inspection.

Tauri capabilities originally had no remote URL grant. Therefore the presence of `opener:default` alone was **not evidence that the live website could invoke opener commands**. Removing unused native functionality reduces attack surface; it does not demonstrate a previously exploitable remote code execution vulnerability. Disabling `withGlobalTauri` alone is not an IPC authorization boundary.

## Findings and changes

| ID | Classification | Evidence and impact | Resolution |
| --- | --- | --- | --- |
| D-01 | Low / defense in depth | Unused `greet` command, opener registration, global Tauri object, and `core:default` / `opener:default` grants enlarged the native surface. Remote exploitation was not demonstrated. | Removed command/plugin and their direct dependencies; disabled global API; explicitly selected a zero-permission capability with no remote grant. |
| D-02 | Low / bundled content only | `app.security.csp` was null. Bundled template HTML had no application CSP. No XSS sink was demonstrated. | Added restrictive bundled CSP and replaced the interactive template with static BuildBench fallback HTML. |
| D-03 | Informational | DevTools setting was implicit. Default release behavior already depends on Tauri's compile-time features. | Explicitly disabled window DevTools. This is a UI hardening choice, not protection against a user controlling their own binary. |
| D-04 | Open hardening gap | No explicit navigation or popup origin policy. The initial HTTPS URL does not constrain every subsequent navigation. | Deferred pending actual OAuth, checkout, download, and external-link requirements. A guessed domain allowlist could break functionality. No navigation exploit was demonstrated. |
| D-05 | Open supply-chain gap | macOS workflow uses ad-hoc signing, mutable action references, and can publish an artifact from a supplied previous run. It checks version/architecture/signature consistency but does not establish Developer ID identity or approved-source provenance. | Not changed; production signing identities, notarization, immutable action revisions, and artifact provenance validation require release-owner configuration. Windows signing was not established from the reviewed source. |

The user's existing `zoomHotkeysEnabled: true` change was preserved.

The CSP change protects bundled assets served by Tauri. It does **not** inject a security header into `https://buildbench.online`. Website CSP, HSTS, framing protection, referrer policy, CORS, and cookie flags remain unverified. A local CSP must never be described as a server-side fix.

## Coverage

| Area | Local review outcome | Remaining verification |
| --- | --- | --- |
| Authentication and API authorization | No custom implementation exists in the desktop source. | Inspect website client and server; test unauthenticated/expired/revoked sessions and cross-account object access in staging. |
| Tokens and local storage | No hardcoded credential or custom token persistence was found by targeted source inspection. No native logging of tokens exists in the reviewed code. | Inspect website storage, cookie flags, logout invalidation, refresh rotation, URL/referrer leakage, logs and WebView profile permissions using synthetic accounts. Git history and binary secret scanning were not completed. |
| Injection and native execution | No application SQL, shell execution, unsafe Rust, dynamic evaluation, or HTML injection sink was found in the small local app. Template output previously used `textContent`. | Remote rendering, uploads, generated previews, dependency behavior, XSS and backend injection remain untested. |
| Native permissions | No application command or external plugin remains registered; capability permissions are empty and no remote origins are granted. | Attempt denied IPC calls from a controlled local WebView fixture on each supported OS before release. Configuration tests are not runtime IPC exploitation tests. |
| Transport | Startup URL uses HTTPS; no application TLS verification bypass was found. | Redirect chains, TLS behavior, certificate failures and mixed content need an authorized local/staging test harness. |
| Credits/payments | No local authoritative accounting logic exists. | Server-side ownership, pricing, ledger atomicity and webhook validation require backend access. |
| Dependencies | npm audit returned zero known vulnerabilities. Opener and unused direct dependencies were removed from manifests/lockfiles. | `cargo audit` was unavailable; Rust advisory coverage is incomplete. System WebView vulnerabilities are outside npm audit. |
| Distribution | Release workflow reviewed; no updater plugin configured. | Signed/notarized installers, publisher provenance, CI action pinning and all supported OS builds remain release requirements. |

## Verification

- `npm run test:security`: four regression tests passed. They assert exact HTTPS startup, disabled global API/DevTools, explicit empty capabilities, restrictive bundled CSP, and absence of application command/plugin registrations.
- `npm run build`: TypeScript and Vite production build passed.
- `cargo check --offline --manifest-path src-tauri/Cargo.toml`: passed on Windows.
- `cargo check --release --offline --locked --manifest-path src-tauri/Cargo.toml`: passed on Windows, including production asset/configuration compilation.
- `cargo test --offline --locked --manifest-path src-tauri/Cargo.toml`: passed compilation/linking and test harness execution; there are zero Rust unit/doc tests, so this is not behavioral security coverage.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`: passed.
- Generated Tauri capability output was inspected: local `main` window, empty permissions, no remote grant. Generated manifests contain no opener plugin.
- `npm audit --json`: returned zero vulnerabilities. This is advisory-tool output, not proof that dependencies are vulnerability-free.
- `git diff --check`: passed (line-ending conversion warnings only).

Initial Node test/build execution encountered sandbox `spawn EPERM`; both passed when rerun with approved process execution.

## Server-side acceptance criteria (unverified, not findings)

These requirements must be enforced by the backend even if someone modifies the desktop app or sends API requests directly:

1. Derive identity and role from a verified session. Enforce ownership/tenant membership on every read, write, export, job and subscription operation; never trust submitted user IDs or client role flags.
2. Validate session expiry/revocation; rotate refresh credentials; use secure cookie attributes where cookies are used and appropriate CSRF defenses. Scope CORS to required origins without treating CORS as authentication.
3. Calculate prices, entitlements, discounts, currency and credit consumption on the server. Reject invalid/negative/overflow quantities. Use atomic conditional debits and a durable ledger so concurrent requests cannot overspend.
4. Verify payment webhook signatures against the raw body, enforce freshness, deduplicate provider event IDs transactionally, and reconcile product, account, amount, currency and payment state with provider records. Never grant credits from a browser success redirect.
5. Make retries idempotent; test duplicates, reordered events, cancellations, refunds and failed jobs. Ensure refund logic cannot issue credits repeatedly.
6. Validate input and use parameterized queries; isolate user-generated HTML and code previews. Enforce resource limits and per-account rate limits on expensive operations.
7. Exclude credentials from URLs, telemetry and logs. Return safe errors. Keep secrets server-side and maintain audit records for sensitive changes.

Use isolated staging accounts A and B and payment sandbox data to test each condition. Assert rejected requests leave account state and ledger balances unchanged. Do not execute these tests against production under this engagement's scope.

## Release follow-up

Before publishing, run a current RustSec advisory scan of `src-tauri/Cargo.lock`; verify installers on Windows and macOS; exercise login, logout/restart, OAuth redirects, checkout, external links and downloads in staging. Removing the opener plugin also removes its injected link interceptor, so external-link behavior needs explicit GUI regression coverage. Establish a reviewed navigation policy only after those destinations are known.

No GUI session was launched against the live site. No claim is made that all website functionality has been verified or that sensitive server operations are secured. The changes are local, reviewable hardening with the above release gates outstanding.

## References

- [Tauri capabilities and remote access](https://v2.tauri.app/security/capabilities/)
- [Tauri security boundaries](https://v2.tauri.app/security/)
- [Tauri configuration reference](https://v2.tauri.app/reference/config/)
- Installed Tauri 2.12.4 protocol implementation and opener 2.7.2 source were inspected locally to distinguish bundled CSP handling and plugin link interception from website behavior.
