# KD-CIRF Operational Testing Update 5

Update 5 completes the operational-testing improvements identified during the first tabletop runs while preserving the Defensive Routines Update 4.

## Added

### 1. Scenario library
Operational Testing now includes reusable scenarios for:
- Unauthorized USB and malware activity
- Phishing and compromised account
- Ransomware-like activity
- Suspected insider data exfiltration
- Brute-force / suspicious authentication

Each scenario includes an expected classification and ordered facilitator injects.

### 2. Facilitator inject console
Injects can be released one at a time during an active exercise. A released inject is timestamped as `FACILITATOR_INJECT_RELEASED` and preserved in the operational-test event timeline.

### 3. Structured incident classification
The previous one-click classification milestone has been replaced by a structured classification workflow containing:
- Category
- Severity
- Confidence
- Affected asset
- Initial impact
- Suspected cause
- Notes

Confirming classification updates the linked incident and records `INCIDENT_CLASSIFIED` for the classification-time KPI.

### 4. KPI diagnostics
The KPI engine now explains why a value is blank or still running. Examples:
- MTTD: missing `INCIDENT_OCCURRED`
- MTTC: waiting for successful `CONTAINMENT_CONFIRMED`
- MTTR: waiting for `INCIDENT_CLOSED`
- Knowledge retrieval: waiting for `KNOWLEDGE_ACCESSED`

### 5. Baseline vs KD-CIRF comparison
Sessions can be created as:
- `baseline` — response without knowledge/routine support
- `kd_cirf` — KD-CIRF-assisted response

A comparison group links equivalent runs. Completed tests are summarized descriptively using mean values and directional percentage change.

### 6. Expanded statistics and trends
Aggregate KPI summaries now include:
- Mean
- Median
- Minimum
- Maximum
- Population standard deviation
- Count

The Operational Testing page shows a completed-test trend table for MTTD, MTTC, MTTR, knowledge utilization and facilitator interventions.

### 7. Automated draft Post-Incident Review
Operational Testing can generate a draft PIR from:
- Event timeline
- Classification
- KPI snapshot
- Containment evidence
- Recovery evidence
- Observer assessment
- Captured lesson

The PIR remains editable in the existing Post-Incident Review page.

### 8. Operational data-quality checks
Each test now shows completeness checks for:
- Incident injection
- Detection / incident linkage
- Structured classification
- Successful containment evidence
- Successful recovery evidence
- Observer assessment
- Captured lesson

The completion percentage is also exported in CSV.

### 9. Improved CSV export
Exports now include:
- Test mode and comparison group
- Structured classification
- Classification time
- Data-quality percentage
- Existing KPI, containment, recovery, knowledge and observer results

## Research workflow

For a paired tabletop evaluation:

1. Create a baseline session using a scenario-library entry.
2. Run the response without Knowledge Base or Defensive Routine assistance.
3. Complete the test and preserve the results.
4. Create a KD-CIRF-assisted session using the same scenario and comparison group.
5. Run the response with normal KD-CIRF knowledge and routine support.
6. Complete the session.
7. Review the descriptive baseline-vs-KD-CIRF comparison and trend analytics.

Update 5 does not treat the descriptive comparison as proof of causality. Statistical inference should be performed separately when an adequate study design and sample size are available.
