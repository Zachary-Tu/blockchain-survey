# Boundary Lab M1 — Experimental Architecture Brief

**Frozen implementation date:** 26 August 2026

**Protocol:** `m1-isomorphic-v1`

**Cohort:** `m1-technical-pilot-a2-2026`

**Build:** `m1-stage-a2-6d1a0f5d304b9fca` (source-manifest-bound)
**Status:** Stage-A implementation frozen; Stage-B specification disabled in this build; not ready for Human recruitment or paired Agent Stage A. Every real-Human activity first requires applicable institutional ethics approval or written exemption, institution-approved full informed-consent materials, a frozen out-of-band English financial-news reading screen, and verified data-minimization/withdrawal controls. Paired Agent Stage A also remains blocked by the external executable controller, complete runtime prompt package, restricted run artifacts, a production collection-close/export receipt signer, independently controlled audit-evidence signing, and deployment evidence described below.

## 1. Research objective

M1 estimates how stage boundaries change when the same judge receives progressively richer semantic context about a time series, and whether this context elasticity differs between a Human participant and a multimodal Agent system.

The Agent is not treated as a structured-data algorithm. The comparison target is a Human participant versus a frozen **model + screenshot input + coordinate controller** system operating the same browser pages.

## 2. Identifiable design

The core design is a 2 × 2 experiment:

- **Actor:** Human / Agent, paired within a common assignment.
- **Information condition:** staged disclosure / no-new-information repeat control, randomized between pairs.

Each session contains six cryptocurrency price series, seven judgment rounds, and two stage boundaries. Assets use one of six Williams-balanced orders. A complete session therefore contains:

```text
7 rounds × 6 assets = 42 formal judgments
```

The staged condition progresses through G0, GI1, GI2, DI1, DI2, DI3, and DI4. The repeat-control condition presents seven otherwise equivalent rounds while retaining the G0 information state. It estimates practice, fatigue, elapsed-time, anchoring, and mechanical retest drift; it is not claimed to be a reading-load-matched placebo.

Human and Agent members of a pair receive the same condition, schedule, stimulus hash, event-source hash, cohort Agent-profile hash, primary Chrome major, and 42-step canonical plan. URLs contain only a one-time 256-bit opaque launch token.

## 3. Pilot sequence

- **Stage A — technical pilot:** 12 primary pairs, one pair in each information-condition × Williams-schedule cell.
- **Stage B — variance-pilot specification, disabled:** a future 36-pair build with three pairs per cell. It requires a new cohort/build/cap after a full Stage-A release decision; the current allocator cannot launch it.
- **Primary pair:** exactly one allocated Human slot and one allocated frozen `R-PRIMARY` Agent slot. A slot becomes started only when the server creates its canonical session.
- Data from Stage A, Stage B, revised cohorts, and a later confirmatory sample must not be pooled.
- Every stage involving real Human participants—including Stage A and Stage B pilots—requires the applicable institution’s prior ethics approval or written exemption and institution-approved full informed consent. The website checkbox records only that the separate consent process was completed; it is not and cannot replace informed consent. A confirmatory study additionally requires preregistration, a Stage-B-based power simulation, and a newly frozen deployment.

## 4. Common task and controlled factors

Both actors receive the same participant-facing briefing, synthetic practice item, chart geometry, response controls, transition pages, asset pages, neutral rest pages, and completion rules. Future disclosure topics are rendered as “?” until they become available.

DI3 and DI4 show two event sets selected by frozen source-priority bands, but participants see neutral “event information 1/2” framing, no P1–P5 badge, and the same marker/card styling. Priority remains analysis metadata rather than a visual cue. Event titles and descriptions are frozen in English. Human eligibility therefore requires a prior out-of-band English financial-news reading screen (`m1-en-financial-reading-v1`); the website records only the screening version and confirmation time, not the instrument, score, or cutoff. This restricts generalizability to Chinese users who can independently read short English financial-event descriptions.

The primary M1 task fixes:

- T2 three-stage judgment with two boundaries;
- price series, weekly resolution, linear scale, and all available observations;
- BTC, ETH, SOL, BNB, XRP, and DOGE;
- continuous boundary positions and continuous symmetric uncertainty ranges;
- previous-round boundaries as dashed references;
- 1/3 and 2/3 starting anchors, explicitly defined as a common adjustment task rather than blank placement.

Primary Human sessions use desktop Chrome, a 1440 × 900 viewport, DPR 1, 100% zoom, and a fine pointer. The server hard-checks the assignment-frozen Chrome major plus measurable viewport/DPR/pointer/orientation; zoom remains an external checklist item. The Agent uses the corresponding frozen browser environment and coordinate-only controller. DOM, accessibility tree, source code, network requests, stimulus JSON, database access, external search, and Human responses are prohibited during Agent judgment.

## 5. Primary estimand

For actor `q`, condition `c`, transition `l`, asset `a`, and boundary `k`, let `m[q,c,l,a,k]` be the expected absolute normalized boundary movement. The single primary estimand is:

```text
theta_abs = equal-weight mean over 6 transitions × 6 assets × 2 boundaries of
  [(Agent staged − Agent control) − (Human staged − Human control)]
```

All 72 cells receive equal weight. The primary analysis uses complete matched pairs. Assets are fixed effects; pair is the allocation and clustering unit; session/run is nested within pair; transition slopes and session × asset heterogeneity are retained. Absolute movement uses a two-part hurdle model whose first part is any nonzero stored-ratio movement: ratios are stored to six decimal places, so `B = round(10^6 × b)` and `I(|delta B| >= 1)` deterministically implements `I(|delta b| > 0)` without an analyst-chosen tolerance; the positive part models `|delta b|`. Signed movement and the distinct grid-crossing outcome `I(|delta index| >= 1)` are secondary outcomes.

All-available and protocol-eligible complete-pair analyses are sensitivity analyses. Because withdrawal, technical failure, and controller abort can be non-random, all-available observations cannot restore randomization or replace the complete-pair primary analysis.

## 6. Data and integrity controls

The database stores:

- the assignment ledger, irreversible token hashes, claim timestamps/session links, and any server-recorded pre-start terminal disposition;
- session status and termination code, actor, pair, schedule, condition, frozen cohort/build/profile identifiers, timestamped operational confirmations that institution-approved consent and the external English screen were completed, and device environment;
- 42 server-generated expected-step tuples per session;
- current and previous boundaries, uncertainty intervals, influence rating, timestamps, interaction latency, adjustment counts, hidden-page time, active response time, viewport, and protocol deviations;
- one immutable server exposure clock per formal step;
- for every Agent step, controller/model request metadata plus complete runtime-request, prompt, screenshot, output, action-trace, and server-response hashes, with retry/source-request linkage.

The server enforces strict next-step submission, server-derived previous boundaries, idempotent identical retries, rejection of conflicting rewrites, and exact completion. Session creation atomically claims the token, occupies the pair slot, writes all 42 expected steps, and activates the session. Every complete session requires 42 server-issued exposures and 42 canonical responses. A complete Agent session additionally requires 42 unique submitted attempts linked one-to-one to those responses and 42 independently verified scientific-response hashes.

Researcher CSV exports provide five linked tables: allocations, sessions/devices, responses, server step-exposures, and Agent attempts. Aggregate export is protected by the server-side researcher email allowlist.

The formal Stage-A v3 audit does not trust exported convenience flags or researcher-written summaries. It reconstructs the 12 allocation cells, 24 primary slots, every real canonical session, canonical 42-step plans, boundary/date/index correspondence, uncertainty intervals, previous-boundary continuity, G0 default-anchor behavior, device deviations, Human exposure coverage, and Agent attempt/link/response hashes from the five raw CSVs. An unstarted slot is terminal only when its unclaimed token has one of four frozen dispositions (`declined-before-start`, `no-show-expired`, `withdrawn-before-start`, or `technical-cancel-before-start`) and the same server timestamp in `terminal_at` and `revoked_at`; this revokes the token but creates no session and never enters the started denominator. Every table carries one deployment ID and canonical deployment fingerprint. A server- or controlled-audit-service-signed v2 collection/export receipt binds collection closure, that deployment identity, one database snapshot, all five file hashes, and their ordered bundle hash. Closure follows the last authoritative database/server write, including allocation claim/terminal timestamps and Agent-attempt `created_at`; controller-supplied completion time is chronology-checked but cannot establish that an attempt was persisted before close. A separately signed external-evidence root binds ethics, consent, data management, English screening, withdrawal, the actual event-source archive, source/deployment bytes, controller/prompt/browser, and exactly one run artifact for every claimed R-PRIMARY allocation. A legitimate pre-start terminal Agent slot has no run artifact; an open unclaimed slot keeps the audit not evaluable. Deployment verification reads the archived JavaScript, CSS, font, worker, stimulus, prompt, source-manifest, and migration bytes, checks page/API route closure, and requires deployment creation to precede primary activity. Raw Agent validation uses closed runtime/action schemas, fully validates 1440×900 non-interlaced PNG screenshots, forbids cross-page screenshot/model-output reuse within a run, and closes each `m1-agent-model-output-v1` scientific payload over its session, step, model request, submitted-attempt hash, and exported response. The two HMAC trust roots must be at least 32 bytes and independently controlled; missing, equal, or invalid secrets cannot yield GO.

The operational confirmation is not the consent record. The authoritative consent version, timestamp, withdrawal status, and necessary contact details remain in a separate access-restricted recruitment ledger linked only by an opaque token hash.

Strict M1 does not persist raw User-Agent strings. The server transiently reduces the value to a coarse browser-major and operating-system summary; standard research CSVs and participant-local strict-M1 CSV/JSON exports exclude the raw string. Historical/development rows, hosting logs, and backups must still be audited and handled under the institution-approved data-management plan before recruitment.

## 7. Frozen retry and failure rules

- Maximum 180 server-wall-clock seconds per formal page, beginning when the unique exposure is created; acknowledgement network time and hidden-tab time count. Client timers are behavioral telemetry, not the timeout authority.
- Maximum 20 controller-reported actions per formal page, audited against the external action trace.
- At most two additional mechanical retries per action, without recalling the model.
- At most two identical API retries only before the model returns any output.
- Maximum 120 minutes per full Human session or Agent run.
- Exceeding a limit aborts the run.
- A failed side cannot be replaced within the original pair. The fixed 12-cell Stage-A cohort does not add replacement pairs. A restart is permitted only as a new, fully frozen cohort after `REVISE`; the original cohort remains separate and its invitation, started, and failure counts are retained.
- Frozen termination families distinguish participant exit/withdrawal, page/run timeout, server-clock failure, model/mechanical retry limit, controller/network/operator failure, and attempt-protocol violation. Every aborted R-PRIMARY Agent run remains in the Agent-abort numerator; codes are reported by cause, not selectively excluded.

## 8. Stage A decision rules

**NOT EVALUABLE:** collection is not formally closed by a valid signed receipt tied to one snapshot and the five exact exports, the export/evidence signatures or hashes are invalid, there are fewer or more than the 12 unique condition × schedule cells, or any of the 24 primary allocation slots has neither a real `complete`/`aborted` session nor a valid pre-start terminal disposition. An open unclaimed token is not terminal. A confirmed STOP event overrides this state and stops collection immediately.

**STOP:** any complete-session canonical/exposure/attempt/link/hash integrity below 100%, any confirmed response loss above zero, or any future-information leakage above zero.

**REVISE and rerun a new Stage A cohort:** fewer than 10/12 complete matched pairs; fewer than 5/6 complete matched pairs in either information condition; either actor has complete/started below 80%; aborted R-PRIMARY Agent runs/started exceeds 10%; either actor has median completion time above 45 minutes or empirical nearest-rank P95 above 75 minutes; started-session device/per-response protocol deviations exceed 10%; or either actor accepts both default G0 anchors without interaction in more than 50% of available G0 judgments. Equality at each threshold passes.

**GO PENDING EXTERNAL GATES:** quantitative STOP/REVISE checks pass, but any ethics/consent/data-plan/English-screening/withdrawal/raw-UA audit, executable controller, complete prompt package, model/API, browser, deployment/source manifest, signed evidence root, or raw run-artifact gate is missing. `proceedToStageB=false`.

**GO:** quantitative checks and every external release gate pass. This authorizes only a new Stage-B freeze; Stage B remains disabled in the current build.

## 9. Current readiness boundary

The repository now freezes the Human and Agent pages, pairing allocator, canonical state machine, server clocks, database audit chain, five-table exports, runner contract, cohort Agent-profile hash, deterministic Stage-A v3 audit/normalizer/evidence verifier, one hashed system-prompt component, and default-off collection gates. Formal collection requires primary and Human gates to be explicitly enabled, the development-pilot gate to remain disabled, and a frozen deployment ID/fingerprint; diagnostic quota launches require the opposite development flag and are excluded. Disabling the formal gates stops further strict-session writes, but the repository still does **not** include the executable screenshot-to-model-to-coordinate controller, complete runtime prompt package, restricted raw run artifacts, the production service that atomically and persistently closes collection and signs an export receipt from the same database snapshot, independently governed audit signing, or a real deployment archive. Those are external blockers for paired Agent Stage A. Institutional ethics approval or written exemption, approved full consent materials, the frozen English-screening instrument and screening records, restricted recruitment/withdrawal ledger, and verified treatment of historical raw User-Agent values are separate blockers for real-Human recruitment.

Accordingly, the current build is suitable only for synthetic or non-research developer validation and supervised Agent feasibility work excluded from Stage A. It is not ready for real-Human recruitment, paired Agent Stage A, Stage B collection, or confirmatory claims. The build ID is bound to a deterministic source manifest, but source identity is not deployment identity: a full Git object ID, deployment ID, and the actual JS/CSS bundle manifest must still be frozen and signed into the external evidence chain before data collection. HMAC is an implementable pilot trust root rather than a perfect institutional attestation; production should separate custody of the two keys, and a later confirmatory deployment should prefer KMS-backed or asymmetric signing and provider-issued execution receipts where available.

The normative Chinese method specification is `docs/M1_ISOMORPHIC_HUMAN_AGENT_METHOD_ZH.md`; the machine-readable Agent contract is `public/data/m1-agent-runner-protocol.json`.
