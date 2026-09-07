#!/usr/bin/env bash
# Yohu ADB Tools v6 — sidecar scrcpy-server 准备
# tools/scrcpy-server 被 .gitignore 排除（官方二进制不入库）。
# 从 Genymobile/scrcpy Release 下载官方 server（与协议钉死版本一致）。
# 用法：bash scripts/setup-scrcpy-server.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_DIR="$ROOT/tools"
TARGET="$TARGET_DIR/scrcpy-server"
VERSION="4.1"
URL="https://github.com/Genymobile/scrcpy/releases/download/v${VERSION}/scrcpy-server-v${VERSION}"

mkdir -p "$TARGET_DIR"

if [[ -f "$TARGET" ]]; then
  LEN="$(wc -c < "$TARGET" | tr -d ' ')"
  if [[ "$LEN" -gt 100000 ]]; then
    echo "scrcpy-server 已存在（$LEN 字节），跳过下载"
    exit 0
  fi
fi

TMP="$(mktemp -t yohu-scrcpy-server-XXXXXX)"
cleanup() { rm -f "$TMP"; }
trap cleanup EXIT

echo "下载 scrcpy-server v${VERSION}：${URL}"
curl -fsSL -L "${URL}" -o "${TMP}"
cp "${TMP}" "${TARGET}"
echo "OK：${TARGET}"
echo "sidecar scrcpy-server 就绪（版本 ${VERSION}）"
