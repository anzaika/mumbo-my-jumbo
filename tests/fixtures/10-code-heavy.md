# API Integration Guide

This guide walks through the steps required to connect a local development environment
to the production API. All examples assume a Unix-like shell.

## Prerequisites

Ensure your environment has Python 3.9+ and `curl` available. You will also need a
valid API key — contact the platform team if you do not have one. All production traffic
is routed through `acmecorp.com` endpoints; internal staging uses a separate domain
that is not covered here.

## Authentication

Store your credentials as environment variables. Never hardcode them in source files.

```bash
export ACME_API_SECRET=supersecretvalue
export ACME_BASE_URL=https://api.acmecorp.com/v2/data
```

## Making a Request

The following `curl` example fetches the latest dataset from the production endpoint:

```bash
curl -s \
  -H "Authorization: Bearer sk-live-abcdef123456" \
  -H "Content-Type: application/json" \
  https://api.acmecorp.com/v2/data \
  | jq '.results'
```

If you receive a 401, verify that `sk-live-abcdef123456` has not been rotated. Keys are
rotated every 90 days; the rotation schedule is published on the internal wiki.

## Python Client

For programmatic access, use the following pattern:

```python
import os
import httpx

API_KEY = "sk-live-abcdef123456"
BASE_URL = "https://api.acmecorp.com/v2/data"

response = httpx.get(
    BASE_URL,
    headers={"Authorization": f"Bearer {API_KEY}"},
    timeout=30,
)
response.raise_for_status()
print(response.json())
```

## Internal Network Access

When running inside the private network, the service is also reachable directly at the
host-level address. Use this only for low-latency batch jobs that run within the cluster.

```yaml
# config/service.yaml
api:
  base_url: https://api.acmecorp.com/v2/data
  internal_host: 192.168.1.100
  port: 8443
  tls: true
```

The `api.acmecorp.com` DNS record resolves to `192.168.1.100` within the internal zone.
External clients always hit the public load balancer and should never use the raw IP.

## Troubleshooting

- **401 Unauthorized** — The key `sk-live-abcdef123456` may have expired. Rotate via
  the secrets portal and update `ACME_API_SECRET=supersecretvalue` in your local `.env`.
- **Connection refused on `192.168.1.100`** — You are likely outside the VPN tunnel.
  Connect to VPN and retry. The `acmecorp.com` public endpoint should still be reachable
  without VPN.
