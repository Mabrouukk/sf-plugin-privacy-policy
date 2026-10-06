# summary

Export Privacy Center policies to JSON files you can commit to Git.

# description

Exports each policy through Privacy Center's Policy Export / Import page, then writes one JSON file per policy, named after its API name. Org-specific record IDs are removed, and keys are sorted so Git diffs stay clean. The export fails if a policy still contains a record ID (for example, a filter on a specific record), because such a policy can't work in another org.

This command reads only; it changes nothing in the org. It uses the Policy Export / Import page, which Salesforce doesn't document as an API, so a Salesforce release can change it.

# flags.policy.summary

API name (DeveloperName) of a policy to export. Repeat the flag to export several.

# flags.all.summary

Export every policy in the org.

# flags.output-dir.summary

Directory to write the policy files to.

# examples

- Export one policy:

  <%= config.bin %> <%= command.id %> --target-org dev --policy Contact_Retention

- Export all policies to the default directory, privacy/policies:

  <%= config.bin %> <%= command.id %> --target-org dev --all

# info.connecting

Opening the Policy Export / Import page

# info.none

No Privacy Center policies found in this org.

# error.notFound

No policy with API name "%s" in org %s.

# error.notFound.action

Run "sf privacy policy list" to see the API names of the policies in this org.
