# Changelog

## 0.2.1

- Fix the node identifier in n8n Codex metadata for Creator Portal verification.

## 0.2.0

- Update the release tooling to Node.js 24.22.1, `@n8n/node-cli` 0.55.6,
  and `release-it` 21.1.0.
- Keep the Schedule Trigger out of the AI tool picker.
- Improve Schedule Trigger discovery in n8n for cron, regional schedules,
  daylight saving time, and maintenance windows.
- Emit `temporalVersion: 2` on generated progress recurrence JSON for the hosted
  0.2.x temporal contract, verified against the published 0.2.2 event engine.
- Reject ambiguous event bounds, invalid calendar dates, and nonzero fractional
  seconds before replacing an existing remote schedule.
- Add a structured Event Window mode that dynamically generates regional
  reminders, operational warnings, and enabled lifecycle targets from editable
  business parameters.
- Add an advanced Canonical Targets JSON import mode with canonical
  `recurrence` or `event_schedule` sources.
- Fingerprint schedule definitions so unchanged targets resume without remote
  recreation.
- Replace changed immutable target definitions without leaving duplicate
  schedules, while preserving existing natural-language workflows.
- Align the visible workflow lifecycle terminology with n8n's Publish and
  Unpublish actions while preserving existing workflow parameters.
- Add schedule-definition and lifecycle regression tests to CI.
- Verify all 13 maintenance target sequences, spring and autumn clock changes,
  replacement failures, and unchanged Coffee Newsletter compatibility.

## 0.1.4

- Add normalized target fields for rrule.net schedule targets: `target_id`, `target_label`, `target_timezone`, and `target_metadata`.
- Read `x-rrule-target-id` as a fallback when target-aware webhook payloads provide the target id in headers.
- Document target-aware schedule routing for downstream n8n workflow actions.
- Preserve actionable rrule.net API errors when schedule updates, pauses, or deletions fail.
- Update release tooling to `@n8n/node-cli` 0.38.8 and `release-it` 20.2.1.

## 0.1.3

- Add webhook troubleshooting guidance for n8n production webhooks, local tunnels, and common HTTP 404 delivery failures.
- Add an in-node webhook delivery notice to help users understand production webhook requirements before activation.
- Clarify schedule, timezone, and deactivate behavior descriptions.

## 0.1.2

- Add public author contact metadata required by n8n community node verification.

## 0.1.1

- Update README examples to keep npm package documentation fully in English for n8n verification.

## 0.1.0

- Add `rrule.net Schedule Trigger` node.
- Add `rrule.net API` credentials.
- Create, resume, pause, and delete remote rrule.net schedules from the n8n workflow lifecycle.
- Normalize rrule.net webhook payloads for downstream n8n nodes.
- Surface rrule.net API errors during workflow publication.
