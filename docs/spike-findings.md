# Phase 0 – Discovery spike findings

Status: **spike done, decision made** (4 open questions to test)
Date: 2026-10-06
Org: licensed Unlimited Edition sandbox, API v67.0, native Privacy Center enabled.
All commands below were read-only (describe / SOQL / GET). Nothing was written to the org.

## Step 1 – Test policies

Skipped. The sandbox already had 6 policies, so there was no need to create any:

| Type (`Type` picklist) | Count | Active |
| --- | --- | --- |
| `rtbf` | 2 | 2 |
| `datamanagement` (retention) | 4 | 1 (yearly schedule) |
| DSAR (`DsarPolicy`) | 0 | – |

## Step 2 – Candidate objects

`sf sobject list --sobject all` returned 2,279 objects. The privacy-related ones:

### Policy storage

| Object | Key prefix | Queryable | Createable | What it holds |
| --- | --- | --- | --- | --- |
| `PrivacyPolicyDefinition` | `8sk` | yes | **yes** (also updateable) | Policy header: `DeveloperName`, `MasterLabel`, `Type`, `Status`, `RunFrequency`, `ScheduledStart`, `Description`, `Language`, `IsAllocatePermset` |
| `PrivacyPolicy` | `8so` | yes | yes (only `Name`, `PrivacyPolicyDefinitionId`) | 1:1 wrapper around the definition; `Type`/`Status`/`RunFrequency` are read-only formula-style mirrors |
| `DsarPolicy` | `83A` | yes | **no** | DSAR header: `DeveloperName`, `MasterLabel`, `IsActive`, `Description`. Read-only through the API |

Picklist values for `Type`: `datamanagement | herokumigration | datamask | rtbf | archive | datamanagementondatacloud | globalconsentstore`.
`Status`: `active | inactive`. `RunFrequency`: `none | once | daily | weekly | monthly | yearly`.

**None of these objects has a field for the policy body** (target object, related-object tree, fields, conditions, mask/delete action, retention period). They only hold the header.

### Runtime / execution objects (not policy storage)

| Object | Notes |
| --- | --- |
| `PrivacyJobSession` | One record per run. Has `SerializedPolicy` (textarea). **It was null on all 46 sessions checked**, both rtbf and datamanagement, both preview and processor runs. Also has `PolicyName`, `PolicyType`, `JobStatus`, `JobManagementType`, `IsPreview` |
| `PrivacyObjectSession` | Per-object progress inside a job (`PolicyNode`, `ProcessType` delete/mask, counts) |
| `PrivacyRTBFRequest` | An RTBF request against a policy (`PolicyNameId` → `PrivacyPolicyDefinition`) |
| `PrivacySessionRecordFailure`, `PrivacyRtntStoreDelStatus`, `RetentionStoreUsage`, `DsarPolicyLog`, `PrivacyHold*`, `PrivacyRequest` | Runtime, logging, and hold records. Not useful for migration |

### Metadata API / Tooling API

- `sf org list metadata-types` has **no** privacy-policy type. The only near matches are `DataMaskPolicy`, `TransactionSecurityPolicy`, `UserAccessPolicy`, `MobileSecurityPolicy`, and `ProfilePasswordPolicy`, which are unrelated.
- In the Tooling API, `PrivacyPolicyDefinition` and `PrivacyPolicy` show up in `EntityDefinition`, but they can't be described as Tooling sObjects. So there is no `Metadata` complex field there.
- `PrivacySettings` (Tooling, has a `Metadata` field) holds org-level settings only (consent capture, archive enabled, and so on), not policies.

### REST / Connect

- The REST root `/services/data/v67.0/` has no privacy resource. The one match, `consent`, is the Consent API and doesn't apply.
- The Connect root has no privacy resource.

### Step 2 conclusion

- **Read via API: header only.** We can list policies (name, type, status, schedule) through SOQL on `PrivacyPolicyDefinition`, which is enough for `sf privacy policy list` and for matching by `DeveloperName` in the target org.
- **The policy body is not reachable through SOQL, Tooling, Metadata, or any documented REST/Connect resource.** The only copy we can get is whatever the Export button produces.
- `PrivacyPolicyDefinition` is createable through the API, but inserting a header with no body would probably leave a broken policy. **Do not test this in a shared org.**

## Step 3 – How Export / Import works (captured 2026-10-07, Safari HAR)

- The tool page is **`/policies/importExport.apexp`** on `*.my.salesforce.com`. It's a Salesforce-internal **Visualforce page**: no Aura, no REST, no XHR.
- **Export is a classic form POST** (`application/x-www-form-urlencoded`) back to the same URL. The response is the full HTML page.
- Form fields sent on Export:

| Field | Value |
| --- | --- |
| `thePage:theForm` | `thePage:theForm` |
| `thePage:theForm:theTabPanel` | `exportTab` |
| `thePage:theForm:j_id32` | PrivacyPolicy Id (`8so…`) |
| `thePage:theForm:j_id33` | `Export` (the submit button) |
| `thePage:theForm:j_id39` | empty (the import textarea) |
| `com.salesforce.visualforce.ViewState` / `ViewStateVersion` / `ViewStateMAC` / `ViewStateCSRF` | taken from the GET of the page |

- **Import** is the same form: the payload goes in the textarea (`j_id39`) and the submit button is `j_id41 = Import`.
- The exported text comes back in `<span id="thePage:theForm:exportedPolicyText">`.
- The `j_idNN` names are generated by the page, so the tool must **find fields by label/button value when parsing the GET response**, not hard-code them.
- There's a green success banner: "Success:Policy with Id … was exported."

## Step 4 – Payload format

- **Plain base64 of JSON.** No signature, checksum or compression (about 11 KB base64 for a 1-object policy).
- Top level: `name`, `developerName`, `description`, `type`, `status`, `runFrequency`, `scheduledStart`, `apiVersion` (e.g. `67.0`), `retentionTimeToLiveValue/Unit`, `shouldHardDelete`, `shouldDeleteFieldHistory*`, `shouldIgnoreTriggers`, `shouldBypassTopLevelErrors`, `requiresPreview`, `isAllocatePermset`, `deleteMaskBatchSize`, `maskingLibraries`, `targetSystem`, `objects[]`.
- `objects[]`: `objectReference` (API name), `traversalOrder`, `timeToLiveValue/Unit`, `actionOnFilesAndAttachments`, `rawFilterCriteria` (filters by `objectReference`/`fieldReference` API names, operator, value, time unit), `fields[]` (`fieldReference` API name, `maskingCategory`, mask/retention settings).
- **It contains source-org record IDs:** `policyId` (`8sk`), `policyVersionId` / `privacyPolicyVersion` (`8sn`), `privacyPolicyObjectId` (`8sl`), `fields[].id` (`8sm`). Everything else is by API name.
- `apiVersion` is the release stamp behind the "newer sandbox → older prod" rule. We can pre-check it against the target org's API version.
- `isPreview`, `rtbfRequestId`: runtime fields, null/false in exports.

## Decision

**B (the UI's endpoint), via HTTP, no browser.** A for listing.

- `list` / `diff` headers: SOQL on `PrivacyPolicyDefinition` / `PrivacyPolicy` (A).
- `export`: GET `importExport.apexp` → parse the ViewState → POST with the `8so` Id and `Export` → read `exportedPolicyText` → base64-decode → **strip the IDs** (`policyId`, `policyVersionId`, `privacyPolicyVersion`, `privacyPolicyObjectId`, `fields[].id`) → write sorted, pretty JSON.
- `import`: read the JSON → force `status: inactive` unless `--activate` → base64-encode → GET the page → POST with textarea + `Import` → parse the success/error banner.
- Auth: reuse the `sf` access token through `frontdoor.jsp` to get a session cookie for the `my.salesforce.com` domain. No passwords.
- **Risk:** this is an undocumented internal page. Salesforce can rename fields or change it in any release. Mitigate by parsing fields by label, failing loudly on anything unexpected, and running a canary e2e test each release. **README must say so.**
- C (Playwright) not needed.

Open questions to test next (all on a disposable/second org for import):
1. Does a POST using a frontdoor session from the `sf` token work for the Export POST? (read-only)
2. Does Import accept a payload with the IDs removed? If not, re-add the source IDs or use placeholders. They can't be stored in Git, so the tool would inject dummies at import time.
3. What does Import return on success vs. failure (missing field, duplicate name)?
4. How do we update an existing policy? The page says the name must not exist in the target, so "update" may mean delete + re-import, or a rename. This affects the idempotency rule.

