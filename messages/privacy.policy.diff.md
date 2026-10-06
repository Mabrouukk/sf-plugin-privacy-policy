# summary

Show which policies differ between a source (org or folder) and a target org.

# description

Read-only. Compares policy content, ignoring org-specific IDs, status, and the release stamp. Status is shown in its own columns.

# flags.source-org.summary

Org to compare from.

# flags.source-dir.summary

Folder of policy files to compare from, instead of an org.

# examples

- Compare dev with QA:

  <%= config.bin %> <%= command.id %> --source-org dev --target-org qa

- Compare the files in Git with production:

  <%= config.bin %> <%= command.id %> --source-dir privacy/policies --target-org prod

# info.comparing

Comparing policies
