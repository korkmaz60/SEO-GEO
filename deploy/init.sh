#!/bin/sh
# Creates deploy/.env from deploy/.env.example with random secrets. Safe to re-run: an
# existing deploy/.env is never overwritten.
set -eu

dir=$(cd "$(dirname "$0")" && pwd)
target="$dir/.env"

if [ -e "$target" ]; then
  echo "deploy/.env already exists; nothing was changed."
  exit 0
fi

secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32
  else
    head -c 32 /dev/urandom | base64
  fi
}

# Letters and digits only, so the password is safe inside a connection URL.
password() {
  LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32
}

umask 077
sed \
  -e "s|^POSTGRES_PASSWORD=$|POSTGRES_PASSWORD=$(password)|" \
  -e "s|^AUTH_SECRET=$|AUTH_SECRET=$(secret)|" \
  -e "s|^ENCRYPTION_KEY=$|ENCRYPTION_KEY=$(secret)|" \
  "$dir/.env.example" >"$target"

echo "Created deploy/.env with a new database password, AUTH_SECRET and ENCRYPTION_KEY."
echo "Next: review WEB_URL (and SMTP) in deploy/.env, then run:"
echo "  docker compose -f deploy/compose.yaml up -d --build"
