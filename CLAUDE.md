# CLAUDE.md

## Read first

Before doing anything in this repo, read the project record in the shared folder:

`C:\Users\amorrison\OneDrive - Wairarapa College\2026 Transition Form Rework`

Start with `README.md` there, then `DECISIONS.md`, then the brief for the current phase (for example `PHASE-A-BRIEF.md`). That folder is the source of truth for decisions, the field list and the CSV format. If something there looks wrong or incomplete, raise it with the user rather than changing it or working around it. Do not edit `DECISIONS.md` or `schools.csv` from a build session.

## Never use real student data

Never use, request, copy or commit real student data, in code, tests, sample files, screenshots or commit messages. Use fictional test data only, with made-up names.

## Other ground rules

- Work on one build phase per session, named at the start of the session. Finish and test each phase before the next one starts.
- Never commit a client secret, token, password or API key. Client IDs in `config.js` are not secrets.
- Use New Zealand English spelling and metric units.
