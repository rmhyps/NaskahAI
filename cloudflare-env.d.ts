declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    NINE_ROUTER_BASE_URL?: string;
    NINE_ROUTER_API_KEY?: string;
    NINE_ROUTER_MODEL?: string;
  }
}
