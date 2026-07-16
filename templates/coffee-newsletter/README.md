# Send a coffee newsletter at 09:00 local time in every region

Status: runtime validated; final presentation and submission pending
Last validated: 2026-07-16

Import
[`coffee-newsletter.workflow.json`](./coffee-newsletter.workflow.json) into n8n
to send a morning RSS digest to Paris, New York, Tokyo, and Perth at 09:00 in
each region's local timezone.

The workflow is an end-to-end demonstration of target-aware scheduling:

```text
rrule.net Schedule Trigger
  -> regional audience configuration
  -> RSS feed
  -> localized HTML digest
  -> Brevo transactional email
  -> delivery context
```

## Requirements

- an n8n instance that allows community nodes;
- `@rrulenet/n8n-nodes-rrulenet` version `0.1.4` or later;
- an rrule.net API key;
- a Brevo API credential and a verified Brevo sender.

## Setup

1. Install `@rrulenet/n8n-nodes-rrulenet` from n8n's community-node settings.
2. Import `coffee-newsletter.workflow.json`.
3. Add an rrule.net credential to `At 09:00 in each target timezone`.
4. Add a Brevo credential to `Send with Brevo`.
5. Open `Configure regional audiences` and replace:
   - `newsletter@example.com` with a verified Brevo sender;
   - the four `example.com` recipient addresses;
   - the RSS URL or article count if desired.
6. Run the manual preview branch. It injects a Paris execution without creating
   or changing a remote schedule.
7. Publish or activate the workflow after the preview email succeeds.

Deactivating the workflow pauses its remote rrule.net schedule by default.

## Schedule contract

The trigger uses this production-validated expression:

```text
Send the morning coffee newsletter every day at 9am local time in Paris, New York, Tokyo, and Perth
```

On 2026-07-15, the public validation API resolved it into these targets:

| Target ID | Timezone | 09:00 local in UTC on that date |
| --- | --- | --- |
| `paris` | `Europe/Paris` | 07:00Z |
| `new_york` | `America/New_York` | 13:00Z |
| `tokyo` | `Asia/Tokyo` | 00:00Z |
| `perth` | `Australia/Perth` | 01:00Z |

The UTC values for Paris and New York change when their local DST offset
changes. The local delivery time remains 09:00.

The workflow routes by `target_id` and verifies the corresponding
`target_timezone`. If the schedule expression or returned target IDs are
changed, update the audience map before publishing the workflow.

## Content and delivery choices

The draft uses Hacker News' official `https://news.ycombinator.com/rss` feed as
replaceable example content. It escapes feed text before inserting it into the
HTML email and accepts only HTTP(S) article links. The RSS node retries
transient failures three times. The former HNRSS example returned HTTP 429
under concurrent target executions, so it is not used as the default. Replace
`feed_url` with a feed intended for the expected test and production traffic
when adapting the template.

The Brevo node sends one transactional email to the configured address for each
regional target. A distribution address can be used for an internal team
digest. This workflow is not a bulk marketing campaign manager: for a public
subscriber newsletter, adapt it to the provider's campaign, consent,
unsubscribe, and list-management features.

The manual preview branch sends a real email when executed. Keep placeholder
recipients until the Brevo credential and sender are ready.

On 2026-07-16, the Paris manual-preview branch completed successfully in a
local n8n development instance and delivered the rendered HTML email through
Brevo. A controlled production-webhook test through a temporary Cloudflare
Tunnel then created and routed all four target executions successfully for
Paris, New York, Tokyo, and Perth, with four localized Brevo deliveries. The
workflow was unpublished after the bounded test.

## Submission checklist

- Replace or deliberately retain the example RSS source.
- Test the manual Paris preview.
- Test a real short-lived target-aware schedule before restoring the daily
  expression.
- Verify the four target mappings.
- Confirm the exported workflow contains no credentials or instance metadata.
- Capture a clean workflow screenshot and prepare the n8n Creator Portal copy.
