// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import react from '@vitejs/plugin-react';
import path from 'path';
import { Plugin, defineConfig, loadEnv } from 'vite';

let listenHost = 'localhost';
if (process.env.VITE_LISTEN_HOST) {
  listenHost = process.env.VITE_LISTEN_HOST as string;
}

// monaco-editor's esm/vs/nls.js#_format uses the shape
//   let result;
//   if (args.length === 0) { result = message; } else { result = message.replace(...); }
//   if (isPseudo) { result = '...' + result.replace(...) + '...'; }
//   return result;
// Vite/Rollup's optimizer drops the `result = message;` assignment in the
// empty-args branch, so when localize() is called with no template args (which
// every action descriptor does) result is undefined and the page crashes at
// load. Rewrite to an unambiguous initializer that the optimizer can't drop.
const monacoNlsFixPlugin = (): Plugin => ({
  name: 'monaco-editor-nls-fix',
  enforce: 'pre',
  transform(code, id) {
    if (!id.includes('/monaco-editor/esm/vs/nls.js')) return;
    const fixed = code.replace(
      /let result;\s*if \(args\.length === 0\) \{\s*result = message;\s*\}\s*else \{\s*result = message\.replace\(/,
      'let result = message;\n    if (args.length !== 0) {\n        result = message.replace(',
    );
    return fixed === code ? null : { code: fixed, map: null };
  },
});

// In production the container's entrypoint writes /config.json from CONFIGHUB_*
// environment variables (see docker-entrypoint.sh). The dev server answers the same
// request from the same variables (environment or .env.local), so `npm run dev` needs
// no file in public/. The instance defaults to a ConfigHub server on this machine,
// which the UI calls directly: the API allows any origin.
const runtimeConfigPlugin = (env: Record<string, string>): Plugin => ({
  name: 'confighub-runtime-config',
  configureServer(server) {
    server.middlewares.use('/config.json', (_req, res) => {
      const config = {
        apiBaseUrl: env.CONFIGHUB_URL || 'http://localhost:9090',
        oauthClientId: env.CONFIGHUB_UI_OAUTH_CLIENT_ID,
        posthogKey: env.CONFIGHUB_POSTHOG_KEY,
      };
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(config));
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    monacoNlsFixPlugin(),
    react(),
    runtimeConfigPlugin({ ...loadEnv(mode, process.cwd(), 'CONFIGHUB_'), ...process.env } as Record<string, string>),
  ],
  // esbuild 0.28.x regressed: it tries to lower plain destructuring even for targets that
  // support it (e.g. monaco worker `for (let {range,text,eol} of edits)`), failing the build
  // with "Transforming destructuring ... is not supported yet". Tell esbuild destructuring is
  // supported so it leaves it alone.
  esbuild: {
    supported: { destructuring: true },
  },
  optimizeDeps: {
    include: ['json-rules-engine', 'eventemitter2'],
    esbuildOptions: {
      supported: { destructuring: true },
    },
  },
  resolve: {
    // When @confighub/* are linked from a local checkout (file: dependencies), resolve
    // their imports from here, so they share this app's React and Redux Toolkit rather
    // than the checkout's own. Their own runtime dependencies (openapi-fetch) are
    // therefore this app's dependencies too.
    preserveSymlinks: true,
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: listenHost,
    // Honor a PORT assigned by the environment (e.g. the preview harness) so the
    // dev server can run alongside another instance already on the default 5173.
    // Falls back to Vite's default when PORT is unset.
    ...(process.env.PORT ? { port: Number(process.env.PORT) } : {}),
    fs: {
      allow: ['..'],
    },
  },
}));
