# Bootstrap

Creates the shared Terraform state bucket and GitHub Actions Workload Identity Federation.

Run this once from an authenticated operator account with project admin permissions:

```bash
terraform init
terraform apply
```

Save these outputs in GitHub repository variables:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_DEPLOYER_SERVICE_ACCOUNT`

The deployer service account receives only the roles needed to manage the preprod stack and the state bucket.
