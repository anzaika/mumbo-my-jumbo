# Platform Migration: Vortex Platform to Next-Gen Infrastructure

**Project:** Project Chimera
**Status:** In Progress
**Last Updated:** 2026-02-14

## Overview

Acme Corporation has approved the migration of all internal services away from the
legacy Vortex Platform. This initiative, internally codenamed Project Chimera, is
expected to run through Q2 2026 and will affect all engineering teams at Acme Corp.

The decision to sunset the Vortex Platform was driven by three factors: rising
licensing costs, lack of multi-region support, and the platform's inability to
handle the throughput demands Acme now faces at its current scale.

## Background

When Acme first adopted the Vortex Platform in 2019, the company had fewer than
200 engineers and a single datacenter footprint. Since then, Acme Corp has grown
to over 1,400 engineers across five regions. The Vortex Platform was never designed
for this level of scale, and the engineering debt has become difficult to service.

Project Chimera was formally scoped in Q4 2025 after an internal review conducted
by the Infrastructure Guild. The review concluded that Acme's reliability targets
could not be met on the Vortex Platform beyond 2026 without significant custom
development — effort better spent on the migration itself.

## Scope

The following services will be migrated under Project Chimera:

- Authentication and identity (owned by the Platform Security team at Acme Corp)
- Event streaming pipelines (currently running on Vortex Platform message queues)
- Internal dashboards and observability tooling
- Developer CI/CD orchestration

Services not in scope for the initial Project Chimera rollout will be documented
separately by the Acme infrastructure leads.

## Timeline

| Phase | Description                        | Target Date |
|-------|------------------------------------|-------------|
| 1     | Inventory all Vortex Platform deps | 2026-03-15  |
| 2     | Migrate auth services              | 2026-04-30  |
| 3     | Migrate streaming pipelines        | 2026-05-31  |
| 4     | Decommission Vortex Platform       | 2026-06-30  |

## Contacts

For questions about Project Chimera, reach out to the Acme infrastructure mailing
list or open a ticket in the internal tracker tagged `project-chimera`.
