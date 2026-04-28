#!/usr/bin/env bash
# install-web-terminal-full.sh
#
# ONE-SHOT web terminal bring-up. Zero interaction. Safe to re-run.
#
# Chains:
#   1. scripts/install-web-terminal.sh  (installs ttyd, systemd unit, generates creds)
#   2. caddy hash-password on the generated plaintext password
#   3. sed the bcrypt hash into infra/caddy/terminal.Caddyfile -> /etc/caddy/terminal.Caddyfile
#   4. Ensures /etc/caddy/Caddyfile imports the terminal block (idempotent)
#   5. Optional: if CF_API_TOKEN is set, upserts DNS A record terminal.crontech.ai -> host IP
#   6. caddy validate
#   7. systemctl restart caddy
#   8. Polls https://terminal.crontech.ai locally until basic-auth (HTTP 401) responds (max 90s)
#   9. Prints final banner with credentials (password shown ONCE)
#
# Usage (as root):
#   sudo bash scripts/install-web-terminal-full.sh
#   sudo CF_API_TOKEN=cf-xxxx bash scripts/install-web-terminal-full.sh   # + DNS upsert
#
# Requirements: bash curl jq sed openssl caddy systemctl

set -euo pipefail

# --- config ---------------------------------------------------------------
DOMAIN="${TERMINAL_DOMAIN:-terminal.crontech.ai}"
ZONE="${TERMINAL_ZONE:-crontech.ai}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TERMINAL_SRC="${REPO_ROOT}/infra/caddy/terminal.Caddyfile"
TERMINAL_DST="/etc/caddy/terminal.Caddyfile"
CADDY_MAIN="/etc/caddy/Caddyfile"
AUTH_FILE="/etc/caddy/terminal-auth"
IMPORT_LINE="import ${TERMINAL_DST}"

# --- helpers --------------------------------------------------------------
log()  { printf '>>> %s\n' "$*" >&2; }
warn() { printf '!!! %s\n' "$*" >&2; }
die()  { printf 'XXX %s\n' "$*" >&2; exit 1; }
redact() { sed -E 's/(password|token|hash|authorization)[^ ]*/\1=<redacted>/Ig'; }

trap 'rc=$?; [[ $rc -ne 0 ]] && warn "aborted (rc=$rc). Partial state may exist. Re-run is safe; or inspect: systemctl status ttyd caddy; journalctl -u caddy -n 50; cat '"$AUTH_FILE"'"; exit $rc' EXIT

[[ $EUID -eq 0 ]] || die "must run as root (sudo)"

for bin in curl jq sed openssl caddy systemctl; do
  command -v "$bin" >/dev/null 2>&1 || die "missing dependency: $bin"
done
[[ -f "$TERMINAL_SRC" ]] || die "template not found: $TERMINAL_SRC"
[[ -f "$CADDY_MAIN"  ]] || die "main Caddyfile not found: $CADDY_MAIN (install Caddy first)"

# --- 1. ttyd + systemd + local-bind --------------------------------------
log "[1/9] running install-web-terminal.sh"
INSTALL_OUT="$(bash "${REPO_ROOT}/scripts/install-web-terminal.sh" 2>&1)"
printf '%s\n' "$INSTALL_OUT" | redact >&2

# --- 2. resolve plaintext password ---------------------------------------
log "[2/9] resolving plaintext password"
PASSWORD="" # secrets-ok — empty init, value extracted from installer output below
# Prefer fresh output (password is only in output when freshly generated).
PASSWORD="$(printf '%s\n' "$INSTALL_OUT" | sed -n 's/^[[:space:]]*Password:[[:space:]]*//p' | head -1 || true)" # secrets-ok — read from installer, not hardcoded
if [[ -z "$PASSWORD" && -s "$AUTH_FILE" ]]; then
  PASSWORD="$(sed -n 's/^PASSWORD=//p' "$AUTH_FILE" | head -1 || true)" # secrets-ok — read from auth file, not hardcoded
fi
[[ -n "$PASSWORD" ]] || die "could not determine plaintext password (check $AUTH_FILE)"

# --- 3. bcrypt hash -------------------------------------------------------
log "[3/9] generating bcrypt hash (caddy hash-password)"
HASH="$(caddy hash-password --plaintext "$PASSWORD")"
[[ "$HASH" == \$2* ]] || die "caddy hash-password returned unexpected output"

# --- 4. materialise /etc/caddy/terminal.Caddyfile -------------------------
log "[4/9] writing $TERMINAL_DST with bcrypt hash"
install -d -m 755 /etc/caddy
install -d -m 755 /var/log/caddy
# Escape replacement for sed: &, \, and / in bcrypt hashes.
HASH_ESC="$(printf '%s' "$HASH" | sed -e 's/[\/&]/\\&/g')"
sed "s/{CADDY_TERMINAL_PASSWORD_HASH}/${HASH_ESC}/g" "$TERMINAL_SRC" >"${TERMINAL_DST}.tmp"
chmod 644 "${TERMINAL_DST}.tmp"
mv "${TERMINAL_DST}.tmp" "$TERMINAL_DST"
grep -q '{CADDY_TERMINAL_PASSWORD_HASH}' "$TERMINAL_DST" && die "placeholder not replaced in $TERMINAL_DST"

# --- 5. ensure main Caddyfile imports terminal block (idempotent) --------
log "[5/9] ensuring main Caddyfile imports terminal block"
if grep -Fq "$IMPORT_LINE" "$CADDY_MAIN"; then
  log "import line already present in $CADDY_MAIN"
else
  cp -a "$CADDY_MAIN" "${CADDY_MAIN}.bak.$(date -u +%Y%m%dT%H%M%SZ)"
  printf '\n# Web terminal (added by install-web-terminal-full.sh)\n%s\n' "$IMPORT_LINE" >>"$CADDY_MAIN"
  log "appended: $IMPORT_LINE"
fi

# --- 6. optional Cloudflare DNS upsert -----------------------------------
if [[ -n "${CF_API_TOKEN:-}" ]]; then
  log "[6/9] CF_API_TOKEN detected — upserting DNS A record $DOMAIN"
  PUBIP=""
  for svc in https://api.ipify.org https://ifconfig.me https://icanhazip.com; do
    PUBIP="$(curl -fsS --max-time 5 "$svc" | tr -d '[:space:]' || true)"
    [[ "$PUBIP" =~ ^[0-9.]+$ ]] && break
    PUBIP=""
  done
  [[ -n "$PUBIP" ]] || die "could not resolve public IP for DNS upsert"
  log "public IP: $PUBIP"

  CF="https://api.cloudflare.com/client/v4"
  AUTH=(-H "Authorization: Bearer ${CF_API_TOKEN}" -H "Content-Type: application/json")
  ZONE_ID="$(curl -fsS "${AUTH[@]}" "${CF}/zones?name=${ZONE}" | jq -r '.result[0].id // empty')"
  [[ -n "$ZONE_ID" ]] || die "Cloudflare zone '$ZONE' not found for this token"

  REC_JSON="$(curl -fsS "${AUTH[@]}" "${CF}/zones/${ZONE_ID}/dns_records?type=A&name=${DOMAIN}")"
  REC_ID="$(printf '%s' "$REC_JSON" | jq -r '.result[0].id // empty')"
  BODY="$(jq -nc --arg n "$DOMAIN" --arg c "$PUBIP" '{type:"A",name:$n,content:$c,ttl:120,proxied:false}')"
  if [[ -n "$REC_ID" ]]; then
    log "updating existing A record"
    curl -fsS -X PUT "${AUTH[@]}" --data "$BODY" "${CF}/zones/${ZONE_ID}/dns_records/${REC_ID}" >/dev/null
  else
    log "creating new A record"
    curl -fsS -X POST "${AUTH[@]}" --data "$BODY" "${CF}/zones/${ZONE_ID}/dns_records" >/dev/null
  fi
  log "DNS: $DOMAIN -> $PUBIP (proxied=false)"
else
  log "[6/9] CF_API_TOKEN not set — SKIPPING DNS upsert"
  warn "create A record manually: $DOMAIN -> <this host public IP>, proxy=OFF"
fi

# --- 7. caddy validate ---------------------------------------------------
log "[7/9] caddy validate --config $CADDY_MAIN"
caddy validate --config "$CADDY_MAIN" --adapter caddyfile >/dev/null

# --- 8. restart + poll ---------------------------------------------------
log "[8/9] systemctl restart caddy"
systemctl restart caddy
sleep 1
systemctl is-active --quiet caddy || die "caddy failed to start; see: journalctl -u caddy -n 60"

log "[8/9] polling https://${DOMAIN} (via loopback, max 90s) for basic-auth 401"
DEADLINE=$(( $(date +%s) + 90 ))
CODE=""
while (( $(date +%s) < DEADLINE )); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' \
    --resolve "${DOMAIN}:443:127.0.0.1" \
    -k "https://${DOMAIN}/" || true)"
  if [[ "$CODE" == "401" ]]; then
    log "terminal reachable locally, basic-auth challenge confirmed (HTTP 401)"
    break
  fi
  sleep 5
done
if [[ "$CODE" != "401" ]]; then
  warn "did not observe HTTP 401 within 90s (last code=$CODE). Cert may still be issuing — try https://${DOMAIN} in ~2 min. Check: journalctl -u caddy -n 100"
fi

# --- 9. final banner -----------------------------------------------------
log "[9/9] done"
trap - EXIT
cat <<BANNER

========================================================================
  CRONTECH WEB TERMINAL — READY
------------------------------------------------------------------------
  URL:      https://${DOMAIN}
  User:     admin
  Password: ${PASSWORD}

  Saved locally (mode 600): ${AUTH_FILE}
  Caddy site:               ${TERMINAL_DST}

  Next steps:
    * If DNS not yet propagated, wait 1-2 min then retry.
    * Bookmark the URL on iPad — full shell in Safari.
    * Rotate: delete ${AUTH_FILE} and re-run this script.
========================================================================
BANNER
