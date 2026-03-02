# Deployment Configuration Guide

This document covers the credentials and connection strings required to deploy
the application stack to production. All secrets listed here are real values from
the production environment — handle accordingly and do not commit this file to a
public repository.

## API Keys

### LLM Gateway

The inference gateway authenticates via a bearer token. Set the following in your
environment before running the deployment script:

```bash
export LLM_API_KEY=sk-prod-abc123def456
```

The key `sk-prod-abc123def456` grants access to all production inference endpoints.
Rotate it via the LLM provider dashboard if you suspect it has been exposed.

### GitHub Actions Token

The CI pipeline uses a fine-grained personal access token for repository dispatch.
Set it as a repository secret named `GH_DEPLOY_TOKEN`. The current active value is
`ghp_1234567890abcdef` — this token has `repo` and `workflow` scopes only.

### AWS Access Key

Terraform uses a static AWS credential for the legacy state bucket. The access key
ID is `AKIAIOSFODNN7EXAMPLE`. The corresponding secret access key is stored in
1Password under the vault entry "Terraform Legacy Bucket".

    export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE

Do not embed the AWS secret access key in any configuration file. Retrieve it from
1Password at deploy time.

## Database Connection

The application connects to MongoDB using the following URI. This string includes
the admin password and must not appear in logs or error messages:

```
mongodb://admin:s3cret@db.acmecorp.com:27017
```

The database host db.acmecorp.com is accessible only from within the private VPC.
The URI above will not resolve from outside the network perimeter. If you need to
connect locally, establish the VPN tunnel to acmecorp.com first and then use the
same connection string.

## Rotation Policy

| Secret                                   | Rotation Interval |
|------------------------------------------|-------------------|
| sk-prod-abc123def456                     | 90 days           |
| ghp_1234567890abcdef                     | 30 days           |
| AKIAIOSFODNN7EXAMPLE                     | 180 days          |
| mongodb://admin:s3cret@db.acmecorp.com:27017 | 365 days      |

Rotation is tracked in the internal secrets management runbook. After each
rotation, update the corresponding entry in 1Password and re-deploy the affected
services. Notify the on-call engineer via the `#deployments` channel on Slack.
