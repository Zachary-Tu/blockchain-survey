# Boundary Lab — Human–Agent Context Elasticity Experiment

Boundary Lab is a research platform for measuring how stage boundaries move when the same judge receives progressively richer semantic context about a time series, and for comparing that context elasticity between Human participants and a frozen multimodal Agent system.

## Current primary experiment: M1

M1 is a fixed, isomorphic Human–Agent protocol rather than the configurable module console:

- Actor: one Human and one `R-PRIMARY` Agent run per pair;
- Information condition: staged disclosure or seven-round no-new-information repeat control, randomized between pairs;
- Task: two boundaries defining three stages;
- Stimulus: weekly, linear-scale price curves using all available observations;
- Assets: BTC, ETH, SOL, BNB, XRP, and DOGE;
- Flow: 7 rounds × 6 single-asset pages = 42 formal judgments per session;
- Ordering: six Williams-balanced asset schedules;
- Response: two boundary centers, two continuous uncertainty ranges, disclosure-impact rating, and explicit no-change confirmation when needed.

Staged disclosure uses G0, GI1, GI2, DI1, DI2, DI3, and DI4. Future topics remain “?” until disclosed. From the second judgment onward, the previous boundary is shown as a dashed reference. DI3 and DI4 use two preselected event sets with identical participant-facing visual treatment; source priority is retained only in research metadata. Frozen event text is English, so Human eligibility includes a prior out-of-band English financial-news reading screen.

The repeat-control arm keeps G0 visible for all seven rounds while preserving the same page count, response controls, prior-boundary reference, breaks, and canonical state machine. It estimates retest, time, fatigue, practice, and anchoring drift; it is not a reading-load-matched placebo.

## Entry points

- `/m1` — Human M1 task;
- `/agent` — isomorphic screenshot-and-coordinate Agent task;
- `/research/m1-launch` — researcher-only paired launcher;
- `/research/results` — allowlisted research exports;
- `/methodology/m1` — rendered method architecture;
- `/` and `/agent/console` — configurable development/diagnostic modules, excluded from the primary M1 comparison.

## Stage plan and readiness

The current executable build enables only **Stage A**, capped at 12 balanced primary pairs: one pair in each information-condition × Williams-schedule cell. Stage B is a disabled specification for a later 36-pair variance pilot. It requires a new cohort/build/configuration after Stage A achieves a full release decision; it does not start automatically.

Stage A uses a frozen audit state machine:

1. `NOT_EVALUABLE` until all 12 cells exist, all 24 primary allocation slots are terminal through either a real complete/aborted session or a valid pre-start disposition, Stage-A collection is formally closed by a trusted signed receipt, and the five-table input bundle is verified;
2. `STOP` for any complete-session integrity failure, confirmed answer loss, or future-information leakage;
3. `REVISE` below 10 complete matched pairs, below 5 within either information condition, or beyond the frozen completion, abort, duration, device-deviation, or G0-anchor thresholds;
4. `GO_PENDING_EXTERNAL_GATES` when quantitative checks pass but required ethics, consent/data-management, English-screening, withdrawal, raw-UA, deployment, controller, runtime-prompt, model/browser, or run-artifact evidence is missing;
5. `GO` only when both the quantitative audit and all external release gates pass.

The deterministic core is in `lib/m1-stage-a-audit.ts`; it does not inspect Human–Agent boundary effects. The v3 audit CLI reconstructs scientific integrity from the five raw exports, verifies every referenced external and raw Agent artifact, and requires independently controlled HMAC signatures for both the collection receipt and the institutional evidence root.

This repository is **not yet ready for real-Human recruitment or paired Agent Stage A**. Real-Human work requires the applicable institutional ethics approval or written exemption, institution-approved full consent materials, a frozen English-screening instrument and threshold, and an approved data-management/withdrawal process. Paired Agent Stage A additionally requires the external executable screenshot-to-model-to-coordinate controller, the complete runtime prompt package, frozen browser/model artifacts, restricted raw run artifacts, a real deployment manifest, and a collection service that closes one database snapshot and produces the signed export receipt. The repository validates those artifacts when supplied but does not contain the controller, production receipt signer, institutional evidence keys, or real run artifacts.

## Integrity and data model

Strict M1 uses one-time 256-bit opaque launch tokens. The server atomically freezes pair, actor, condition, schedule, stimulus/event hashes, cohort Agent-profile hash, and primary Chrome major. Session creation materializes 42 canonical expected steps. Before a token is claimed, an allowlisted researcher may record one of four frozen pre-start terminal dispositions; the server verifies the formal collection gate, current build, and allocation deployment identity, revokes the token, and creates no session. Consequently, `started` counts only real canonical sessions.

Every formal page obtains one immutable server exposure clock before the stimulus is shown. Server receive time enforces the 180-second page limit; the full run has a 120-minute server limit. Browser timers remain behavioral telemetry, not the authoritative timeout clock.

For Agent runs, every page must have a validated attempt ledger. Retry inputs are bound by prompt, complete runtime-request, screenshot, output, action-trace, and request-link hashes. A complete Agent session requires 42 canonical responses, 42 server exposures, 42 final submitted attempts, 42 one-to-one response links, and 42 independently verified scientific-answer hashes. Stage-A release auditing also reads each non-empty raw request/screenshot/output/trace file, verifies its hash, checks request-profile binding, fully validates the frozen non-interlaced 1440×900 PNG evidence, and enforces closed coordinate-only action schemas. A screenshot or model-output hash may not be reused across different ledger pages in one run. Each closed `m1-agent-model-output-v1` record is bound to one session, step, and model request; its recomputed scientific-response hash must match both the submitted attempt and the exported response.

Cloudflare D1 is the system of record. Research exports provide five linked tables:

1. allocations, token hashes, claim/session links, and pre-start terminal disposition/timestamps;
2. sessions, device environment, profile/screening metadata, status, and termination code;
3. 42-step responses and interaction telemetry;
4. server step exposures;
5. Agent attempt ledgers.

Strict M1 does not persist raw User-Agent strings; it stores only a coarse browser-major/OS summary. Identity, recruitment, consent, compensation, screen-out, and withdrawal records belong in a separate restricted ledger connected only through approved opaque identifiers. Website records are coded/pseudonymized, not fully anonymous.

## Local development

Requires Node.js `>=22.13.0`.

```bash
npm ci
npm run dev
```

Validation:

```bash
npm run typecheck
npm run lint
npm test
npm run db:generate
```

All collection routes fail closed. A real Stage-A deployment must explicitly set `M1_STAGE_A_PRIMARY_COLLECTION_ENABLED=true` and `M1_HUMAN_COLLECTION_ENABLED=true`, while keeping `M1_DEVELOPMENT_PILOT_ENABLED=false`; a diagnostic `quota-manual` launch is permitted only when the development-pilot flag is explicitly true and is never part of the primary sample. The deployment must also define `M1_AGENT_PROFILE_SHA256`, `M1_PRIMARY_CHROME_MAJOR`, a stable `M1_DEPLOYMENT_ID`, and the 64-hex `M1_DEPLOYMENT_FINGERPRINT_SHA256` derived from the archived production bundle. Launch assignments and all linked exports carry that deployment identity. At collection stop, disabling the primary/Human gates blocks new launches and further strict-session mutations (explicit abort remains available), but the repository still requires an external controlled service to atomically close the database snapshot and sign the final export receipt. Receipt chronology uses server/database write times: allocation claims/terminal dispositions and attempt `created_at` must precede collection close; controller `completed_at` is checked for chronology but cannot prove the write occurred before close. Research CSV access additionally requires a server-side `RESEARCHER_EMAILS` allowlist.

## Key files

- `app/ExperimentModular.tsx` — shared Human/Agent M1 UI and state machine;
- `lib/m1-protocol.ts` — frozen 42-step topology, schedules, hashes, and cohort identifiers;
- `lib/m1-agent-profile.ts` — canonical cohort Agent-profile hashing;
- `lib/m1-execution-limits.ts` — Agent retry/action/page-limit state machine;
- `lib/m1-stage-a-audit.ts` — deterministic Stage-A decision core;
- `lib/m1-stage-a-normalize.ts` — five-table scientific-integrity reconstruction;
- `lib/m1-stage-a-evidence.ts` — signed receipt/evidence, deployment, profile, run, and raw-artifact verification;
- `scripts/audit-m1-stage-a.ts` — v3 evidence-driven audit CLI;
- `app/api/m1-launches/route.ts` — atomic balanced assignment and opaque launch tokens;
- `app/api/m1-step-exposures/route.ts` — authoritative page clocks;
- `app/api/agent-attempts/route.ts` — Agent ledger validation and audit links;
- `app/api/modular-responses/route.ts` and `app/api/sessions/route.ts` — canonical response and completion enforcement;
- `app/api/research-export/route.ts` — allowlisted linked-table exports;
- `public/data/m1-agent-runner-protocol.json` — machine-readable runner contract;
- `public/data/m1-source-manifest.json` — deterministic source manifest bound to the Stage-A build ID;
- `docs/M1_ISOMORPHIC_HUMAN_AGENT_METHOD_ZH.md` — normative Chinese method specification;
- `docs/EXPERIMENT_BRIEF_REPORT_EN.md` — concise English architecture report;
- `docs/M1_DATA_STORAGE_AND_TELEMETRY_ZH.md` — storage, timing, privacy, and export dictionary;
- `docs/M1_STAGE_A_AUDIT_RUNBOOK_ZH.md` — operational v3 GO/REVISE/STOP audit runbook;
- `drizzle/` — versioned D1 migrations.

Earlier configurable interfaces and protocol files remain in the repository for rollback and separate exploratory work, but their data must not be pooled with the primary M1 cohort.
