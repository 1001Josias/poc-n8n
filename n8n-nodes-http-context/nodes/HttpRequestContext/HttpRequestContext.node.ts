import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IHttpRequestMethods,
	IDataObject,
	IHttpRequestOptions,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

export class HttpRequestContext implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'HTTP Request Context',
		name: 'httpRequestContext',
		icon: 'fa:globe',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["method"] + ": " + $parameter["url"]}}',
		description: 'HTTP Request node that automatically injects workflow context (ID and name) into headers',
		defaults: {
			name: 'HTTP Request Context',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		properties: [
			// Method
			{
				displayName: 'Method',
				name: 'method',
				type: 'options',
				options: [
					{ name: 'DELETE', value: 'DELETE' },
					{ name: 'GET', value: 'GET' },
					{ name: 'HEAD', value: 'HEAD' },
					{ name: 'OPTIONS', value: 'OPTIONS' },
					{ name: 'PATCH', value: 'PATCH' },
					{ name: 'POST', value: 'POST' },
					{ name: 'PUT', value: 'PUT' },
				],
				default: 'GET',
				description: 'The HTTP method to use',
			},
			// URL
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				default: '',
				placeholder: 'https://httpbin.org/headers',
				description: 'The URL to make the request to',
				required: true,
			},
			// Send Headers
			{
				displayName: 'Send Headers',
				name: 'sendHeaders',
				type: 'boolean',
				default: false,
				description: 'Whether to send additional custom headers',
			},
			// Headers
			{
				displayName: 'Headers',
				name: 'headerParameters',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				displayOptions: {
					show: {
						sendHeaders: [true],
					},
				},
				default: {},
				placeholder: 'Add Header',
				options: [
					{
						name: 'parameters',
						displayName: 'Header',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
							},
						],
					},
				],
			},
			// Send Body
			{
				displayName: 'Send Body',
				name: 'sendBody',
				type: 'boolean',
				default: false,
				description: 'Whether to send a request body',
			},
			// Body Content Type
			{
				displayName: 'Body Content Type',
				name: 'bodyContentType',
				type: 'options',
				displayOptions: {
					show: {
						sendBody: [true],
					},
				},
				options: [
					{ name: 'JSON', value: 'json' },
					{ name: 'Form-Urlencoded', value: 'form-urlencoded' },
					{ name: 'Raw', value: 'raw' },
				],
				default: 'json',
			},
			// JSON Body
			{
				displayName: 'Body (JSON)',
				name: 'jsonBody',
				type: 'json',
				displayOptions: {
					show: {
						sendBody: [true],
						bodyContentType: ['json'],
					},
				},
				default: '{}',
				description: 'JSON body to send',
			},
			// Raw Body
			{
				displayName: 'Body (Raw)',
				name: 'rawBody',
				type: 'string',
				displayOptions: {
					show: {
						sendBody: [true],
						bodyContentType: ['raw'],
					},
				},
				default: '',
				description: 'Raw body to send',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		// Get workflow context - THE KEY FEATURE OF THIS NODE
		const workflow = this.getWorkflow();
		const workflowId = workflow.id ?? 'unknown';
		const workflowName = workflow.name ?? 'unknown';

		for (let i = 0; i < items.length; i++) {
			try {
				const method = this.getNodeParameter('method', i) as IHttpRequestMethods;
				const url = this.getNodeParameter('url', i) as string;
				const sendHeaders = this.getNodeParameter('sendHeaders', i, false) as boolean;
				const sendBody = this.getNodeParameter('sendBody', i, false) as boolean;

				// Build headers with workflow context injection
				const headers: IDataObject = {
					'X-Workflow-Id': workflowId,
					'X-Workflow-Name': workflowName,
				};

				// Add user-defined headers
				if (sendHeaders) {
					const headerParameters = this.getNodeParameter(
						'headerParameters.parameters',
						i,
						[],
					) as Array<{ name: string; value: string }>;

					for (const header of headerParameters) {
						headers[header.name] = header.value;
					}
				}

				// Build request options with proper typing
				const options: IHttpRequestOptions = {
					method,
					url,
					headers,
				};

				// Add body if needed
				if (sendBody) {
					const bodyContentType = this.getNodeParameter('bodyContentType', i, 'json') as string;

					if (bodyContentType === 'json') {
						const jsonBody = this.getNodeParameter('jsonBody', i, '{}') as string;
						options.body = typeof jsonBody === 'string' ? JSON.parse(jsonBody) : jsonBody;
						headers['Content-Type'] = 'application/json';
					} else if (bodyContentType === 'raw') {
						const rawBody = this.getNodeParameter('rawBody', i, '') as string;
						options.body = rawBody;
					}
				}

				// Make the HTTP request using n8n's helper
				const response = await this.helpers.httpRequest(options);

				returnData.push({
					json: {
						...(typeof response === 'object' ? response : { data: response }),
						_metadata: {
							injectedHeaders: {
								'X-Workflow-Id': workflowId,
								'X-Workflow-Name': workflowName,
							},
						},
					},
					pairedItem: { item: i },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (error as Error).message,
						},
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
