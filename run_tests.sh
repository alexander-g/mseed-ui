#!/bin/bash

set -e


COVERAGE_DIR=./tests/coverage
rm -rf $COVERAGE_DIR

./deno.sh test                  \
    --allow-read=./             \
    --no-prompt                 \
    --cached-only               \
    --coverage=$COVERAGE_DIR/raw    \
    --coverage-raw-data-only        \
    ${@-tests/}



for arg in "--html" "--lcov --output=${COVERAGE_DIR}/coverage.lcov" ""; do
    ./deno.sh coverage \
        --exclude=./tests               \
        --exclude=./wasm-cpp/build-wasm \
        $arg                            \
        $COVERAGE_DIR
done
