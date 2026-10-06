# Operational Testing Update 9

Update 9 makes the incident workflow more practical at station level and turns escalation/collaboration into a real team action rather than a text-only record.

## Central station directory
The application now uses one authenticated station directory instead of free-text station names. Active locations are:

- KALRO Headquarters
- KALRO Muguga
- KALRO Kiboko
- KALRO Mtwapa
- KALRO Kabati

Incident creation, operational-test creation, user administration, and incident filtering use the same station values. New incidents and operational tests are rejected by the backend if the station is not in the active station directory.

## Practical incident creation
For phishing/account incidents the incident form now supports:

- station/site selection;
- affected KALRO account selection from real application users;
- automatic station alignment with the selected account;
- suspicious source IP;
- phishing sender, subject, and URL;
- detection source (identity monitoring, email gateway, user report, SIEM, endpoint, or network monitoring);
- impacted service.

The guided operational-test flow remains intact: Inject Incident opens this form already linked to the active operational test and returns to Operational Testing when the incident is saved.

## Response-team directory
The seeded prototype now includes responders across Headquarters, Muguga, Kiboko, Mtwapa, and Kabati so collaboration can be tested across stations. Existing user accounts are also assigned to valid stations when their station is missing.

## Google Meet collaboration
When knowledge is insufficient or containment is partial/failed, responders can now select actual application users and start a collaboration session.

The collaboration panel supports:

- response function/team;
- one or more selected response-team members;
- reason and assistance required;
- response summary shared with the team;
- meeting agenda;
- Google Meet link.

`Open Google Meet` opens `https://meet.google.com/new` in a new browser tab. The generated Meet URL is pasted back into the incident response workspace and stored with the collaboration record. A Join/Rejoin button remains available from the operational test.

Selected collaborators receive in-app notifications linked to the incident.

## Escalation with live coordination
Escalation remains separate from collaboration. It changes the incident to escalated status and records:

- escalation target;
- priority;
- reason;
- unresolved risk / situation summary;
- specialist assistance required;
- selected escalation-team members;
- Google Meet URL and agenda.

The escalation team receives in-app notifications. The Google Meet room is preserved with the incident-response evidence and included in exports.

## Reporting
The operational PDF and CSV now include collaboration/escalation team members and Google Meet coordination details in addition to the existing KPI, knowledge, containment, recovery, timeline, and lesson evidence.

## Backward compatibility
Historical `Site A` data remains readable, but new UI workflows no longer offer `Site A`. New operational tests and incidents use the station directory. No new npm package is required for Update 9.
