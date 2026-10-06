# sf privacy policy

A Salesforce CLI plugin that moves **Privacy Center policies** (data retention, RTBF, archive) between orgs, so you can keep them in Git and promote them dev → QA → UAT → prod like the rest of your metadata.

Privacy Center metadata deploys normally, but the policies themselves don't. Today each policy moves by hand: you open the Export page, copy a long text blob, paste it into the other org, and repeat for every policy and every org. This plugin does that for you.

```
sf privacy policy list      --target-org dev
sf privacy policy export    --target-org dev --all
sf privacy policy validate  --target-org qa
sf privacy policy import    --target-org qa --dry-run
sf privacy policy import    --target-org qa
sf privacy policy diff      --source-org dev --target-org qa
```

> **Read this first.** Salesforce has no API for exporting or importing policies. This plugin uses the same **Policy Export / Import** page you use by hand (`/policies/importExport.apexp`), from the command line. That page isn't a documented API, so a Salesforce release can change it. The plugin checks everything it reads and stops with a clear error if the page looks different. Pin a version, and run `--dry-run` before every real import.

## Install

```
sf plugins install sf-plugin-privacy-policy
```

Requirements: Salesforce CLI (`sf`), Node.js 20+, and native Privacy Center (on-platform, Winter '24 or later) with the **Manage Privacy Center Policies** permission. Legacy Privacy Center (managed package + Heroku) isn't supported.

## Authentication

The plugin uses the orgs you've already authorized with `sf org login web` or `sf org login jwt`. It never asks for, sees, or stores a password. To reach the Export / Import page it opens a browser-style session through the org's frontdoor URL, the same way `sf org open` does.

If the user's password has expired, or Salesforce wants another verification, the page can't load. The plugin tells you to run `sf org open` and finish what Salesforce asks.

## 2-minute walkthrough

```bash
# 1. See what's in your dev sandbox
sf privacy policy list --target-org dev

# 2. Export every policy to privacy/policies/*.json, then commit the files
sf privacy policy export --target-org dev --all
git add privacy/policies && git commit -m "Export privacy policies"

# 3. Check that QA has every object and field the policies use
sf privacy policy validate --target-org qa

# 4. See what an import would do, without changing anything
sf privacy policy import --target-org qa --dry-run

# 5. Import. Policies arrive INACTIVE.
sf privacy policy import --target-org qa
```

## Commands

| Command | Does | Changes the org? |
| --- | --- | --- |
| `list` | Lists policies: API name, label, type, status, run frequency | No |
| `export --policy <name>… \| --all [--output-dir]` | Writes one JSON file per policy (default `privacy/policies`) | No |
| `validate [--source-dir]` | Checks that every referenced object and field exists in the target org, and that the policy isn't from a newer release | No |
| `import [--source-dir] [--dry-run] [--activate] [--no-prompt]` | Validates, then creates the policies that are missing | **Yes**, unless `--dry-run` |
| `diff --source-org <org> \| --source-dir <dir> --target-org <org>` | Shows which policies are the same, different, or only on one side | No |

Every command supports `--json`.

### How import behaves

- **Validates first.** If any policy references an object or field the target org doesn't have, nothing is imported.
- **Imports inactive by default.** Use `--activate` to import active policies. On a production org, you're asked to confirm; `--no-prompt` skips the question in CI.
- **Idempotent.** A policy that already exists in the target org with the same content is skipped, so running the import twice is safe.
- **Fails loudly on conflicts.** Salesforce can't update an existing policy through import. If a policy with the same API name exists but differs, the import stops and tells you which policy differs and where. Change or delete it in the target org yourself.
- **Verifies afterwards.** After each import, the plugin checks through the API that the policy exists with the expected status.

### The policy files

- **Plain, sorted JSON**, decoded from Salesforce's export, so Git diffs are readable and stable. Exporting the same policy twice gives a byte-identical file.
- **No org-specific record IDs.** Objects and fields are referenced by API name only. The IDs Salesforce's import format expects are rebuilt at import time.
- **Some policies can't be migrated.** If a policy filters on a specific record ID (for example, a specific parent record or record type), export fails and names the value. That's because the ID can't mean the same thing in another org (Salesforce documents the same limit).

## Limits

- A policy exported from a sandbox on a newer release can't be imported into an org on an older release until that org is upgraded. `validate` checks this.
- DSAR (data subject access request) policies aren't supported. The Export / Import page only handles data management, RTBF, and archive policies.
- Policies are created, never updated or deleted, by this plugin.

## Pipeline example

```bash
sf project deploy start --target-org "$ENV"                                   # metadata first
sf privacy policy validate --target-org "$ENV"
sf privacy policy import  --target-org "$ENV" --dry-run --json > plan.json    # post to the PR
# after approval:
sf privacy policy import  --target-org "$ENV"
```

In CI, authorize with the JWT bearer flow (`sf org login jwt`) for a dedicated integration user that has the Manage Privacy Center Policies permission.

## Development

```bash
npm install
npm run build
./bin/dev.js privacy policy list --target-org dev   # run from source
sf plugins link .                                    # use as "sf privacy policy ..."
npm test
```

## License

Apache-2.0
