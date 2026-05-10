---
wo_origin: WO-072
schema_version: 1
---

# VERSIONING.md

## Repo

**Repo:** catalyst-ops-dashboard
**Current version:** 0.1.0
**Schema version:** 1

---

## Version scheme

`v[major].[minor].[patch]`

### Major

Breaking change to the contract this dashboard depends on: a rename of the WO state files in `Catalyst-Austin/vera/state/`, a dossier-path restructure in `packages/vera/briefcase/**`, an API shape change that requires schema migration, or a UI overhaul that breaks bookmarks.

Examples:
- 1.0.0 — WO state files committed to `Catalyst-Austin/vera/state/` (bootstrap of D1)
- 2.0.0 — Move state read source out of `Catalyst-Austin/vera` (would force PAT scope change)

### Minor

New panel, new tab, new dossier filter, new env var, or non-breaking enhancement to an existing panel.

Examples:
- New tab beyond WO Queue + Dossiers (e.g. session log viewer)
- Persistent dossier search across sessions

### Patch

Bug fix, parser tightening, style adjustment, dep bump that doesn't change behavior.

---

## Bump rules

| Change type | Bump | Approval |
|---|---|---|
| State-file path rename | Major | (Me)shach |
| New panel | Minor | (Me)shach |
| Parser fix / dep bump | Patch | Ren-autonomous |

Always update `package.json` version + this VERSIONING.md `Current version` line in the same commit.

---

*Filed by Ren · Code · 2026-05-10 · session 20260510T194804Z · WO-072*
