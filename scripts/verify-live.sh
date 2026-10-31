#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .data/verification
export CAMPUS_DATABASE="campus_radar_test_$(date +%Y%m%d_%H%M%S)_${RANDOM}"
export PREVIEW_URL=http://127.0.0.1:5179 API_REAL_E2E=1
passed=false
restore() {
  local test_database="$CAMPUS_DATABASE"
  ./scripts/stop-local.sh
  unset CAMPUS_DATABASE
  ./scripts/start-local.sh --no-build
  if "$passed"; then python3 scripts/local.py drop-test "$test_database"; else
    echo "验收未通过，隔离库 $test_database 已保留供排查；应用已恢复到 campus_radar。" >&2
  fi
}
./backend/mvnw -B -f backend/pom.xml "-Dmaven.repo.local=$PWD/.data/maven-repository" clean test package > .data/verification/backend-full.log 2>&1
npm --prefix frontend run generate:api
npm --prefix frontend run typecheck
npm --prefix frontend test
npm --prefix frontend run build > .data/verification/frontend-build.log 2>&1
trap restore EXIT
./scripts/start-local.sh --no-build
export PLAYWRIGHT_JSON_OUTPUT_FILE="$PWD/.data/verification/live-results.json"
npm --prefix frontend run test:e2e -- --reporter=list,json
passed=true
