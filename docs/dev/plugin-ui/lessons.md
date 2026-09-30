# Plugin preview contract lessons from cub-flux

This is a second-plugin applicability check of the frozen v1 envelope in
[`contract.md`](contract.md), using the real `cub flux plan --json` output. It
does not change the envelope or imply that every plugin can calculate a
preview.

## Common envelope lessons

- Keep producer, export time, scope, offered capability, two graphs, and issues
  common. `capabilities: ["preview"]` describes this local conversion; it
  grants no ConfigHub access and performs no action.
- Keep graph identity plugin-neutral: stable string node IDs, explicit kinds,
  optional namespace/details, and edges whose endpoints stay inside their own
  graph. Sort nodes and edges for repeatable output.
- Preserve the distinction between supplied input, inferred proposal, and live
  observation. Here the source is a static fleet plan. It cannot prove current
  reconciliation, rendered objects, or delivery. We do not invent a live
  inventory or health result.
- Represent source-reported skipped inputs and planning problems as warning
  issues. A valid partial plan remains a valid JSON document. A malformed
  input is a conversion error: stderr diagnostic and nonzero exit, with no
  partial stdout. Successful CLI conversion writes JSON only to stdout.
- Treat IDs as text, not UUIDs; use hub slugs only where the plan supplies
  them. Never infer authorization or account identity from a local plan.
- Omit credentials, Secret/config bodies, and arbitrary source metadata. The
  adapter selects an allowlist of plan fields and ignores unknown properties.

## Plugin-specific choices

Flux plan exposes clusters, Kustomizations, component bases, per-cluster
variant spaces/units, targets, stages, dependencies, departures, and explicit
limitations. The adapter maps those named relationships to the v1 graph and
labels inventory nodes as Git plan inputs. The Sveltos-specific kinds,
selectors, profile dispositions, and onboarding hints in the frozen contract
remain optional plugin behavior. Flux does not need to fabricate those fields
or a preview when it lacks the corresponding source data.

The Flux plan is local and offline. No connected account, authenticated
operation, or preview authorization is implied. Separate any future connected
read from this conversion; capabilities and mode must not silently turn a
local artifact into an upload or execution.

## Reproduction and provenance

Source: `/Users/alexis/code/examples`, commit
`64a6c499ce824d4700a8dfbc1945333dc2e4a1e3`, input tree
`gitops/flux/expert-fleet`; plan implementation is in
`cub-flux/internal/flux/plan.go`. The checked-in input fixture is a direct copy
of the plugin's machine-readable plan output, not parsed prose:

```sh
cd /Users/alexis/code/examples
./cub-flux/bin/cub-flux plan --json ./gitops/flux/expert-fleet \
  > /Users/alexis/code/ui/tests/fixtures/plugin-ui/cub-flux-expert-fleet.plan.json
cd /Users/alexis/code/ui
node scripts/plugin-preview-flux.mjs tests/fixtures/plugin-ui/cub-flux-expert-fleet.plan.json \
  --exported-at 2026-09-30T00:00:00Z > public/examples/flux-preview.json
npx playwright test -c playwright.pure.config.ts tests/plugin-preview-flux.pure.spec.ts
```

The reproducible fixture preserves the source CLI's plan identity and expected
relationships while removing its checkout-specific absolute `repoRoot` from
the envelope. This proves adapter applicability to plan JSON only; it is not a
claim that the plugin emits this envelope natively or that a live Flux cluster
was checked.

## Lessons discovered during integration

1. Reuse the planner's match resolution. Sveltos unions explicit references and
   selectors, with recorded status as a fallback; a separately implemented
   exporter initially got that wrong. Export all planned variants and management
   units, not just the visually obvious base objects.
2. Keep raw export time separate from observation freshness. Recorded matches
   use a distinct relation and never establish current delivery.
3. Authentication's organization identifier can be an identity-provider alias.
   Connected graph scoping must use canonical IDs from API entities. A live
   ConfigHub read exposed this; the browser fixture now uses different IDs.
4. Offline startup includes the HTML document. Moving auth out of the route was
   insufficient while HTML still fetched external fonts. Local browser tests
   now assert that no foreign, auth, API or runtime-config requests occur.
5. One bundle requires one asset URL layout. The first local launcher mapped
   assets under `/local/`, while Vite emits root `/assets/` URLs. Verify the
   production bundle through the actual launcher, not only a mocked HTML file.
6. Validate adapters against a second plugin before calling a contract generic.
   Flux reused the envelope unchanged while supplying different domain details.
   Applicability to every plugin is a checklist, not a claim that all plugins
   have already migrated or have the same capabilities.

## Cost-conscious delegation

Two bounded Luna workers handled exporter/launcher work and the second-plugin
fixture/adapter review. Each received specific owned files and acceptance cases.
The primary handled shared architecture, connected identity, integration, browser
proof and review. Exporter review required planner-parity corrections; launcher
review required one asset-routing repair. These are useful constraints for future
delegation: give workers real producer semantics and a representative built bundle.
No measured dollar saving is claimed. Use inexpensive agents for bounded adapters,
fixtures and inventories; retain integration review and escalate semantic mismatches.
