# One explorer, two entry paths

The optional plugin UI and the connected ConfigHub UI share `Explorer.tsx` and
one production build. `/local` reads preview files in the browser without
starting authentication, fetching runtime configuration, or contacting a
ConfigHub server. `/plugins` uses the existing authenticated SDK and actual
server identities. The same bundle supports both routes; the local launcher
only exposes the static local route and assets.

## Try it

In this repository:

```sh
npm ci
npm run build:plugin
```

In the Sveltos plugin checkout containing the preview/launcher implementation:

```sh
go build -o ./cub-sveltos .
./cub-sveltos plan examples/ui-preview/minimal.yaml --format json > preview.json
./cub-sveltos ui --assets-dir /absolute/path/to/ui/dist
```

Open `preview.json` in the browser, or use either bundled example. Switch between
supplied input and proposed ConfigHub structure; select an object to follow its
relationships. No server account is required. Planning can read Helm chart
sources according to the existing planner; viewing an exported file is offline.

The launcher is an optional extra. Existing CLI installation and ASCII output
continue to work without a UI bundle. `--no-browser` prints the URL; Ctrl-C stops
the launcher. A future installer can offer this bundle as an opt-in download;
installer prompts, published release assets and automatic updates are not part
of this pilot. The manifest verifies local bytes; it is not a publisher signature.

For the connected path, run this UI with its normal ConfigHub configuration,
open **Plugin explorer**, and select a component. This reads configuration
records and links to existing space/unit/rollout pages. It does not infer live
controller health. A local preview can optionally be compared by proposed space
name within the selected component; candidates are not proof of adoption.

The local UI's **Open connected mode** goes to a separately hosted UI address
and its existing sign-in flow. It transfers no preview file. The loopback launcher
has no server proxy, credential handling, import, or execution endpoint.

## Plugin author checklist

Every cub plugin can adopt these practices, even if it never offers a UI:

- Preserve human-readable defaults; expose explicit, versioned machine output.
- Write only machine data to stdout in machine mode; diagnostics go to stderr.
  Document when a nonzero exit still carries a valid partial result.
- Define stable identity, input scope, provenance, export time and unknown states.
  Missing data must not turn into a healthy, unmanaged or empty-fleet claim.
- Select safe metadata explicitly; exclude credentials and raw configuration.
- Test determinism, partial errors, unsupported inputs and backwards compatibility.
- Treat optional UI capabilities separately from authorization and installation.

Plugins offering this preview additionally implement the [v1 contract](contract.md),
provide a representative fixture, and run it through the existing parser tests.
They supply adapters and domain metadata, not separate explorer implementations.
See [lessons](lessons.md) for the Flux proof and pilot discoveries. Neither Flux
nor other plugins are claimed to emit this envelope natively yet.

## Validation

```sh
npx tsc -b
npm run lint
npx playwright test -c playwright.pure.config.ts
npx playwright install chromium
npm run test:plugin
npm run build:plugin
# In the Sveltos checkout:
go test ./...
go build ./...
```

The UI browser suite runs independently of a backend: it blocks foreign requests
in local mode and exercises the actual connected component/SDK against recorded
HTTP responses. The implementation ledger records separate live checks and their
limits. Tests of a preview do not prove live controller delivery.
