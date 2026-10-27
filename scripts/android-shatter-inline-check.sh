#!/usr/bin/env bash
# Focused native qualification through the existing unprofiled workflow.
# Workflow tail=physics-mesh only quiesces after all shards are gone.
set -euo pipefail
bash scripts/android-shatter-native-costs.sh
bash scripts/android-shatter-native-pacing.sh
# Retain original Glass Shatter behavior gate unchanged, including its failure.
bash scripts/android-shatter.sh
python3 scripts/check-android-results.py smoke-out --require-summary shatter
