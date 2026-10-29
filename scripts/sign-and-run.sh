#!/usr/bin/env bash
# Cargo runner for debug builds (see src-tauri/.cargo/config.toml). Signs the
# debug binary with the local dev identity, under the same bundle identifier as
# the release build, so Keychain "Always Allow" applies to dev runs too. Without
# the identity it runs the binary unsigned, as before.
set -euo pipefail

BIN="$1"
shift

NAME="BugText Local Dev"

if security find-identity -v -p codesigning 2> /dev/null | grep -q "$NAME"; then
    codesign --force --sign "$NAME" --identifier com.kael.bugtext "$BIN"
fi

exec "$BIN" "$@"
