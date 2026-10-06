<p align="center">
  <img src="https://raw.githubusercontent.com/Mabrouukk/sf-plugin-privacy-policy/main/docs/images/banner.png" alt="sf privacy policy: move Salesforce Privacy Center policies between orgs in one command" width="100%">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/sf-plugin-privacy-policy"><img src="https://img.shields.io/npm/v/sf-plugin-privacy-policy.svg" alt="npm version"></a>
  <a href="https://github.com/Mabrouukk/sf-plugin-privacy-policy/actions/workflows/ci.yml"><img src="https://github.com/Mabrouukk/sf-plugin-privacy-policy/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE.txt"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License"></a>
</p>

# sf privacy policy

**A Salesforce CLI plugin that moves Salesforce Privacy Center policies (data retention and RTBF) from one org to another in a single command.**

Privacy Center metadata deploys like any other metadata, but the **policies** don't. There's no API and no CLI command for them, so moving a policy means opening the Export page, copying a long block of text, pasting it into the other org, and importing it, for every policy and every org. This plugin does all of that for you, and checks the target org first.

## Quick start

```bash
# 1. Install (answer "y" when asked to trust the plugin)
sf plugins install sf-plugin-privacy-policy

# 2. See the policies in your source org
sf privacy policy list -o <source-org>

# 3. Check what would happen (changes nothing)
sf privacy policy copy -s <source-org> -o <target-org> -p <Policy_API_Name> --dry-run

# 4. Copy it
sf privacy policy copy -s <source-org> -o <target-org> -p <Policy_API_Name>
```

Use the aliases of orgs you've already logged into with `sf org login web`. The policy arrives in the target org **inactive**. Review it and activate it in Privacy Center when you're ready.

## Why it's safe

| | |
| --- | --- |
| ✅ **Validates first** | Stops before changing anything if the target org is missing an object or field the policy uses. |
| 🛡️ **Imports inactive** | Every policy is created inactive, so a person always decides when it runs. |
| 🔒 **Never overwrites** | An identical policy is skipped. A different one with the same name stops the run and shows the differences. |
| 🔁 **Safe to re-run** | Running the same command twice changes nothing the second time. |
| 🔑 **No passwords** | Uses the orgs you've already authorized in the Salesforce CLI. |

## Commands

| Command | What it does | Changes the org? |
| --- | --- | --- |
| `sf privacy policy list` | Lists the policies in an org | No |
| `sf privacy policy copy` | Copies policies from one org to another in one step | Yes (not with `--dry-run`) |
| `sf privacy policy diff` | Shows which policies differ between two orgs | No |
| `sf privacy policy export` | Saves policies as JSON files, ready for Git | No |
| `sf privacy policy validate` | Checks that an org has everything a set of policy files needs | No |
| `sf privacy policy import` | Creates policies in an org from JSON files | Yes (not with `--dry-run`) |

Add `--help` to any command for all its options, and `--json` for machine-readable output.

## How it works

<p align="center">
  <img src="https://raw.githubusercontent.com/Mabrouukk/sf-plugin-privacy-policy/main/docs/images/how-it-works.png" alt="Sequence diagram: the plugin logs into the source org, finds the policy ID with SOQL, submits the Export form, decodes and cleans the policy, validates the target org, prepares the payload, submits the Import form, and verifies the result" width="100%">
</p>

Salesforce's Policy Export / Import page is a simple form. The plugin uses your existing CLI login to submit that same form, exactly like clicking the buttons:

1. **Find:** a SOQL query on `PrivacyPolicy` gets the policy's record ID.
2. **Export:** submits the Export form; Salesforce returns the policy as base64-encoded JSON.
3. **Clean:** decodes it and removes the IDs that only mean something in the source org.
4. **Validate:** checks that the target org has every object and field, and isn't on an older Salesforce release.
5. **Import:** submits the Import form with the policy set to inactive, then confirms through the API that it exists.

The full design notes are in [docs/spike-findings.md](docs/spike-findings.md).

## Keep policies in Git

You can also store policies as files and promote them like the rest of your metadata:

```bash
sf privacy policy export   -o dev --all            # writes privacy/policies/*.json
git add privacy/policies && git commit -m "Privacy policies"

sf privacy policy validate -o qa                   # does QA have every field?
sf privacy policy import   -o qa --dry-run         # what would change?
sf privacy policy import   -o qa                   # create the missing policies
```

The files are sorted, readable JSON with no org-specific IDs, so Git diffs stay clean.

## FAQ

<details>
<summary><b>Is this an official Salesforce API?</b></summary>

No. Salesforce has no API for policy export and import. The plugin uses the same Export / Import page you use by hand. If a Salesforce release changes that page, the plugin stops with a clear error instead of doing something unexpected. This is a community project; it isn't made or endorsed by Salesforce.
</details>

<details>
<summary><b>Which policies and orgs does it support?</b></summary>

| | Status |
| --- | --- |
| Data retention policies | ✅ Tested end to end |
| RTBF policies (including child objects) | ✅ Tested |
| Archive policies | Should work (same page), not tested yet |
| DSAR policies | ❌ Not supported (not on the Export / Import page) |
| Sandboxes | ✅ Tested |
| Production | Login and listing verified; import works the same way |
| `--activate` flag | Experimental. Prefer importing inactive and activating in Privacy Center |

Requires the Salesforce CLI, Node.js 22+, native Privacy Center, and the **Manage Privacy Center Policies** permission.
</details>

<details>
<summary><b>Can it update a policy that already exists?</b></summary>

No. Salesforce's import only creates policies. If the target org already has a policy with the same API name and different settings, the plugin stops and shows what's different (`sf privacy policy diff` shows it too). Delete or rename the old one in the target org, then run again.
</details>

<details>
<summary><b>Can I use it in a CI/CD pipeline?</b></summary>

Yes. Every command supports `--json`. A typical pipeline:

```bash
sf project deploy start -o "$ENV"                        # metadata first
sf privacy policy validate -o "$ENV"
sf privacy policy import -o "$ENV" --dry-run --json      # post the plan for review
sf privacy policy import -o "$ENV"                       # after approval
```

Log in with `sf org login jwt` as an integration user with the Manage Privacy Center Policies permission. To skip the install confirmation on CI machines, add the plugin to [`unsignedPluginAllowList.json`](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_allowlist.htm).
</details>

<details>
<summary><b>Troubleshooting</b></summary>

| Message | What to do |
| --- | --- |
| `Salesforce sent this user to …ChangePassword` | The password expired. Run `sf org open`, set a new password, try again. |
| `The Policy Export / Import page did not load as expected` | Check the user has the Manage Privacy Center Policies permission and that the manual Export page works. If it does, [open an issue](https://github.com/Mabrouukk/sf-plugin-privacy-policy/issues). |
| `Field X.Y does not exist in the target org` | Deploy that field to the target org first, then run again. |
| `already exist in the target org with different content` | See "Can it update a policy that already exists?" above. |
| `Policy has no objects or fields` | The policy is empty in the source org. Add at least one object. |
| `contains values that look like record IDs` | The policy filters on a specific record or record type. Record IDs differ between orgs, so remove that filter. |
| `Salesforce rejected policy X: …` | The text after the colon is Salesforce's own message, the same one the Import page shows. |
</details>

## Install, update, remove

```bash
sf plugins install sf-plugin-privacy-policy
sf plugins update
sf plugins uninstall sf-plugin-privacy-policy
```

## Contributing

Feedback, bug reports, and ideas are welcome. Please [open an issue](https://github.com/Mabrouukk/sf-plugin-privacy-policy/issues). To work on the code:

```bash
npm install && npm run build
sf plugins link .        # use your local copy as "sf privacy policy ..."
npm test
```

## License

[Apache-2.0](LICENSE.txt). Built by [Mahmoud Mabrouk](https://github.com/Mabrouukk).
