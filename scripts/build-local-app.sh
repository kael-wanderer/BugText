#!/usr/bin/env bash
# Build the BugText app bundle (and DMG) signed with the stable local identity
# "BugText Local Dev" (see scripts/make-local-signing-cert.sh). Every build handed
# out must use this: the Keychain binds "Always Allow" to the app's designated
# requirement, which for this identity is the same certificate on every build, so
# saved API keys keep working after an update. An ad-hoc signature changes on each
# build and makes macOS ask for the login password again.
#
# Run as `npm run build:app`. Extra arguments go to `tauri build`, for example
# `npm run build:app -- --bundles app`. Without the identity the build stops;
# set BUGTEXT_ALLOW_ADHOC=1 for a local ad-hoc build that is never handed out.
set -euo pipefail

NAME="BugText Local Dev"

if security find-identity -v -p codesigning 2> /dev/null | grep -q "$NAME"; then
    export APPLE_SIGNING_IDENTITY="$NAME"
elif [ "${BUGTEXT_ALLOW_ADHOC:-}" = "1" ]; then
    echo "No '$NAME' identity: building ad-hoc signed (BUGTEXT_ALLOW_ADHOC=1). Do not hand this build out." >&2
else
    echo "No '$NAME' code-signing identity. Run scripts/make-local-signing-cert.sh once, or set BUGTEXT_ALLOW_ADHOC=1 for a local-only build." >&2
    exit 1
fi

npm run tauri -- build "$@"

APP="src-tauri/target/release/bundle/macos/BugText.app"
if [ -d "$APP" ] && [ -n "${APPLE_SIGNING_IDENTITY:-}" ]; then
    # Read into a variable first: with pipefail, grep -q closing the pipe early
    # would fail the check through codesign's SIGPIPE.
    INFO="$(codesign -dv --verbose=2 "$APP" 2>&1)"
    if ! printf '%s\n' "$INFO" | grep -q "^Authority=$NAME\$"; then
        echo "$APP is not signed by '$NAME'." >&2
        exit 1
    fi
    echo "Signed by '$NAME':"
    REQ="$(codesign -d -r- "$APP" 2>&1)"
    printf '%s\n' "$REQ" | grep designated
fi
