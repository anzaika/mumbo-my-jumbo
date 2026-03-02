# REST API Reference — v2

This document covers the primary endpoints exposed by the Acme Corp public API.
All endpoints are served from api.acmecorp.com over HTTPS. A staging environment
is available at staging.acmecorp.com for pre-release integration testing.

## Base URLs

| Environment | Base URL                        |
|-------------|---------------------------------|
| Production  | https://api.acmecorp.com/v2     |
| Staging     | https://staging.acmecorp.com    |

For general information about our developer programme, visit the
[API Docs](https://api.acmecorp.com/v2/docs) landing page.

## Authentication

All requests to api.acmecorp.com must include a bearer token in the
`Authorization` header. Tokens are scoped per-application and can be
generated from the developer portal on acmecorp.com.

Tokens issued against staging.acmecorp.com are not valid on the production
endpoint and vice versa.

## Endpoints

### List Users

```
GET https://api.acmecorp.com/v2/users
```

Returns a paginated list of users visible to the authenticated application.
Supports `limit` and `cursor` query parameters.

**Example request:**

```bash
curl -H "Authorization: Bearer <token>" \
     https://api.acmecorp.com/v2/users?limit=50
```

### List Projects

```
GET https://api.acmecorp.com/v2/projects
```

Returns all projects the authenticated application has access to. Projects
are scoped to the organisation associated with the token.

**Example request:**

```bash
curl -H "Authorization: Bearer <token>" \
     https://api.acmecorp.com/v2/projects
```

## Rate Limits

Rate limits are enforced per token at the api.acmecorp.com gateway. The
default limit is 1000 requests per minute for production and 100 requests
per minute for staging.acmecorp.com. If you need higher limits, contact
support via the form on acmecorp.com.

## SDK Support

Official SDKs for Python and TypeScript are maintained at the acmecorp.com
developer portal. They wrap the endpoints above and handle token refresh,
retry logic, and pagination automatically.
