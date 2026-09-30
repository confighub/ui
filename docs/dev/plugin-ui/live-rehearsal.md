# Live local-to-connected rehearsal, 2026-09-30

Result: Sveltos delivered the test object locally, handed it over without
recreation, and delivered a subsequent approved ConfigHub release. Both UI
entry paths were exercised. The sanitized [receipt](evidence/2026-09-30-sveltos-live.json)
records object identity, controller state, and published release digests.

## Scope and environment

The older `kind-helm-expt-sveltos-mgmt` context was stale. Existing Meridian kind
containers `mer-mgmt` and `mer-test1` were stopped; these two were restarted.
No other cluster was started or deleted, and the global kube context was not
changed. Private kubeconfigs and working files remain in `/tmp/plugin-ui-live`
(mode 0700); they are not committed.

A new `ui-preview-policy` ClusterProfile on management delivered a Namespace and
ConfigMap to `projectsveltos/eu-central-test1`. The object was isolated in
`plugin-ui-proof`. Existing Meridian application profiles were not changed.
ConfigHub records use the `ui-pilot` prefix on the local server.

## Evidence sequence

1. Native Sveltos delivery produced `ConfigMap/plugin-ui-proof/preview-proof`
   with `message: local-first`.
2. Exported the actual ClusterProfile, referenced ConfigMap and two cluster
   records. `plan --format json --prefix ui-pilot --profiles ui-preview-policy`
   produced a valid v1 preview: 4 inventory nodes, 2 edges; 9 proposed nodes,
   8 edges. The management cluster's unselected warning remained explicit.
3. The shared validator passed. The browser's local upload test consumed this
   exact preview with all foreign/auth/API/runtime-config requests prohibited.
4. Generated the onboarding and handover scripts. For this local test only,
   changed the delivery profile's hosted OCI URL to
   `oci://host.docker.internal:32181/space/<variant>:latest` and enabled
   `remoteURL.plainHTTP`. The normal planner still defaults to the hosted gateway.
5. Ran `apply.sh` with the local ConfigHub context and explicit management and
   workload kubeconfigs. It created base/variant/management/target records and
   published the first approved release. Unrelated cluster facts were reported
   as not collected because this proof has Targets for only two clusters.
6. Ran `handover.sh`. It verified the exported profile and ConfigMap versions,
   set LeavePolicies, removed only the new original profile, and installed its
   ConfigHub delivery profile. The ConfigMap UID remained unchanged.
7. Updated the base to `message: connected-release`, created a new change order,
   promoted to fleet, approved, and published. Sveltos reported Resources as
   Provisioned; the actual ConfigMap changed while retaining the same UID.
8. In the authenticated UI, selected `ui-pilot-ui-preview-policy`. It showed
   5 objects and 4 relationships with real Space/Unit links. Health remained
   explicitly unassessed in the explorer; the independent live receipt supplies
   delivery evidence rather than silently changing the UI's evidence source.

## Repeating the check

Create a fresh, uniquely named proof profile and namespace with the same simple
ConfigMap policy as `sveltos-confighub/examples/ui-preview/minimal.yaml`, using
explicit refs to your test cluster. Export the live objects (not Secrets), then:

```sh
cub sveltos plan profile.yaml clusters.yaml policy-configmap.yaml \
  --profiles <profile> --prefix <unique-prefix> --format json > preview.json
# From the UI source checkout:
npm run --silent check:preview -- /absolute/path/to/preview.json
PLUGIN_PREVIEW_FILE=/absolute/path/to/preview.json npm run test:plugin -- --grep 'local boot'
# From the Sveltos plugin:
cub sveltos apply profile.yaml clusters.yaml policy-configmap.yaml \
  --profiles <profile> --prefix <unique-prefix> --out onboard
```

Read `onboard/apply.sh` and `handover.sh`, configure the correct gateway for the
instance, and run them with explicit kubeconfigs/context. Record the object's
UID before and after handover and after one approved update; require the live
object value and controller result, not just a successful publish command.

The resumed clusters and isolated proof records are retained for demonstration.
This is one successful target-level rehearsal, not a fleet-wide health claim.
