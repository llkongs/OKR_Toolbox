# AGENTS.md — Feishu OKR Execution OS (Bitable MVP)

## 0. North Star
Build an OKR tracking system that does not “lose execution”:
- Turn quarterly OKRs into daily pullable actions (Action Bank -> Daily Pull).
- Require evidence for progress (Evidence-first).
- Detect drift early and trigger a small correction loop (Drift Detection + 1-click Playbook).
- Allow exploration but with budget and guardrails (Parking Lot + Exploration Budget).

This repo aims to deliver an MVP on Feishu/Lark Base (Bitable) via:
1) A Python initializer script (server OpenAPI) to create schema (tables/fields/views).
2) A Bitable plugin (Base extensions) for daily operations (MIT pull, guardrails, drift, correction).

Avoid over-optimizing. Prefer a working closed-loop MVP over fancy dashboards.

---

## 1. Product PRD (Condensed)

### 1.1 Problem
Users can write OKR docs (O/KR/owner/timeline), but execution drifts:
- Work becomes scattered (1 week off-track) without immediate feedback.
- Planning cannot reach hour-level; daily “what do I do now” is missing.
- Progress updates are status-talk without evidence.

### 1.2 Goals (Outcome)
- Every workday: user can pull 1–2 MITs that map to a KR.
- Weekly: KR has at least N evidence items; drift is visible.
- Drift rule triggers: user receives a “correction playbook” and can recover within the same day.

### 1.3 Principles
- Pull over push: from Action Bank, not calendar micromanagement.
- Evidence-first: progress must reference deliverables/links.
- Drift detection: measurable, triggerable, and actionable.
- Exploration with budget: allowed but bounded and recoverable.
- “No polishing”: stop “拉丝纹理” detail work unless it changes decisions.

---

## 2. MVP Scope (Hard Cut)

### Must-have features
1) OKR modeling (Objectives, KeyResults, owners, cycle, confidence).
2) Evidence system (Evidence records linked to KR).
3) Action Bank + Daily Pull (Actions linked to KR, “Today” selection).
4) Parking Lot (Ideas not linked to KR by default).
5) Drift detection (at least):
   - Days since last evidence per KR (or per “Top KR”).
   - Unaligned actions count/time (Actions without KR link).
6) Weekly ops (WeeklyPlan rows per KR: weekly deliverable + risk + budget).
7) Basic guardrails:
   - If a new task > 30 min and has no KR link -> must go to Parking Lot or be linked.

### Explicitly NOT in MVP
- Complex org alignment trees.
- Fully automatic sync with Git/Docs/BI.
- Hour-by-hour planning.
- Advanced analytics / fancy reporting.

---

## 3. Data Model (7 Tables)

### 3.1 Tables
- Objectives
- KeyResults
- Actions
- Evidence
- WeeklyPlan
- Ideas
- TimeLog

### 3.2 Key Fields (minimal, can extend later)

**Objectives**
- O_Title (text)
- Owner (text)
- Cycle (text)

**KeyResults**
- KR_Title (text)
- KR_Type (single select: Metric/Milestone/Deliverable)
- Target (text)
- Progress (number 0..1 or %)
- Confidence (single select: Green/Yellow/Red)
- Objective (link to Objectives, single)

**Actions**
- Action_Title (text)
- Status (single select: Backlog/Today/Doing/Done/Blocked)
- Est_Minutes (number)
- Due (datetime)
- KeyResult (link to KeyResults, single)
- Guardrail_Flag (checkbox or single select; optional)

**Evidence**
- Evidence_Title (text)
- Evidence_Type (single select: Doc/Dashboard/PR/SQL/Experiment/Note)
- Link (text)
- Date (datetime)
- KeyResult (link to KeyResults, single)
- Action (link to Actions, optional)

**WeeklyPlan**
- Week_Start (date)
- Deliverable (text)
- Risk (text)
- Time_Budget_Min (number; optional)
- KeyResult(s) (link to KeyResults, multiple)

**Ideas**
- Idea_Title (text)
- Est_Minutes (number)
- Status (single select: Parking/Approved/Doing/Dropped)
- KeyResult(s) (link to KeyResults, optional)
- Notes (text; optional)

**TimeLog**
- Start (datetime)
- Minutes (number)
- Note (text)
- Action (link to Actions, optional)
- KeyResult (lookup via Action or direct link; optional)

---

## 4. System Behaviors (MVP)

### 4.1 Daily Pull (MIT)
- User selects 1–2 MIT actions from Action Bank for today.
- Selected actions get Status=Today and optionally a FocusBlock entry (optional v1).

### 4.2 Evidence-first
- When marking an Action Done, prompt:
  - attach Evidence link OR provide “failure reason” (simple text).
- If no evidence for a KR for >= 2 days: drift warning.

### 4.3 Guardrails
- If user creates an Action with Est_Minutes > 30 and no KR link:
  - prompt to link KR OR move to Ideas(Parking) automatically (best effort in plugin).

### 4.4 Drift Detection
Minimum drift indicators:
- days_since_last_evidence per KR.
- unaligned_actions_count (Actions with KR empty).
- Optional: time_on_unaligned via TimeLog.

When drift triggers, show a 3-step correction playbook:
1) Choose one KR weekly deliverable.
2) Pull one 30-min next action.
3) Produce one evidence item (even a 1-page note).

---

## 5. Implementation Plan

### Phase 0: Schema initializer (Python, server OpenAPI)
Deliver a script: `scripts/init_base.py`:
- Inputs via env vars:
  - FEISHU_APP_ID
  - FEISHU_APP_SECRET
  - FEISHU_BASE_APP_TOKEN
- Behavior:
  - Create the 7 tables
  - Create minimal fields (as above)
  - Create initial views (optional v0; can be v1)
  - Print created table_id/field_id mapping to stdout and save to `generated/base_schema.json`

Notes:
- Use Feishu/Lark Bitable server APIs (create table, create field, create records).
- No secrets in repo. Never commit app_secret.
- Keep idempotent where possible (re-run without duplicating too much; at least detect “table already exists by name” and skip).

### Phase 1: Plugin (Bitable Base extension)
Deliver a plugin UI with:
- Home: Top KRs + drift status + “Start correction”
- Today: MIT list + buttons (Mark Done, Add Evidence)
- Action Bank: quick filter + “Pull to Today”
- Parking Lot: capture idea quickly
- Drift: indicators + 1-click correction playbook

Implementation guidance:
- Prefer simple deterministic logic over “AI”.
- Don’t build a complex state manager; keep it CRUD and view-driven.

### Phase 2 (Optional): Views + Automation
- Create standard views:
  - Today (Actions where Status=Today)
  - Drift (KRs where days_since_last_evidence >= 2, or confidence=Red)
  - Weekly (WeeklyPlan for current week)
- Optional scheduled notifications (if feasible): daily drift reminder.

---

## 6. Engineering Guidelines

### 6.1 Quality bar
- Keep changes small and reversible.
- Do not refactor unrelated files.
- Handle API errors and rate limits gracefully (retry with backoff when safe).

### 6.2 Security
- Never log tokens/secrets.
- Use env vars for credentials.
- If adding config files, default them to sample templates (e.g., `.env.example`).

### 6.3 Repository layout (suggested)
- scripts/
  - init_base.py
- src/ (plugin)
- docs/
  - PRD.md (optional longer)
  - schema.md (optional)
- generated/
  - base_schema.json (gitignored unless asked)

---

## 7. Commands (fill in for this repo)
- Install deps:
  - Python: `pip install -r requirements.txt`
  - Plugin: `npm install`
- Dev:
  - Plugin dev: `npm run dev` (or repo-specific)
- Build:
  - `npm run build`
- Lint:
  - `npm run lint`
- Test:
  - (If none, say so explicitly. Add minimal smoke checks for scripts.)

---

## 8. Review Guidelines
- Prioritize MVP loop: OKR -> Action -> Evidence -> Drift -> Correction.
- Avoid “polish” features until drift loop works.
- When unsure, implement the simplest mechanism with explicit user control.
