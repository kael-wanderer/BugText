#!/usr/bin/env bash
# Build the BugText app bundle signed with the stable local identity when it
# exists (see scripts/make-local-signing-cert.sh), otherwise ad-hoc signed.
# Extra arguments go to `tauri build`, for example `--bundles app`.
set -euo pipefail

NAME="BugText Local Dev"

if security find-identity -v -p codesigning 2> /dev/null | grep -q "$NAME"; then
    export APPLE_SIGNING_IDENTITY="$NAME"
else
    echo "No '$NAME' identity found; building ad-hoc signed. Run scripts/make-local-signing-cert.sh once to stop repeated Keychain prompts." >&2
fi

npm run tauri -- build "$@"
