# Changelog

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
