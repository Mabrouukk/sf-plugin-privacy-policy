# summary

Import policy files into an org. Policies are imported inactive unless you specify --activate.

# description

Validates every file first (objects, fields, release), then compares each policy with the target org:

- Not in the target org: it's created.
- In the target org and identical: nothing happens, so running the import twice is safe.
- In the target org but different: the import stops with an error. Salesforce can't update an existing policy through import, so change or delete it in the target org yourself.

Nothing is sent if any policy fails validation or conflicts. Use --dry-run to see the plan without changing anything.

A wrong active retention or RTBF policy can delete or mask real customer data. Policies are imported inactive by default. With --activate on a production org, you're asked to confirm unless you also specify --no-prompt.

This command uses the Policy Export / Import page, which Salesforce doesn't document as an API.

# flags.source-dir.summary

Directory containing the policy files.

# flags.dry-run.summary

Validate and show what would be imported, without changing the org.

# flags.activate.summary

Import policies as active. They are inactive by default.

# flags.no-prompt.summary

Don't ask for confirmation when activating policies in a production org (for CI).

# examples

- See what would be imported into QA:

  <%= config.bin %> <%= command.id %> --target-org qa --dry-run

- Import into QA, inactive:

  <%= config.bin %> <%= command.id %> --target-org qa

# info.validating

Validating policies against the target org

# info.planning

Comparing with policies already in the target org

# info.importing

Importing %s

# info.conflict

Differs from the target org at: %s

# info.unchanged

Already in the target org and identical (status there: %s).

# info.dryRun

Dry run: nothing was changed.

# info.nothingToDo

Nothing to import: every policy is already in the target org.

# info.statusMismatch

Created, but its status in the org is %s (expected %s). Check it in Privacy Center.

# prompt.activateProd

You're about to import %s ACTIVE policies into production org %s. Active retention and RTBF policies can delete or mask customer data. Continue?

# error.invalid

Validation failed with %s problem(s). Nothing was imported.

# error.conflict

These policies already exist in the target org with different content: %s. Nothing was imported.

# error.conflict.action

Salesforce can't update a policy through import. Delete or rename the policy in the target org, then run the import again.

# error.cancelled

Import cancelled. Nothing was imported.

# error.importFailed

Salesforce rejected policy %s: %s. Policies before it in the list were imported; the rest were not.

# error.notVisible

Salesforce reported success, but the policy isn't visible through the API.

# error.verifyFailed

One or more policies could not be verified after import.
