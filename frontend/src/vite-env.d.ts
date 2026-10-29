/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Worker origin when the frontend is hosted separately (e.g. GitHub Pages). Empty means same origin. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
