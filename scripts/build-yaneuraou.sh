#!/usr/bin/env sh
set -eu

repo="${YANEURAOU_REPO:-https://github.com/yaneurao/YaneuraOu.git}"
ref="${YANEURAOU_REF:-master}"
target_cpu="${YANEURAOU_TARGET_CPU:-SSE42}"
jobs="${YANEURAOU_BUILD_JOBS:-2}"
edition="${YANEURAOU_EDITION:-YANEURAOU_ENGINE_MATERIAL}"
material_level="${YANEURAOU_MATERIAL_LEVEL:-1}"

workdir="/tmp/yaneuraou-build"
out="/app/engine/yaneuraou"

rm -rf "$workdir"
git clone --depth 1 --branch "$ref" "$repo" "$workdir"

cd "$workdir/source"
make clean YANEURAOU_EDITION="$edition" MATERIAL_LEVEL="$material_level"
make "-j$jobs" tournament \
  COMPILER=clang++ \
  YANEURAOU_EDITION="$edition" \
  MATERIAL_LEVEL="$material_level" \
  TARGET_CPU="$target_cpu" \
  ENGINE_NAME="YaneuraOuRender"

mkdir -p "$(dirname "$out")"

candidate=""
if [ -x "./YaneuraOuRender" ]; then
  candidate="./YaneuraOuRender"
else
  candidate="$(find . ../exe -maxdepth 1 -type f -perm -111 2>/dev/null | grep -E 'YaneuraOu|YaneuraOuRender|yaneuraou' | head -n 1 || true)"
fi
if [ -z "$candidate" ]; then
  echo "YaneuraOu build finished, but no engine executable was found." >&2
  find . ../exe -maxdepth 1 -type f -perm -111 2>/dev/null || true
  exit 1
fi

cp "$candidate" "$out"
chmod +x "$out"
"$out" compiler
