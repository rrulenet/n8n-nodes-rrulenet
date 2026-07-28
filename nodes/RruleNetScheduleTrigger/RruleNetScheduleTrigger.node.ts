import type {
	IDataObject,
	IHookFunctions,
	IHttpRequestOptions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { eventWindowProperties } from './eventWindowProperties';
import {
	buildCreateScheduleBody,
	buildScheduleDefinition,
	getExpectedScheduleName,
	isStoredDefinitionEqual,
	ScheduleDefinitionValidationError,
	type ScheduleDefinition,
	type ScheduleDefinitionMode,
} from './scheduleDefinition';

function getString(value: unknown): string | undefined {
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getDataObject(value: unknown): IDataObject | undefined {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as IDataObject)
		: undefined;
}

function getResponseBody(value: unknown): unknown {
	const response = getDataObject(value);
	if (!response) {
		return undefined;
	}

	const body = response.body ?? response.data;
	if (typeof body !== 'string') {
		return body;
	}

	try {
		return JSON.parse(body);
	} catch {
		return body;
	}
}

function normalizeBaseUrl(value: unknown): string {
	const baseUrl = typeof value === 'string' && value.length > 0 ? value : 'https://api.rrule.net';
	return baseUrl.replace(/\/+$/, '');
}

function getErrorStatusCode(error: unknown): string | undefined {
	const errorObject = getDataObject(error);
	const response = getDataObject(errorObject?.response);
	const statusCode =
		errorObject?.httpCode ??
		errorObject?.statusCode ??
		errorObject?.status ??
		getDataObject(errorObject?.errorResponse)?.statusCode ??
		getDataObject(errorObject?.errorResponse)?.status ??
		response?.statusCode ??
		response?.status;

	return typeof statusCode === 'number' || typeof statusCode === 'string'
		? String(statusCode)
		: undefined;
}

function isNotFoundError(error: unknown): boolean {
	return getErrorStatusCode(error) === '404';
}

function clearRemoteScheduleData(staticData: IDataObject): void {
	delete staticData.scheduleId;
	delete staticData.scheduleName;
	delete staticData.scheduleInput;
	delete staticData.timezone;
	delete staticData.webhookUrl;
	delete staticData.remoteSchedule;
	delete staticData.scheduleDefinitionMode;
	delete staticData.scheduleDefinitionFingerprint;
}

function throwRruleNetApiError(
	context: IHookFunctions,
	response: IDataObject,
	fallbackMessage: string,
): never {
	const statusCode = getErrorStatusCode(response);
	const body = getResponseBody(response);
	const bodyObject = getDataObject(body);
	const errorMessage = getString(bodyObject?.error) ?? getString(bodyObject?.message) ?? fallbackMessage;
	const details = getString(bodyObject?.details);
	const message =
		details && /^Failed to /i.test(errorMessage) ? details : errorMessage;
	const descriptionParts = [
		message === details ? errorMessage : details,
		statusCode ? `rrule.net API returned HTTP ${statusCode}.` : undefined,
	].filter((part): part is string => Boolean(part));
	const error = new NodeOperationError(context.getNode(), message, {
		description: descriptionParts.join('\n'),
	});

	(error as unknown as IDataObject).statusCode = statusCode;
	(error as unknown as IDataObject).errorResponse = {
		statusCode,
		body: bodyObject ?? body,
	};

	throw error;
}

function throwUnexpectedRruleNetError(
	context: IHookFunctions,
	error: unknown,
	fallbackMessage: string,
): never {
	const errorObject = getDataObject(error);
	const statusCode = getErrorStatusCode(error);
	const message = getString(errorObject?.message) ?? fallbackMessage;
	const descriptionParts = [
		getString(errorObject?.description),
		statusCode ? `rrule.net API returned HTTP ${statusCode}.` : undefined,
	].filter((part): part is string => Boolean(part));
	const wrappedError = new NodeOperationError(context.getNode(), message, {
		description: descriptionParts.join('\n'),
	});

	(wrappedError as unknown as IDataObject).statusCode = statusCode;

	throw wrappedError;
}

function persistRemoteScheduleData(
	context: IHookFunctions,
	staticData: IDataObject,
	schedule: IDataObject,
	definition: ScheduleDefinition,
	scheduleName: string,
	webhookUrl: string,
): void {
	const scheduleId = getString(schedule.id);
	if (!scheduleId) {
		throw new NodeOperationError(
			context.getNode(),
			'rrule.net did not return a schedule ID after schedule creation.',
		);
	}

	staticData.scheduleId = scheduleId;
	staticData.scheduleName = scheduleName;
	staticData.webhookUrl = webhookUrl;
	if (definition.input) {
		staticData.scheduleInput = definition.input;
	} else {
		delete staticData.scheduleInput;
	}
	staticData.timezone = definition.timezone;
	staticData.scheduleDefinitionMode = definition.mode;
	staticData.scheduleDefinitionFingerprint = definition.fingerprint;
	staticData.remoteSchedule = schedule;
}

async function rruleNetRequest(
	context: IHookFunctions,
	options: Omit<IHttpRequestOptions, 'baseURL' | 'json'>,
): Promise<IDataObject> {
	const credentials = await context.getCredentials<{ apiBaseUrl?: string }>('rruleNetApi');

	const response = (await context.helpers.httpRequestWithAuthentication.call(context, 'rruleNetApi', {
		baseURL: normalizeBaseUrl(credentials.apiBaseUrl),
		ignoreHttpStatusErrors: true,
		json: true,
		returnFullResponse: true,
		...options,
	})) as IDataObject;
	const statusCode = getErrorStatusCode(response);

	if (statusCode && Number(statusCode) >= 400) {
		throwRruleNetApiError(context, response, 'rrule.net API request failed.');
	}

	const body = getResponseBody(response);
	return getDataObject(body) ?? {};
}

async function createRemoteSchedule(
	context: IHookFunctions,
	definition: ScheduleDefinition,
	name: string,
	webhookUrl: string,
): Promise<IDataObject> {
	return await rruleNetRequest(context, {
		method: 'POST',
		url: '/v1/schedules',
		body: buildCreateScheduleBody(definition, name, webhookUrl),
	});
}

function getScheduleDefinition(context: IHookFunctions): ScheduleDefinition {
	const mode = context.getNodeParameter('scheduleMode', 'natural') as ScheduleDefinitionMode;
	const timezone = context.getNodeParameter('timezone', 'Europe/Paris') as string;

	try {
		if (mode === 'eventWindow') {
			return buildScheduleDefinition({
				mode,
				input: context.getNodeParameter('inputDescription', '') as string,
				timezone,
				eventWindow: {
					eventId: context.getNodeParameter('eventId', ''),
					eventLabel: context.getNodeParameter('eventLabel', ''),
					windowStart: context.getNodeParameter('windowStart', ''),
					windowEnd: context.getNodeParameter('windowEnd', ''),
					audiences: context.getNodeParameter('audiences', {}),
					customerReminders: context.getNodeParameter('customerReminders', {}),
					operationalWarnings: context.getNodeParameter('operationalWarnings', {}),
					includeStartTarget: context.getNodeParameter('includeStartTarget', true),
					includeProgressTarget: context.getNodeParameter('includeProgressTarget', true),
					progressIntervalMinutes: context.getNodeParameter(
						'progressIntervalMinutes',
						10,
					),
					includeEndTarget: context.getNodeParameter('includeEndTarget', true),
				},
			});
		}

		if (mode === 'targets') {
			return buildScheduleDefinition({
				mode,
				input: context.getNodeParameter('inputDescription', '') as string,
				timezone,
				targetsJson: context.getNodeParameter('targetsJson', '[]'),
			});
		}

		return buildScheduleDefinition({
			mode: 'natural',
			input: context.getNodeParameter('input', '') as string,
			timezone,
		});
	} catch (error) {
		const message =
			error instanceof ScheduleDefinitionValidationError
				? error.message
				: 'Unable to read the rrule.net schedule definition.';
		throw new NodeOperationError(context.getNode(), message);
	}
}

async function deleteRemoteScheduleIfExists(
	context: IHookFunctions,
	scheduleId: string,
): Promise<void> {
	try {
		await rruleNetRequest(context, {
			method: 'DELETE',
			url: `/v1/schedules/${scheduleId}`,
		});
	} catch (error) {
		if (!isNotFoundError(error)) {
			throwUnexpectedRruleNetError(context, error, 'Failed to delete the rrule.net schedule.');
		}
	}
}

export class RruleNetScheduleTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'rrule.net Schedule Trigger',
		name: 'rruleNetScheduleTrigger',
		icon: {
			light: 'file:rrulenet.svg',
			dark: 'file:rrulenet.dark.svg',
		},
		group: ['trigger'],
		version: 1,
		description: 'Advanced schedule trigger powered by rrule.net',
		subtitle:
			'={{$parameter["name"] || $parameter["input"] || $parameter["eventLabel"] || $parameter["inputDescription"]}}',
		defaults: {
			name: 'rrule.net Schedule Trigger',
		},
		usableAsTool: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'rruleNetApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'rrulenet',
			},
		],
		properties: [
			{
				displayName: 'Webhook Delivery',
				name: 'webhookDeliveryNotice',
				type: 'notice',
				default: '',
				description:
					'This trigger registers the workflow production webhook URL with rrule.net. If rrule.net reports HTTP 404 deliveries, make sure the workflow is published and do not use a test webhook URL.',
			},
			{
				displayName: 'Schedule Mode',
				name: 'scheduleMode',
				type: 'options',
				// eslint-disable-next-line @n8n/community-nodes/options-sorted-alphabetically -- Order modes by increasing configuration complexity.
				options: [
					{
						name: 'Natural Language',
						value: 'natural',
						description: 'Describe the schedule in text and let rrule.net validate it',
					},
					{
						name: 'Event Window',
						value: 'eventWindow',
						description:
							'Generate deterministic targets from one event window, audiences, reminders, warnings, and lifecycle phases',
					},
					{
						name: 'Canonical Targets JSON (Advanced)',
						value: 'targets',
						description:
							'Import target definitions already generated by a template, API client, or rrule.net tool',
					},
				],
				default: 'natural',
				description: 'Choose how the remote rrule.net schedule is defined',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'Optional display name for the remote rrule.net schedule',
			},
			{
				displayName: 'Schedule Text',
				name: 'input',
				type: 'string',
				typeOptions: {
					rows: 3,
				},
				default: '',
				placeholder: 'Every weekday at 9:00',
				required: true,
				description:
					'Natural language schedule definition to register in rrule.net. rrule.net validates the schedule before the workflow is published.',
				displayOptions: {
					show: {
						scheduleMode: ['natural'],
					},
				},
			},
			{
				displayName: 'Schedule Description',
				name: 'inputDescription',
				type: 'string',
				typeOptions: {
					rows: 2,
				},
				default: '',
				placeholder: 'Coordinate the September maintenance window',
				description:
					'Optional original human-readable description stored with an explicit targeted schedule',
				displayOptions: {
					show: {
						scheduleMode: ['eventWindow', 'targets'],
					},
				},
			},
			{
				displayName: 'Timezone',
				name: 'timezone',
				type: 'string',
				default: 'Europe/Paris',
				required: true,
				description:
					'IANA timezone for the parent schedule. In explicit-target mode, each target timezone controls its own execution.',
			},
			...eventWindowProperties,
			{
				displayName:
					'Advanced import path: each target must have a unique ID, an IANA timezone, and exactly one canonical recurrence or event_schedule object. Most users should choose Natural Language or Event Window.',
				name: 'explicitTargetsNotice',
				type: 'notice',
				default: '',
				displayOptions: {
					show: {
						scheduleMode: ['targets'],
					},
				},
			},
			{
				displayName: 'Targets JSON',
				name: 'targetsJson',
				type: 'json',
				typeOptions: {
					rows: 16,
				},
				default: '[]',
				required: true,
				validateType: 'array',
				description:
					'Array of explicit rrule.net targets. Every target may include label and metadata, plus exactly one recurrence or event_schedule source.',
				displayOptions: {
					show: {
						scheduleMode: ['targets'],
					},
				},
			},
			{
				displayName: 'On Unpublish',
				name: 'onDeactivate',
				type: 'options',
				options: [
					{
						name: 'Delete Remote Schedule',
						value: 'delete',
					},
					{
						name: 'Pause Remote Schedule',
						value: 'pause',
					},
				],
				default: 'pause',
				description:
					'Choose what happens to the remote rrule.net schedule when this n8n workflow is unpublished',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				return false;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				if (!webhookUrl) {
					throw new NodeOperationError(
						this.getNode(),
						'Unable to determine the rrule.net webhook URL for this workflow.',
					);
				}

				const staticData = this.getWorkflowStaticData('node');
				const scheduleId = getString(staticData.scheduleId);
				const name = this.getNodeParameter('name', '') as string;
				const definition = getScheduleDefinition(this);
				const expectedName = getExpectedScheduleName(name, definition);
				const sameRemoteSchedule = isStoredDefinitionEqual(staticData, definition);

				if (scheduleId && sameRemoteSchedule) {
					try {
						await rruleNetRequest(this, {
							method: 'PATCH',
							url: `/v1/schedules/${scheduleId}`,
							body: {
								name: name.trim() || null,
								webhook: {
									url: webhookUrl,
								},
							},
						});

						const schedule = await rruleNetRequest(this, {
							method: 'POST',
							url: `/v1/schedules/${scheduleId}/resume`,
						});

						persistRemoteScheduleData(
							this,
							staticData,
							schedule,
							definition,
							expectedName,
							webhookUrl,
						);

						return true;
					} catch (error) {
						if (!isNotFoundError(error)) {
							throwUnexpectedRruleNetError(
								this,
								error,
								'Failed to update the existing rrule.net schedule.',
							);
						}

						clearRemoteScheduleData(staticData);
					}
				}

				if (scheduleId) {
					await deleteRemoteScheduleIfExists(this, scheduleId);
					clearRemoteScheduleData(staticData);
				}

				const schedule = await createRemoteSchedule(this, definition, name, webhookUrl);

				persistRemoteScheduleData(
					this,
					staticData,
					schedule,
					definition,
					expectedName,
					webhookUrl,
				);

				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const scheduleId = getString(staticData.scheduleId);
				const action = this.getNodeParameter('onDeactivate', 'pause') as string;

				staticData.lastDeactivateAction = action;

				if (!scheduleId) {
					return true;
				}

				if (action === 'delete') {
					await deleteRemoteScheduleIfExists(this, scheduleId);
					clearRemoteScheduleData(staticData);

					return true;
				}

				try {
					const schedule = await rruleNetRequest(this, {
						method: 'POST',
						url: `/v1/schedules/${scheduleId}/pause`,
					});

					staticData.remoteSchedule = schedule;
				} catch (error) {
					if (!isNotFoundError(error)) {
						throwUnexpectedRruleNetError(this, error, 'Failed to pause the rrule.net schedule.');
					}

					clearRemoteScheduleData(staticData);
				}

				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const body = this.getBodyData();
		const headers = this.getHeaderData();
		const input = getDataObject(body.input);
		const target = getDataObject(body.target);
		const now = new Date().toISOString();

		const output: IDataObject = {
			schedule_id: getString(body.schedule_id) ?? getString(headers['x-rrule-schedule-id']),
			schedule_name: getString(body.schedule_name),
			execution_id: getString(body.execution_id) ?? getString(headers['x-rrule-execution-id']),
			scheduled_for: getString(body.scheduled_for) ?? getString(headers['x-rrule-scheduled-for']),
			executed_at: getString(body.executed_at) ?? now,
			timezone: getString(body.timezone),
			target_id: getString(target?.id) ?? getString(headers['x-rrule-target-id']),
			target_label: getString(target?.label),
			target_timezone: getString(target?.timezone),
			target_metadata: getDataObject(target?.metadata) ?? {},
			input_type: getString(input?.type),
			input_value: getString(input?.value),
			raw_payload: body,
		};

		return {
			workflowData: [this.helpers.returnJsonArray(output)],
		};
	}
}
