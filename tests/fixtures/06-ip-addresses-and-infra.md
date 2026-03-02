# Infrastructure Network Topology

This document describes the internal network layout for the primary data centre pod.
All IP addresses and hostnames are for internal use only and must not be published externally.

## Monitoring and Gateway Services

The **Helios Monitor** service runs on the management node at `192.168.1.100` and polls
all registered hosts every 60 seconds. Alerts are routed through the **Nexus Gateway**,
which sits at `172.16.0.1` and handles traffic shaping for the entire segment.

The worker pool communicates internally over the `10.0.0.0/24` subnet. The primary
worker coordinator is reachable at `10.0.0.50` and handles job distribution for
batch processing pipelines.

## Server Inventory

The table below lists all registered servers in the current pod:

| Hostname         | IP Address      | Role                  | Managed By       |
|------------------|-----------------|-----------------------|------------------|
| mgmt-01          | 192.168.1.100   | Management / Metrics  | Helios Monitor   |
| gateway-01       | 172.16.0.1      | Traffic / Routing     | Nexus Gateway    |
| worker-coord-01  | 10.0.0.50       | Job Coordination      | Helios Monitor   |

## Operational Notes

- All inbound access to `192.168.1.100` is restricted to the ops VLAN.
- The **Nexus Gateway** at `172.16.0.1` applies rate-limiting rules defined in
  `gateway-policy.yaml`. Changes require approval from the infrastructure team.
- **Helios Monitor** sends daily digest emails to the on-call rotation. If the
  host at `10.0.0.50` misses three consecutive heartbeats, a P1 alert is raised.
- Firewall rules between `172.16.0.1` and the `192.168.1.0/24` block are reviewed
  quarterly as part of the security audit process.

## Escalation Path

If either **Helios Monitor** or **Nexus Gateway** becomes unreachable, follow the
runbook at `docs/runbooks/infra-escalation.md` and page the on-call infrastructure
engineer immediately.
