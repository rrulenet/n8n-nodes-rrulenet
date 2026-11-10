import { createHash } from 'node:crypto';

export interface EventWindowTarget extends Record<string, unknown> {
	id: string;
	label?: string;
	timezone: string;
	event_schedule: Record<string, unknown>;
	metadata: Record<string, unknown>;
}

export interface EventWindowDefinitionOptions {
	eventId: unknown;
	eventLabel?: unknown;
	windowStart: unknown;
	windowEnd: unknown;
	audiences?: unknown;
	customerReminders?: unknown;
	operationalWarnings?: unknown;
	includeStartTarget?: unknown;
	includeProgressTarget?: unknown;
	progressIntervalMinutes?: unknown;
	includeEndTarget?: unknown;
}

interface Audience {
	id: string;
	label: string;
	timezone: string;
	metadata: Record<string, unknown>;
}

interface CustomerReminder {
	id: string;
	label: string;
	daysBefore: number;
	localTime: string;
	metadata: Record<string, unknown>;
}

interface OperationalWarning {
	id: string;
	label: string;
	offsetValue: number;
	offsetUnit: 'hours' | 'minutes';
	metadata: Record<string, unknown>;
}

const EVENT_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;
const TARGET_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const LOCAL_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const INSTANT_PATTERN = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.(\d+))?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/i;

export class EventWindowValidationError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
	if (typeof value !== 'string' || !value.trim()) {
		throw new EventWindowValidationError(`${field} must be a non-empty string.`);
	}

	return value.trim();
}

function optionalString(value: unknown, fallback: string): string {
	return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function isValidTimezone(value: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: value });
		return true;
	} catch {
		return false;
	}
}

function parseInstant(value: unknown, field: string): string {
	const input = requiredString(value, field);
	const match = INSTANT_PATTERN.exec(input);
	if (!match) {
		throw new EventWindowValidationError(
			`${field} must be an ISO date and time with Z or an explicit UTC offset.`,
		);
	}
	if (match[2] && /[1-9]/.test(match[2])) {
		throw new EventWindowValidationError(`${field} must use whole-second precision.`);
	}
	const date = Date.parse(`${match[1]}T00:00:00Z`);
	const timestamp = Date.parse(input);
	if (
		!Number.isFinite(date) ||
		!Number.isFinite(timestamp) ||
		new Date(date).toISOString().slice(0, 10) !== match[1]
	) {
		throw new EventWindowValidationError(`${field} must be a valid date and time.`);
	}

	return new Date(timestamp).toISOString();
}

function parseInteger(
	value: unknown,
	field: string,
	minimum: number,
	maximum: number,
): number {
	const parsed = typeof value === 'number' ? value : Number(value);
	if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
		throw new EventWindowValidationError(
			`${field} must be an integer between ${minimum} and ${maximum}.`,
		);
	}

	return parsed;
}

function parseMetadata(value: unknown, field: string): Record<string, unknown> {
	if (value === undefined || value === null || value === '') {
		return {};
	}

	let parsed = value;
	if (typeof value === 'string') {
		let parseFailed = false;
		try {
			parsed = JSON.parse(value);
		} catch {
			parseFailed = true;
		}
		if (parseFailed) {
			throw new EventWindowValidationError(`${field} must contain valid JSON.`);
		}
	}
	if (!isRecord(parsed)) {
		throw new EventWindowValidationError(`${field} must contain a JSON object.`);
	}

	return parsed;
}

function collectionItems(value: unknown, key: string, field: string): unknown[] {
	if (value === undefined || value === null) {
		return [];
	}
	if (Array.isArray(value)) {
		return value;
	}
	if (isRecord(value)) {
		if (value[key] === undefined) {
			return [];
		}
		if (Array.isArray(value[key])) {
			return value[key];
		}
	}

	throw new EventWindowValidationError(`${field} has an invalid collection value.`);
}

function validateGeneratedId(value: string, field: string): string {
	if (!TARGET_ID_PATTERN.test(value)) {
		throw new EventWindowValidationError(
			`${field} may only contain letters, numbers, underscores, and dashes.`,
		);
	}

	return value;
}

function parseAudiences(value: unknown): Audience[] {
	return collectionItems(value, 'audience', 'Audiences').map((item, index) => {
		if (!isRecord(item)) {
			throw new EventWindowValidationError(`Audience at index ${index} must be an object.`);
		}

		const id = validateGeneratedId(
			requiredString(item.id, `Audience at index ${index} ID`),
			`Audience ID "${String(item.id)}"`,
		);
		const timezone = requiredString(
			item.timezone,
			`Audience "${id}" timezone`,
		);
		if (!isValidTimezone(timezone)) {
			throw new EventWindowValidationError(
				`Audience "${id}" timezone "${timezone}" is not a valid IANA timezone.`,
			);
		}

		return {
			id,
			label: optionalString(item.label, id),
			timezone,
			metadata: parseMetadata(item.metadata, `Audience "${id}" metadata`),
		};
	});
}

function parseCustomerReminders(value: unknown): CustomerReminder[] {
	return collectionItems(value, 'reminder', 'Customer Reminders').map((item, index) => {
		if (!isRecord(item)) {
			throw new EventWindowValidationError(
				`Customer reminder at index ${index} must be an object.`,
			);
		}

		const id = validateGeneratedId(
			requiredString(item.id, `Customer reminder at index ${index} ID`),
			`Customer reminder ID "${String(item.id)}"`,
		);
		const localTime = requiredString(
			item.localTime,
			`Customer reminder "${id}" local time`,
		);
		if (!LOCAL_TIME_PATTERN.test(localTime)) {
			throw new EventWindowValidationError(
				`Customer reminder "${id}" local time must use HH:mm in 24-hour format.`,
			);
		}

		return {
			id,
			label: optionalString(item.label, id),
			daysBefore: parseInteger(
				item.daysBefore,
				`Customer reminder "${id}" days before`,
				0,
				3650,
			),
			localTime,
			metadata: parseMetadata(item.metadata, `Customer reminder "${id}" metadata`),
		};
	});
}

function parseOperationalWarnings(value: unknown): OperationalWarning[] {
	return collectionItems(value, 'warning', 'Operational Warnings').map((item, index) => {
		if (!isRecord(item)) {
			throw new EventWindowValidationError(
				`Operational warning at index ${index} must be an object.`,
			);
		}

		const id = validateGeneratedId(
			requiredString(item.id, `Operational warning at index ${index} ID`),
			`Operational warning ID "${String(item.id)}"`,
		);
		const offsetUnit = item.offsetUnit;
		if (offsetUnit !== 'hours' && offsetUnit !== 'minutes') {
			throw new EventWindowValidationError(
				`Operational warning "${id}" unit must be hours or minutes.`,
			);
		}

		return {
			id,
			label: optionalString(item.label, id),
			offsetValue: parseInteger(
				item.offsetValue,
				`Operational warning "${id}" offset`,
				1,
				525_600,
			),
			offsetUnit,
			metadata: parseMetadata(item.metadata, `Operational warning "${id}" metadata`),
		};
	});
}

function eventSchedule(
	events: Record<string, unknown>,
	timezone: string,
	transform: Record<string, unknown>,
	recurrence?: Record<string, unknown>,
): Record<string, unknown> {
	return {
		kind: 'event-schedule',
		timezone,
		events,
		...(recurrence ? { recurrence } : {}),
		transform,
	};
}

function utcZonedDateTime(instant: string): string {
	return instant.replace(/Z$/, '+00:00[UTC]');
}

function progressRecurrence(start: string, interval: number): Record<string, unknown> {
	return {
		temporalVersion: 2,
		kind: 'input',
		start: utcZonedDateTime(start),
		tzid: 'UTC',
		include: [
			{
				rule: {
					freq: 'MINUTELY',
					start,
					tzid: 'UTC',
					interval,
				},
			},
		],
		exclude: [],
	};
}

export function buildEventWindowTargets(
	options: EventWindowDefinitionOptions,
): EventWindowTarget[] {
	const eventId = requiredString(options.eventId, 'Event ID');
	if (!EVENT_ID_PATTERN.test(eventId)) {
		throw new EventWindowValidationError(
			'Event ID may only contain letters, numbers, dots, underscores, and dashes.',
		);
	}

	const start = parseInstant(options.windowStart, 'Window Start');
	const end = parseInstant(options.windowEnd, 'Window End');
	if (Date.parse(end) <= Date.parse(start)) {
		throw new EventWindowValidationError('Window End must be later than Window Start.');
	}

	const eventLabel = optionalString(options.eventLabel, eventId);
	const versionInput = JSON.stringify({ eventId, eventLabel, start, end });
	const version = `n8n-${createHash('sha256').update(versionInput).digest('hex').slice(0, 12)}`;
	const events = {
		kind: 'event-set',
		id: `inline.${eventId}`,
		version,
		source: 'inline',
		timezone: 'UTC',
		members: [
			{
				kind: 'interval',
				id: eventId,
				label: eventLabel,
				start,
				end,
			},
		],
	};
	const audiences = parseAudiences(options.audiences);
	const reminders = parseCustomerReminders(options.customerReminders);
	const warnings = parseOperationalWarnings(options.operationalWarnings);
	if (reminders.length > 0 && audiences.length === 0) {
		throw new EventWindowValidationError(
			'Add at least one audience when customer reminders are configured.',
		);
	}

	const targets: EventWindowTarget[] = [];
	for (const audience of audiences) {
		for (const reminder of reminders) {
			const phase = `customer-reminder-${reminder.id}`;
			targets.push({
				id: `${phase}-${audience.id}`,
				label: `${audience.label} customer reminder ${reminder.label}`,
				timezone: audience.timezone,
				event_schedule: eventSchedule(events, audience.timezone, {
					kind: 'event-relative',
					triggers: [
						{
							before: { days: reminder.daysBefore },
							time: reminder.localTime,
						},
					],
				}),
				metadata: {
					...audience.metadata,
					...reminder.metadata,
					phase,
					audience: 'customers',
					region: audience.id,
					eventId: events.id,
				},
			});
		}
	}

	for (const warning of warnings) {
		const phase = `ops-warning-${warning.id}`;
		targets.push({
			id: phase,
			label: optionalString(warning.label, phase),
			timezone: 'UTC',
			event_schedule: eventSchedule(events, 'UTC', {
				kind: 'event-relative',
				triggers: [
					{
						before: {
							[warning.offsetUnit]: warning.offsetValue,
						},
					},
				],
			}),
			metadata: {
				...warning.metadata,
				phase,
				audience: 'operations',
				eventId: events.id,
			},
		});
	}

	if (options.includeStartTarget !== false) {
		targets.push({
			id: 'maintenance-start',
			label: 'Maintenance start',
			timezone: 'UTC',
			event_schedule: eventSchedule(events, 'UTC', {
				kind: 'event-relative',
				triggers: [{ at: 'start' }],
			}),
			metadata: {
				phase: 'maintenance-start',
				audience: 'operations',
				eventId: events.id,
			},
		});
	}

	if (options.includeProgressTarget !== false) {
		const interval = parseInteger(
			options.progressIntervalMinutes ?? 10,
			'Progress Interval',
			1,
			10_080,
		);
		targets.push({
			id: 'maintenance-progress',
			label: 'Maintenance progress check',
			timezone: 'UTC',
			event_schedule: eventSchedule(
				events,
				'UTC',
				{ kind: 'during' },
				progressRecurrence(start, interval),
			),
			metadata: {
				phase: 'maintenance-progress',
				audience: 'operations',
				eventId: events.id,
			},
		});
	}

	if (options.includeEndTarget !== false) {
		targets.push({
			id: 'maintenance-end',
			label: 'Planned maintenance end',
			timezone: 'UTC',
			event_schedule: eventSchedule(events, 'UTC', {
				kind: 'event-relative',
				triggers: [{ at: 'end' }],
			}),
			metadata: {
				phase: 'maintenance-end',
				audience: 'customers-and-operations',
				eventId: events.id,
			},
		});
	}

	if (targets.length === 0) {
		throw new EventWindowValidationError(
			'Event Window configuration must generate at least one target.',
		);
	}

	return targets;
}
