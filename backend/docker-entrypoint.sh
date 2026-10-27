#!/bin/sh
set -eu

load_secret() {
  variable_name="$1"
  file_variable_name="${variable_name}_FILE"
  eval "file_path=\${$file_variable_name:-}"
  if [ -n "$file_path" ]; then
    secret_value="$(cat "$file_path")"
    export "$variable_name=$secret_value"
  fi
}

load_secret DB_PASSWORD
load_secret AUTH_DB_PASSWORD
load_secret PLATFORM_DB_PASSWORD
load_secret JWT_SECRET
load_secret PLATFORM_ADMIN_PASSWORD
load_secret INTEGRATIONS_KEY
load_secret EMAIL_API_KEY

exec "$@"
