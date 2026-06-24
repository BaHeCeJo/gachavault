#!/usr/bin/env bash
#
# Decide which services need a real Docker rebuild for this push.
#
# Output (to $GITHUB_OUTPUT):
#   changed_services=ALL                  -> rebuild everything
#   changed_services=api-gateway web ...  -> rebuild only these (space list)
#   changed_services=                     -> rebuild nothing (e.g. compose/nginx-
#                                            only change); every service is retagged
#                                            to the new SHA and the deploy still runs
#
# The build workflow turns this into: changed -> build+push :sha/:latest,
# unchanged -> `imagetools create` copies :latest to :sha (no rebuild).
# Either way every service ends up with a :<sha> image, so the SHA-pinned
# docker-compose.prod.yml deploy is unaffected.
#
# Bias: when anything is ambiguous (manual run, missing diff base, shared
# crate / Cargo.lock / .sqlx change), rebuild EVERYTHING. Over-building wastes
# minutes; under-building ships a stale image silently — the worse failure.
set -euo pipefail

ALL_RUST="api-gateway auth-service games-service items-service collections-service tierlists-service media-service search-service notifications-service events-service"

emit() {
  echo "changed_services=$1" >> "$GITHUB_OUTPUT"
  echo "[detect] selected: ${1:-<none>}"
}

# --- Cases where we cannot (or shouldn't) trust a diff: build everything ---
if [ "${EVENT_NAME:-}" = "workflow_dispatch" ]; then
  echo "[detect] manual dispatch -> build all"
  emit "ALL"; exit 0
fi
if [ -z "${BEFORE:-}" ] || [ "${BEFORE}" = "0000000000000000000000000000000000000000" ]; then
  echo "[detect] no prior commit (first push / new branch) -> build all"
  emit "ALL"; exit 0
fi
if ! git cat-file -e "${BEFORE}^{commit}" 2>/dev/null; then
  echo "[detect] prior commit ${BEFORE} not in history (force-push?) -> build all"
  emit "ALL"; exit 0
fi

FILES="$(git diff --name-only "${BEFORE}" "${SHA}")"
if [ -z "$FILES" ]; then
  echo "[detect] empty diff -> build all (safe default)"
  emit "ALL"; exit 0
fi
echo "[detect] changed files:"; echo "$FILES" | sed 's/^/  /'

# --- Workspace-global changes: anything every Rust service compiles against ---
# crates/** (shared crates), Cargo.lock / root Cargo.toml (dep graph),
# .sqlx/** (shared offline query cache), audit.toml, the deploy workflow
# itself, or this detector script -> all Rust services must rebuild.
if echo "$FILES" | grep -qE '^(crates/|Cargo\.toml$|Cargo\.lock$|\.sqlx/|audit\.toml$|\.github/workflows/deploy\.yml$|\.github/scripts/detect-changed-services\.sh$)'; then
  echo "[detect] workspace-global change -> all Rust services"
  RUST_ALL=1
else
  RUST_ALL=0
fi

selected=""
for svc in $ALL_RUST; do
  if [ "$RUST_ALL" = 1 ] || echo "$FILES" | grep -qE "^services/${svc}/"; then
    selected="$selected $svc"
  fi
done

# web is independent of the Rust workspace (its own build context).
if echo "$FILES" | grep -qE '^web/'; then
  selected="$selected web"
fi
# A change to the deploy workflow should also re-exercise the web build.
if echo "$FILES" | grep -qE '^\.github/workflows/deploy\.yml$' && ! echo " $selected " | grep -q ' web '; then
  selected="$selected web"
fi

selected="$(echo "$selected" | xargs || true)"  # trim/normalize spaces
emit "$selected"
