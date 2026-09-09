/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RPC_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_POOL_PROGRAM_ID?: string;
  readonly VITE_ORACLE_PROGRAM_ID?: string;
  readonly VITE_POOL_REGISTRY_JSON?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
