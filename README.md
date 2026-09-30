# ConfigHub UI

The web UI for [ConfigHub](https://confighub.com): a React + TypeScript app (Vite, MUI, Redux
Toolkit / RTK Query) that signs in to a ConfigHub instance as an ordinary OAuth client and talks
to its API with a bearer token. The same build works with any ConfigHub instance; which one, and
as which OAuth client, is read at runtime from `/config.json`.

It is built on the published JavaScript SDK
([`@confighub/api`, `@confighub/rtk-query`, `@confighub/react-auth`](https://github.com/confighub/js-sdk)),
whose version is the ConfigHub server version it speaks.

## Running it

You need Node 22+ and a ConfigHub instance.

1. Register this app as an OAuth client of the instance, with the dev server's origin as its
   redirect URI (the trailing slash matters):

       cub oauthclient create my-ui-dev --redirect-uri http://localhost:5173/

   To serve every organization, as a hub's own UI does, the registering user's organization
   must be trusted by the server (`CONFIGHUB_OAUTHCLIENT_TRUSTED_ORGS`) and the client is
   created with `--allow-all-orgs`.

2. Point the dev server at the instance: copy `.env.local.example` to `.env.local` and set
   `CONFIGHUB_URL` and `CONFIGHUB_UI_OAUTH_CLIENT_ID`.

3. `npm install` and `npm run dev`, then open http://localhost:5173.

For a ConfigHub server on your own machine, leave `CONFIGHUB_URL` unset: it defaults to
`http://localhost:9090`, which the UI calls directly, since the API allows any origin.

## Authentication

`@confighub/react-auth` runs OIDC Authorization Code + PKCE against the identity provider the
instance advertises in `/api/info`, then exchanges the IdP token at `/auth/exchange` (RFC 8693)
for a ConfigHub token. Every API call carries it as `Authorization: Bearer`. There are no
cookies, so the UI can be served from any origin. On an instance with no identity provider
(`/api/info` advertises no `AuthIssuer`), a browser is signed in by the link
`cub auth browser-session` prints, which opens `/cli-signin` with a single-use ticket.

`src/main.tsx` fetches `/config.json` and `/api/info` before it imports the app:

| Field | Meaning | If absent |
|---|---|---|
| `apiBaseUrl` | Origin of the ConfigHub instance | the page's own origin |
| `oauthClientId` | This deployment's OAuth client | right for an instance with no identity provider; a configuration error otherwise |
| `posthogKey` | Telemetry project | no telemetry |

The image below writes it from the environment; the dev server serves it from `.env.local`.

## The image

`Dockerfile` builds the UI into an nginx image that works with any ConfigHub instance. The
entrypoint writes `/config.json` from the environment at start:

| Env | Meaning | Unset |
|---|---|---|
| `CONFIGHUB_URL` | The ConfigHub instance | the page's own origin |
| `CONFIGHUB_UI_OAUTH_CLIENT_ID` | This deployment's OAuth client | none |
| `CONFIGHUB_POSTHOG_KEY` | Telemetry | off |

Build it with `docker build .`. The image serves static files only: the UI calls the instance
at `CONFIGHUB_URL` directly, which the API's CORS allows.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server on http://localhost:5173 |
| `npm run build` | Production bundle in `dist/` |
| `npm run lint` | ESLint |
| `npm run prettier` | Format the sources |
| `npm run playwright:test` | The end-to-end suite (see below) |

## Tests

The tests are [Playwright](https://playwright.dev) end-to-end specs in `tests/`; see
[tests.md](./tests.md). They run against a live ConfigHub instance and sign in through its
identity provider as a test user, configured in `.env`: `TEST_BASE_URL`, `TEST_USER` and
`TEST_PASSWORD`. `TEST_BASE_URL` is the UI under test, wherever it is served (the dev server
or the image); the suite learns the instance behind it from
that UI's `/config.json`, as the app does. A spec that calls the API directly does so through
`hubApi` in `tests/fixtures/test.ts`, which targets that instance with the test user's token.
Specs named `*.pure.spec.ts` need no server and run with
`npx playwright test -c playwright.pure.config.ts`.

## License

[MIT](./LICENSE).
