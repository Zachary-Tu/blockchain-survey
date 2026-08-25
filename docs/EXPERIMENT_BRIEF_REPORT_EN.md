# Boundary Lab M1 — Brief Experimental Report

**Report date:** 25 August 2026  
**Published site version:** 23  
**Production URL:** <https://boundary-lab-context-elasticity.zactt.chatgpt.site/m1>  
**Production source commit:** `56af018a10af49a60f1b3edbf0a069734bd70c83`

## 1. Experimental purpose

Boundary Lab M1 measures how human and multimodal LLM/Agent judgments of time-series stages change as semantic and contextual information is progressively disclosed.

Each tester divides six cryptocurrency price series into three stages by placing two change-point centers and assigning a continuous uncertainty interval to each change point. The assets are BTC, ETH, SOL, BNB, XRP, and DOGE.

The seven disclosure levels are:

1. **G0 — Unlabelled curve**
2. **GI1 — Series type**
3. **GI2 — Time axis and measurement unit**
4. **DI1 — Cryptocurrency identity**
5. **DI2 — Cryptocurrency description and background**
6. **DI3 — High-priority historical events**
7. **DI4 — Lower-priority supplementary events**

Within each disclosure level, the six assets are presented on six consecutive single-asset pages. A complete M1 session therefore produces:

```text
6 assets × 7 disclosure levels = 42 responses
```

## 2. What the experiment can measure

The experiment supports measurement of:

- **Context elasticity:** how far judgments move when new information is disclosed.
- **Revision direction:** whether a change point moves earlier or later on the normalized timeline.
- **Incremental revision:** change relative to the immediately preceding disclosure level.
- **Cumulative revision:** change relative to the unlabelled baseline.
- **Event sensitivity:** separate effects of high-priority and supplementary historical events.
- **Human–Agent differences:** differences in boundary location, movement, uncertainty, and disclosure sensitivity.
- **Within-group consistency:** agreement among human testers and among independent Agent runs.
- **Uncertainty behavior:** agreement about how precisely a stage boundary can be located.
- **Uncertainty calibration:** whether wider intervals predict greater distance from group consensus.
- **Response dynamics:** reading time, first-action latency, adjustment frequency, visible answering time, and time spent away from the page.
- **Device effects:** possible differences across mobile, tablet, and desktop environments or viewport sizes.

The modular research console additionally supports T1/T2/T3 task framing, price/active-address/Google Trends series, daily/weekly/monthly/yearly resolution, linear/logarithmic scales, whole/truncated windows, and stock/white-noise/synthetic controls.

## 3. Data collected

### 3.1 Session-level data

One row per tester session is stored in `experiment_sessions`, including:

- anonymous participant code and expertise category;
- human or Agent actor type;
- Agent model and independent run ID where applicable;
- experimental arm, protocol version, randomized asset order, and study configuration;
- start time, completion time, and active/complete status;
- inferred device type, screen dimensions, initial viewport dimensions, and device pixel ratio;
- platform, browser language, time zone, pointer type, touch-point count, orientation, and User Agent.

The experiment does not intentionally collect real names, contacts, hardware serial numbers, camera or microphone data, or precise geographical location.

### 3.2 Response-level data

One row per asset and disclosure level is stored in `modular_responses`, including:

- asset, metric, resolution, scale, data window, and disclosure state;
- current and previous change-point centers;
- boundary ratios, observation indices, and dates;
- symmetric uncertainty half-widths, full widths, and lower/upper bounds;
- new-information influence rating and explicit unchanged-answer confirmation;
- displayed event IDs and priority information;
- boundary and uncertainty adjustment counts;
- client and server submission timestamps;
- viewport size and orientation at submission.

### 3.3 Response-time data

Each response separately records:

- `elapsed_ms`: total time from page entry to submission;
- `page_hidden_ms`: time spent with the page hidden or in the background;
- `active_elapsed_ms`: visible answering time;
- `reveal_read_ms`: time before the first boundary or uncertainty interaction;
- `first_move_ms`: latency to the first boundary movement;
- `first_uncertainty_ms`: latency to the first uncertainty adjustment;
- `adjustment_count` and `uncertainty_adjustment_count`.

For response-quality analysis, `active_elapsed_ms` should normally be preferred over total elapsed time.

## 4. Data integrity and export

Every answer is written to the Cloudflare D1 database immediately after submission. Submitted answers therefore remain available if a participant later exits the study.

The database enforces the unique key:

```text
session_id + trial_id + disclosure_index
```

This prevents duplicate records caused by refreshes or network retries. A session can only be marked complete after all 42 expected M1 responses have been stored.

The researcher page at <https://boundary-lab-context-elasticity.zactt.chatgpt.site/research/results> provides two Excel-compatible CSV exports:

1. **Participant/device table:** one row per session, including incomplete sessions.
2. **Trial-response table:** one row per asset and disclosure level.

Aggregate export requires an authenticated researcher email included in the protected `RESEARCHER_EMAILS` hosting variable.

## 5. Requirement assessment

All current M1 requirements for experimental presentation, normalized change points, symmetric uncertainty intervals, response timing, device metadata, immediate database persistence, completion checks, and tabular export are satisfied.

The broader Research Roadmap still contains post-collection tasks that are not part of the current website release:

- Hartigan’s dip test and PCA projection;
- mixed-effects variance decomposition;
- Spearman uncertainty–consensus analysis;
- human-equivalence percentiles;
- Kolmogorov–Smirnov testing and tester-blocked bootstrap;
- formal revision and convergence analyses;
- integration of the algorithm-generated boundary evaluation task;
- a fully minimal Agent M1 path without the additional post-boundary annotation stage.

These remaining items concern the statistical analysis pipeline and future experimental modules. They do not prevent the current M1 system from collecting the required raw research data.

## 6. Validation and release status

- Production build: passed
- Lint: passed with no errors
- Website/API tests: 19/19 passed
- Supporting module tests: 19/19 passed
- Complete 42-response database lifecycle: passed
- Session/device and response-table exports: passed
- Sites version 23 production deployment: succeeded
- Production release tag: `site-v23`

