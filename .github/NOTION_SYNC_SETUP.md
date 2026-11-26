# Notion Commit Sync — Setup Guide

Syncs every push (any branch) to a shared Notion database. Each commit becomes
a row; a manual `workflow_dispatch` run with `backfill: true` logs full git
history instead.

## Notion Database Schema

Create a **full-page database** in Notion with these properties (names must
match exactly — `log_commits.py` writes to them by name):

| Property name    | Type   | Notes |
|---|---|---|
| `Commit Message`  | Title  | Rename the default title column to this |
| `Repo Name`       | Select | One option per repo, auto-created on first push |
| `Commit SHA`      | Text   | Short 7-char SHA |
| `Author`          | Text   | Git author name |
| `Date`            | Date   | Commit timestamp |
| `Branch`          | Text   | e.g. `master`, `main` |

(If you're reusing the same database as another repo, it already has these —
skip straight to sharing it with the integration.)

## One-time setup for this repo

**In Notion** (skip if already done for the shared database):
1. Open the database → **Share** (top right) → **Invite** → search for your
   integration name → give it **Full access**.
2. Copy the database ID from the URL: `notion.so/YOUR-WORKSPACE/DATABASE_ID?v=...`
   (the part before `?v=`).

**In this GitHub repo:**
Go to **Settings → Secrets and variables → Actions → New repository secret**
and add:

| Secret name          | Value |
|---|---|
| `NOTION_TOKEN`       | Your Notion integration secret |
| `NOTION_DATABASE_ID` | The database ID copied from the URL |

Reuse the same two values across repos that feed the same shared database —
the `Repo Name` column (set automatically from `github.repository`) is what
distinguishes them. Create a filtered view per repo in Notion
(`Repo Name = "owner/repo-name"`) if you want a per-project log.

## Backfilling history

After the secrets are set, run the workflow manually once
(**Actions → Log Commits to Notion → Run workflow**, leave `backfill: true`)
to log the repo's existing history. Every push after that logs incrementally
(`commit_exists_in_notion()` skips SHAs already present, so re-runs are safe).
