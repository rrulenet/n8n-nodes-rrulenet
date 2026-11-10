const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
	buildCreateScheduleBody,
	buildScheduleDefinition,
	isStoredDefinitionEqual,
	parseExplicitTargets,
} = require('../dist/nodes/RruleNetScheduleTrigger/scheduleDefinition.js');
const {
	RruleNetScheduleTrigger,
} = require('../dist/nodes/RruleNetScheduleTrigger/RruleNetScheduleTrigger.node.js');
const {
	buildEventWindowTargets,
} = require('../dist/nodes/RruleNetScheduleTrigger/eventWindow.js');
const {
	maintenanceWindowEventWindow,
	maintenanceWindowTargets,
} = require('./fixtures/maintenanceWindowTargets.js');

function recurrenceTarget(id, timezone = 'UTC') {
	return {
		id,
		timezone,
		recurrence: {
			kind: 'rule',
			frequency: 'DAILY',
		},
		metadata: {
			phase: id,
		},
	};
}

function eventScheduleTarget(id, timezone = 'UTC') {
	return {
		id,
		label: id,
		timezone,
		event_schedule: {
			kind: 'event-schedule',
			timezone,
			events: {
				kind: 'event-set',
				id: 'inline.maintenance',
				version: 'user-snapshot-1',
				members: [
					{
						kind: 'interval',
						id: 'maintenance-window',
						start: '2026-09-15T02:00:00Z',
						end: '2026-09-15T04:00:00Z',
					},
				],
			},
			transform: {
				kind: 'event-relative',
				triggers: [{ at: 'start' }],
			},
		},
	};
}

function createHookContext(parameters, staticData = {}, responseScheduleId = 'schedule-new', responses = []) {
	const requests = [];
	const context = {
		getNodeWebhookUrl: () => 'https://n8n.example.com/webhook/rrulenet',
		getWorkflowStaticData: () => staticData,
		getNodeParameter: (name, fallback) =>
			Object.prototype.hasOwnProperty.call(parameters, name) ? parameters[name] : fallback,
		getNode: () => ({
			id: 'node-1',
			name: 'rrule.net Schedule Trigger',
			type: '@rrulenet/n8n-nodes-rrulenet.rruleNetScheduleTrigger',
			typeVersion: 1,
			position: [0, 0],
			parameters,
		}),
		getCredentials: async () => ({
			apiBaseUrl: 'https://api.rrule.net',
		}),
		helpers: {
			httpRequestWithAuthentication: async (_credentialType, options) => {
				requests.push(options);
				if (responses[requests.length - 1]) {
					return responses[requests.length - 1];
				}
				const isScheduleResponse =
					options.url === '/v1/schedules' || options.url.endsWith('/resume');
				return {
					statusCode: 200,
					body: isScheduleResponse
						? {
								id:
									options.url === '/v1/schedules'
										? responseScheduleId
										: options.url.split('/')[3],
								status: 'active',
							}
						: {},
				};
			},
		},
	};

	return { context, requests, staticData };
}

describe('event-window target generation', () => {
	it('normalizes explicit offsets and accepts zero fractional seconds', () => {
		const targets = buildEventWindowTargets({
			...maintenanceWindowEventWindow,
			windowStart: '2026-09-15T04:00:00.000+02:00',
			windowEnd: '2026-09-15T06:00:00+02:00',
		});
		assert.deepEqual(targets, buildEventWindowTargets(maintenanceWindowEventWindow));
	});

	it('rejects ambiguous dates, invalid calendar dates and fractional instants', () => {
		for (const field of ['windowStart', 'windowEnd']) {
			for (const value of [
				'2026-09-15', '2026-09-15T02:00:00', '2026-02-30T02:00:00Z',
				'2026-09-15T02:00:00.001Z', '2026-09-15T02:00:00.000000001Z',
			]) {
				assert.throws(() => buildEventWindowTargets({
					...maintenanceWindowEventWindow,
					[field]: value,
				}), /ISO date and time|valid date and time|whole-second precision/);
			}
		}
	});

	it('generates the complete reference definition dynamically', () => {
		const targets = buildEventWindowTargets(maintenanceWindowEventWindow);

		assert.equal(targets.length, 13);
		assert.equal(new Set(targets.map(({ id }) => id)).size, 13);
		assert.equal(
			targets.filter(({ id }) => id.startsWith('customer-reminder-')).length,
			8,
		);
		assert.deepEqual(
			targets
				.filter(({ id }) => id.startsWith('ops-warning-'))
				.map(({ id }) => id),
			['ops-warning-2h', 'ops-warning-15m'],
		);

		const parisReminder = targets.find(
			({ id }) => id === 'customer-reminder-7d-paris',
		);
		assert.equal(parisReminder.timezone, 'Europe/Paris');
		assert.deepEqual(
			parisReminder.event_schedule.transform.triggers,
			[{ before: { days: 7 }, time: '09:00' }],
		);
		assert.equal(parisReminder.metadata.locale, 'fr-FR');

		const progress = targets.find(({ id }) => id === 'maintenance-progress');
		assert.equal(progress.event_schedule.transform.kind, 'during');
		assert.equal(progress.event_schedule.recurrence.temporalVersion, 2);
		assert.equal(progress.event_schedule.recurrence.include[0].rule.interval, 10);
		assert.equal(progress.event_schedule.recurrence.include[0].rule.count, undefined);
	});

	it('uses the configured audiences, reminders, warnings, and enabled phases', () => {
		const twoAudiencesOneReminder = buildEventWindowTargets({
			...maintenanceWindowEventWindow,
			audiences: {
				audience: maintenanceWindowEventWindow.audiences.audience.slice(0, 2),
			},
			customerReminders: {
				reminder: maintenanceWindowEventWindow.customerReminders.reminder.slice(0, 1),
			},
			operationalWarnings: {},
			includeStartTarget: true,
			includeProgressTarget: false,
			includeEndTarget: true,
		});
		assert.equal(twoAudiencesOneReminder.length, 4);
		assert.deepEqual(
			twoAudiencesOneReminder.map(({ id }) => id),
			[
				'customer-reminder-7d-paris',
				'customer-reminder-7d-new-york',
				'maintenance-start',
				'maintenance-end',
			],
		);

		const warningOnly = buildEventWindowTargets({
			...maintenanceWindowEventWindow,
			audiences: {},
			customerReminders: {},
			operationalWarnings: {
				warning: maintenanceWindowEventWindow.operationalWarnings.warning.slice(0, 1),
			},
			includeStartTarget: false,
			includeProgressTarget: false,
			includeEndTarget: false,
		});
		assert.deepEqual(warningOnly.map(({ id }) => id), ['ops-warning-2h']);
	});

	it('rejects invalid or empty business configurations before activation', () => {
		assert.throws(
			() =>
				buildEventWindowTargets({
					...maintenanceWindowEventWindow,
					audiences: {},
				}),
			/Add at least one audience/,
		);
		assert.throws(
			() =>
				buildEventWindowTargets({
					...maintenanceWindowEventWindow,
					windowEnd: maintenanceWindowEventWindow.windowStart,
				}),
			/Window End must be later/,
		);
		assert.throws(
			() =>
				buildEventWindowTargets({
					...maintenanceWindowEventWindow,
					audiences: {},
					customerReminders: {},
					operationalWarnings: {},
					includeStartTarget: false,
					includeProgressTarget: false,
					includeEndTarget: false,
				}),
			/must generate at least one target/,
		);
	});

	it('fingerprints generated definitions independently of collection ordering', () => {
		const first = buildScheduleDefinition({
			mode: 'eventWindow',
			input: 'Coordinate maintenance',
			timezone: 'UTC',
			eventWindow: maintenanceWindowEventWindow,
		});
		const second = buildScheduleDefinition({
			mode: 'eventWindow',
			input: 'Coordinate maintenance',
			timezone: 'UTC',
			eventWindow: {
				...maintenanceWindowEventWindow,
				audiences: {
					audience: [...maintenanceWindowEventWindow.audiences.audience].reverse(),
				},
				customerReminders: {
					reminder: [
						...maintenanceWindowEventWindow.customerReminders.reminder,
					].reverse(),
				},
				operationalWarnings: {
					warning: [
						...maintenanceWindowEventWindow.operationalWarnings.warning,
					].reverse(),
				},
			},
		});

		assert.equal(first.targets.length, 13);
		assert.equal(first.fingerprint, second.fingerprint);
	});
});

describe('explicit schedule definitions', () => {
	it('parses deterministic recurrence and event-schedule targets', () => {
		const targets = parseExplicitTargets(
			JSON.stringify([
				recurrenceTarget('maintenance-progress'),
				eventScheduleTarget('maintenance-start'),
			]),
		);

		assert.equal(targets.length, 2);
		assert.equal(targets[0].id, 'maintenance-progress');
		assert.equal(targets[1].event_schedule.transform.kind, 'event-relative');
	});

	it('rejects ambiguous, duplicate, and natural-language target sources', () => {
		assert.throws(
			() =>
				parseExplicitTargets([
					{
						id: 'invalid',
						timezone: 'UTC',
						recurrence: {},
						event_schedule: {},
					},
				]),
			/exactly one of recurrence or event_schedule/,
		);
		assert.throws(
			() =>
				parseExplicitTargets([
					recurrenceTarget('duplicate'),
					eventScheduleTarget('duplicate'),
				]),
			/Target ids must be unique/,
		);
		assert.throws(
			() =>
				parseExplicitTargets([
					{
						id: 'natural-target',
						timezone: 'UTC',
						input: 'Every day at 9am',
					},
				]),
			/unsupported field "input"/,
		);
	});

	it('accepts the complete deterministic maintenance-window definition', () => {
		const targets = parseExplicitTargets(JSON.stringify(maintenanceWindowTargets));

		assert.equal(targets.length, 13);
		assert.equal(new Set(targets.map(({ id }) => id)).size, 13);
		assert.equal(
			targets.filter(({ id }) => id.startsWith('customer-reminder-')).length,
			8,
		);

		const progress = targets.find(({ id }) => id === 'maintenance-progress');
		assert.equal(progress.event_schedule.transform.kind, 'during');
		assert.equal(progress.event_schedule.recurrence.temporalVersion, 2);
		assert.equal(progress.event_schedule.recurrence.include[0].rule.interval, 10);
		assert.equal(progress.event_schedule.recurrence.include[0].rule.count, 13);
	});

	it('rejects target values that the hosted API would reject', () => {
		assert.throws(
			() =>
				parseExplicitTargets([
					recurrenceTarget('invalid-timezone', 'Europe/Nowhere'),
				]),
			/not a valid IANA timezone/,
		);
		assert.throws(
			() =>
				parseExplicitTargets([
					recurrenceTarget('a'.repeat(81)),
				]),
			/at most 80 characters/,
		);
		assert.throws(
			() =>
				parseExplicitTargets([
					{
						...recurrenceTarget('long-label'),
						label: 'a'.repeat(161),
					},
				]),
			/at most 160 characters/,
		);
	});

	it('uses a stable fingerprint across JSON key and target ordering', () => {
		const first = buildScheduleDefinition({
			mode: 'targets',
			input: 'Coordinate maintenance',
			timezone: 'UTC',
			targetsJson: [
				recurrenceTarget('progress'),
				eventScheduleTarget('start'),
			],
		});
		const second = buildScheduleDefinition({
			mode: 'targets',
			input: 'Coordinate maintenance',
			timezone: 'UTC',
			targetsJson: [
				{
					timezone: 'UTC',
					event_schedule: eventScheduleTarget('start').event_schedule,
					label: 'start',
					id: 'start',
				},
				{
					metadata: { phase: 'progress' },
					recurrence: {
						frequency: 'DAILY',
						kind: 'rule',
					},
					timezone: 'UTC',
					id: 'progress',
				},
			],
		});

		assert.equal(first.fingerprint, second.fingerprint);
		assert.equal(isStoredDefinitionEqual({
			scheduleDefinitionMode: 'targets',
			scheduleDefinitionFingerprint: first.fingerprint,
		}, second), true);
	});

	it('keeps the webhook and name outside user-provided target JSON', () => {
		const definition = buildScheduleDefinition({
			mode: 'targets',
			input: 'Coordinate maintenance',
			timezone: 'UTC',
			targetsJson: [eventScheduleTarget('maintenance-start')],
		});
		const body = buildCreateScheduleBody(
			definition,
			'September maintenance',
			'https://n8n.example.com/webhook/rrulenet',
		);

		assert.equal(body.name, 'September maintenance');
		assert.equal(body.input, 'Coordinate maintenance');
		assert.equal(body.timezone, 'UTC');
		assert.equal(body.targets.length, 1);
		assert.deepEqual(body.webhook, {
			url: 'https://n8n.example.com/webhook/rrulenet',
		});
	});
});

describe('schedule lifecycle compatibility', () => {
	it('resumes the published Coffee Newsletter without adding a schedule mode', async () => {
		const workflow = require('../templates/coffee-newsletter/coffee-newsletter.workflow.json');
		const { parameters } = workflow.nodes.find(({ type }) =>
			type === '@rrulenet/n8n-nodes-rrulenet.rruleNetScheduleTrigger');
		assert.equal(parameters.scheduleMode, undefined);
		const staticData = {
			scheduleId: 'coffee-existing',
			scheduleInput: parameters.input,
			timezone: parameters.timezone,
		};
		const { context, requests } = createHookContext(parameters, staticData);
		assert.equal(await new RruleNetScheduleTrigger().webhookMethods.default.create.call(context), true);
		assert.deepEqual(requests.map(({ method, url }) => [method, url]), [
			['PATCH', '/v1/schedules/coffee-existing'],
			['POST', '/v1/schedules/coffee-existing/resume'],
		]);
		assert.equal(staticData.scheduleId, 'coffee-existing');
		assert.equal(staticData.scheduleDefinitionMode, 'natural');
	});

	it('rejects an invalid event window before deleting an existing schedule', async () => {
		const staticData = { scheduleId: 'schedule-existing' };
		const { context, requests } = createHookContext({
			scheduleMode: 'eventWindow',
			timezone: 'UTC',
			...maintenanceWindowEventWindow,
			windowStart: '2026-09-15T02:00:00.001Z',
		}, staticData);
		await assert.rejects(() => new RruleNetScheduleTrigger().webhookMethods.default.create.call(context),
			/whole-second precision/);
		assert.equal(requests.length, 0);
		assert.equal(staticData.scheduleId, 'schedule-existing');
	});

	it('does not create a replacement if deleting the previous schedule fails', async () => {
		const staticData = { scheduleId: 'schedule-existing' };
		const { context, requests } = createHookContext({
			scheduleMode: 'eventWindow',
			timezone: 'UTC',
			...maintenanceWindowEventWindow,
		}, staticData, 'unused', [{
			statusCode: 403,
			body: { error: 'Schedule deletion is forbidden' },
		}]);
		await assert.rejects(() => new RruleNetScheduleTrigger().webhookMethods.default.create.call(context),
			/Schedule deletion is forbidden/);
		assert.deepEqual(requests.map(({ method }) => method), ['DELETE']);
		assert.equal(staticData.scheduleId, 'schedule-existing');
	});

	it('surfaces replacement errors without keeping the deleted schedule in static data', async () => {
		const staticData = { scheduleId: 'schedule-existing' };
		const { context, requests } = createHookContext({
			scheduleMode: 'eventWindow',
			timezone: 'UTC',
			...maintenanceWindowEventWindow,
		}, staticData, 'unused', [
			{ statusCode: 200, body: {} },
			{ statusCode: 400, body: { error: 'Failed to create schedule', details: 'Target cadence rejected' } },
		]);
		await assert.rejects(() => new RruleNetScheduleTrigger().webhookMethods.default.create.call(context),
			/Target cadence rejected/);
		assert.deepEqual(requests.map(({ method }) => method), ['DELETE', 'POST']);
		assert.equal(staticData.scheduleId, undefined);
	});

	it('creates one generated event-window schedule with the required target count', async () => {
		const parameters = {
			scheduleMode: 'eventWindow',
			name: 'September maintenance',
			inputDescription: 'Coordinate maintenance',
			timezone: 'UTC',
			...maintenanceWindowEventWindow,
		};
		const { context, requests, staticData } = createHookContext(parameters);
		const trigger = new RruleNetScheduleTrigger();

		assert.equal(await trigger.webhookMethods.default.create.call(context), true);
		assert.equal(requests.length, 1);
		assert.equal(requests[0].body.targets.length, 13);
		assert.equal(staticData.scheduleDefinitionMode, 'eventWindow');
		assert.match(staticData.scheduleDefinitionFingerprint, /^[a-f0-9]{64}$/);
	});

	it('creates one explicit targeted schedule and persists its fingerprint', async () => {
		const parameters = {
			scheduleMode: 'targets',
			name: 'September maintenance',
			inputDescription: 'Coordinate maintenance',
			timezone: 'UTC',
			targetsJson: JSON.stringify([eventScheduleTarget('maintenance-start')]),
		};
		const { context, requests, staticData } = createHookContext(parameters);
		const trigger = new RruleNetScheduleTrigger();

		assert.equal(await trigger.webhookMethods.default.create.call(context), true);
		assert.equal(requests.length, 1);
		assert.equal(requests[0].method, 'POST');
		assert.equal(requests[0].url, '/v1/schedules');
		assert.equal(requests[0].body.targets[0].id, 'maintenance-start');
		assert.equal(staticData.scheduleId, 'schedule-new');
		assert.equal(staticData.scheduleDefinitionMode, 'targets');
		assert.match(staticData.scheduleDefinitionFingerprint, /^[a-f0-9]{64}$/);
	});

	it('resumes an unchanged explicit definition without recreating it', async () => {
		const definition = buildScheduleDefinition({
			mode: 'targets',
			input: 'Coordinate maintenance',
			timezone: 'UTC',
			targetsJson: [eventScheduleTarget('maintenance-start')],
		});
		const parameters = {
			scheduleMode: 'targets',
			name: 'September maintenance',
			inputDescription: 'Coordinate maintenance',
			timezone: 'UTC',
			targetsJson: JSON.stringify([eventScheduleTarget('maintenance-start')]),
		};
		const staticData = {
			scheduleId: 'schedule-existing',
			scheduleName: 'September maintenance',
			scheduleDefinitionMode: 'targets',
			scheduleDefinitionFingerprint: definition.fingerprint,
		};
		const { context, requests } = createHookContext(parameters, staticData);
		const trigger = new RruleNetScheduleTrigger();

		assert.equal(await trigger.webhookMethods.default.create.call(context), true);
		assert.deepEqual(
			requests.map(({ method, url }) => [method, url]),
			[
				['PATCH', '/v1/schedules/schedule-existing'],
				['POST', '/v1/schedules/schedule-existing/resume'],
			],
		);
		assert.equal(requests[0].body.name, 'September maintenance');
	});

	it('deletes an immutable changed definition before creating its replacement', async () => {
		const oldDefinition = buildScheduleDefinition({
			mode: 'targets',
			timezone: 'UTC',
			targetsJson: [eventScheduleTarget('maintenance-start')],
		});
		const parameters = {
			scheduleMode: 'targets',
			name: 'September maintenance',
			inputDescription: '',
			timezone: 'UTC',
			targetsJson: JSON.stringify([
				eventScheduleTarget('maintenance-start'),
				eventScheduleTarget('maintenance-end'),
			]),
		};
		const staticData = {
			scheduleId: 'schedule-old',
			scheduleName: 'September maintenance',
			scheduleDefinitionMode: 'targets',
			scheduleDefinitionFingerprint: oldDefinition.fingerprint,
		};
		const { context, requests } = createHookContext(parameters, staticData, 'schedule-replacement');
		const trigger = new RruleNetScheduleTrigger();

		assert.equal(await trigger.webhookMethods.default.create.call(context), true);
		assert.deepEqual(
			requests.map(({ method, url }) => [method, url]),
			[
				['DELETE', '/v1/schedules/schedule-old'],
				['POST', '/v1/schedules'],
			],
		);
		assert.equal(staticData.scheduleId, 'schedule-replacement');
	});

	it('migrates an unchanged legacy natural-language schedule without replacement', async () => {
		const parameters = {
			name: 'Morning schedule',
			input: 'Every weekday at 9:00',
			timezone: 'Europe/Paris',
		};
		const staticData = {
			scheduleId: 'schedule-legacy',
			scheduleName: 'Morning schedule',
			scheduleInput: 'Every weekday at 9:00',
			timezone: 'Europe/Paris',
		};
		const { context, requests } = createHookContext(parameters, staticData);
		const trigger = new RruleNetScheduleTrigger();

		assert.equal(await trigger.webhookMethods.default.create.call(context), true);
		assert.deepEqual(
			requests.map(({ method, url }) => [method, url]),
			[
				['PATCH', '/v1/schedules/schedule-legacy'],
				['POST', '/v1/schedules/schedule-legacy/resume'],
			],
		);
		assert.equal(staticData.scheduleDefinitionMode, 'natural');
		assert.match(staticData.scheduleDefinitionFingerprint, /^[a-f0-9]{64}$/);
	});

	it('preserves the configured pause and delete deactivation behavior', async () => {
		const pausedStaticData = {
			scheduleId: 'schedule-paused',
			scheduleDefinitionMode: 'targets',
			scheduleDefinitionFingerprint: 'a'.repeat(64),
		};
		const paused = createHookContext(
			{ onDeactivate: 'pause' },
			pausedStaticData,
		);
		const trigger = new RruleNetScheduleTrigger();

		assert.equal(await trigger.webhookMethods.default.delete.call(paused.context), true);
		assert.deepEqual(
			paused.requests.map(({ method, url }) => [method, url]),
			[['POST', '/v1/schedules/schedule-paused/pause']],
		);
		assert.equal(pausedStaticData.scheduleId, 'schedule-paused');

		const deletedStaticData = {
			scheduleId: 'schedule-deleted',
			scheduleDefinitionMode: 'targets',
			scheduleDefinitionFingerprint: 'b'.repeat(64),
		};
		const deleted = createHookContext(
			{ onDeactivate: 'delete' },
			deletedStaticData,
		);

		assert.equal(await trigger.webhookMethods.default.delete.call(deleted.context), true);
		assert.deepEqual(
			deleted.requests.map(({ method, url }) => [method, url]),
			[['DELETE', '/v1/schedules/schedule-deleted']],
		);
		assert.equal(deletedStaticData.scheduleId, undefined);
		assert.equal(deletedStaticData.scheduleDefinitionMode, undefined);
		assert.equal(deletedStaticData.scheduleDefinitionFingerprint, undefined);
	});
});
