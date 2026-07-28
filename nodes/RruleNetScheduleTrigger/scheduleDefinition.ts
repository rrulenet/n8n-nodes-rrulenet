import { createHash } from 'node:crypto';
import {
	buildEventWindowTargets,
	EventWindowValidationError,
	type EventWindowDefinitionOptions,
} from './eventWindow';

export type ScheduleDefinitionMode = 'eventWindow' | 'natural' | 'targets';

export interface ExplicitScheduleTarget extends Record<string, unknown> {
	id: string;
	label?: string;
	timezone: string;
	recurrence?: Record<string, unknown>;
	event_schedule?: Record<string, unknown>;
	metadata?: Record<string, unknown>;
}

export interface ScheduleDefinition {
	mode: ScheduleDefinitionMode;
	input?: string;
	timezone: string;
	targets?: ExplicitScheduleTarget[];
	fingerprint: string;
}

interface BuildScheduleDefinitionOptions {
	mode: ScheduleDefinitionMode;
	input?: string;
	timezone: string;
	targetsJson?: unknown;
	eventWindow?: EventWindowDefinitionOptions;
}

const TARGET_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const TARGET_KEYS = new Set([
	'id',
	'label',
	'timezone',
	'recurrence',
	'event_schedule',
	'metadata',
]);

export class ScheduleDefinitionValidationError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidTimezone(value: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: value });
		return true;
	} catch {
		return false;
	}
}

function parseJson(value: unknown): unknown {
	if (typeof value !== 'string') {
		return value;
	}

	const trimmed = value.trim();
	if (!trimmed) {
		throw new ScheduleDefinitionValidationError('Targets JSON must not be empty.');
	}

	let parseError: string;
	try {
		return JSON.parse(trimmed);
	} catch (error) {
		parseError = error instanceof Error ? error.message : 'Invalid JSON.';
	}

	throw new ScheduleDefinitionValidationError(`Targets JSON is invalid: ${parseError}`);
}

function getRequiredString(
	target: Record<string, unknown>,
	key: 'id' | 'timezone',
	index: number,
): string {
	const value = target[key];
	if (typeof value !== 'string' || !value.trim()) {
		throw new ScheduleDefinitionValidationError(
			`Target at index ${index} must provide a non-empty ${key}.`,
		);
	}

	return value.trim();
}

function normalizeTarget(value: unknown, index: number): ExplicitScheduleTarget {
	if (!isRecord(value)) {
		throw new ScheduleDefinitionValidationError(`Target at index ${index} must be a JSON object.`);
	}

	const unknownKey = Object.keys(value).find((key) => !TARGET_KEYS.has(key));
	if (unknownKey) {
		throw new ScheduleDefinitionValidationError(
			`Target at index ${index} contains unsupported field "${unknownKey}".`,
		);
	}

	const id = getRequiredString(value, 'id', index);
	if (id.length > 80) {
		throw new ScheduleDefinitionValidationError(
			`Target id "${id}" must contain at most 80 characters.`,
		);
	}
	if (id === 'default') {
		throw new ScheduleDefinitionValidationError('Target id "default" is reserved by rrule.net.');
	}
	if (!TARGET_ID_PATTERN.test(id)) {
		throw new ScheduleDefinitionValidationError(
			`Target id "${id}" may only contain letters, numbers, underscores, and dashes.`,
		);
	}

	const timezone = getRequiredString(value, 'timezone', index);
	if (!isValidTimezone(timezone)) {
		throw new ScheduleDefinitionValidationError(
			`Target "${id}" timezone "${timezone}" is not a valid IANA timezone.`,
		);
	}
	const recurrence = value.recurrence;
	const eventSchedule = value.event_schedule;
	const sourceCount = Number(recurrence !== undefined) + Number(eventSchedule !== undefined);
	if (sourceCount !== 1) {
		throw new ScheduleDefinitionValidationError(
			`Target "${id}" must provide exactly one of recurrence or event_schedule.`,
		);
	}
	if (recurrence !== undefined && !isRecord(recurrence)) {
		throw new ScheduleDefinitionValidationError(`Target "${id}" recurrence must be a JSON object.`);
	}
	if (eventSchedule !== undefined && !isRecord(eventSchedule)) {
		throw new ScheduleDefinitionValidationError(
			`Target "${id}" event_schedule must be a JSON object.`,
		);
	}

	const label = value.label;
	if (label !== undefined && (typeof label !== 'string' || !label.trim())) {
		throw new ScheduleDefinitionValidationError(
			`Target "${id}" label must be a non-empty string when provided.`,
		);
	}
	if (typeof label === 'string' && label.trim().length > 160) {
		throw new ScheduleDefinitionValidationError(
			`Target "${id}" label must contain at most 160 characters.`,
		);
	}

	const metadata = value.metadata;
	if (metadata !== undefined && !isRecord(metadata)) {
		throw new ScheduleDefinitionValidationError(`Target "${id}" metadata must be a JSON object.`);
	}

	return {
		id,
		...(typeof label === 'string' ? { label: label.trim() } : {}),
		timezone,
		...(recurrence !== undefined ? { recurrence } : {}),
		...(eventSchedule !== undefined ? { event_schedule: eventSchedule } : {}),
		...(metadata !== undefined ? { metadata } : {}),
	};
}

export function parseExplicitTargets(value: unknown): ExplicitScheduleTarget[] {
	const parsed = parseJson(value);
	if (!Array.isArray(parsed)) {
		throw new ScheduleDefinitionValidationError('Targets JSON must contain a JSON array.');
	}
	if (parsed.length === 0) {
		throw new ScheduleDefinitionValidationError('Targets JSON must contain at least one target.');
	}
	if (parsed.length > 50) {
		throw new ScheduleDefinitionValidationError('Targets JSON may contain at most 50 targets.');
	}

	const targets = parsed.map(normalizeTarget);
	const ids = targets.map((target) => target.id);
	if (new Set(ids).size !== ids.length) {
		throw new ScheduleDefinitionValidationError('Target ids must be unique.');
	}

	return targets;
}

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(canonicalize);
	}
	if (!isRecord(value)) {
		return value;
	}

	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, canonicalize(value[key])]),
	);
}

function fingerprintDefinition(
	definition: Omit<ScheduleDefinition, 'fingerprint'>,
): string {
	const targets = definition.targets
		? [...definition.targets].sort((left, right) =>
				left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
			)
		: undefined;
	const serialized = JSON.stringify(
		canonicalize({
			mode: definition.mode,
			input: definition.input ?? null,
			timezone: definition.timezone,
			targets: targets ?? null,
		}),
	);

	return createHash('sha256').update(serialized).digest('hex');
}

export function buildScheduleDefinition(
	options: BuildScheduleDefinitionOptions,
): ScheduleDefinition {
	const timezone = options.timezone.trim();
	if (!timezone) {
		throw new ScheduleDefinitionValidationError('Timezone must not be empty.');
	}
	if (!isValidTimezone(timezone)) {
		throw new ScheduleDefinitionValidationError(
			`Timezone "${timezone}" is not a valid IANA timezone.`,
		);
	}

	if (options.mode === 'natural') {
		const input = options.input ?? '';
		if (!input.trim()) {
			throw new ScheduleDefinitionValidationError('Schedule Text must not be empty.');
		}

		const definition = {
			mode: options.mode,
			input,
			timezone,
		};

		return {
			...definition,
			fingerprint: fingerprintDefinition(definition),
		};
	}

	const input = options.input?.trim() || undefined;
	let targets: ExplicitScheduleTarget[] | undefined;
	if (options.mode === 'eventWindow') {
		if (!options.eventWindow) {
			throw new ScheduleDefinitionValidationError(
				'Event Window configuration is missing.',
			);
		}
		let eventWindowError: unknown;
		try {
			targets = parseExplicitTargets(buildEventWindowTargets(options.eventWindow));
		} catch (error) {
			eventWindowError = error;
		}
		if (eventWindowError instanceof EventWindowValidationError) {
			throw new ScheduleDefinitionValidationError(eventWindowError.message);
		}
		if (eventWindowError) {
			throw new ScheduleDefinitionValidationError(
				'Unable to build the Event Window target definition.',
			);
		}
	} else {
		targets = parseExplicitTargets(options.targetsJson);
	}
	if (!targets) {
		throw new ScheduleDefinitionValidationError(
			'Unable to build the target definition.',
		);
	}
	const definition = {
		mode: options.mode,
		...(input ? { input } : {}),
		timezone,
		targets,
	};

	return {
		...definition,
		fingerprint: fingerprintDefinition(definition),
	};
}

export function getExpectedScheduleName(name: string, definition: ScheduleDefinition): string {
	return name.trim() || definition.input || 'Targeted schedule';
}

export function isStoredDefinitionEqual(
	staticData: Record<string, unknown>,
	definition: ScheduleDefinition,
): boolean {
	const storedFingerprint =
		typeof staticData.scheduleDefinitionFingerprint === 'string'
			? staticData.scheduleDefinitionFingerprint
			: undefined;
	if (storedFingerprint) {
		return (
			staticData.scheduleDefinitionMode === definition.mode &&
			storedFingerprint === definition.fingerprint
		);
	}

	return (
		definition.mode === 'natural' &&
		staticData.scheduleInput === definition.input &&
		staticData.timezone === definition.timezone
	);
}

export function buildCreateScheduleBody(
	definition: ScheduleDefinition,
	name: string,
	webhookUrl: string,
): Record<string, unknown> {
	return {
		...(name.trim() ? { name: name.trim() } : {}),
		...(definition.input ? { input: definition.input } : {}),
		timezone: definition.timezone,
		...(definition.targets ? { targets: definition.targets } : {}),
		webhook: {
			url: webhookUrl,
		},
	};
}
