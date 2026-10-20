# MstnTransitions

**Phase B: the transition form.** A teacher signs in with their school Microsoft or Google account, types in their leaving roll, chooses a destination school for each student, completes every field, and saves the roll to a file on their own computer to reopen later. Nothing is sent yet: sending comes in Phase C.

- Page: https://alistairwaicol.github.io/MstnTransitions/
- Phase A sign-in and sending test (kept until Phase B is accepted): https://alistairwaicol.github.io/MstnTransitions/phase-a.html
- Rules tests: https://alistairwaicol.github.io/MstnTransitions/tests/rules.html

The project record (decisions, field list, CSV format and phase briefs) is kept outside this repo, in the shared folder "2026 Transition Form Rework". Start with its README.md.

Fictional test data only. Never use real student data here.

## Running the rules tests

Open `tests/rules.html` in a browser. The tests run straight away and the page shows a pass or fail line for each, with a summary at the top. No Node or other tools are needed.

- On the live site: https://alistairwaicol.github.io/MstnTransitions/tests/rules.html
- Opened as a file from a local copy, the tests that read `data/schools.csv` and the test rolls are marked SKIPPED, because browsers do not let a page opened as a file read other files. Everything else runs. Use the web address to run them all.

## Files

| File | What it does |
|---|---|
| `index.html` | The form |
| `config.js` | The Microsoft and Google client IDs. A blank ID hides that sign-in button |
| `data/schools.csv` | The school list: school name, email domains, sends, receives. A copy of the shared-folder list **without the audit and batch address columns**, because this repo is public |
| `js/fields.js` | Every per-student field as data: CSV column name, label, type, options, limit and when it is shown. The form and the completeness check read it, and Phase C's CSV writer will too |
| `js/rules.js` | Show and hide rules, exclusive options, character limits and the completeness check (`checkStudent`), as plain functions |
| `js/rollfile.js` | The working file (format `transition-roll`, version 1): creating, checking, reading and writing it, removing students (withdrawals), and taking over another teacher's roll |
| `js/schools.js` | Reading the school list, refusing personal accounts, and matching a teacher to a school |
| `js/csv.js` | CSV reader and writer to csv-format.md, including the apostrophe rule. Also builds the Phase A test file |
| `js/savefile.js` | Saving to a chosen file (Chrome and Edge), downloading a copy, and opening a file |
| `js/form.js` | Builds the student form from `js/fields.js` |
| `js/app.js` | Page wiring: sign-in, the roll, the student form, saving and opening |
| `js/popup-bridge.js` | Passes the Microsoft sign-in response from the popup back to the page |
| `js/microsoft.js`, `js/google.js` | Sign-in (from Phase A, unchanged) |
| `phase-a.html`, `js/phase-a.js`, `js/mime.js`, `css/style.css` | The Phase A test page |
| `tests/rules.html` | The rules test page; the tests are in `tests/rules.test.js` |
| `test-data/` | Fictional test rolls for opening in the form |
| `vendor/` | Vendored MSAL Browser 5.23.0 and its licence |

## Caching

GitHub Pages lets browsers keep files for up to 10 minutes. Every script, style and data link carries a version, for example `js/app.js?v=2026-10-20a`. Change it on every push that changes those files (in `index.html`, `phase-a.html`, `tests/rules.html` and the `VERSION` constant in `js/app.js`), so corrected files reach teachers straight away.

## Libraries

- `@azure/msal-browser` 5.23.0, vendored from the npm package (`lib/msal-browser.min.js` and `lib/redirect-bridge/msal-redirect-bridge.min.js`), checked against the npm sha512 integrity value.
  - `msal-browser-5.23.0.min.js` SHA-256 `a71f893dc3c9fa3c59219e0535ab6a00a6281860f24315ab8118304baafacc64`
  - `msal-redirect-bridge-5.23.0.min.js` SHA-256 `dff750c346ff0afbdfc33701abca224302af3b08ab4087aa23a0e55f514bf6f6`
- Google Identity Services, loaded from `https://accounts.google.com/gsi/client`. Google publishes no versioned or downloadable copy, so it cannot be pinned or vendored.

## Security and privacy notes

- No client secret, token or password is kept in the repo. Client IDs are not secrets.
- Microsoft tokens are kept in MSAL's memory cache. Google's access token is kept in a page variable. Both are gone when the tab closes. MSAL keeps short-lived sign-in state (not tokens) in session storage while the popup is open.
- No student data goes into browser storage of any kind (local storage, session storage, IndexedDB or cookies). The roll lives in page memory and in the file the teacher saves. The file handle used for saving in Chrome and Edge is kept in memory only, so after a reload the teacher signs in and opens the file again.
- Microsoft's popup returns to the site root, which is the redirect address IT registered. `index.html` must keep loading `vendor/msal-redirect-bridge-5.23.0.min.js` and `js/popup-bridge.js` before anything else.
- A Content Security Policy limits requests to this site (for `data/schools.csv`), Microsoft sign-in, Microsoft Graph, Google sign-in, Google userinfo and the Gmail API. There is no analytics or tracking.
- The browser console shows one blocked inline style. It is Google's library trying to add button styles this page does not use, and the policy blocking it is expected.
