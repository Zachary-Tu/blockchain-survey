/** Runtime bindings injected by Cloudflare Workers / Sites. */
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    RESEARCHER_EMAILS: string;
    M1_AGENT_PROFILE_SHA256?: string;
    M1_PRIMARY_CHROME_MAJOR?: string;
    M1_DEPLOYMENT_ID?: string;
    M1_DEPLOYMENT_FINGERPRINT_SHA256?: string;
    M1_STAGE_A_PRIMARY_COLLECTION_ENABLED?: string;
    M1_HUMAN_COLLECTION_ENABLED?: string;
    M1_DEVELOPMENT_PILOT_ENABLED?: string;
    M1_AUDIT_RECEIPT_HMAC_SECRET?: string;
    M1_AUDIT_EVIDENCE_HMAC_SECRET?: string;
  }
}
