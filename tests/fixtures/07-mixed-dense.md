# Sprint 42 Planning — Acme Corporation

**Date:** 2026-02-24
**Facilitator:** Jane Doe
**Attendees:** Bob Smith, Maria Garcia, Tom Wilson

---

## Context

Acme Corporation is entering the final stretch of Q1. The work this sprint feeds
directly into the **Project Chimera** launch milestone. All team members should
ensure their environments are pointing at `https://api.acmecorp.com/v2` rather
than the staging endpoint before committing integration tests.

Bob Smith noted that the dashboard at `https://dashboard.acmecorp.com` showed
elevated error rates on Friday. Maria Garcia has opened a ticket against the
**Vortex Platform** to investigate whether the issue originates in the request
routing layer or further downstream.

## API Access

The production API key `sk-prod-xyz789` is stored in Vault under the path
`secret/acme/prod`. Do not hardcode this key in any repository. If you need
access, contact Jane Doe at `jane.doe@acmecorp.com` or Bob Smith at
`bob.smith@acmecorp.com`.

All external requests from Acme Corp services must originate from the approved
egress node at `192.168.1.100`. The `acmecorp.com` DNS zone is managed by the
platform team; subdomain changes require a PR against the zone file in the
`infra` repository.

## Sprint Goals

1. **Project Chimera** — Complete end-to-end smoke tests against `api.acmecorp.com`
   and verify latency SLOs. Owner: Maria Garcia.

2. **Project Atlas** — Finalise the data-export pipeline. Tom Wilson will coordinate
   with the **Helios Monitor** on-call to confirm the export job runs cleanly on
   `dashboard.acmecorp.com` before the cutover window.

3. **Vortex Platform** stability — Bob Smith and Tom Wilson will pair on reproducing
   the Friday error spike using the `dashboard.acmecorp.com` HAR captures.

## Stakeholder Update

Acme sent a reminder that the contractual deadline for **Project Atlas** is end of
March. Jane Doe will prepare the external status update and share it with the
`acmecorp.com` leadership alias by Thursday EOD.

All questions about Acme Corp billing integrations should go to `bob.smith@acmecorp.com`.
For platform-level queries, reach Jane Doe at `jane.doe@acmecorp.com`.
