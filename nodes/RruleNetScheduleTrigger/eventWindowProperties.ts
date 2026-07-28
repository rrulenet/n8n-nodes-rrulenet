import type { INodeProperties } from 'n8n-workflow';

const eventWindowDisplay = {
	show: {
		scheduleMode: ['eventWindow'],
	},
};

export const eventWindowProperties: INodeProperties[] = [
	{
		displayName:
			'Define the shared event window once. The node generates one target for every audience/reminder pair and for each enabled operational phase.',
		name: 'eventWindowNotice',
		type: 'notice',
		default: '',
		displayOptions: eventWindowDisplay,
	},
	{
		displayName: 'Event ID',
		name: 'eventId',
		type: 'string',
		default: 'maintenance-window',
		required: true,
		description:
			'Stable event identifier using letters, numbers, dots, underscores, or dashes',
		displayOptions: eventWindowDisplay,
	},
	{
		displayName: 'Event Label',
		name: 'eventLabel',
		type: 'string',
		default: 'Planned maintenance window',
		description: 'Human-readable event name included in the canonical event snapshot',
		displayOptions: eventWindowDisplay,
	},
	{
		displayName: 'Window Start',
		name: 'windowStart',
		type: 'dateTime',
		default: '',
		required: true,
		description: 'Exact planned start instant, including its timezone or UTC offset',
		displayOptions: eventWindowDisplay,
	},
	{
		displayName: 'Window End',
		name: 'windowEnd',
		type: 'dateTime',
		default: '',
		required: true,
		description:
			'Exact planned end instant. Downstream health checks decide whether recovery is operationally complete.',
		displayOptions: eventWindowDisplay,
	},
	{
		displayName: 'Audiences',
		name: 'audiences',
		type: 'fixedCollection',
		default: {},
		placeholder: 'Add Audience',
		typeOptions: {
			multipleValues: true,
			multipleValueButtonText: 'Add Audience',
			sortable: true,
		},
		description:
			'Regional or business audiences crossed with every configured customer reminder',
		displayOptions: eventWindowDisplay,
		options: [
			{
				displayName: 'Audience',
				name: 'audience',
				values: [
					{
						displayName: 'ID',
						name: 'id',
						type: 'string',
						default: '',
						required: true,
						placeholder: 'paris',
						description: 'Stable suffix used in generated target IDs',
					},
					{
						displayName: 'Label',
						name: 'label',
						type: 'string',
						default: '',
						placeholder: 'Paris customers',
					},
					{
						displayName: 'Timezone',
						name: 'timezone',
						type: 'string',
						default: 'Europe/Paris',
						required: true,
						description: 'IANA timezone used for local reminder times',
					},
					{
						displayName: 'Metadata',
						name: 'metadata',
						type: 'json',
						default: '{}',
						validateType: 'object',
						description:
							'Optional routing context such as locale, segment ID, market, or channel',
					},
				],
			},
		],
	},
	{
		displayName: 'Customer Reminders',
		name: 'customerReminders',
		type: 'fixedCollection',
		default: {},
		placeholder: 'Add Reminder',
		typeOptions: {
			multipleValues: true,
			multipleValueButtonText: 'Add Reminder',
			sortable: true,
		},
		description:
			'Each reminder is generated once per audience at the audience local time',
		displayOptions: eventWindowDisplay,
		options: [
			{
				displayName: 'Reminder',
				name: 'reminder',
				values: [
					{
						displayName: 'Days Before',
						name: 'daysBefore',
						type: 'number',
						default: 7,
						required: true,
						description: 'Calendar days before the event in each audience timezone',
					},
					{
						displayName: 'ID',
						name: 'id',
						type: 'string',
						default: '',
						required: true,
						placeholder: '7d',
						description: 'Stable identifier such as 7d or 1d',
					},
					{
						displayName: 'Label',
						name: 'label',
						type: 'string',
						default: '',
						placeholder: 'Seven days before',
					},
					{
						displayName: 'Local Time',
						name: 'localTime',
						type: 'string',
						default: '09:00',
						required: true,
						placeholder: '09:00',
						description: 'Audience-local wall-clock time in 24-hour HH:mm format',
					},
					{
						displayName: 'Metadata',
						name: 'metadata',
						type: 'json',
						default: '{}',
						validateType: 'object',
						description: 'Optional routing context specific to this reminder',
					},
				],
			},
		],
	},
	{
		displayName: 'Operational Warnings',
		name: 'operationalWarnings',
		type: 'fixedCollection',
		default: {},
		placeholder: 'Add Warning',
		typeOptions: {
			multipleValues: true,
			multipleValueButtonText: 'Add Warning',
			sortable: true,
		},
		description: 'Exact elapsed offsets before the global event start instant',
		displayOptions: eventWindowDisplay,
		options: [
			{
				displayName: 'Warning',
				name: 'warning',
				values: [
					{
						displayName: 'ID',
						name: 'id',
						type: 'string',
						default: '',
						required: true,
						placeholder: '2h',
						description: 'Stable identifier used after the ops-warning prefix',
					},
					{
						displayName: 'Label',
						name: 'label',
						type: 'string',
						default: '',
						placeholder: 'Operations warning two hours before',
					},
					{
						displayName: 'Metadata',
						name: 'metadata',
						type: 'json',
						default: '{}',
						validateType: 'object',
						description: 'Optional routing context specific to this warning',
					},
					{
						displayName: 'Offset',
						name: 'offsetValue',
						type: 'number',
						default: 2,
						required: true,
					},
					{
						displayName: 'Unit',
						name: 'offsetUnit',
						type: 'options',
						default: 'hours',
						required: true,
						options: [
							{
								name: 'Hours',
								value: 'hours',
							},
							{
								name: 'Minutes',
								value: 'minutes',
							},
						],
					},
				],
			},
		],
	},
	{
		displayName: 'Generate Start Target',
		name: 'includeStartTarget',
		type: 'boolean',
		default: true,
		description:
			'Whether to generate maintenance-start at the exact planned start instant',
		displayOptions: eventWindowDisplay,
	},
	{
		displayName: 'Generate Progress Target',
		name: 'includeProgressTarget',
		type: 'boolean',
		default: true,
		description:
			'Whether to generate maintenance-progress throughout the half-open window',
		displayOptions: eventWindowDisplay,
	},
	{
		displayName: 'Progress Interval (Minutes)',
		name: 'progressIntervalMinutes',
		type: 'number',
		default: 10,
		required: true,
		typeOptions: {
			minValue: 1,
			maxValue: 10080,
			numberPrecision: 0,
		},
		description:
			'Elapsed minutes between progress executions; the planned end instant is excluded',
		displayOptions: {
			show: {
				scheduleMode: ['eventWindow'],
				includeProgressTarget: [true],
			},
		},
	},
	{
		displayName: 'Generate End Target',
		name: 'includeEndTarget',
		type: 'boolean',
		default: true,
		description:
			'Whether to generate maintenance-end at the exact planned end instant. The workflow must verify recovery before announcing completion.',
		displayOptions: eventWindowDisplay,
	},
];
