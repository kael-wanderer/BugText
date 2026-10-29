#!/usr/bin/env bash
# One-time setup: create a stable self-signed code-signing identity so local
# BugText builds keep their Keychain ACLs ("Always Allow") across rebuilds.
# Ad-hoc signatures change on every build, so macOS asks for each saved key
# again after every install.
#
# Run once, interactively; macOS asks for your login password when the key is
# imported and the certificate is trusted. Afterwards scripts/build-local-app.sh
# picks the identity up automatically.
set -euo pipefail

NAME="BugText Local Dev"

if security find-identity -v -p codesigning 2> /dev/null | grep -q "$NAME"; then
    echo "Code-signing identity '$NAME' already exists — nothing to do."
    exit 0
fi

# Pin the system LibreSSL. A Homebrew OpenSSL 3 earlier in PATH writes a
# modern PKCS#12 that `security import` rejects with "MAC verification failed
# during PKCS12 import (wrong password?)".
OPENSSL=/usr/bin/openssl

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT # SAFE: removes only the mktemp scratch directory this script created
# Throwaway transport passphrase for the temporary .p12; never stored.
PASS="$("$OPENSSL" rand -hex 16)"

"$OPENSSL" req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
    -keyout "$TMP/key.pem" -out "$TMP/cert.pem" \
    -subj "/CN=$NAME" \
    -addext "keyUsage=critical,digitalSignature" \
    -addext "extendedKeyUsage=critical,codeSigning" \
    -addext "basicConstraints=critical,CA:FALSE"

"$OPENSSL" pkcs12 -export -out "$TMP/dev.p12" -inkey "$TMP/key.pem" -in "$TMP/cert.pem" \
    -name "$NAME" -passout "pass:$PASS"

LOGIN_KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"
security import "$TMP/dev.p12" -k "$LOGIN_KEYCHAIN" -P "$PASS" -T /usr/bin/codesign

# Trust the certificate for code signing in the user trust domain. This is the
# step where macOS asks for your password.
security add-trusted-cert -r trustRoot -p codeSign -k "$LOGIN_KEYCHAIN" "$TMP/cert.pem"

echo
echo "Created '$NAME':"
security find-identity -v -p codesigning | grep "$NAME" || true
echo
echo "Next steps:"
echo "  1. Rebuild: scripts/build-local-app.sh (identity is picked up automatically)."
echo "  2. First codesign use may prompt for keychain access — click 'Always Allow'."
