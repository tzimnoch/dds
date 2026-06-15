#!/usr/bin/env bash
# Remove WASM artifacts copied into web/ by update_wasm.sh.
set -euo pipefail
cd "$(dirname "$0")"
rm -f dds_wasm.js dds_mvp_wasm_cc.wasm
echo "Removed web/dds_wasm.js and dds_mvp_wasm_cc.wasm (if present)"
