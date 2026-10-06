# Operational Testing Update 2

This update corrects MTTD timing and separates knowledge retrieval from knowledge use.

## New tabletop flow

1. Start exercise -> records EXERCISE_STARTED only.
2. Click **Inject incident now** at the exact moment the simulated attack/event begins -> records INCIDENT_OCCURRED (T0).
3. Create or link the incident -> records DETECTED and ALERT_CREATED.
4. Continue acknowledgement, classification, knowledge search, containment, recovery and closure.

MTTD is now calculated as:

`DETECTED - INCIDENT_OCCURRED`

If no incident injection timestamp exists, MTTD stays blank rather than using exercise setup time.

## Knowledge evidence stages

- KNOWLEDGE_SEARCH_STARTED
- KNOWLEDGE_ACCESSED
- KNOWLEDGE_APPLIED
- KNOWLEDGE_REUSE_SUCCESS

The dashboard now reports knowledge utilization, recommendation acceptance and reuse success separately.

## Defensive routine outcomes

Recommended routines now support three outcomes:

- Applied - successful
- Applied - unsuccessful
- Reject recommendation

Only the first two count as accepted/applied routines. A rejected recommendation does not inflate the recommendation acceptance rate.
