#!/bin/sh

set -eu

WASM_FILE=wasm_minimp3_rs.wasm
OUTPUT_WASM_FILE=decoder.wasm

bindgen bindings.h --output src/bindings.rs

## For release build.
CXX=clang++-11 CC=clang-11 AR=llvm-ar-11 cargo build --release --target wasm32-unknown-unknown
wasm-opt -O ./target/wasm32-unknown-unknown/release/${WASM_FILE} -o public/${OUTPUT_WASM_FILE}
wasm-strip public/${OUTPUT_WASM_FILE}

## For debug build.
# CXX=clang++-11 CC=clang-11 AR=llvm-ar-11 cargo build --target wasm32-unknown-unknown
# cp ./target/wasm32-unknown-unknown/debug/${WASM_FILE} public/${OUTPUT_WASM_FILE}