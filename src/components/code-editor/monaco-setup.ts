// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import yamlWorker from 'monaco-yaml/yaml.worker?worker';

// Route Monaco's web-worker requests to Vite-bundled workers. Without this,
// @monaco-editor/react would fetch Monaco from a CDN and monaco-yaml could not
// attach to the same Monaco instance.
declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}

let initialized = false;

export const initMonaco = () => {
  if (initialized) return;
  initialized = true;

  self.MonacoEnvironment = {
    getWorker(_workerId: string, label: string) {
      switch (label) {
        case 'json':
          return new jsonWorker();
        case 'yaml':
          return new yamlWorker();
        default:
          return new editorWorker();
      }
    },
  };

  loader.config({ monaco });
};
