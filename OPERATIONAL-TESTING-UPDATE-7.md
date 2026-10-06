# Operational Testing Update 7

Update 7 changes Operational Testing from a research-style control panel into a guided incident-response workspace.

## User-facing workflow

1. Create and start an operational test.
2. Record incident occurrence. The system opens the incident form automatically.
3. Save the incident. The system returns to Operational Testing and calculates MTTD.
4. Review the actual alert context and acknowledge it. MTTA is calculated automatically.
5. Complete structured incident classification.
6. Search the Knowledge Base. Selecting an entry returns the Knowledge ID to the active test.
7. Apply the selected knowledge. Its response actions become the containment plan.
8. Track every containment action as Not started, In progress, Completed, or Not applicable and attach evidence.
9. Verify containment against explicit success checks. MTTC ends only after successful verification.
10. If knowledge is missing, partial, or unsuccessful, record a structured escalation.
11. Complete recovery and safe account restoration with action statuses and validation evidence.
12. Close the incident and calculate MTTR.
13. Capture lessons learned into the Knowledge Base.
14. Review the passive event timeline and optional operational assessment.
15. Download CSV/PDF evidence and finalize the operational test.

## UI changes

- Removed facilitator controls from Operational Testing.
- Removed visible framework branding while retaining the response sequence and measurement logic.
- Performance KPIs appear near the top of the workspace, before the timeline.
- Completed response stages collapse automatically.
- The current response stage, incident status, and overall progress are shown at the top.
- The timeline is passive audit evidence and no longer drives the workflow.
- Finalization is at the bottom under **Final operational review**.

## Phishing realism

The phishing scenario uses a KALRO example account (`carol@kalro.org`) and covers:

- suspicious sign-in and phishing-mail evidence;
- active-session revocation;
- account deactivation/locking;
- mailbox forwarding/delegation persistence;
- malicious indicator blocking;
- evidence preservation;
- campaign-recipient review;
- privilege/MFA/recovery-setting checks;
- potential data-access assessment;
- password and MFA recovery;
- safe account restoration;
- post-restoration monitoring.

## PDF report

`GET /api/operational-tests/:id/report.pdf` generates a formal operational-test report containing the incident summary, KPIs, classification, selected knowledge, containment evidence, recovery evidence, escalation details, assessment, lessons learned, and event timeline.
