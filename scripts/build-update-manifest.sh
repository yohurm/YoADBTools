#!/usr/bin/env bash
# Build update-manifest.json for GitHub Releases (static check path, no REST API).
# Platform keys must match yohu-update::github::manifest::platform_manifest_key.
#
# Usage:
#   bash scripts/build-update-manifest.sh \
#     --version 0.1.3 --tag v0.1.3 --out update-manifest.json \
#     --asset windows-x86_64=/path/YohuAdbTools_0.1.3_x64-setup.exe \
#     --asset linux-x86_64=/path/YohuAdbTools_0.1.3_amd64.deb \
#     --asset darwin-aarch64=/path/YohuAdbTools_0.1.3_aarch64.dmg
set -euo pipefail

OWNER="${OWNER:-yohurm}"
REPO="${REPO:-Windows-YoADBTools}"
VERSION=""
TAG=""
NOTES=""
OUT=""
declare -a ASSET_ARGS=()

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="${2:?}"; shift 2 ;;
    --tag) TAG="${2:?}"; shift 2 ;;
    --notes) NOTES="${2:?}"; shift 2 ;;
    --out) OUT="${2:?}"; shift 2 ;;
    --owner) OWNER="${2:?}"; shift 2 ;;
    --repo) REPO="${2:?}"; shift 2 ;;
    --asset)
      ASSET_ARGS+=("${2:?}")
      shift 2
      ;;
    -h|--help) usage ;;
    *)
      echo "unknown arg: $1" >&2
      usage
      ;;
  esac
done

if [[ -z "$VERSION" || ${#ASSET_ARGS[@]} -eq 0 ]]; then
  echo "需要 --version 与至少一个 --asset key=path" >&2
  usage
fi

VERSION="${VERSION#v}"
VERSION="${VERSION#V}"
if [[ -z "$TAG" ]]; then
  TAG="v${VERSION}"
fi
if [[ -z "$OUT" ]]; then
  OUT="update-manifest.json"
fi

page_url="https://github.com/${OWNER}/${REPO}/releases/tag/${TAG}"

# Validate keys against product contract.
allowed='^(windows-x86_64|darwin-aarch64|darwin-x86_64|linux-x86_64|linux-aarch64)$'

platforms_json=""
first=1
for entry in "${ASSET_ARGS[@]}"; do
  key="${entry%%=*}"
  path="${entry#*=}"
  if [[ "$key" == "$entry" || -z "$path" ]]; then
    echo "asset 格式应为 key=path，收到：$entry" >&2
    exit 1
  fi
  if [[ ! "$key" =~ $allowed ]]; then
    echo "非法平台键：$key" >&2
    exit 1
  fi
  if [[ ! -f "$path" ]]; then
    echo "安装包不存在：$path" >&2
    exit 1
  fi
  name="$(basename "$path")"
  size="$(wc -c < "$path" | tr -d ' ')"
  if command -v sha256sum >/dev/null 2>&1; then
    sha="$(sha256sum "$path" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    sha="$(shasum -a 256 "$path" | awk '{print $1}')"
  else
    echo "需要 sha256sum 或 shasum" >&2
    exit 1
  fi
  url="https://github.com/${OWNER}/${REPO}/releases/download/${TAG}/${name}"
  # Escape JSON string specials in name (ASCII product names; keep simple).
  name_json="${name//\\/\\\\}"
  name_json="${name_json//\"/\\\"}"
  block=$(printf '{"url":"%s","name":"%s","size_bytes":%s,"sha256":"%s"}' \
    "$url" "$name_json" "$size" "$sha")
  if [[ $first -eq 1 ]]; then
    platforms_json=$(printf '"%s":%s' "$key" "$block")
    first=0
  else
    platforms_json+=$(printf ',"%s":%s' "$key" "$block")
  fi
  echo "  $key ← $name ($size bytes, sha256=$sha)"
done

notes_json="${NOTES//\\/\\\\}"
notes_json="${notes_json//\"/\\\"}"
notes_json="${notes_json//$'\n'/\\n}"
notes_json="${notes_json//$'\r'/}"

printf '{\n  "version": "%s",\n  "notes": "%s",\n  "page_url": "%s",\n  "platforms": {\n    %s\n  }\n}\n' \
  "$VERSION" "$notes_json" "$page_url" "$platforms_json" > "$OUT"

echo "Wrote $OUT"
