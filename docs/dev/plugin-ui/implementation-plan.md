# One plugin UI: implementation and proof ledger

Agreed 2026-09-30. Two entry paths, one implementation in confighub/ui: plugin/local first, or ConfigHub/connected first. Sveltos pilots reusable lessons for every cub plugin.

## Success defined before implementation
- Versioned deterministic JSON over the existing Sveltos planner, retaining input scope and partial failures, without raw config/Secrets.
- One explorer consumes local graphs and actual connected records; local route boots with no auth/API/telemetry calls.
- No invented live health or server IDs. Explicit scoped lookup, ambiguity and unreadable states.
- Optional loopback launcher serves the same pinned UI build, no command execution endpoint.
- Contract tested against a second plugin's real recorded output; shared lessons document applicable versus optional capabilities.
- Go unit/integration tests, UI type/build/pure tests, browser local/connected mock flows, and available live read-only smoke. Report unavailable live dependencies honestly.

## Work packages
1. Freeze preview envelope and fixtures; implement Sveltos JSON exporter (Luna, high).
2. Implement local startup and shared explorer (primary).
3. Connected adapter and identity tests (primary).
4. Optional pinned local launcher (bounded Luna after exporter).
5. Reusable guide, second-plugin adapter/fixture, regression and browser proof (primary; bounded Luna fixture audit).

Only independent work runs concurrently. Workers receive contract, owned files and acceptance cases, not full conversation. One repair attempt then escalation. Capture review/rework; no unmeasured monetary saving claims. Sub-agent tool cannot set speed tier.

## Progress
- Contract specified in contract.md.
- Baselines: UI 4f0b5f7; Sveltos 8187910. Implementation uses separate codex/plugin-ui-local-connected branches.

## Completion evidence — 2026-09-30

- Sveltos `plan --format json` and optional `ui` launcher implemented. ASCII
  remains the default. Preview reuses planner matching, includes variant and
  management Units, and separates recorded status matches from selectors.
- One shared explorer runs in unauthenticated local mode and authenticated
  connected mode. Both local examples pass browser loading; Flux uses a real
  recorded plan and requires no envelope changes.
- `npx playwright test -c playwright.pure.config.ts`: 272 passed.
- `npm run test:plugin`: 6 passed. Covers foreign/backend request blocking,
  malformed input, connected permission failures, distinct auth/canonical org
  identifiers, mobile layout and Sveltos proposal completeness.
- `npm run build:plugin`: passed, 178 assets sealed. TypeScript compilation is
  part of the build. Existing large-chunk warning remains.
- `npm run lint`: 0 errors, 97 warnings in existing code; no plugin file warnings.
- Sveltos `go test ./...`, `go build ./...`, `go vet ./...`: passed.
- Production smoke: launched the Go binary against the actual sealed UI bundle;
  checked every served asset against its manifest SHA-256 and confirmed API,
  auth, connected and missing asset paths return 404. Opened Sveltos inventory
  and proposal in the in-app browser and visually inspected both modes.
- Live connected smoke: existing local ConfigHub server, read-only component
  `rh-argo-apptique`, 8 objects and 7 relationships. Confirmed canonical org
  scoping, existing links, and explicit unassessed health.
- `git diff --check`: passed in both repositories. cub-scout is unchanged.

The existing Sveltos management context was unreachable (connection refused),
so no live Sveltos controller or delivery proof is claimed. Deterministic input
fixtures and connected HTTP fixtures cover this read-only pilot; the live server
check uses existing Argo-backed records. A full Sveltos delivery rehearsal needs
that environment restored. No deployment, import or rollout was performed.

## Delegation review

Exporter/launcher and Flux work used two bounded Luna workers; architecture,
connected integration and final verification stayed with the primary. Exporter
review found match-resolution and proposal-completeness defects and corrected
them with regression tests. Launcher review required one repair for root asset
URLs. The Flux fixture was checked against a real CLI plan. Document these
integration costs alongside reuse benefits; runtime logs do not establish a
monetary saving. All delegated work is finished.
