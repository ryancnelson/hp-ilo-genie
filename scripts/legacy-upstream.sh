#!/bin/sh
set -eu
exec "${LEGACY_OPENSSL:-/opt/legacy/bin/openssl}" s_client \
  -quiet -no_ign_eof -connect "${ILO_CONNECT_HOST:-$ILO_HOST}:${ILO_PORT:-443}" \
  -cipher "${ILO_CIPHER:-DES-CBC3-SHA}"
