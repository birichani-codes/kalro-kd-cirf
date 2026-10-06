# KD-CIRF Operational Testing Module

The application now includes an Operational Testing workflow for tabletop exercises and operational validation.

## What is captured automatically

When an incident is linked to an active operational test, the system records timestamped milestones and derives:

- MTTD: incident/event start to detection
- MTTA: alert creation to acknowledgement
- MTTC: detection to confirmed containment
- MTTR: detection to incident closure
- Knowledge Retrieval Time: knowledge search start to relevant knowledge access
- Escalation Time: detection to escalation
- Collaboration Time: detection to incident briefing/collaboration start
- Recovery Time: detection to confirmed recovery
- Knowledge Capture Time: closure to creation/update of institutional knowledge
- Knowledge/recommendation use counts and reuse success indicators

## Workflow

1. Open **Operational Testing** from the main navigation.
2. Create a tabletop session for a participant and scenario.
3. Start the exercise. This records `EXERCISE_STARTED` for administrative timing only.
4. At the exact moment the simulated malicious activity begins, click **Inject incident now**. This records `INCIDENT_OCCURRED` (T0).
5. Log a new incident and select the active Operational Test, or link an existing incident from the testing page.
6. Work the incident normally.
   - Creating/linking an incident records detection and alert creation.
   - Moving an incident to Investigating records acknowledgement.
   - Escalating records escalation.
   - Starting an incident briefing records collaboration start.
   - Finding relevant knowledge records access; marking it as used records application.
   - Applying a defensive routine records recommendation acceptance/use.
   - Resolving records recovery.
   - Closing records incident closure.
7. Use the incident test banner or testing page for milestones that must be explicitly confirmed, especially containment start and containment confirmation.
8. Enter observer-only measures such as decision accuracy, role adherence, facilitator interventions and critical omissions.
9. Finish the exercise and export the result as CSV.

## Data files used by the prototype

- `server/data/operational_tests.json`
- `server/data/incident_events.json`

These follow the current JSON persistence design. They can later be migrated to PostgreSQL without changing the KPI definitions.

## KPI formulas

- `MTTD = DETECTED - INCIDENT_OCCURRED`
- `MTTA = ALERT_ACKNOWLEDGED - ALERT_CREATED`
- `MTTC = CONTAINMENT_CONFIRMED - DETECTED`
- `MTTR = INCIDENT_CLOSED - DETECTED`
- `Knowledge Retrieval = KNOWLEDGE_ACCESSED - KNOWLEDGE_SEARCH_STARTED`

The backend calculates durations from server-side ISO timestamps. Core milestone events are de-duplicated to reduce accidental double-click distortion.

## Install and run

The submitted archive intentionally should not rely on packaged `node_modules`. Install dependencies from each lockfile:

```bash
cd server
npm ci
npm start
```

In another terminal:

```bash
cd client
npm ci
npm run dev
```

The frontend production build is:

```bash
npm run build
```

## KPI timing update: explicit incident injection

Starting a tabletop exercise no longer starts MTTD. The exercise start is recorded as `EXERCISE_STARTED` for administrative timing only. At the exact moment the facilitator injects the simulated malicious activity, click **Inject incident now**. This records `INCIDENT_OCCURRED` (T0). Detection is recorded separately when the linked incident is created or detected.

- MTTD = `DETECTED - INCIDENT_OCCURRED`
- If `INCIDENT_OCCURRED` has not been recorded, MTTD remains blank rather than using exercise setup time.

## Knowledge evidence model

Knowledge is now tracked in separate stages so retrieval is not incorrectly counted as use:

1. `KNOWLEDGE_SEARCH_STARTED` – analyst starts looking for relevant knowledge.
2. `KNOWLEDGE_ACCESSED` – a relevant knowledge item is found/opened.
3. `KNOWLEDGE_APPLIED` – the analyst actually uses the knowledge in the response.
4. `KNOWLEDGE_REUSE_SUCCESS` – the reused knowledge is confirmed to have contributed successfully.

The system reports:

- Knowledge Retrieval Time = `KNOWLEDGE_ACCESSED - KNOWLEDGE_SEARCH_STARTED`
- Knowledge Utilization Rate = applied knowledge / accessed knowledge × 100
- Knowledge Reuse Success Rate = successful reused knowledge / applied knowledge × 100
- Recommendation Acceptance Rate = accepted defensive routines / routines recommended × 100

When a defensive routine is applied with a successful outcome, the system records both acceptance and successful knowledge reuse automatically. Manual milestone controls remain available for tabletop-only events that cannot be inferred from the normal application workflow.


## Structured containment and recovery (Update 3)

Containment is no longer a timestamp-only button. The operational test now stores the planned actions, the actions actually completed, verification/evidence, the analyst, timestamps and an outcome (`successful`, `partial`, or `failed`).

- `CONTAINMENT_STARTED` is written when the containment plan begins.
- Partial and failed attempts are retained in the event timeline.
- `CONTAINMENT_CONFIRMED` is written only when the outcome is **successful**.
- Therefore MTTC is not artificially shortened by an unsuccessful containment attempt.

Recovery is also evidence-based. The analyst selects restoration actions, records validation evidence, and sets the result. Successful recovery writes `RECOVERY_CONFIRMED`; partial/failed attempts are retained separately.

## Final lesson capture

The **Capture Lesson to Knowledge Base** section creates a real institutional knowledge entry rather than only a milestone. It records:

- what happened;
- what worked;
- what failed or remained a gap;
- the knowledge/defensive routine used;
- containment and recovery actions/outcomes;
- what should change next time;
- a reusable procedure;
- tags, confidence and visibility.

The new knowledge entry is linked to both the incident and operational test. `KNOWLEDGE_CREATED` is recorded only after the entry has actually been saved. For the final lesson, resolve or close the linked incident first.

## Development stream stability

`server/nodemon.json` watches source code but ignores JSON data writes. This prevents normal incident/test updates from continuously restarting the backend during `npm run dev`. The duplicate incident SSE `/stream` route has also been removed.

## Defensive Routine Integration (Update 4)
Operational tests can now measure defensive-routine recommendation, acceptance, structured execution, evidence collection and successful reuse separately. Routine success is recorded only after the structured procedure is completed successfully; merely opening or starting a routine does not count as successful knowledge reuse.

## Update 5 additions

The operational-testing module now also supports a reusable scenario library, timed facilitator injects, structured incident classification, KPI diagnostics, baseline-vs-KD-CIRF test modes, descriptive paired comparison, trend analytics, automated draft PIR generation, and operational data-quality checks. See `OPERATIONAL-TESTING-UPDATE-5.md` for the detailed workflow.

## Update 8: Multi-Knowledge Response and Adaptive Escalation

Operational incidents can now use several related institutional knowledge entries. Analysts build and confirm a knowledge response set, the system combines the selected procedures into one containment/recovery plan, and utilization/reuse outcomes remain traceable to each Knowledge ID.

If the knowledge-guided response does not fully contain the incident, the workflow supports three realistic next actions: add more knowledge, collaborate with another responder while retaining ownership, or escalate the incident when severity, scope, authority, or available knowledge is insufficient. Partial and failed containment attempts remain in the incident record and can be followed by revised attempts.

At closure, lessons learned are saved as draft institutional knowledge. Responders can create a new draft lesson or propose a draft update to an existing knowledge entry. Drafts remain unavailable for operational selection until they are validated and published.

## Update 9: Station-Based Operations and Live Collaboration

New operational work no longer uses a typed `Site A` value. Incidents, operational tests, and user administration use the shared KALRO station directory (Headquarters, Muguga, Kiboko, Mtwapa, and Kabati). Phishing incidents can select an affected application user, capture the detection source and impacted service, and automatically align the incident with that user's station.

When a knowledge-guided response is not enough, Collaboration and Escalation now select real response-team users. A real Google Meet room can be opened from the workflow, attached to the incident, rejoined later, and included in the PDF/CSV evidence. Selected responders receive in-app notifications, making the additional-response stage operational rather than text-only. See `OPERATIONAL-TESTING-UPDATE-9.md`.
