# Porting TODO: odysseus-dev/dev -> ulises

Base merge-base: 71d74290. Ulises main at 89ea3ef0.

## Features to port (priority order)

- [ ] Email export selected messages as email/PDF + Google OAuth2 + IMAP hardening (manual port needed, structure differs)
- [x] GitHub Copilot provider (device-flow auth) (already present)
- [x] MCP Streamable HTTP transport + OAuth 2.0 (already present)
- [x] Skills import SKILL.md bundles from public GitHub URLs (already present)
- [x] Tasks admin policy + backfill (already present)
- [ ] UI/a11y: text size control + OpenDyslexic font (manual port needed)
- [x] Multiple CalDAV accounts (already present)
- [ ] Notes decomposition into feature modules (manual port needed)
- [ ] Runtime containment (authority binding)
- [ ] Docker GPU compose + portable Windows launcher

## Notes
- Direct merge produced 1057 conflicts (add/add). Use cherry-pick per feature.
- Adapt renames: odysseus -> ulises (paths, imports, configs, Docker, tests).
- Run full test suite after each feature.
EOF