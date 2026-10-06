# Changelog

## 0.1.0

First release.

- `sf privacy policy list`: list policies in an org.
- `sf privacy policy export`: write policies to sorted JSON files with org-specific IDs removed.
- `sf privacy policy validate`: check that the target org has every referenced object and field, and a release at least as new.
- `sf privacy policy import`: validate, then create missing policies (inactive by default); skip identical ones; stop on conflicts; verify afterwards.
- `sf privacy policy copy`: export and import in one step, straight from org to org.
- `sf privacy policy diff`: compare policies between an org or folder and another org.
