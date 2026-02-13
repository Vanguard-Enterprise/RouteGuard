declare global {
  interface CloudflareEnv {
    DB: D1Database;
    R2: R2Bucket;
  }

  namespace NodeJS {
    interface ProcessEnv {
      WORKOS_API_KEY?: string;
      WORKOS_CLIENT_ID?: string;
      WORKOS_REDIRECT_URI?: string;
      NEXT_PUBLIC_MAPBOX_TOKEN?: string;
      TWILIO_ACCOUNT_SID?: string;
      TWILIO_AUTH_TOKEN?: string;
      TWILIO_FROM_NUMBER?: string;
      NODE_ENV?: string;
    }
  }
}

export {};
