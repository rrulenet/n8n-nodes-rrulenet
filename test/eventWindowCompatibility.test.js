const assert = require('node:assert/strict');
const { before, describe, it } = require('node:test');
const { buildEventWindowTargets } = require('../dist/nodes/RruleNetScheduleTrigger/eventWindow.js');
const {
	maintenanceWindowEventWindow,
	maintenanceWindowTargets,
} = require('./fixtures/maintenanceWindowTargets.js');

let EventSchedule;
before(async () => {
	({ EventSchedule } = await import('@rrulenet/events'));
});

function occurrences(target) {
	return EventSchedule.fromJSON(target.event_schedule).occurrences()
		.map((value) => value.toInstant().toString());
}

const expectedReference = {
	'customer-reminder-7d-paris': ['2026-09-08T07:00:00Z'],
	'customer-reminder-1d-paris': ['2026-09-14T07:00:00Z'],
	'customer-reminder-7d-new-york': ['2026-09-07T13:00:00Z'],
	'customer-reminder-1d-new-york': ['2026-09-13T13:00:00Z'],
	'customer-reminder-7d-tokyo': ['2026-09-08T00:00:00Z'],
	'customer-reminder-1d-tokyo': ['2026-09-14T00:00:00Z'],
	'customer-reminder-7d-perth': ['2026-09-08T01:00:00Z'],
	'customer-reminder-1d-perth': ['2026-09-14T01:00:00Z'],
	'ops-warning-2h': ['2026-09-15T00:00:00Z'],
	'ops-warning-15m': ['2026-09-15T01:45:00Z'],
	'maintenance-start': ['2026-09-15T02:00:00Z'],
	'maintenance-progress': [
		'2026-09-15T02:00:00Z', '2026-09-15T02:10:00Z',
		'2026-09-15T02:20:00Z', '2026-09-15T02:30:00Z',
		'2026-09-15T02:40:00Z', '2026-09-15T02:50:00Z',
		'2026-09-15T03:00:00Z', '2026-09-15T03:10:00Z',
		'2026-09-15T03:20:00Z', '2026-09-15T03:30:00Z',
		'2026-09-15T03:40:00Z', '2026-09-15T03:50:00Z',
	],
	'maintenance-end': ['2026-09-15T04:00:00Z'],
};

describe('published 0.2.2 event-window compatibility', () => {
	for (const source of ['generator', 'canonical fixture']) {
		it(`resolves every ${source} target to the expected instant sequence`, () => {
			const targets = source === 'generator'
				? buildEventWindowTargets(maintenanceWindowEventWindow)
				: maintenanceWindowTargets;
			assert.deepEqual(
				Object.fromEntries(targets.map((target) => [target.id, occurrences(target)])),
				expectedReference,
			);
		});
	}

	for (const [date, reminder, beforeOffset, afterOffset] of [
		['2026-03-29', '2026-03-28T08:00:00Z', '+01:00', '+02:00'],
		['2026-10-25', '2026-10-24T07:00:00Z', '+02:00', '+01:00'],
	]) {
		it(`keeps exact warnings, anchors and a half-open UTC grid across ${date}`, () => {
			const targets = buildEventWindowTargets({
				...maintenanceWindowEventWindow,
				windowStart: `${date}T00:00:00Z`,
				windowEnd: `${date}T02:00:00Z`,
			});
			const byId = Object.fromEntries(targets.map((target) => [target.id, target]));
			assert.deepEqual(occurrences(byId['customer-reminder-1d-paris']), [reminder]);
			assert.deepEqual(occurrences(byId['ops-warning-15m']), [
				`${date === '2026-03-29' ? '2026-03-28' : '2026-10-24'}T23:45:00Z`,
			]);
			assert.deepEqual(occurrences(byId['maintenance-start']), [`${date}T00:00:00Z`]);
			assert.deepEqual(occurrences(byId['maintenance-end']), [`${date}T02:00:00Z`]);
			const progress = EventSchedule.fromJSON(byId['maintenance-progress'].event_schedule)
				.occurrences().map((value) => value.toInstant());
			assert.deepEqual(progress.map((value) => value.toString()),
				Array.from({ length: 12 }, (_, index) =>
					`${date}T0${Math.floor(index / 6)}:${String(index % 6 * 10).padStart(2, '0')}:00Z`));
			assert.equal(progress[0].toZonedDateTimeISO('Europe/Paris').offset, beforeOffset);
			assert.equal(progress[6].toZonedDateTimeISO('Europe/Paris').offset, afterOffset);
		});
	}

	it('requires temporalVersion 2 for the generated progress recurrence', () => {
		const target = buildEventWindowTargets(maintenanceWindowEventWindow)
			.find(({ id }) => id === 'maintenance-progress');
		const json = target.event_schedule;
		assert.equal(json.recurrence.temporalVersion, 2);
		assert.deepEqual(EventSchedule.validateJSON(json), { ok: true });
		const legacy = structuredClone(json);
		delete legacy.recurrence.temporalVersion;
		assert.throws(() => EventSchedule.fromJSON(legacy), /migration choice/);
		assert.deepEqual(occurrences(target), expectedReference['maintenance-progress']);
	});
});
