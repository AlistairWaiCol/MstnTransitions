# CLAUDE.md

## Read first

Before doing anything in this repo, read the project record in the shared folder:

`C:\Users\amorrison\OneDrive - Wairarapa College\2026 Transition Form Rework`

Start with `README.md` there, then `DECISIONS.md`, then the brief for the current phase (for example `PHASE-A-BRIEF.md`). That folder is the source of truth for decisions, the field list and the CSV format. If something there looks wrong or incomplete, raise it with the user rather than changing it or working around it. Do not edit `DECISIONS.md` or `schools.csv` from a build session.

## Never use real student data

Never use, request, copy or commit real student data, in code, tests, sample files, screenshots or commit messages. Use fictional test data only, with made-up names.

## Where things are (Phase B)

- `index.html` is the form; the Phase A test page is `phase-a.html`.
- Field definitions are data in `js/fields.js`, keyed by csv-format.md column names. The form, the completeness check (`TF.rules.checkStudent` in `js/rules.js`) and, from Phase C, the CSV writer all read it. Change a field there, not in the HTML.
- Rules, the working file and the school list are plain functions with no page dependencies (`js/rules.js`, `js/rollfile.js`, `js/schools.js`, `js/csv.js`), tested by `tests/rules.html`. Add a test there for any rule change. The user has no Node, so the browser page is how tests are run: open `tests/rules.html` on the live site (or a local web server) and check every line passes.
- `data/schools.csv` is a copy of the shared-folder list without the address columns. Do not edit it or the master; the user copies changes across.
- No student data in browser storage of any kind, ever. The roll is in page memory and the teacher's own file.
- Keep `vendor/msal-redirect-bridge-5.23.0.min.js` and `js/popup-bridge.js` loading first in `index.html`, or Microsoft sign-in breaks.
- Bump the `?v=` version on script, style and data links (and `VERSION` in `js/app.js`) with each push.
- Pushing to `main` publishes the live page. Ask the user before pushing.

## Other ground rules

- Work on one build phase per session, named at the start of the session. Finish and test each phase before the next one starts.
- Never commit a client secret, token, password or API key. Client IDs in `config.js` are not secrets.
- Use New Zealand English spelling and metric units.
