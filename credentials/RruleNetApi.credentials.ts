import type {
	IAuthenticateGeneric,
	ICredentialType,
	ICredentialTestRequest,
	INodeProperties,
} from 'n8n-workflow';

export class RruleNetApi implements ICredentialType {
	name = 'rruleNetApi';

	displayName = 'rrule.net API';

	icon = 'file:../nodes/RruleNetScheduleTrigger/rrulenet.svg' as const;

	documentationUrl = 'https://github.com/rrulenet/n8n-nodes-rrulenet#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
		},
		{
			displayName: 'API Base URL',
			name: 'apiBaseUrl',
			type: 'string',
			default: 'https://api.rrule.net',
			required: true,
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.apiBaseUrl}}',
			url: '/v1/schedules?limit=1',
			method: 'GET',
		},
	};
}
