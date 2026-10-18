# MstnTransitions

**This is a throwaway test page (Phase A).** It checks that a static page can sign a teacher in with Microsoft or Google and send an email with a CSV attachment from their own mailbox. It is not the transition form.

Test page: https://alistairwaicol.github.io/MstnTransitions/

The project record (decisions, field list, CSV format and phase briefs) is kept outside this repo, in the shared folder "2026 Transition Form Rework". Start with its README.md.

Fictional test data only. Never use real student data here.

## Files

| File | What it does |
|---|---|
| `index.html` | The test page |
| `config.js` | The Microsoft and Google client IDs. A blank ID hides that sign-in button |
| `js/popup-bridge.js` | Passes the Microsoft sign-in response from the popup back to the page |
| `js/microsoft.js` | Microsoft sign-in (MSAL, popup, auth code with PKCE) and sending through Microsoft Graph |
| `js/google.js` | Google sign-in (Google Identity Services token client) and sending through the Gmail API |
| `js/csv.js` | Builds the fictional test file to csv-format.md version 1 |
| `js/mime.js` | Base64 and the MIME message for Gmail |
| `js/app.js` | Buttons, the account panel and the results log |
| `vendor/` | Vendored MSAL Browser 5.23.0 and its licence |

## Libraries

- `@azure/msal-browser` 5.23.0, vendored from the npm package (`lib/msal-browser.min.js` and `lib/redirect-bridge/msal-redirect-bridge.min.js`), checked against the npm sha512 integrity value.
  - `msal-browser-5.23.0.min.js` SHA-256 `a71f893dc3c9fa3c59219e0535ab6a00a6281860f24315ab8118304baafacc64`
  - `msal-redirect-bridge-5.23.0.min.js` SHA-256 `dff750c346ff0afbdfc33701abca224302af3b08ab4087aa23a0e55f514bf6f6`
- Google Identity Services, loaded from `https://accounts.google.com/gsi/client`. Google publishes no versioned or downloadable copy, so it cannot be pinned or vendored.

## Security notes

- No client secret, token or password is kept in the repo. Client IDs are not secrets.
- Microsoft tokens are kept in MSAL's memory cache. Google's access token is kept in a page variable. Both are gone when the tab closes. MSAL keeps short-lived sign-in state (not tokens) in session storage while the popup is open.
- A Content Security Policy in `index.html` limits requests to Microsoft sign-in, Microsoft Graph, Google sign-in, Google userinfo and the Gmail API. There is no analytics or tracking.
- The browser console shows one blocked inline style. It is Google's library trying to add button styles this page does not use, and the policy blocking it is expected.
