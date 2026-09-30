One optional UI bundle for local plugin previews and connected ConfigHub reads.

Includes Sveltos and Flux examples. Local mode needs no server account and does
not upload preview files. Connected mode uses the normal ConfigHub sign-in flow.

Download both the archive and its SHA-256 file. With a compatible Sveltos plugin,
run `cub sveltos ui install --version <this-release-tag>`, then `cub sveltos ui`.
The installer verifies archive integrity and every manifest-listed file before
activating the bundle. GitHub CLI authentication is required for private releases.
Checksums verify bytes; obtain releases from the trusted ConfigHub repository.

This bundle has an independent `plugin-ui-v*` version. It does not change the
version or deployment of the ConfigHub server or hosted UI. CLI-only plugin
installation does not require it.
