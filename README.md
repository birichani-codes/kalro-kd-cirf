# KALRO KD-CIRF

**Knowledge-Driven Cybersecurity Incident Response Framework for KALRO**

KALRO KD-CIRF is a knowledge-driven cybersecurity incident response prototype designed to support practical incident handling, operational testing, institutional knowledge reuse, defensive routines, collaboration, containment, recovery, performance measurement, and lessons learned across KALRO stations.

## Project Overview

The framework combines incident response with institutional knowledge management so that previous cybersecurity experience can be captured, reused, evaluated, and improved over time.

The system supports a practical response workflow:

**Detection → Acknowledgement → Classification → Knowledge Search → Knowledge Application → Containment → Collaboration/Escalation → Recovery → Closure → Lessons Learned**

Operational performance is measured automatically as users work through the incident.

## Core Features

### Incident Management
- Create, classify, assign, update, and close cybersecurity incidents
- Structured incident classification
- Severity, confidence, affected asset/account, impact, and suspected cause
- Station-based incident assignment
- Event timeline and audit trail
- Incident status and response progress tracking

### Operational Testing
- Guided tabletop and operational testing workflow
- Automatic incident linking
- Real-time event timestamping
- Automatic KPI calculation
- Collapsible completed workflow stages
- Passive response timeline
- Final operational review
- CSV export
- PDF operational test report

### Response KPIs
The system automatically calculates:

- **MTTD** — Mean Time to Detect
- **MTTA** — Mean Time to Acknowledge
- **Classification Time**
- **Knowledge Retrieval Time**
- **Knowledge Selection Time**
- **MTTC** — Mean Time to Contain
- **MTTR** — Mean Time to Resolve
- Escalation time
- Collaboration time
- Knowledge capture time
- Knowledge utilization rate
- Knowledge reuse success rate
- Recommendation acceptance rate

### Institutional Knowledge Base
- Search and reuse previous incident knowledge
- Select multiple knowledge records for one incident
- Add additional knowledge before confirmation
- Combine actions from multiple knowledge items
- Track which knowledge contributed to which response action
- Apply selected knowledge to containment
- Record knowledge effectiveness
- Create new draft knowledge from lessons learned
- Propose updates to existing knowledge
- Knowledge lifecycle and review workflow

### Defensive Routines
- Reusable response procedures
- Trigger conditions
- Applicable incident types and severity levels
- Required responder roles
- Step-by-step execution
- Evidence requirements
- Expected outcomes
- Failure conditions
- Escalation conditions
- Rollback guidance
- Routine versioning
- Review dates
- Success and completion metrics
- Automatic routine recommendations

### Containment and Recovery
Containment is treated as a structured operational process rather than a single status change.

For phishing and compromised-account scenarios, actions may include:

- Revoke active sessions and tokens
- Disable or lock compromised accounts
- Remove malicious forwarding rules and mailbox delegates
- Block malicious indicators
- Preserve authentication and mailbox logs
- Review MFA and recovery information
- Assess potential data exposure
- Check whether other users received the same phishing message

Recovery may include:

- Verified password reset
- MFA re-registration
- Recovery-information validation
- Authentication-log review
- Mailbox validation
- Safe restoration of access
- User notification
- Continued monitoring

MTTC is only completed after successful containment is confirmed.

### Collaboration and Escalation
Collaboration and escalation are treated separately.

**Collaboration** allows the current responder to retain incident ownership while requesting assistance from other users or stations.

**Escalation** is used when the incident exceeds the current response capability, authority, severity threshold, or available institutional knowledge.

The system supports:

- Selecting one or more collaborating users
- Same-station and cross-station collaboration
- Reason for collaboration
- Assistance required
- Information shared
- Escalation target
- Priority
- Escalation reason
- Specialist assistance required
- Google Meet collaboration link
- In-app notifications

### Lessons Learned
At the end of an incident, lessons learned can be converted into reusable institutional knowledge.

The system can record:

- What worked
- What did not work
- Knowledge that was effective
- Knowledge that was incomplete
- Missing response actions
- Recommended changes
- New knowledge discovered

Lessons may result in:

- New draft knowledge
- Updates to existing knowledge
- No knowledge update required

## Supported Stations

New incidents and operational tests use a controlled station list:

- Headquarters
- Muguga
- Kiboko
- Mtwapa
- Kabati

Legacy records using older station values remain readable.

## Example Operational Scenario

A phishing email results in a suspicious login to a KALRO account.

The responder:

1. Reviews and acknowledges the security alert.
2. Classifies the incident.
3. Searches the Knowledge Base.
4. Selects one or more relevant knowledge records.
5. Confirms the selected knowledge set.
6. Applies the combined response plan.
7. Attempts containment.
8. Adds more knowledge, collaborates, or escalates if required.
9. Confirms containment.
10. Completes recovery.
11. Closes the incident.
12. Captures lessons learned.
13. Creates or updates institutional knowledge.
14. Generates the operational test report.

## Technology Stack

### Frontend
- React
- Vite
- JavaScript
- CSS

### Backend
- Node.js
- Express.js
- JWT authentication
- JSON-based prototype persistence

### Planned Production Improvements
The current application is a research/prototype implementation. Future production deployment should consider:

- PostgreSQL persistence
- Stronger secrets management
- Multi-factor authentication
- Centralized logging
- Hardened API authentication
- Rate limiting
- Immutable audit logging
- Production-grade identity integration
- Automated endpoint and SIEM integrations

## Project Structure

```text
kalro-kd-cirf/
├── client/
│   ├── src/
│   ├── public/
│   └── package.json
├── server/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   ├── data/
│   └── package.json
├── OPERATIONAL-TESTING.md
└── README.md
```


## Running the Application

### Start the Backend

```bash
cd server
npm start
```

The backend runs on:

```text
http://localhost:10000
```

Health check:

```text
http://localhost:10000/api/health
```

### Start the Frontend

In another terminal:

```bash
cd client
npm run dev
```

The frontend normally runs on:

```text
http://localhost:5173
```

The Vite development proxy should forward `/api` requests to:

```text
http://127.0.0.1:10000
```

## Operational Testing Workflow

```text
Start Operational Test
        ↓
Inject Incident
        ↓
Create / Detect Incident
        ↓
Acknowledge Alert
        ↓
Classify Incident
        ↓
Search Knowledge
        ↓
Select One or More Knowledge Items
        ↓
Confirm Knowledge Set
        ↓
Apply Knowledge
        ↓
Containment Attempt
        ↓
Successful → Recovery → Closure
Partial / Failed → Add Knowledge / Collaborate / Escalate → Retry Containment
        ↓
Lessons Learned
        ↓
Create / Update Knowledge
        ↓
Generate PDF / CSV Report
        ↓
Finalize Operational Test
```

## Research Purpose

The framework is intended to evaluate whether institutional cybersecurity knowledge can be systematically captured, reused, validated, and improved to support faster and more consistent incident response.

The prototype supports research into:

- incident-response performance
- institutional knowledge reuse
- knowledge effectiveness
- collaboration
- escalation
- response consistency
- containment and recovery performance
- organizational learning

## Security Notice

This repository is intended for research, development, and controlled operational testing.

Do not commit:

- production passwords
- API keys
- email app passwords
- private tokens
- confidential incident data
- real credentials

Use environment variables and secure secret-management practices for any deployment.
