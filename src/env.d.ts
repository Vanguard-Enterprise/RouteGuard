declare global {
  interface CloudflareEnv {
    DB: D1Database;
    R2: R2Bucket;
  }
}

export {};
