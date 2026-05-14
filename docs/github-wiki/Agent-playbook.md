# Agent playbook — Catalyst-Internal/cat-iq-status

Paste into https://github.com/Catalyst-Internal/cat-iq-status/wiki/Agent-playbook

## Before you edit

1. https://github.com/Catalyst-Internal/cat-iq-status/blob/main/AGENTS.md
2. https://github.com/Catalyst-Internal/cat-iq-status/blob/main/VERSIONING.md when changing releases or contracts

## Label taxonomy

| Label | Meaning |
|-------|---------|
| `semver:patch` | Parser fix, styling, dep bump without behavior change |
| `semver:minor` | New panel, filter, non-breaking env |
| `semver:major` | WO state path break, dossier contract break |

## PR checklist

- [ ] Branch convention
- [ ] Conventional Commits
- [ ] `CHANGELOG.md` when user-visible
- [ ] `npm run lint` and `npm run build`
- [ ] No PATs in git

## Backlinks

- [Wiki home](Home)
- [Releases and tags](Releases-and-tags)
- [CI and build](CI-and-build)
