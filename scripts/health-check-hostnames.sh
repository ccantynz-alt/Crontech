#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# scripts/health-check-hostnames.sh
# ──────────────────────────────────────────────────────────────────────
# Nightly (or on-demand) sweep of every customer-facing Crontech
# hostname. Curls each URL, verifies HTTP 2xx / 3xx, and posts to Slack
# on any non-success. Designed to catch the class of outage where Caddy
# serves the apex fine but breaks a subdomain (see the 2026-04-23
# www.crontech.ai ERR_SSL_PROTOCOL_ERROR incident — caught by a human
# at launch time, not by any automation).
#
# USAGE
#   ./health-check-hostnames.sh                    # one-shot, prints to stdout
#   SLACK_WEBHOOK_URL=... ./health-check-hostnames.sh   # also posts on failure
#
# INSTALL AS A NIGHTLY CRON (Vultr host)
#   sudo cp scripts/health-check-hostnames.sh /usr/local/bin/
#   sudo chmod +x /usr/local/bin/health-check-hostnames.sh
#   sudo tee /etc/systemd/system/crontech-healthcheck.service > /dev/null <<'EOF'
#   [Unit]
#   Description=Crontech public-hostname health check
#   Wants=network-online.target
#   After=network-online.target
#
#   [Service]
#   Type=oneshot
#   Environment=SLACK_WEBHOOK_URL=https://hooks.slack.com/services/REPLACE/ME/PLEASE
#   ExecStart=/usr/local/bin/health-check-hostnames.sh
#   User=root
#   StandardOutput=journal
#   StandardError=journal
#   EOF
#
#   sudo tee /etc/systemd/system/crontech-healthcheck.timer > /dev/null <<'EOF'
#   [Unit]
#   Description=Run Crontech health check every 15 minutes
#
#   [Timer]
#   OnBootSec=3min
#   OnUnitActiveSec=15min
#   Persistent=true
#
#   [Install]
#   WantedBy=timers.target
#   EOF
#
#   sudo systemctl daemon-reload
#   sudo systemctl enable --now crontech-healthcheck.timer
#
# WHAT GETS CHECKED
#   Every hostname in HOSTS below. For each:
#     - TLS handshake succeeds
#     - Response status is 2xx or 3xx
#     - Response body is non-empty (catches 200-with-blank-body regressions)
#   A failure in any of those posts a Slack alert with the curl detail.
#
# EXIT CODES
#   0   every hostname healthy
#   1   at least one hostname failed (also posts to Slack if configured)
# ──────────────────────────────────────────────────────────────────────

set -u
# NOTE: deliberately NOT `set -e` — we want to check every host, not
# bail on the first failure.

# Hostnames to probe. Add new ones here as the platform grows.
HOSTS=(
  "https://crontech.ai/"
  "https://www.crontech.ai/"
  "https://api.crontech.ai/api/health"
)

# Slack webhook for alerts. Unset => dry-run (stdout only).
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"

# Per-request hard timeout (seconds). Short enough to detect a wedged
# Caddy, long enough to tolerate the occasional cold edge in Auckland.
TIMEOUT="${HEALTHCHECK_TIMEOUT:-10}"

# Accumulated failure messages for the Slack post.
FAILURES=""
OK_COUNT=0
FAIL_COUNT=0

timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

post_slack() {
  local text="$1"
  if [ -z "$SLACK_WEBHOOK_URL" ]; then
    printf "[%s] (dry-run: SLACK_WEBHOOK_URL unset)\n%s\n" "$(timestamp)" "$text"
    return 0
  fi
  # Escape double quotes and newlines for JSON transport.
  local payload
  payload=$(printf '%s' "$text" | sed 's/\\/\\\\/g; s/"/\\"/g' | awk 'BEGIN{ORS="\\n"} {print}')
  curl -sS -m 10 -H 'Content-Type: application/json' \
    --data "{\"text\":\"$payload\"}" \
    "$SLACK_WEBHOOK_URL" > /dev/null || true
}

check_one() {
  local url="$1"
  # Fetch: HTTP status + response time + body length.
  # curl -sS: silent + show errors. -m: max time. -o /tmp: discard body.
  local tmp
  tmp="$(mktemp)"
  local info
  info=$(curl -sS -m "$TIMEOUT" -o "$tmp" \
    -w "status=%{http_code}\nproto=%{http_version}\ntime=%{time_total}\nsize=%{size_download}" \
    "$url" 2>&1)
  local curl_rc=$?
  local status size
  status=$(printf '%s\n' "$info" | awk -F= '/^status=/ {print $2}')
  size=$(printf '%s\n' "$info" | awk -F= '/^size=/ {print $2}')
  rm -f "$tmp"

  # curl failed outright (DNS, TLS, connection refused) — no status code.
  if [ "$curl_rc" -ne 0 ] || [ -z "$status" ] || [ "$status" = "000" ]; then
    FAILURES+="❌ ${url} — curl failed (rc=${curl_rc}): $(printf '%s' "$info" | tr '\n' ' ')\n"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    return 1
  fi

  # Non-2xx / non-3xx is a failure.
  case "$status" in
    2[0-9][0-9]|3[0-9][0-9])
      # 2xx/3xx with empty body is a regression (blank page).
      if [ "${size:-0}" -lt 10 ] && [ "${status:0:1}" = "2" ]; then
        FAILURES+="⚠️  ${url} — ${status} but body empty (${size}B)\n"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        return 1
      fi
      OK_COUNT=$((OK_COUNT + 1))
      printf "✅ %s → %s (%sB)\n" "$url" "$status" "$size"
      return 0
      ;;
    *)
      FAILURES+="❌ ${url} — HTTP ${status}\n"
      FAIL_COUNT=$((FAIL_COUNT + 1))
      return 1
      ;;
  esac
}

# ── Main ──────────────────────────────────────────────────────────

printf "=== Crontech health check @ %s ===\n" "$(timestamp)"
for host in "${HOSTS[@]}"; do
  check_one "$host"
done

printf "\n=== %d OK, %d FAIL ===\n" "$OK_COUNT" "$FAIL_COUNT"

if [ "$FAIL_COUNT" -gt 0 ]; then
  msg="🚨 Crontech health check failed at $(timestamp)\n${FAILURES}\nRun scripts/health-check-hostnames.sh on the Vultr host for detail."
  post_slack "$msg"
  exit 1
fi

exit 0
