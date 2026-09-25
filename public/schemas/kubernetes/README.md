# Kubernetes JSON Schema

Sourced from https://github.com/yannh/kubernetes-json-schema (Apache-2.0).

Files: `v1.31.0-standalone-strict/all.json` and `v1.31.0-standalone-strict/_definitions.json`.

`all.json` references `_definitions.json` via relative `$ref`, so both files
must be served from the same path. Vite copies this directory into the build
output, so they are reachable at `/schemas/kubernetes/all.json` at runtime.

To upgrade the Kubernetes version, replace both files with the matching pair
from a different `vX.Y.Z-standalone-strict/` directory in the upstream repo.
