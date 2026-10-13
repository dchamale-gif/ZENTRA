#!/bin/sh
set -eu

load_secret() {
  variable_name="$1"
  file_variable_name="${variable_name}_FILE"
  eval "file_path=\${$file_variable_name:-}"
  if [ -n "$file_path" ]; then
    eval "export $variable_name=\"$(cat "$file_path")\""
  fi
}

load_secret DB_PASSWORD
load_secret AUTH_DB_PASSWORD
load_secret PLATFORM_DB_PASSWORD
load_secret JWT_SECRET
load_secret PLATFORM_ADMIN_PASSWORD

exec "$@"
