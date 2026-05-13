# Vercel setup

Catalyst Ops is live at <https://catalyst-ops-dashboard.vercel.app>. The build is up and serving, but without environment variables the app shows a "Missing configuration" screen on first load. This page walks you through finishing the wiring.

## One-time setup (after first deploy)

1. Open the Vercel project at <https://vercel.com/mjackson-7673s-projects/catalyst-ops-dashboard>.
2. Go to **Settings → Environment Variables**.
3. Add the following four variables, all scoped to **Production**, **Preview**, and **Development**:

   | Name | Value |
   |---|---|
   | `VITE_GITHUB_TOKEN` | Fine-grained PAT with `contents:read` on `Catalyst-Internal/vera` |
   | `VITE_VERA_REPO` | `Catalyst-Internal/vera` |
   | `VITE_STATE_REPO` | `Catalyst-Internal/vera` |
   | `VITE_STATE_BRANCH` | `main` |

4. Click **Save** for each.
5. Trigger a redeploy: **Deployments → … → Redeploy** on the latest production deployment, or push any commit to `main`.
6. Reload <https://catalyst-ops-dashboard.vercel.app> — both panels should render with live data.

## Fine-grained PAT

If you don't already have a PAT scoped to vera:

1. Go to <https://github.com/settings/personal-access-tokens>.
2. **Generate new token (fine-grained)**.
3. **Repository access** → "Only select repositories" → choose `Catalyst-Internal/vera`.
4. **Repository permissions** → `Contents`: Read-only. (Other permissions can stay no access.)
5. Set expiration (90 days is a reasonable default).
6. **Generate** and copy the token. Paste into Vercel's `VITE_GITHUB_TOKEN` value.

## Auto-deploy on push

Vercel auto-deploys on every push to `main` for this project (default GitHub integration). No extra config needed — once the env vars are set, every WO close that updates `state/_*.md` in `Catalyst-Internal/vera` is visible in the dashboard within the next 60-second poll.

## After the GitHub org move (Catalyst-Internal)

1. **Git connection:** In Vercel → Settings → Git, confirm the project is linked to `Catalyst-Internal/cat-iq-status` (GitHub slug for this dashboard). Re-authorize the Vercel GitHub App for the **Catalyst-Internal** org if imports stopped working.
2. **PAT scope:** Regenerate or edit the fine-grained PAT so **Repository access** includes `Catalyst-Internal/vera` (and any other private repos the dashboard reads).
3. **Env values:** Ensure `VITE_VERA_REPO` and `VITE_STATE_REPO` still match the live slug (`Catalyst-Internal/vera` unless you split state elsewhere).

## Custom domain (optional)

If you want `ops.thelyst.com` or similar:

1. Vercel → Settings → Domains → Add.
2. Add your domain.
3. Update DNS at your registrar per Vercel's instructions.

Not required for v1.0.

---

Filed by WO-072. See [README.md](README.md) for the dashboard architecture.
