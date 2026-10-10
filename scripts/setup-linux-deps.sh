#!/usr/bin/env bash
# Yohu ADB Tools — Linux 宿主依赖（WebKitGTK / GTK3）
# Tauri 2 在 Linux 上用系统 WebKitGTK 4.1，不内嵌浏览器。
# 用法：bash scripts/setup-linux-deps.sh
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "此脚本只在 Linux 上安装 WebKitGTK 构建依赖" >&2
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "未找到 apt-get。请自行安装：libwebkit2gtk-4.1-dev、libgtk-3-dev、patchelf、librsvg2-dev、libayatana-appindicator3-dev、libssl-dev、libxdo-dev、pkg-config、build-essential、xdg-utils" >&2
  exit 1
fi

pkgs=(
  build-essential
  pkg-config
  libssl-dev
  libwebkit2gtk-4.1-dev
  libgtk-3-dev
  libayatana-appindicator3-dev
  librsvg2-dev
  patchelf
  libxdo-dev
  file
  xdg-utils
  curl
  unzip
)

if [[ "${EUID}" -eq 0 ]]; then
  apt-get update
  apt-get install -y "${pkgs[@]}"
else
  sudo apt-get update
  sudo apt-get install -y "${pkgs[@]}"
fi

echo "Linux 宿主依赖已安装"
