#!/usr/bin/env bash
# Yohu ADB Tools v6 — sidecar adb 准备（macOS / Linux）
# tools/ 下官方 adb 被 .gitignore 排除（二进制不入库）。
# 从 Google platform-tools 下载当前 OS 的 adb。
# 用法：bash scripts/setup-adb.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_DIR="$ROOT/tools"
# 钉死版本，避免 latest 漂移；与 scripts/setup-adb.ps1 同一 r36.0.2
PT_VERSION="36.0.2"
UNAME="$(uname -s)"
case "$UNAME" in
  Darwin)
    ZIP_NAME="platform-tools_r${PT_VERSION}-darwin.zip"
    FILES=(adb)
    ;;
  Linux)
    ZIP_NAME="platform-tools_r${PT_VERSION}-linux.zip"
    FILES=(adb)
    ;;
  *)
    echo "请在 Windows 上运行 scripts/setup-adb.ps1（当前 OS: $UNAME）" >&2
    exit 1
    ;;
esac
URL="https://dl.google.com/android/repository/${ZIP_NAME}"

mkdir -p "$TARGET_DIR"
missing=0
for name in "${FILES[@]}"; do
  if [[ ! -f "$TARGET_DIR/$name" ]]; then
    missing=1
    break
  fi
done
if [[ "$missing" -eq 0 ]]; then
  echo "sidecar adb 已存在，跳过下载"
  chmod +x "$TARGET_DIR/adb" 2>/dev/null || true
  exit 0
fi

TMP_ZIP="$(mktemp -t yohu-platform-tools-XXXXXX.zip)"
TMP_DIR="$(mktemp -d -t yohu-platform-tools-XXXXXX)"
cleanup() {
  rm -f "$TMP_ZIP"
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "下载 platform-tools：$URL"
curl -fsSL "$URL" -o "$TMP_ZIP"
unzip -q "$TMP_ZIP" -d "$TMP_DIR"
SRC_DIR="$TMP_DIR/platform-tools"
for name in "${FILES[@]}"; do
  if [[ ! -f "$SRC_DIR/$name" ]]; then
    echo "zip 中缺少 $name" >&2
    exit 1
  fi
  cp "$SRC_DIR/$name" "$TARGET_DIR/$name"
  chmod +x "$TARGET_DIR/$name"
  echo "OK：$TARGET_DIR/$name"
done

echo
echo "sidecar adb 就绪（${#FILES[@]} 个文件）"
