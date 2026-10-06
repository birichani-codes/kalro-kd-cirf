# KD-CIRF Operational Testing Update 6

## Purpose
Update 6 makes Operational Testing the primary guided workflow for tabletop exercises while preserving the project's NIST alignment and the Defensive Routine capabilities introduced previously.

## NIST alignment
The guided workflow is displayed against the NIST incident-response functions used by the project:

- **DE — Detect / Analyze:** incident occurrence, detection, alert acknowledgement, structured classification.
- **RS — Respond:** institutional knowledge search, knowledge application, containment and conditional escalation.
- **RC — Recover:** validated account/system restoration and monitoring.
- **Post-Incident Activity:** incident closure, lesson capture, PIR and institutional learning.

## Guided phishing workflow
1. Start the operational test.
2. Click **Inject incident and open incident form**.
3. `INCIDENT_OCCURRED` is timestamped and the app opens the Incident form automatically.
4. The incident form is pre-filled from the selected scenario and linked to the test.
5. Saving the incident records detection/alert timestamps and returns automatically to Operational Testing.
6. MTTD is displayed.
7. Review a realistic alert and phishing-email context, then acknowledge the alert.
8. Complete structured incident classification.
9. Click **Start knowledge search**; the app records the search start and opens the Knowledge Base automatically.
10. Review a Knowledge Base entry and choose **Select as relevant**. Its Knowledge ID is linked to the test and the app returns automatically.
11. Operational Testing shows the selected Knowledge ID/title and the response plan from that entry.
12. **Apply knowledge** imports the Knowledge Base containment actions and begins containment.
13. Record whether the solution was successful, partial, or unsuccessful.
14. If successful, escalation is not required; proceed to recovery.
15. If no relevant knowledge was found, or the knowledge solution was partial/unsuccessful, escalation becomes the next workflow step.
16. An escalated response can perform revised containment without overwriting the original knowledge-reuse outcome.
17. After successful containment, complete the recovery plan (password reset, MFA validation, session/persistence checks, safe access restoration, monitoring).
18. Close the incident to complete MTTR.
19. Capture the lesson into the Knowledge Base and finish the exercise.

## User-experience changes
- Completed workflow sections collapse automatically and remain expandable.
- The operational test remains the main controller of the exercise.
- Manual navigation between Operational Testing, Incidents and Knowledge Base is minimized.
- KPI cards remain available with diagnostics explaining missing measurements.
- The exercise cannot be finished from the main button until the linked incident is closed and a lesson is captured.

## Realistic phishing scenario data
The phishing scenario now uses the project's existing example KALRO user account:

- **Affected user:** Carol Njoroge
- **Account:** `carol@kalro.org`
- **Suspicious source IP:** `203.0.113.24` (documentation/test address)
- **Phishing sender:** `security-update@kalro-helpdesk.example`
- **Subject:** `Action Required: Verify Your KALRO Mailbox`
- **Suspicious URL:** `https://kalro-verify.example/login`

The `.example` domain is intentionally used for safe simulation.

## New phishing knowledge entry
`k_phish_account — Phishing-Induced KALRO Account Compromise Response`

The entry contains structured:
- containment actions,
- recovery actions,
- success criteria,
- escalation conditions,
- NIST mapping.

This structured response is what the Operational Testing workflow imports when the analyst clicks **Apply knowledge**.

## KPI behavior
- MTTD: incident occurrence → detection
- MTTA: alert creation → acknowledgement
- Classification time: detection → classification
- Knowledge retrieval time: search start → selected relevant knowledge
- Knowledge search duration: search start → selection or explicit no-match result
- MTTC: detection → successful containment
- MTTR: detection → incident closure
- Knowledge utilization: applied ÷ accessed knowledge
- Knowledge reuse success: successful knowledge-guided responses ÷ applied knowledge

A failed/partial knowledge-guided response is preserved as a failed/partial reuse result even if an escalated response later contains the incident successfully.
