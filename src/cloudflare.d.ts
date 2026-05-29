interface KVNamespacePutOptions {
  expiration?: number;
  expirationTtl?: number;
  metadata?: unknown;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: KVNamespacePutOptions): Promise<void>;
  delete(key: string): Promise<void>;
}
