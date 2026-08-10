/** Runtime bindings injected by Cloudflare Workers / Sites. */
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
  }
}
