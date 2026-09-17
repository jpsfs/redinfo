#!/bin/sh
# Runtime app-title stamp for the build-once/promote model: nginx:alpine
# executes every executable *.sh it finds in /docker-entrypoint.d/ before
# starting nginx (see Dockerfile, which installs this as
# /docker-entrypoint.d/20-app-title.sh), so the SAME frontend image can be
# built once and deployed to every environment — only APP_TITLE (set on the
# container, see deploy/redinfo/values.*.yaml) differs between them.
#
# Only index.html and manifest.webmanifest are rewritten. The JS bundle is
# deliberately left alone: LoginPage.tsx reads window.APP_TITLE, which
# index.html publishes (as a separate identifier from the __APP_TITLE__
# placeholder text below, so this sed can't mangle it — see index.html's own
# comment), instead of anything baked into the bundle at build time (see
# vite.config.ts's injectAppTitle plugin for the build-time-only counterpart
# of this, used for dev/local builds that set VITE_APP_TITLE).
#
# manifest.webmanifest is JSON, so a title containing a double quote would
# break it — APP_TITLE is expected to be plain text, not arbitrary input.
set -eu
APP_TITLE="${APP_TITLE:-RedInfo - Dev}"
ROOT=/usr/share/nginx/html
# sed replacement metacharacters in the title would otherwise corrupt the output
ESCAPED=$(printf '%s' "$APP_TITLE" | sed -e 's/[\\&|]/\\&/g')
for f in "$ROOT/index.html" "$ROOT/manifest.webmanifest"; do
  [ -f "$f" ] || continue
  sed -i "s|__APP_TITLE__|${ESCAPED}|g" "$f"
done
