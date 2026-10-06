# Operational Testing Update 8

Update 8 extends the incident-response workflow with multi-source institutional knowledge, conditional collaboration/escalation, repeatable containment attempts, and governed lesson capture.

## Multi-knowledge response set
- Analysts can add multiple active Knowledge Base entries to one operational incident.
- The Knowledge Base stays in guided selection mode so related entries can be added before returning.
- Selected entries can be removed until they have been applied.
- The response set must be explicitly confirmed before use.
- The system merges containment, recovery, verification, success, and escalation guidance from all selected entries while removing duplicate actions.
- The first relevant knowledge selection still drives Knowledge Retrieval Time; the response-set confirmation is stored separately.

## Knowledge-driven containment
- Applying the confirmed response set records each knowledge item separately.
- The combined response plan becomes the containment/recovery plan.
- Knowledge utilization and reuse-success metrics remain item-level, even when several entries support one incident.
- If more knowledge is added after an incomplete attempt, the set must be confirmed and newly selected knowledge applied before the next attempt.

## Collaboration and escalation
- Collaboration and escalation are separate actions.
- Collaboration keeps incident ownership with the current analyst and records the assisting role/team, reason, requested assistance, and shared response summary.
- Escalation records the escalation target, reason, priority, and specialist support required.
- These options become prominent when no suitable knowledge is available or containment is partial/failed.

## Repeatable containment
- Partial and failed containment attempts are preserved in `containment.attempts`.
- A revised response can be attempted after additional knowledge, collaboration, or escalation.
- MTTC still closes only on the first successful `CONTAINMENT_CONFIRMED` event.

## Lessons learned become governed knowledge
- Lessons are now stored in the Knowledge Base as **draft** entries rather than immediately becoming active guidance.
- The responder can review each knowledge item used and mark it effective, partial, ineffective, or requiring an update.
- A lesson can create a new draft knowledge entry or create a proposed draft version of an existing knowledge entry.
- Multiple lessons or proposed updates can be captured from one incident.
- Draft entries are visible in the Knowledge Base but cannot be selected for operational response until published/validated.
- Super administrators can publish a validated draft from the Knowledge Detail screen.

## Reporting
- CSV export includes all selected Knowledge IDs, selection duration, collaboration count, and multi-knowledge outcome information.
- PDF reports list all selected knowledge entries, collaboration activity, and all captured lessons/proposed updates.

## Backward compatibility
Existing Update 7 operational tests remain readable. Legacy `selected_knowledge_id`, `knowledge_selection`, and `knowledge_application` fields are still honored while new tests use the multi-knowledge fields.
