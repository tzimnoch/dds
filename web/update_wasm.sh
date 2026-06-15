#!/usr/bin/env bash
# Copy Bazel WASM artifacts next to dds_mvp.html for local static serving.
# Also generates dds_wasm_bin.js with embedded base64 wasm for file:// support.
set -euo pipefail
cd "$(dirname "$0")/.."
bazel build //web:dds_wasm
bin="$(bazel info bazel-bin)/web"
cp -f "${bin}/dds_wasm.js" web/
cp -f "${bin}/dds_mvp_wasm_cc.wasm" web/
echo "Updated web/dds_wasm.{js,wasm,bin.js}"
