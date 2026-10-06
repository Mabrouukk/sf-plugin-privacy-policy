# summary

List the Privacy Center policies in an org.

# description

Lists retention (data management), RTBF, and archive policies with their API name, type, status, and run frequency. Use the API name with "sf privacy policy export --policy".

# examples

- List the policies in your default org:

  <%= config.bin %> <%= command.id %>

- List the policies in a specific org as JSON:

  <%= config.bin %> <%= command.id %> --target-org my-sandbox --json

# info.none

No Privacy Center policies found in this org.
