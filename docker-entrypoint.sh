#!/bin/sh
set -e

HTML=/usr/share/nginx/html

# Runtime configuration for the app, read once at boot from /config.json. Every
# value is optional; empty means the default, which for the instance is the page's
# own origin. Values are JSON-escaped, not validated. CONFIGHUB_API_URL and
# CONFIGHUB_OAUTH_CLIENT_ID are the names these had before; they are still read.
json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}
cat > "$HTML/config.json" <<JSON
{
  "apiBaseUrl": "$(json_escape "${CONFIGHUB_URL:-${CONFIGHUB_API_URL:-}}")",
  "oauthClientId": "$(json_escape "${CONFIGHUB_UI_OAUTH_CLIENT_ID:-${CONFIGHUB_OAUTH_CLIENT_ID:-}}")",
  "posthogKey": "$(json_escape "${CONFIGHUB_POSTHOG_KEY:-}")"
}
JSON

exec nginx -g 'daemon off;'
