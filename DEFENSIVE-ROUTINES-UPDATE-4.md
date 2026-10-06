# KD-CIRF Defensive Routines Update 4

## Purpose
This update turns Defensive Routines from static knowledge recommendations into governed, executable incident-response procedures whose use and effectiveness can be measured.

## Routine definition
Each defensive routine can now contain:
- title, category and primary goal
- lifecycle status and routine version
- trigger conditions
- applicable incident types and severities
- required responder roles
- prerequisites
- ordered response steps
- step-level evidence requirements and success criteria
- routine-level evidence requirements
- expected outcome
- failure conditions
- escalation conditions
- rollback instructions
- application risks
- estimated completion time and cost
- NIST CSF function and socio-technical focus
- institutional enablers and associated scripts
- review interval and next review date

## Governance lifecycle
New routines start as `draft`.

Controlled lifecycle:

`Draft -> Reviewed -> Approved -> Active`

Active routines can be archived or superseded. Creating a new routine version automatically supersedes the previous version and creates the new version as a draft.

Only routines that are both enabled and `active` are eligible for automatic incident recommendation.

## Automatic recommendation
The recommendation engine now considers:
- incident type
- severity
- routine trigger conditions
- knowledge tags
- historical routine success
- number of completed uses
- responder role eligibility
- routine review status

The incident screen shows the match score and why the routine matched.

## Execution workflow
From an incident:
1. Review an automatically recommended routine.
2. Start and apply the routine.
3. Complete each procedure step.
4. Provide evidence where a step requires evidence.
5. Record step notes as needed.
6. Record the final outcome as Successful, Partial or Failed.
7. Add final verification evidence and an outcome summary.
8. Record whether escalation or rollback was used.

A routine cannot be marked Successful while required steps remain incomplete. A step marked as evidence-required cannot be completed without evidence.

## Effectiveness metrics
The system now tracks:
- recommendation count
- acceptance count
- rejected recommendations
- completion count
- successful executions
- partial executions
- failed executions
- recommendation acceptance rate
- routine completion rate
- routine success rate
- average completion duration

Operational-testing events continue to distinguish:
- routine recommended
- routine accepted / knowledge applied
- successful knowledge reuse

This keeps knowledge retrieval, knowledge utilization and successful reuse as separate measures.

## Review and version control
Administrators can:
- move routines through the governance lifecycle
- create a new routine version
- archive obsolete routines
- review effectiveness after a closed incident

Routine history preserves lifecycle changes and review history.

## New data store
`server/data/routine_executions.json`

This stores step-level routine executions separately from the reusable knowledge definition.

## Main API additions
- `POST /api/knowledge/defensive-routines`
- `PUT /api/knowledge/:id/routine`
- `POST /api/knowledge/:id/routine-lifecycle`
- `POST /api/knowledge/:id/routine-version`
- `GET /api/incidents/:id/routine-executions`
- `POST /api/incidents/:id/routine-executions/:knowledgeId/start`
- `PATCH /api/incidents/:id/routine-executions/:executionId/steps/:stepId`
- `POST /api/incidents/:id/routine-executions/:executionId/complete`

Existing one-click routine application endpoints remain available for backward compatibility.
