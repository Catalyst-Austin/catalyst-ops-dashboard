# Vera Status

Single-pane dashboard for the Vera work-order queue and dossier library. Reads everything
live from `Catalyst-Internal/vera` over the GitHub Contents API.

Two panels:

- **WO Queue** — P1 / P2 / P3 tier cards, in-flight section, status pills, 60-second auto-refresh. Reads `state/_queue-active.md`, `state/_in-flight.md`, `state/_current-state.yml`.
- **Dossiers** — left-sidebar list of `dossier-*.md` from `packages/vera/briefcase/**`, grouped by subdirectory. Right pane renders the markdown via `react-markdown` with a frontmatter strip and stale indicator.

## Local dev

```bash
cp .env.example .env.local
# Edit .env.local: VITE_GITHUB_TOKEN must be a fine-grained PAT with contents:read on Catalyst-Internal/vera
npm install
npm run dev
```

## Deploy

Vercel free tier. Connect this repo, add the four env vars from `.env.example` in project settings, and Vercel auto-deploys on every push to `main`.

## Stack

- Vite 8 + React 19
- `react-markdown` for dossier rendering
- `gray-matter` for frontmatter parsing
- GitHub Contents API (no backend)

## Repo conventions

See [`VERSIONING.md`](VERSIONING.md) for the cross-repo version protocol.

**For AI agents:** read [`AGENTS.md`](AGENTS.md) before editing. [GitHub Wiki home](https://github.com/Catalyst-Internal/vera-status/wiki). Changelog: [`CHANGELOG.md`](CHANGELOG.md).

Filed by WO-072. Sibling repos: [Catalyst-Internal/vera](https://github.com/Catalyst-Internal/vera), [Catalyst-Internal/vera-site](https://github.com/Catalyst-Internal/vera-site).
