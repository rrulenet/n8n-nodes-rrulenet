const maintenanceEvent = {
	kind: 'event-set',
	id: 'inline.maintenance.2026-09-15',
	version: 'user-snapshot-1',
	source: 'inline',
	timezone: 'UTC',
	members: [
		{
			kind: 'interval',
			id: 'maintenance-window',
			label: 'September maintenance window',
			start: '2026-09-15T02:00:00Z',
			end: '2026-09-15T04:00:00Z',
		},
	],
};

const progressRecurrence = {
	temporalVersion: 2,
	kind: 'input',
	start: '2026-09-15T02:00:00+00:00[UTC]',
	tzid: 'UTC',
	include: [
		{
			rule: {
				freq: 'MINUTELY',
				start: '2026-09-15T02:00:00Z',
				tzid: 'UTC',
				interval: 10,
				count: 13,
			},
		},
	],
	exclude: [],
};

function eventSchedule(timezone, transform, recurrence) {
	return {
		kind: 'event-schedule',
		timezone,
		events: maintenanceEvent,
		...(recurrence ? { recurrence } : {}),
		transform,
	};
}

const audiences = [
	{
		id: 'paris',
		label: 'Paris',
		timezone: 'Europe/Paris',
		locale: 'fr-FR',
		segmentId: 'replace-with-brevo-paris-segment-id',
	},
	{
		id: 'new-york',
		label: 'New York',
		timezone: 'America/New_York',
		locale: 'en-US',
		segmentId: 'replace-with-brevo-new-york-segment-id',
	},
	{
		id: 'tokyo',
		label: 'Tokyo',
		timezone: 'Asia/Tokyo',
		locale: 'ja-JP',
		segmentId: 'replace-with-brevo-tokyo-segment-id',
	},
	{
		id: 'perth',
		label: 'Perth',
		timezone: 'Australia/Perth',
		locale: 'en-AU',
		segmentId: 'replace-with-brevo-perth-segment-id',
	},
];

const customerReminderTargets = audiences.flatMap((audience) =>
	[
		{ id: '7d', before: { days: 7 } },
		{ id: '1d', before: { days: 1 } },
	].map((reminder) => ({
		id: `customer-reminder-${reminder.id}-${audience.id}`,
		label: `${audience.label} customer reminder ${reminder.id}`,
		timezone: audience.timezone,
		event_schedule: eventSchedule(audience.timezone, {
			kind: 'event-relative',
			triggers: [{ before: reminder.before, time: '09:00' }],
		}),
		metadata: {
			phase: `customer-reminder-${reminder.id}`,
			audience: 'customers',
			region: audience.id,
			locale: audience.locale,
			segmentId: audience.segmentId,
			eventId: maintenanceEvent.id,
		},
	})),
);

const operationalTargets = [
	{
		id: 'ops-warning-2h',
		label: 'Operations warning two hours before maintenance',
		timezone: 'UTC',
		event_schedule: eventSchedule('UTC', {
			kind: 'event-relative',
			triggers: [{ before: { hours: 2 } }],
		}),
		metadata: {
			phase: 'ops-warning-2h',
			audience: 'operations',
			eventId: maintenanceEvent.id,
		},
	},
	{
		id: 'ops-warning-15m',
		label: 'Final operations warning before maintenance',
		timezone: 'UTC',
		event_schedule: eventSchedule('UTC', {
			kind: 'event-relative',
			triggers: [{ before: { minutes: 15 } }],
		}),
		metadata: {
			phase: 'ops-warning-15m',
			audience: 'operations',
			eventId: maintenanceEvent.id,
		},
	},
	{
		id: 'maintenance-start',
		label: 'Maintenance start',
		timezone: 'UTC',
		event_schedule: eventSchedule('UTC', {
			kind: 'event-relative',
			triggers: [{ at: 'start' }],
		}),
		metadata: {
			phase: 'maintenance-start',
			audience: 'operations',
			eventId: maintenanceEvent.id,
		},
	},
	{
		id: 'maintenance-progress',
		label: 'Maintenance progress check',
		timezone: 'UTC',
		event_schedule: eventSchedule('UTC', { kind: 'during' }, progressRecurrence),
		metadata: {
			phase: 'maintenance-progress',
			audience: 'operations',
			eventId: maintenanceEvent.id,
		},
	},
	{
		id: 'maintenance-end',
		label: 'Maintenance end',
		timezone: 'UTC',
		event_schedule: eventSchedule('UTC', {
			kind: 'event-relative',
			triggers: [{ at: 'end' }],
		}),
		metadata: {
			phase: 'maintenance-end',
			audience: 'customers-and-operations',
			eventId: maintenanceEvent.id,
		},
	},
];

const maintenanceWindowEventWindow = {
	eventId: 'maintenance-window',
	eventLabel: 'September maintenance window',
	windowStart: '2026-09-15T02:00:00Z',
	windowEnd: '2026-09-15T04:00:00Z',
	audiences: {
		audience: audiences.map(({ id, label, timezone, locale, segmentId }) => ({
			id,
			label: `${label} customers`,
			timezone,
			metadata: {
				locale,
				segmentId,
			},
		})),
	},
	customerReminders: {
		reminder: [
			{
				id: '7d',
				label: 'seven days before',
				daysBefore: 7,
				localTime: '09:00',
			},
			{
				id: '1d',
				label: 'one day before',
				daysBefore: 1,
				localTime: '09:00',
			},
		],
	},
	operationalWarnings: {
		warning: [
			{
				id: '2h',
				label: 'Operations warning two hours before maintenance',
				offsetValue: 2,
				offsetUnit: 'hours',
			},
			{
				id: '15m',
				label: 'Final operations warning before maintenance',
				offsetValue: 15,
				offsetUnit: 'minutes',
			},
		],
	},
	includeStartTarget: true,
	includeProgressTarget: true,
	progressIntervalMinutes: 10,
	includeEndTarget: true,
};

module.exports = {
	maintenanceWindowEventWindow,
	maintenanceWindowTargets: [...customerReminderTargets, ...operationalTargets],
};
