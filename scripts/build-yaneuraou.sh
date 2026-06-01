#!/usr/bin/env sh
set -eu

repo="${YANEURAOU_REPO:-https://github.com/yaneurao/YaneuraOu.git}"
ref="${YANEURAOU_REF:-master}"
target_cpu="${YANEURAOU_TARGET_CPU:-SSE42}"
jobs="${YANEURAOU_BUILD_JOBS:-2}"

workdir="/tmp/yaneuraou-build"
out="/app/engine/yaneuraou"

rm -rf "$workdir"
git clone --depth 1 --branch "$ref" "$repo" "$workdir"

cd "$workdir/source"
make clean YANEURAOU_EDITION=YANEURAOU_ENGINE_NNUE
make "-j$jobs" tournament \
  COMPILER=clang++ \
  YANEURAOU_EDITION=YANEURAOU_ENGINE_NNUE \
  TARGET_CPU="$target_cpu" \
  ENGINE_NAME="YaneuraOuRender"

mkdir -p "$(dirname "$out")"

candidate="$(find . -maxdepth 1 -type f -perm -111 | head -n 1)"
if [ -z "$candidate" ]; then
  echo "YaneuraOu build finished, but no executable was found in source/." >&2
  exit 1
fi

cp "$candidate" "$out"
chmod +x "$out"
"$out" compiler || true
