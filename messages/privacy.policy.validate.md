# summary

Check that policy files can be imported into an org.

# description

Read-only. For every policy file, checks that each object and field the policy references (including in filters) exists in the target org, and that the policy wasn't exported from a newer Salesforce release than the target org is on. "sf privacy policy import" runs the same checks automatically.

# flags.source-dir.summary

Directory containing the policy files.

# examples

- Validate the policies in privacy/policies against your QA org:

  <%= config.bin %> <%= command.id %> --target-org qa

# info.valid

All %s policies are valid for %s.

# error.invalid

Validation failed with %s problem(s). Nothing was imported.
