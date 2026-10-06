# summary

Copy Privacy Center policies from one org to another in one step.

# description

Reads the policies from the source org and imports them into the target org, with no files to manage. It does the same as "export" followed by "import": it validates the target org first, imports policies inactive unless you specify --activate, skips policies that are already identical, and stops if a policy exists in the target org with different content.

The source org is only read. Run with --dry-run first to see what would happen.

# flags.source-org.summary

Org to copy the policies from (alias or username).

# flags.policy.summary

API name (DeveloperName) of a policy to copy. Repeat the flag to copy several.

# flags.all.summary

Copy every policy in the source org.

# flags.dry-run.summary

Show what would be copied, without changing the target org.

# flags.activate.summary

Experimental: import policies as active. They are inactive by default. Safer: import inactive, then activate in Privacy Center.

# flags.no-prompt.summary

Don't ask for confirmation when activating policies in a production org (for CI).

# flags.output-dir.summary

Also save the copied policies as JSON files in this directory, for example to commit them to Git.

# examples

- See what copying one policy from dev to QA would do:

  <%= config.bin %> <%= command.id %> --source-org dev --target-org qa --policy Contact_Retention --dry-run

- Copy it:

  <%= config.bin %> <%= command.id %> --source-org dev --target-org qa --policy Contact_Retention

- Copy every policy, and keep the files for Git:

  <%= config.bin %> <%= command.id %> --source-org dev --target-org qa --all --output-dir privacy/policies

# info.reading

Reading policies from %s

# info.none

No Privacy Center policies found in the source org.

# error.sameOrg

The source and target org are the same org.

# error.notFound

No policy with API name "%s" in org %s.

# error.notFound.action

Run "sf privacy policy list --target-org %s" to see the API names of its policies.
