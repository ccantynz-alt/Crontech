# Runbook: Mirror All Empire Repos to Gluecron

One-shot wrapper that pushes all 3 empire repos (Crontech, Gluecron.com,
GateTest) from GitHub into a running Gluecron instance.

## Prerequisites

- A running Gluecron instance reachable over HTTPS.
- A Gluecron Personal Access Token (PAT) with repo create/push scope.
- `scripts/mirror-to-gluecron.sh` and `scripts/verify-gluecron-mirror.sh`
  present and executable (shipped by PR #136). If running on a branch where
  these are not yet merged, merge PR #136 first or cherry-pick those scripts.
- Local tools: `bash`, `git`, `curl` (no new deps).
- Network access to both `github.com` and your Gluecron URL.

## Required env vars

| Var              | Description                                |
|------------------|--------------------------------------------|
| `GLUECRON_URL`   | Base URL of the Gluecron instance          |
| `GLUECRON_USER`  | Gluecron username owning the target repos  |
| `GLUECRON_TOKEN` | Gluecron PAT (never logged; redacted)      |

## How to run

```bash
export GLUECRON_URL="https://gluecron.example.com"
export GLUECRON_USER="crontech"
export GLUECRON_TOKEN="..."   # keep secret

./scripts/mirror-all-to-gluecron.sh
```

The script mirrors these repos (fail-fast on first error):

- `ccantynz-alt/Crontech`      -> `crontech/crontech`
- `ccantynz-alt/Gluecron.com`  -> `crontech/gluecron`
- `ccantynz-alt/GateTest`      -> `crontech/gatetest`

It is idempotent: re-running is safe; matching content is skipped by the
underlying mirror script.

## What success looks like

- Exit code `0`.
- Final log line: `All 3 empire repos mirrored successfully`.
- Summary block lists all 3 under `Succeeded` and none under `Failed`.
- Each repo appears in Gluecron UI under `crontech/` with latest commits.

## Verify post-mirror

For each target, clone from Gluecron and diff against GitHub:

```bash
for r in crontech gluecron gatetest; do
  git clone "${GLUECRON_URL}/crontech/${r}.git" "/tmp/verify-${r}"
  git -C "/tmp/verify-${r}" fetch "https://github.com/ccantynz-alt/${r}.git"
  git -C "/tmp/verify-${r}" diff HEAD FETCH_HEAD   # expect empty
done
```

Empty diffs for all three repos = mirror is complete and consistent.

## Rollback

If a mirror pushed bad state:

1. Log in to the Gluecron UI as `GLUECRON_USER`.
2. For each affected repo under `crontech/` (e.g. `crontech/crontech`),
   go to Settings -> Danger Zone -> Delete Repository and confirm.
3. Re-run the wrapper once the upstream GitHub state is correct.

No destructive change is made to the GitHub source repos; rollback is
limited to deleting the Gluecron-side mirrors.
