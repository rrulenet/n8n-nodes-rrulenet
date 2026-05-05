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

For a deeper comparison of recurrence semantics and cron limitations, see [RRule vs Cron](https://rrule.net/guides/rrule-vs-cron).

It also covers schedules that are awkward or brittle with cron, such as:

- Every second Tuesday at 18:00 except August
- Every business day at 9:00 and weekends at 10:00
- Chaque minute de 11h à 12h en semaine, et chaque minute de 12h à 13h le weekend

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

- **Name**: optional display name for the remote schedule
- **Schedule Text**: natural-language schedule text
- **Timezone**: IANA timezone, for example `Europe/Paris`
- **On Deactivate**: pause or delete the remote schedule when the workflow is unpublished

Example:

```text
Every minute
```

Complex example:

```text
Every second Tuesday at 18:00 except August
```

French example:

```text
Chaque minute de 11h à 12h en semaine, et chaque minute de 12h à 13h le weekend
```

## Activation Behavior

When the workflow is published, the node creates or resumes a persistent schedule in [rrule.net](https://rrule.net).

The remote schedule points to the workflow's production n8n webhook URL. If you are testing locally, make sure n8n is reachable from the internet through a tunnel and that `WEBHOOK_URL` is set to the public tunnel URL.

When the workflow is unpublished, the node pauses the remote schedule by default. You can choose to delete it instead.

If the stored remote schedule was deleted manually, the node recreates it on the next publish.

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
  "input_type": "natural",
  "input_value": "Chaque minute",
  "raw_payload": {}
}
```

## Quotas And Plans

Persistent schedules run on [rrule.net](https://rrule.net). API key, quota, and subscription errors are returned by the rrule.net API and shown in n8n when the workflow is published.

Manage your account and API keys from:

https://rrule.net/dashboard
