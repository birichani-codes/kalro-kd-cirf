# Operational Testing Update 3

This update makes the tabletop workflow evidence-based rather than timestamp-only.

## New structured containment workflow
- Select planned containment actions before containment begins.
- `CONTAINMENT_STARTED` is recorded when the plan starts.
- Confirm completed actions, evidence and outcome as Successful, Partial or Failed.
- **MTTC only ends on `CONTAINMENT_CONFIRMED` (Successful).** Partial/failed attempts remain in the event timeline but do not falsely improve MTTC.

## Recovery confirmation
- Recovery requires selected restoration actions, evidence/validation and an outcome.
- Successful recovery records `RECOVERY_CONFIRMED`; partial/failed attempts are retained separately.

## Capture Lesson is now real knowledge capture
- The Operational Testing page includes a lesson form for what happened, what worked, gaps, changes for next time, reusable procedure, confidence, tags and visibility.
- Saving creates a real Knowledge Base record linked to both the incident and operational test.
- `KNOWLEDGE_CREATED` is recorded only after the Knowledge Base entry is successfully saved.
- Containment and recovery evidence are included in the saved lesson automatically.

## Knowledge KPI separation
- Finding relevant knowledge records `KNOWLEDGE_ACCESSED`.
- Explicitly marking an item as used records `KNOWLEDGE_APPLIED`.
- Successful reuse is recorded separately, preventing retrieval from being counted as utilization.

## Development stream stability
- Added `server/nodemon.json` so JSON data writes do not restart the backend during `npm run dev`.
- Removed the duplicate `/api/incidents/stream` route.

## Recommended exercise flow
1. Create session
2. Start exercise
3. Inject incident now (T0)
4. Create/link incident (Detection)
5. Acknowledge and classify
6. Search and retrieve knowledge
7. Apply knowledge / defensive routine
8. Escalate/collaborate where appropriate
9. Start structured containment
10. Confirm containment with evidence
11. Confirm recovery with evidence
12. Close incident
13. Capture lesson to Knowledge Base
14. Complete observer assessment
15. Finish exercise and export CSV
