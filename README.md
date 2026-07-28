<p align="center">
  <a href="https://rrule.net">
    <img src="./nodes/RruleNetScheduleTrigger/rrulenet.svg" alt="rrule.net" width="96" height="96">
  </a>
</p>

<h1 align="center">@rrulenet/n8n-nodes-rrulenet</h1>

<p align="center">
  n8n community node for <a href="https://rrule.net">rrule.net</a> schedules.
</p>

<p align="center">
  <a href="https://rrule.net">rrule.net</a> •
  <a href="https://docs.n8n.io/integrations/community-nodes/">n8n community nodes</a> •
  <strong>@rrulenet ecosystem</strong>
</p>

<p align="center">
  <code>@rrulenet/rrule</code> ·
  <code>@rrulenet/recurrence</code> ·
  <code>@rrulenet/core</code> ·
  <code>@rrulenet/cli</code>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@rrulenet/n8n-nodes-rrulenet"><img src="https://img.shields.io/npm/v/%40rrulenet%2Fn8n-nodes-rrulenet" alt="npm version"></a>
  <img src="https://img.shields.io/badge/license-MIT-2563EB" alt="MIT License">
</p>

The first node in this package is **rrule.net Schedule Trigger**. It starts an n8n workflow from a hosted [rrule.net](https://rrule.net) schedule, so schedule creation, timezone handling, recurrence evaluation, and webhook delivery live in a dedicated scheduling layer.

## Why Use It

[rrule.net](https://rrule.net) is a hosted scheduler for automation workflows. It can run simple schedules such as `Every minute`, but also gives you a more explicit and testable scheduling model than cron as your workflows grow.

Use it when you want:

- a schedule you can describe in natural language
- timezone-aware execution with DST handling
- a persistent remote schedule that can be paused, resumed, and inspected
- clear validation errors before a workflow is published
- webhook delivery into n8n without maintaining your own scheduler stack
- target-aware executions for routing by market, region, timezone, or custom metadata
- dynamic event-window targets generated from audiences, reminders, warnings, and lifecycle phases
- deterministic explicit targets backed by canonical recurrence or event-schedule JSON
- support for non-English natural-language schedules, depending on your rrule.net account and API configuration

For a deeper comparison of recurrence semantics and cron limitations, see [RRule vs Cron](https://rrule.net/guides/rrule-vs-cron).

It also covers schedules that are awkward or brittle with cron, such as:

- Every second Tuesday at 18:00 except August
- Every business day at 9:00 and weekends at 10:00

[rrule.net](https://rrule.net) handles the recurrence model and calls your n8n webhook when an occurrence is due.

## Installation

Install this package as an n8n community node package.

Package name:

```text
@rrulenet/n8n-nodes-rrulenet
```

Follow n8n's community node installation guide:

https://docs.n8n.io/integrations/community-nodes/installation/

## Credentials

Create a **rrule.net API** credential in n8n:

- **API Key**: an [rrule.net](https://rrule.net) API key from your dashboard
- **API Base URL**: defaults to `https://api.rrule.net`

The API base URL is configurable so you can use local or staging rrule.net APIs during development.

## Trigger Setup

Add **rrule.net Schedule Trigger** to a workflow and configure:

- **Schedule Mode**:
  - **Natural Language** for schedules described in text
  - **Event Window** for a structured maintenance or operational window
  - **Canonical Targets JSON (Advanced)** for definitions produced by another tool
- **Name**: optional display name for the remote schedule
- **Schedule Text**: natural-language schedule text when using Natural Language mode
- **Timezone**: IANA timezone, for example `Europe/Paris`
- **On Unpublish**: pause or delete the remote schedule when the workflow is unpublished

Example:

```text
Every minute
```

Complex example:

```text
Every second Tuesday at 18:00 except August
```

## Event Window Setup

Use **Event Window** to define one exact interval and let the node generate the
canonical rrule.net targets required by the workflow. This keeps business
parameters editable in n8n without requiring users to author event-schedule
JSON.

Configure:

- the event ID, label, start, and end
- zero or more regional audiences, each with its own IANA timezone and routing
  metadata
- zero or more customer reminders expressed as calendar days before the event
  at an audience-local time
- zero or more operational warnings expressed as exact elapsed hours or minutes
  before the global start
- optional start, progress, and end targets, including the progress interval

The target count is dynamic:

```text
(audiences × customer reminders)
+ operational warnings
+ enabled start/progress/end phases
```

For example, four audiences, two reminders, two warnings, and all three
lifecycle phases generate 13 targets. Two audiences, one reminder, no warnings,
and only start and end generate four.

Every generated target has one stable routing ID and one executable temporal
clause. Regional reminders use the audience timezone, while global warnings and
lifecycle phases use UTC. Progress executions are constrained to the half-open
interval `[start, end)`, so an interval ending at 04:00 does not emit a 04:00
progress check.

The end target represents the planned boundary. A production workflow should
verify service recovery before disabling maintenance mode or announcing
completion.

## Canonical Target Import

Use **Canonical Targets JSON (Advanced)** only when a template, API client, or
rrule.net-compatible tool already produced the complete target definition. The
node creates one logical remote schedule and registers its production webhook,
while each imported target owns its own canonical execution source.

Configure:

- **Schedule Description**: optional human-readable context stored with the
  targeted schedule
- **Timezone**: parent display/default timezone; it does not override target
  timezones
- **Targets JSON**: an array of 1 to 50 targets

Each target must have:

- a unique `id`
- an IANA `timezone`
- exactly one `recurrence` or `event_schedule` object
- an optional `label` and `metadata` object

Example shape:

```json
[
  {
    "id": "maintenance-start",
    "label": "Maintenance start",
    "timezone": "UTC",
    "event_schedule": {
      "kind": "event-schedule",
      "timezone": "UTC",
      "events": {
        "kind": "event-set",
        "id": "inline.maintenance",
        "version": "user-snapshot-1",
        "source": "inline",
        "timezone": "UTC",
        "members": [
          {
            "kind": "interval",
            "id": "maintenance-window",
            "start": "2026-09-15T02:00:00Z",
            "end": "2026-09-15T04:00:00Z"
          }
        ]
      },
      "transform": {
        "kind": "event-relative",
        "triggers": [{ "at": "start" }]
      }
    },
    "metadata": {
      "phase": "start"
    }
  }
]
```

The advanced import mode deliberately rejects target-level natural-language
`input`. Use Natural Language mode for interpreted schedules, Event Window for
structured generation, or canonical `recurrence` / `event_schedule` JSON for
definitions created elsewhere.

## Publication Behavior

When the workflow is published, the node creates or resumes a persistent schedule in [rrule.net](https://rrule.net).

The remote schedule points to the workflow's production n8n webhook URL. If you are testing locally, make sure n8n is reachable from the internet through a tunnel and that `N8N_WEBHOOK_URL` is set to the public tunnel URL.

When the workflow is unpublished, the node pauses the remote schedule by default. You can choose to delete it instead.

If the stored remote schedule was deleted manually, the node recreates it on the next publish.

The node fingerprints the executable definition. Reordering Event Window
audiences or reminders, reformatting advanced JSON, or reordering imported
targets does not replace an unchanged schedule. If target timing changes, the
node deletes the old remote schedule before creating its replacement because
target IDs, timezones, and executable sources are immutable in rrule.net. This
ordering prevents duplicate operational executions. If the replacement cannot
be created, workflow publication fails visibly and no stale remote schedule
remains active.

## Webhook Troubleshooting

The node registers the workflow's production n8n webhook URL with [rrule.net](https://rrule.net) when the workflow is published.

If rrule.net reports failed deliveries, check these common causes first:

- **HTTP 404 from n8n**: the workflow is usually not published, or the webhook URL is not the production URL.
- **`webhook-test` URL**: n8n test webhook URLs only work while n8n is explicitly listening for a test event. Use the production webhook URL for persistent schedules.
- **Local n8n instance**: expose n8n through a public HTTPS tunnel and set `N8N_WEBHOOK_URL` to that public URL before publishing the workflow.
- **Stopped tunnel or changed public URL**: publish the workflow again so the node updates the remote rrule.net schedule with the current webhook URL.

rrule.net automatically pauses clearly broken webhook endpoints. For example, a `404` or `410` response is treated as a terminal endpoint failure, while likely configuration errors such as `400`, `401`, or `403` are paused after repeated failures. Fix the n8n endpoint, then resume the schedule in rrule.net or publish the workflow again.

## Target-Aware Schedules

rrule.net can run one logical schedule across multiple execution targets, such as regions, markets, stores, audiences, or local timezones.

For targeted schedules, the trigger output includes normalized target fields:

- `target_id`
- `target_label`
- `target_timezone`
- `target_metadata`

Use these fields in downstream n8n nodes to route each execution. Untargeted schedules keep the same webhook payload shape and leave target fields empty, except `target_metadata`, which is an empty object.

Learn more in the rrule.net schedule targets guide:

https://rrule.net/guides/schedule-targets

## Workflow Templates

The repository includes an importable target-aware example:

- [Send a coffee newsletter at 09:00 local time in every region](https://github.com/rrulenet/n8n-nodes-rrulenet/tree/main/templates/coffee-newsletter)

It combines Paris, New York, Tokyo, and Perth in one logical schedule, then
routes each execution to a localized RSS digest sent through Brevo.

## Output

Each trigger execution emits one item with normalized fields:

```json
{
  "schedule_id": "6b02511c-d936-42cf-932f-cb1ce3832a4c",
  "schedule_name": "n8n lead sync",
  "execution_id": "148bdd21-39af-45a6-8f7f-ea6b40ca39a4",
  "scheduled_for": "2026-05-04T09:23:00+00:00",
  "executed_at": "2026-05-04T09:23:29.173Z",
  "timezone": "Europe/Paris",
  "target_id": "paris",
  "target_label": "Paris audience",
  "target_timezone": "Europe/Paris",
  "target_metadata": {
    "market": "fr",
    "segmentId": "brevo-fr"
  },
  "input_type": "natural",
  "input_value": "Every minute",
  "raw_payload": {}
}
```

## Quotas And Plans

Persistent schedules run on [rrule.net](https://rrule.net). API key, quota, and subscription errors are returned by the rrule.net API and shown in n8n when the workflow is published.

Manage your account and API keys from:

https://rrule.net/dashboard
