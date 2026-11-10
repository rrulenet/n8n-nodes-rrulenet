# n8n workflow templates

These workflow exports demonstrate complete automations built around
`@rrulenet/n8n-nodes-rrulenet`.

They are source artifacts for published and future n8n library templates, as
well as local testing. They are intentionally excluded from the published npm
package by the package `files` allowlist.

## Available templates

- [Coffee newsletter at 09:00 local time](./coffee-newsletter/README.md)
  — [published n8n template](https://n8n.io/workflows/17507-send-localized-9am-rss-coffee-newsletters-with-rrulenet-and-brevo/),
  compatible with node 0.1.4 and later.

The maintenance-window workflow is not included yet. Its Event Window node
mode must be released before workflow implementation resumes.

Never commit credentials, real recipients, private feed URLs, production
webhook URLs, or n8n instance identifiers to these exports.
