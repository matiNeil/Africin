#!/usr/bin/env bash
#
# Sets requireSignedURLs on every Cloudflare Stream video in the account.
#
# ─────────────────────────────────────────────────────────────────────────────
#  DO NOT RUN WITH --apply YET.
#
#  Only the TV client signs its playback URLs (src/lib/tv-stream.ts). Both
#  other clients request plain, unsigned URLs:
#
#    web     src/lib/content-repo.ts:14   https://<host>/<uid>/iframe
#            src/lib/live-repo.ts:11
#    mobile  africin_mobile lib/core/stream_url.dart:37
#                                 https://<host>/<uid>/manifest/video.m3u8
#
#  Enabling signed URLs therefore breaks playback for every web and mobile
#  subscriber, to close a gap that only exists on TV. Both clients must first
#  fetch a signed URL from the backend. Until then this script is documentation
#  of the intended end state, not a thing to run.
#
#  Safe order of operations:
#    1. Confirm TV playback works with signing (sideload to a real set)
#    2. Add a signed-URL endpoint for web and mobile; ship both clients
#    3. Run this with --apply, ideally on one video first (--only <uid>)
#    4. Verify all three clients, and keep --revert handy
# ─────────────────────────────────────────────────────────────────────────────
#
# Usage:
#   bash require-signed-urls.sh                 # dry run — lists what would change
#   bash require-signed-urls.sh --apply         # set requireSignedURLs=true
#   bash require-signed-urls.sh --revert        # set it back to false (rollback)
#   bash require-signed-urls.sh --apply --only <uid>    # one video, for a canary
#
# Auth: reads CLOUDFLARE_API_TOKEN from the environment, or prompts (hidden).
# The token needs Account → Stream → Edit.

set -euo pipefail

ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-c1d9fa0570faa26e44a22ac2b1ac462b}"
API="https://api.cloudflare.com/client/v4"

MODE="dry"; TARGET="true"; ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --apply)  MODE="apply" ;;
    --revert) MODE="apply"; TARGET="false" ;;
    --only)   shift; ONLY="${1:-}" ;;
    *) echo "unknown argument: $1"; exit 1 ;;
  esac
  shift
done

command -v jq >/dev/null || { echo "jq is required: brew install jq"; exit 1; }

TOKEN="${CLOUDFLARE_API_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  printf 'Cloudflare API token (Stream:Edit, hidden): '
  read -rs TOKEN; echo
fi
[ -n "$TOKEN" ] || { echo "No token."; exit 1; }

api() { curl -sS -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" "$@"; }

# --- Collect every video, following pagination -------------------------------
echo "→ Listing videos…"
ALL="[]"; CURSOR=""
while :; do
  URL="$API/accounts/$ACCOUNT_ID/stream?limit=1000"
  [ -n "$CURSOR" ] && URL="$URL&start=$CURSOR"
  PAGE="$(api "$URL")"
  [ "$(jq -r '.success' <<<"$PAGE")" = "true" ] || {
    echo "API error:"; jq -r '.errors[]?.message' <<<"$PAGE"; exit 1; }
  COUNT="$(jq '.result | length' <<<"$PAGE")"
  ALL="$(jq -s '.[0] + .[1]' <<<"$ALL $(jq -c '.result' <<<"$PAGE")")"
  [ "$COUNT" -lt 1000 ] && break
  CURSOR="$(jq -r '.result[-1].created' <<<"$PAGE")"
done

[ -n "$ONLY" ] && ALL="$(jq --arg u "$ONLY" '[.[] | select(.uid == $u)]' <<<"$ALL")"

TOTAL="$(jq 'length' <<<"$ALL")"
NEEDS="$(jq --argjson t "$([ "$TARGET" = "true" ] && echo true || echo false)" \
            '[.[] | select(.requireSignedURLs != $t)]' <<<"$ALL")"
N="$(jq 'length' <<<"$NEEDS")"

echo "  $TOTAL video(s) in scope; $N need requireSignedURLs=$TARGET"
jq -r '.[] | "    \(.uid)  \(.meta.name // "(unnamed)")"' <<<"$NEEDS"

if [ "$MODE" = "dry" ]; then
  echo
  echo "Dry run — nothing changed. Re-read the warning at the top of this file"
  echo "before using --apply: it will break web and mobile playback today."
  exit 0
fi

# --- Apply -------------------------------------------------------------------
echo
echo "!! Setting requireSignedURLs=$TARGET on $N video(s)."
[ "$TARGET" = "true" ] && echo "!! Web and mobile clients do NOT sign their URLs and will break."
printf 'Type EXACTLY "i understand" to continue: '
read -r CONFIRM
[ "$CONFIRM" = "i understand" ] || { echo "Aborted."; exit 1; }

OK=0; FAIL=0
for UID in $(jq -r '.[].uid' <<<"$NEEDS"); do
  RES="$(api -X POST "$API/accounts/$ACCOUNT_ID/stream/$UID" \
        --data "{\"requireSignedURLs\": $TARGET}")"
  if [ "$(jq -r '.success' <<<"$RES")" = "true" ]; then
    OK=$((OK+1)); echo "  ok    $UID"
  else
    FAIL=$((FAIL+1)); echo "  FAIL  $UID — $(jq -r '.errors[]?.message' <<<"$RES" | tr '\n' ' ')"
  fi
done

echo
echo "Done: $OK updated, $FAIL failed."
[ "$TARGET" = "true" ] && echo "Roll back with:  bash $0 --revert"
