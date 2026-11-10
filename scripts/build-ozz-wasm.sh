#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OZZ_VERSION="0.17.0"
SOURCE="${TMPDIR:-/tmp}/preserve-ozz-${OZZ_VERSION}"
if [ ! -f "$SOURCE/include/ozz/animation/runtime/blending_job.h" ]; then
  ARCHIVE="$(mktemp)"
  trap 'rm -f "$ARCHIVE"' EXIT
  curl -fsSL "https://github.com/guillaumeblanc/ozz-animation/archive/refs/tags/${OZZ_VERSION}.tar.gz" -o "$ARCHIVE"
  echo "22b4401c77a2be68acb0a8aa2e857f94dbaccfed3ab25e304a1ddea4c546e86b  $ARCHIVE" | sha256sum -c -
  mkdir -p "$SOURCE"
  tar xzf "$ARCHIVE" -C "$SOURCE" --strip-components=1
fi

em++ -std=c++17 -O3 -DNDEBUG -I"$SOURCE/include" -I"$SOURCE/src" \
  "$ROOT/src/world/ozz/ozz_bridge.cc" \
  "$SOURCE/src/animation/runtime/blending_job.cc" "$SOURCE/src/animation/runtime/ik_two_bone_job.cc" \
  "$SOURCE/src/animation/runtime/local_to_model_job.cc" "$SOURCE/src/animation/runtime/skeleton.cc" \
  "$SOURCE/src/animation/offline/raw_skeleton.cc" "$SOURCE/src/animation/offline/skeleton_builder.cc" \
  "$SOURCE/src/base/memory/allocator.cc" "$SOURCE/src/base/platform.cc" "$SOURCE/src/base/log.cc" \
  "$SOURCE/src/base/containers/string_archive.cc" "$SOURCE/src/base/encode/group_varint.cc" \
  "$SOURCE/src/base/io/archive.cc" "$SOURCE/src/base/io/stream.cc" "$SOURCE/src/base/maths/box.cc" \
  "$SOURCE/src/base/maths/simd_math.cc" "$SOURCE/src/base/maths/math_archive.cc" \
  "$SOURCE/src/base/maths/soa_math_archive.cc" "$SOURCE/src/base/maths/simd_math_archive.cc" \
  -s MODULARIZE=1 -s EXPORT_ES6=1 -s SINGLE_FILE=1 -s ALLOW_MEMORY_GROWTH=1 -s FILESYSTEM=0 -s ENVIRONMENT=web,worker \
  -s 'EXPORTED_FUNCTIONS=["_malloc","_free","_ozz_create_rig","_ozz_destroy_rig","_ozz_blend_pose","_ozz_solve_leg","_ozz_rotate_joint"]' \
  -s 'EXPORTED_RUNTIME_METHODS=["HEAPF32","HEAP32"]' --no-entry \
  -o "$ROOT/src/world/ozz/ozz-runtime.js"
cp "$SOURCE/LICENSE.md" "$ROOT/src/world/ozz/LICENSE.md"
echo "Built ozz-animation ${OZZ_VERSION} WebAssembly runtime."