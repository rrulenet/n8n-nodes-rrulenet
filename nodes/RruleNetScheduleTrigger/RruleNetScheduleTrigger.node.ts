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

function persistRemoteScheduleData(
	context: IHookFunctions,
	staticData: IDataObject,
	schedule: IDataObject,
	input: string,
	name: string,
	timezone: string,
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
	staticData.scheduleName = name || input;
	staticData.webhookUrl = webhookUrl;
	staticData.scheduleInput = input;
	staticData.timezone = timezone;
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
	input: string,
	name: string,
	timezone: string,
	webhookUrl: string,
): Promise<IDataObject> {
	return await rruleNetRequest(context, {
		method: 'POST',
		url: '/v1/schedules',
		body: {
			input,
			...(name ? { name } : {}),
			timezone,
			webhook: {
				url: webhookUrl,
			},
		},
	});
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
			throw error;
		}
	}
}

export class RruleNetScheduleTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'rrule.net Schedule Trigger',
		name: 'rruleNetScheduleTrigger',
		icon: 'file:rrulenet.svg',
		group: ['trigger'],
		version: 1,
		description: 'Advanced schedule trigger powered by rrule.net',
		subtitle: '={{$parameter["name"] || $parameter["input"]}}',
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
				description: 'Natural language schedule definition to register in rrule.net',
			},
			{
				displayName: 'Timezone',
				name: 'timezone',
				type: 'string',
				default: 'Europe/Paris',
				required: true,
			},
			{
				displayName: 'On Deactivate',
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
				const timezone = this.getNodeParameter('timezone', 'Europe/Paris') as string;
				const input = this.getNodeParameter('input', '') as string;
				const name = this.getNodeParameter('name', '') as string;
				const storedInput = getString(staticData.scheduleInput);
				const storedName = getString(staticData.scheduleName);
				const storedTimezone = getString(staticData.timezone);
				const expectedName = name || input;
				const sameRemoteSchedule =
					storedInput === input && storedName === expectedName && storedTimezone === timezone;

				if (scheduleId && sameRemoteSchedule) {
					try {
						await rruleNetRequest(this, {
							method: 'PATCH',
							url: `/v1/schedules/${scheduleId}`,
							body: {
								webhook: {
									url: webhookUrl,
								},
							},
						});

						const schedule = await rruleNetRequest(this, {
							method: 'POST',
							url: `/v1/schedules/${scheduleId}/resume`,
						});

						staticData.remoteSchedule = schedule;
						staticData.webhookUrl = webhookUrl;

						return true;
					} catch (error) {
						if (!isNotFoundError(error)) {
							throw error;
						}

						clearRemoteScheduleData(staticData);
					}
				}

				if (scheduleId) {
					await deleteRemoteScheduleIfExists(this, scheduleId);
				}

				const schedule = await createRemoteSchedule(this, input, name, timezone, webhookUrl);

				persistRemoteScheduleData(this, staticData, schedule, input, name, timezone, webhookUrl);

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
						throw error;
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
		const now = new Date().toISOString();

		const output: IDataObject = {
			schedule_id: getString(body.schedule_id) ?? getString(headers['x-rrule-schedule-id']),
			schedule_name: getString(body.schedule_name),
			execution_id: getString(body.execution_id) ?? getString(headers['x-rrule-execution-id']),
			scheduled_for: getString(body.scheduled_for) ?? getString(headers['x-rrule-scheduled-for']),
			executed_at: getString(body.executed_at) ?? now,
			timezone: getString(body.timezone),
			input_type: getString(input?.type),
			input_value: getString(input?.value),
			raw_payload: body,
		};

		return {
			workflowData: [this.helpers.returnJsonArray(output)],
		};
	}
}
