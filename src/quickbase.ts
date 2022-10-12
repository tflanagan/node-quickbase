
'use strict';

/* Dependencies */
import merge from 'deepmerge';
import { debug } from 'debug';
import { Throttle } from 'generic-throttle';
import axios, {
	AxiosRequestConfig,
	AxiosResponse
} from 'axios';

/* Debug */
const debugMain = debug('quickbase:main');
const debugRequest = debug('quickbase:request');
const debugResponse = debug('quickbase:response');

/* Globals */
const VERSION = require('../package.json').version;
const IS_BROWSER = typeof(window) !== 'undefined';

/* Helpers */
const delay = (time: number) => {
	return new Promise((resolve) => {
		setTimeout(resolve, +time);
	});
};

type LowerKeysObject<T extends object> = {
	[K in keyof T as (K extends string ? Lowercase<K> : K)]: T[K]
};

const objKeysToLowercase = <T extends object>(obj: T): LowerKeysObject<T> => {
	return Object.fromEntries(Object.entries(obj).map(([key, value]) => [
		key.toLocaleLowerCase(),
		value
	])) as LowerKeysObject<T>;
};

/* Quickbase Error */
export type QuickBaseErrorJSON = {
	code: number;
	message: string;
	description: string;
	rayId: string;
};

export class QuickBaseError extends Error {

	/**
	 * Extends the native JavaScript `Error` object for use with Quickbase API errors
	 *
	 * Example:
	 * ```typescript
	 * const qbErr = new QuickBaseError(403, 'Access Denied', 'User token is invalid', 'xxxx');
	 * ```
	 *
	 * @param code Error code
	 * @param message Error message
	 * @param description Error description
	 * @param rayId Quickbase API Ray ID
	 */
	constructor(public code: number, public message: string, public description: string, public rayId: string) {
		super(message);
	}

	/**
	 * Serialize the QuickBaseError instance into JSON
	 */
	toJSON(): QuickBaseErrorJSON {
		return {
			code: this.code,
			message: this.message,
			description: this.description,
			rayId: this.rayId
		};
	}

	/**
	 * Rebuild the QuickBaseError instance from serialized JSON
	 *
	 * @param json Serialized QuickBaseError class options
	 */
	fromJSON(json: string | QuickBaseErrorJSON): QuickBaseError {
		if(typeof(json) === 'string'){
			json = JSON.parse(json);
		}

		if(typeof(json) !== 'object'){
			throw new TypeError('json argument must be type of object or a valid JSON string');
		}

		this.code = json.code;
		this.message = json.message;
		this.description = json.description;
		this.rayId = json.rayId;

		return this;
	}

	/**
	 * Create a new QuickBase instance from serialized JSON
	 *
	 * @param json Serialized QuickBaseError class options
	 */
	static fromJSON(json: string | QuickBaseErrorJSON): QuickBaseError {
		if(typeof(json) === 'string'){
			json = JSON.parse(json);
		}

		if(typeof(json) !== 'object'){
			throw new TypeError('json argument must be type of object or a valid JSON string');
		}

		return new QuickBaseError(json.code, json.message, json.description, json.rayId);
	}

}

/* Main Class */
export class QuickBase {

	public readonly CLASS_NAME: string = 'QuickBase';
	static readonly CLASS_NAME: string = 'QuickBase';

	static readonly VERSION: string = VERSION;

	/**
	 * The default settings of a `QuickBase` instance
	 */
	static defaults: Required<QuickBaseOptions> = {
		server: 'api.quickbase.com',
		version: 'v1',
		realm: IS_BROWSER ? window.location.host.split('.')[0] : '',
		userToken: '',
		tempToken: '',
		tempTokenDbid: '',
		appToken: '',
		userAgent: '',
		autoRenewTempTokens: true,
		connectionLimit: 10,
		connectionLimitPeriod: 1000,
		errorOnConnectionLimit: false,
		retryOnQuotaExceeded: true,
		proxy: false
	};

	/**
	 * The internal numerical id for API calls.
	 *
	 * Increments by 1 with each request.
	 */
	private _id: number = 0;

	/**
	 * The internal throttler for rate-limiting API calls
	 */
	private throttle: Throttle;

	/**
	 * The `QuickBase` instance settings
	 */
	public settings: Required<QuickBaseOptions>;

	constructor(options?: QuickBaseOptions){
		this.settings = merge(QuickBase.defaults, options || {});

		this.throttle = new Throttle(this.settings.connectionLimit, this.settings.connectionLimitPeriod, this.settings.errorOnConnectionLimit);

		debugMain('New Instance', this.settings);

		return this;
	}

	private getBaseRequest(){
		const headers = {
			'Content-Type': 'application/json; charset=UTF-8',
			[IS_BROWSER ? 'X-User-Agent' : 'User-Agent']: `${this.settings.userAgent} node-quickbase/v${VERSION} ${IS_BROWSER ? (window.navigator ? window.navigator.userAgent : '') : 'nodejs/' + process.version}`.trim(),
			'QB-Realm-Hostname': this.settings.realm
		};

		if(this.settings.userToken){
			headers.Authorization = `QB-USER-TOKEN ${this.settings.userToken}`;
		}else{
			if(this.settings.appToken){
				headers['QB-App-Token'] = this.settings.appToken;
			}

			if(this.settings.tempToken){
				headers.Authorization = `QB-TEMP-TOKEN ${this.settings.tempToken}`;
			}
		}

		return {
			method: 'GET',
			baseURL: `https://${this.settings.server}/${this.settings.version}`,
			headers: headers,
			proxy: this.settings.proxy
		};
	}

	private async request<T = any>(options: AxiosRequestConfig): Promise<AxiosResponse<T>> {
		const id = 0 + (++this._id);

		try {
			debugRequest(id, options);

			const results = await axios.request<T>(options);

			results.headers = objKeysToLowercase<Record<string, string>>(results.headers);

			debugResponse(id, results);

			return results;
		}catch(err: any){
			if(err.response){
				const headers = objKeysToLowercase<{
					'x-ratelimit-reset': number;
					'qb-api-ray': string;
				}>(err.response.headers);

				const qbErr = new QuickBaseError(
					err.response.status,
					err.response.data.message,
					err.response.data.description,
					headers['qb-api-ray']
				);

				debugResponse(id, 'Quickbase Error', qbErr);

				if(this.settings.retryOnQuotaExceeded && qbErr.code === 429 && typeof(headers['x-ratelimit-reset']) !== 'undefined'){
					const delayMs = +headers['x-ratelimit-reset'];
					
					debugResponse(id, `Waiting ${delayMs}ms until retrying...`);

					await delay(delayMs);
					
					debugResponse(id, `Retrying...`);

					return await this.request<T>(options);
				}

				if(this.settings.autoRenewTempTokens && qbErr.description.match(/Your ticket has expired/) && this.settings.tempTokenDbid){
					debugResponse(id, `Gettomg new temporary ticket for ${this.settings.tempTokenDbid}...`);

					const results = await this.request(merge.all([
						this.getBaseRequest(),
						{
							url: `auth/temporary/${this.settings.tempTokenDbid}`,
							withCredentials: true
						}
					]));

					this.setTempToken(this.settings.tempTokenDbid, results.data.temporaryAuthorization);
				
					debugResponse(id, `Retrying...`);

					return await this.request<T>(options);
				}
			
				throw qbErr;
			}

			debugResponse(id, 'Error', err);

			throw err;
		}
	}

	private async api<T = any>(actOptions: AxiosRequestConfig, reqOptions?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
		return this.throttle.acquire(async () => {
			return await this.request<T>(merge.all([
				this.getBaseRequest(),
				actOptions,
				reqOptions || {}
			]));
		});
	}

	/**
	 * Set the internally stored `tempToken` for use in subsequent API calls
	 *
	 * Example:
	 * ```typescript
	 * qb.setTempToken('xxxx.xxx[...]xxx', 'xxxxxxxxx');
	 * ```
	 *
	 * @param dbid Quickbase Application ID or Table ID
	 * @param tempToken Temporary Quickbase Authentication Token
	 */
	setTempToken(dbid: string, tempToken: string): QuickBase {
		this.settings.tempTokenDbid = dbid;
		this.settings.tempToken = tempToken;

		return this;
	}

	/**
	 * Rebuild the QuickBase instance from serialized JSON
	 *
	 * @param json QuickBase class options
	 */
	fromJSON(json: string | QuickBaseOptions): QuickBase {
		if(typeof(json) === 'string'){
			json = JSON.parse(json);
		}

		if(typeof(json) !== 'object'){
			throw new TypeError('json argument must be type of object or a valid JSON string');
		}

		this.settings = merge(this.settings, json);

		return this;
	}

	/**
	 * Serialize the QuickBase instance into JSON
	 */
	toJSON(): Required<QuickBaseOptions> {
		return merge({}, this.settings);
	}

	/**
	 * Create a new QuickBase instance from serialized JSON
	 *
	 * @param json QuickBase class options
	 */
	static fromJSON(json: string | QuickBaseOptions): QuickBase {
		if(typeof(json) === 'string'){
			json = JSON.parse(json);
		}

		if(typeof(json) !== 'object'){
			throw new TypeError('json argument must be type of object or a valid JSON string');
		}

		return new QuickBase(json);
	}

	/**
	 * Test if a variable is a `quickbase` object
	 * 
	 * @param obj A variable you'd like to test
	 */
	static IsQuickBase(obj: any): obj is QuickBase {
		return ((obj || {}) as QuickBase).CLASS_NAME === QuickBase.CLASS_NAME;
	}

	/**
	 * Create an app
	 *
	 * Creates an application in an account. You must have application creation rights in the respective account. Main properties and application variables can be set with this API.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/createApp)
	 *
	 * @param options Create an app method options object
	 * @param options.assignToken Set to true if you would like to assign the app to the user token you used to create the application. The default is false.
	 * @param options.variables[].name The name for the variable.
	 * @param options.variables[].value The value for the variable.
	 * @param options.name The app name. You are allowed to create multiple apps with the same name, in the same realm, because they will have different dbid values. We urge you to be careful about doing this.
	 * @param options.securityProperties.hideFromPublic Hide from public application searches
	 * @param options.securityProperties.mustBeRealmApproved Only "approved" users may access this application
	 * @param options.securityProperties.allowClone Allow users who are not administrators to copy
	 * @param options.securityProperties.useIPFilter Only users logging in from "approved" IP addresses may access this application
	 * @param options.securityProperties.allowExport Allow users who are not administrators to export data
	 * @param options.securityProperties.enableAppTokens Require Application Tokens
	 * @param options.description The description for the app. If this property is left out, the app description will be blank.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async createApp({ requestOptions, returnAxios = false, ...body }: QuickBaseRequestCreateApp & { returnAxios?: false }): Promise<QuickBaseResponseCreateApp>;
	public async createApp({ requestOptions, returnAxios = true, ...body }: QuickBaseRequestCreateApp & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseCreateApp>>;
	public async createApp({ requestOptions, returnAxios = false, ...body }: QuickBaseRequestCreateApp): Promise<QuickBaseResponseCreateApp | AxiosResponse<QuickBaseResponseCreateApp>> {
		const results = await this.api<QuickBaseResponseCreateApp>({
			method: 'POST',
			url: `/apps`,
			data: body,
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Get an app
	 *
	 * Returns the main properties of an application, including application variables.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/getApp)
	 *
	 * @param options Get an app method options object
	 * @param options.appId The unique identifier of an app
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async getApp({ appId, requestOptions, returnAxios = false }: QuickBaseRequestGetApp & { returnAxios?: false }): Promise<QuickBaseResponseGetApp>;
	public async getApp({ appId, requestOptions, returnAxios = true }: QuickBaseRequestGetApp & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseGetApp>>;
	public async getApp({ appId, requestOptions, returnAxios = false }: QuickBaseRequestGetApp): Promise<QuickBaseResponseGetApp | AxiosResponse<QuickBaseResponseGetApp>> {
		const results = await this.api<QuickBaseResponseGetApp>({
			method: 'GET',
			url: `/apps/${appId}`,
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Update an app
	 *
	 * Updates the main properties and/or application variables for a specific application. Any properties of the app that you do not specify in the request body will remain unchanged.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/updateApp)
	 *
	 * @param options Update an app method options object
	 * @param options.appId The unique identifier of an app
	 * @param options.variables[].name The name for the variable.
	 * @param options.variables[].value The value for the variable.
	 * @param options.name The name for the app.
	 * @param options.securityProperties.hideFromPublic Hide from public application searches
	 * @param options.securityProperties.mustBeRealmApproved Only "approved" users may access this application
	 * @param options.securityProperties.allowClone Allow users who are not administrators to copy
	 * @param options.securityProperties.useIPFilter Only users logging in from "approved" IP addresses may access this application
	 * @param options.securityProperties.allowExport Allow users who are not administrators to export data
	 * @param options.securityProperties.enableAppTokens Require Application Tokens
	 * @param options.description The description for the app.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async updateApp({ appId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestUpdateApp & { returnAxios?: false }): Promise<QuickBaseResponseUpdateApp>;
	public async updateApp({ appId, requestOptions, returnAxios = true, ...body }: QuickBaseRequestUpdateApp & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseUpdateApp>>;
	public async updateApp({ appId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestUpdateApp): Promise<QuickBaseResponseUpdateApp | AxiosResponse<QuickBaseResponseUpdateApp>> {
		const results = await this.api<QuickBaseResponseUpdateApp>({
			method: 'POST',
			url: `/apps/${appId}`,
			data: body,
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Delete an app
	 *
	 * Deletes an entire application, including all of the tables and data.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/deleteApp)
	 *
	 * @param options Delete an app method options object
	 * @param options.appId The unique identifier of an app
	 * @param options.name To confirm application deletion we ask for application name.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async deleteApp({ appId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestDeleteApp & { returnAxios?: false }): Promise<QuickBaseResponseDeleteApp>;
	public async deleteApp({ appId, requestOptions, returnAxios = true, ...body }: QuickBaseRequestDeleteApp & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseDeleteApp>>;
	public async deleteApp({ appId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestDeleteApp): Promise<QuickBaseResponseDeleteApp | AxiosResponse<QuickBaseResponseDeleteApp>> {
		const results = await this.api<QuickBaseResponseDeleteApp>({
			method: 'DELETE',
			url: `/apps/${appId}`,
			data: body,
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Get app events
	 *
	 * Get a list of events that can be triggered based on data or user actions in this application, includes: Email notification, Reminders, Subscriptions, QB Actions, Webhooks, record change triggered Automations (does not include scheduled).
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/getAppEvents)
	 *
	 * @param options Get app events method options object
	 * @param options.appId The unique identifier of an app
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async getAppEvents({ appId, requestOptions, returnAxios = false }: QuickBaseRequestGetAppEvents & { returnAxios?: false }): Promise<QuickBaseResponseGetAppEvents>;
	public async getAppEvents({ appId, requestOptions, returnAxios = true }: QuickBaseRequestGetAppEvents & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseGetAppEvents>>;
	public async getAppEvents({ appId, requestOptions, returnAxios = false }: QuickBaseRequestGetAppEvents): Promise<QuickBaseResponseGetAppEvents | AxiosResponse<QuickBaseResponseGetAppEvents>> {
		const results = await this.api<QuickBaseResponseGetAppEvents>({
			method: 'GET',
			url: `/apps/${appId}/events`,
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Copy an app
	 *
	 * Copies the specified application. The new application will have the same schema as the original. See below for additional copy options.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/copyApp)
	 *
	 * @param options Copy an app method options object
	 * @param options.appId The unique identifier of an app
	 * @param options.name The name of the newly copied app
	 * @param options.description The description of the newly copied app
	 * @param options.properties.assignUserToken Whether to add the user token used to make this request to the new app
	 * @param options.properties.excludeFiles If keepData is true, whether to copy the file attachments as well. If keepData is false, this property is ignored
	 * @param options.properties.keepData Whether to copy the app's data along with the schema
	 * @param options.properties.usersAndRoles If true, users will be copied along with their assigned roles. If false, users and roles will be copied but roles will not be assigned
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async copyApp({ appId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestCopyApp & { returnAxios?: false }): Promise<QuickBaseResponseCopyApp>;
	public async copyApp({ appId, requestOptions, returnAxios = true, ...body }: QuickBaseRequestCopyApp & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseCopyApp>>;
	public async copyApp({ appId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestCopyApp): Promise<QuickBaseResponseCopyApp | AxiosResponse<QuickBaseResponseCopyApp>> {
		const results = await this.api<QuickBaseResponseCopyApp>({
			method: 'POST',
			url: `/apps/${appId}/copy`,
			data: body,
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Create a table
	 *
	 * Creates a table in an application.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/createTable)
	 *
	 * @param options Create a table method options object
	 * @param options.appId The unique identifier of an app
	 * @param options.name The name for the table.
	 * @param options.pluralRecordName The plural noun for records in the table. If this value is not passed the default value is 'Records'.
	 * @param options.singleRecordName The singular noun for records in the table. If this value is not passed the default value is 'Record'.
	 * @param options.description The description for the table. If this value is not passed the default value is blank.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async createTable({ appId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestCreateTable & { returnAxios?: false }): Promise<QuickBaseResponseCreateTable>;
	public async createTable({ appId, requestOptions, returnAxios = true, ...body }: QuickBaseRequestCreateTable & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseCreateTable>>;
	public async createTable({ appId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestCreateTable): Promise<QuickBaseResponseCreateTable | AxiosResponse<QuickBaseResponseCreateTable>> {
		const results = await this.api<QuickBaseResponseCreateTable>({
			method: 'POST',
			url: `/tables`,
			data: body,
			params: {
				appId
			}
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Get tables for an app
	 *
	 * Gets a list of all the tables that exist in a specific application. The properties for each table are the same as what is returned in Get table.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/getAppTables)
	 *
	 * @param options Get tables for an app method options object
	 * @param options.appId The unique identifier of an app
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async getAppTables({ appId, requestOptions, returnAxios = false }: QuickBaseRequestGetAppTables & { returnAxios?: false }): Promise<QuickBaseResponseGetAppTables>;
	public async getAppTables({ appId, requestOptions, returnAxios = true }: QuickBaseRequestGetAppTables & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseGetAppTables>>;
	public async getAppTables({ appId, requestOptions, returnAxios = false }: QuickBaseRequestGetAppTables): Promise<QuickBaseResponseGetAppTables | AxiosResponse<QuickBaseResponseGetAppTables>> {
		const results = await this.api<QuickBaseResponseGetAppTables>({
			method: 'GET',
			url: `/tables`,
			params: {
				appId
			}
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Get a table
	 *
	 * Gets the properties of an individual table that is part of an application.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/getTable)
	 *
	 * @param options Get a table method options object
	 * @param options.tableId The unique identifier (dbid) of the table.
	 * @param options.appId The unique identifier of an app
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async getTable({ tableId, appId, requestOptions, returnAxios = false }: QuickBaseRequestGetTable & { returnAxios?: false }): Promise<QuickBaseResponseGetTable>;
	public async getTable({ tableId, appId, requestOptions, returnAxios = true }: QuickBaseRequestGetTable & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseGetTable>>;
	public async getTable({ tableId, appId, requestOptions, returnAxios = false }: QuickBaseRequestGetTable): Promise<QuickBaseResponseGetTable | AxiosResponse<QuickBaseResponseGetTable>> {
		const results = await this.api<QuickBaseResponseGetTable>({
			method: 'GET',
			url: `/tables/${tableId}`,
			params: {
				appId
			}
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Update a table
	 *
	 * Updates the main properties of a specific table. Any properties of the table that you do not specify in the request body will remain unchanged.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/updateTable)
	 *
	 * @param options Update a table method options object
	 * @param options.tableId The unique identifier (dbid) of the table.
	 * @param options.appId The unique identifier of an app
	 * @param options.name The name for the table.
	 * @param options.pluralRecordName The plural noun for records in the table. If this value is not passed the default value is 'Records'.
	 * @param options.singleRecordName The singular noun for records in the table. If this value is not passed the default value is 'Record'.
	 * @param options.description The description for the table. If this value is not passed the default value is blank.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async updateTable({ tableId, appId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestUpdateTable & { returnAxios?: false }): Promise<QuickBaseResponseUpdateTable>;
	public async updateTable({ tableId, appId, requestOptions, returnAxios = true, ...body }: QuickBaseRequestUpdateTable & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseUpdateTable>>;
	public async updateTable({ tableId, appId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestUpdateTable): Promise<QuickBaseResponseUpdateTable | AxiosResponse<QuickBaseResponseUpdateTable>> {
		const results = await this.api<QuickBaseResponseUpdateTable>({
			method: 'POST',
			url: `/tables/${tableId}`,
			data: body,
			params: {
				appId
			}
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Delete a table
	 *
	 * Deletes a specific table in an application, including all of the data within it.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/deleteTable)
	 *
	 * @param options Delete a table method options object
	 * @param options.tableId The unique identifier (dbid) of the table.
	 * @param options.appId The unique identifier of an app
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async deleteTable({ tableId, appId, requestOptions, returnAxios = false }: QuickBaseRequestDeleteTable & { returnAxios?: false }): Promise<QuickBaseResponseDeleteTable>;
	public async deleteTable({ tableId, appId, requestOptions, returnAxios = true }: QuickBaseRequestDeleteTable & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseDeleteTable>>;
	public async deleteTable({ tableId, appId, requestOptions, returnAxios = false }: QuickBaseRequestDeleteTable): Promise<QuickBaseResponseDeleteTable | AxiosResponse<QuickBaseResponseDeleteTable>> {
		const results = await this.api<QuickBaseResponseDeleteTable>({
			method: 'DELETE',
			url: `/tables/${tableId}`,
			params: {
				appId
			}
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Get all relationships
	 *
	 * Get a list of all relationships, and their definitions, for a specific table. Details are provided for the child side of relationships within a given application. Limited details are returned for cross-application relationships.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/getRelationships)
	 *
	 * @param options Get all relationships method options object
	 * @param options.childTableId The unique identifier (dbid) of the child table.
	 * @param options.skip The number of relationships to skip.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async getRelationships({ childTableId, skip, requestOptions, returnAxios = false }: QuickBaseRequestGetRelationships & { returnAxios?: false }): Promise<QuickBaseResponseGetRelationships>;
	public async getRelationships({ childTableId, skip, requestOptions, returnAxios = true }: QuickBaseRequestGetRelationships & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseGetRelationships>>;
	public async getRelationships({ childTableId, skip, requestOptions, returnAxios = false }: QuickBaseRequestGetRelationships): Promise<QuickBaseResponseGetRelationships | AxiosResponse<QuickBaseResponseGetRelationships>> {
		const results = await this.api<QuickBaseResponseGetRelationships>({
			method: 'GET',
			url: `/tables/${childTableId}/relationships`,
			params: {
				skip
			}
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Create a relationship
	 *
	 * Creates a relationship in a table as well as lookup/summary fields. Relationships can only be created for tables within the same app.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/createRelationship)
	 *
	 * @param options Create a relationship method options object
	 * @param options.childTableId The unique identifier (dbid) of the table. This will be the child table.
	 * @param options.summaryFields[].summaryFid The field id to summarize.
	 * @param options.summaryFields[].label The label for the summary field.
	 * @param options.summaryFields[].accumulationType The accumulation type for the summary field.
	 * @param options.summaryFields[].where The filter, using the Quickbase query language, which determines the records to return.
	 * @param options.lookupFieldIds Array of field ids in the parent table that will become lookup fields in the child table.
	 * @param options.parentTableId The parent table id for the relationship.
	 * @param options.foreignKeyField.label The label for the foreign key field.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async createRelationship({ childTableId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestCreateRelationship & { returnAxios?: false }): Promise<QuickBaseResponseCreateRelationship>;
	public async createRelationship({ childTableId, requestOptions, returnAxios = true, ...body }: QuickBaseRequestCreateRelationship & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseCreateRelationship>>;
	public async createRelationship({ childTableId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestCreateRelationship): Promise<QuickBaseResponseCreateRelationship | AxiosResponse<QuickBaseResponseCreateRelationship>> {
		const results = await this.api<QuickBaseResponseCreateRelationship>({
			method: 'POST',
			url: `/tables/${childTableId}/relationship`,
			data: body,
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Update a relationship
	 *
	 * Use this endpoint to add lookup fields and summary fields to an existing relationship. Updating a relationship will not delete existing lookup/summary fields.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/updateRelationship)
	 *
	 * @param options Update a relationship method options object
	 * @param options.childTableId The unique identifier (dbid) of the table. This will be the child table.
	 * @param options.relationshipId The relationship id. This is the field id of the reference field on the child table.
	 * @param options.summaryFields[].summaryFid The field id to summarize.
	 * @param options.summaryFields[].label The label for the summary field.
	 * @param options.summaryFields[].accumulationType The accumulation type for the summary field.
	 * @param options.summaryFields[].where The filter, using the Quickbase query language, which determines the records to return.
	 * @param options.lookupFieldIds An array of field ids on the parent table that will become lookup fields on the child table.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async updateRelationship({ childTableId, relationshipId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestUpdateRelationship & { returnAxios?: false }): Promise<QuickBaseResponseUpdateRelationship>;
	public async updateRelationship({ childTableId, relationshipId, requestOptions, returnAxios = true, ...body }: QuickBaseRequestUpdateRelationship & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseUpdateRelationship>>;
	public async updateRelationship({ childTableId, relationshipId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestUpdateRelationship): Promise<QuickBaseResponseUpdateRelationship | AxiosResponse<QuickBaseResponseUpdateRelationship>> {
		const results = await this.api<QuickBaseResponseUpdateRelationship>({
			method: 'POST',
			url: `/tables/${childTableId}/relationship/${relationshipId}`,
			data: body,
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Delete a relationship
	 *
	 * Use this endpoint to delete an entire relationship, including all lookup and summary fields. The reference field in the relationship will not be deleted.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/deleteRelationship)
	 *
	 * @param options Delete a relationship method options object
	 * @param options.childTableId The unique identifier (dbid) of the table. This will be the child table.
	 * @param options.relationshipId The relationship id. This is the field id of the reference field on the child table.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async deleteRelationship({ childTableId, relationshipId, requestOptions, returnAxios = false }: QuickBaseRequestDeleteRelationship & { returnAxios?: false }): Promise<QuickBaseResponseDeleteRelationship>;
	public async deleteRelationship({ childTableId, relationshipId, requestOptions, returnAxios = true }: QuickBaseRequestDeleteRelationship & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseDeleteRelationship>>;
	public async deleteRelationship({ childTableId, relationshipId, requestOptions, returnAxios = false }: QuickBaseRequestDeleteRelationship): Promise<QuickBaseResponseDeleteRelationship | AxiosResponse<QuickBaseResponseDeleteRelationship>> {
		const results = await this.api<QuickBaseResponseDeleteRelationship>({
			method: 'DELETE',
			url: `/tables/${childTableId}/relationship/${relationshipId}`,
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Get reports for a table
	 *
	 * Get the schema (properties) of all reports for a table. If the user running the API is an application administrator, the API will also return all personal reports with owner's user id.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/getTableReports)
	 *
	 * @param options Get reports for a table method options object
	 * @param options.tableId The unique identifier of the table.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async getTableReports({ tableId, requestOptions, returnAxios = false }: QuickBaseRequestGetTableReports & { returnAxios?: false }): Promise<QuickBaseResponseGetTableReports>;
	public async getTableReports({ tableId, requestOptions, returnAxios = true }: QuickBaseRequestGetTableReports & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseGetTableReports>>;
	public async getTableReports({ tableId, requestOptions, returnAxios = false }: QuickBaseRequestGetTableReports): Promise<QuickBaseResponseGetTableReports | AxiosResponse<QuickBaseResponseGetTableReports>> {
		const results = await this.api<QuickBaseResponseGetTableReports>({
			method: 'GET',
			url: `/reports`,
			params: {
				tableId
			}
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Get a report
	 *
	 * Get the schema (properties) of an individual report.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/getReport)
	 *
	 * @param options Get a report method options object
	 * @param options.reportId The identifier of the report, unique to the table.
	 * @param options.tableId The unique identifier of table.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async getReport({ reportId, tableId, requestOptions, returnAxios = false }: QuickBaseRequestGetReport & { returnAxios?: false }): Promise<QuickBaseResponseGetReport>;
	public async getReport({ reportId, tableId, requestOptions, returnAxios = true }: QuickBaseRequestGetReport & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseGetReport>>;
	public async getReport({ reportId, tableId, requestOptions, returnAxios = false }: QuickBaseRequestGetReport): Promise<QuickBaseResponseGetReport | AxiosResponse<QuickBaseResponseGetReport>> {
		const results = await this.api<QuickBaseResponseGetReport>({
			method: 'GET',
			url: `/reports/${reportId}`,
			params: {
				tableId
			}
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Run a report
	 *
	 * Runs a report, based on an ID and returns the underlying data associated with it. The format of the data will vary based on the report type. Reports that focus on record-level data (table, calendar, etc.) return the individual records. Aggregate reports (summary, chart) will return the summarized information as configured in the report. UI-specific elements are not returned, such as totals, averages and visualizations. Returns data with intelligent pagination based on the approximate size of each record. The metadata object will include the necessary information to iterate over the response and gather more data.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/runReport)
	 *
	 * @param options Run a report method options object
	 * @param options.reportId The identifier of the report, unique to the table.
	 * @param options.tableId The identifier of the table for the report.
	 * @param options.skip The number of records to skip. You can set this value when paginating through a set of results.
	 * @param options.top The maximum number of records to return. You can override the default Quickbase pagination to get more or fewer results. If your requested value here exceeds the dynamic maximums, we will return a subset of results and the rest can be gathered in subsequent API calls.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async runReport({ reportId, tableId, skip, top, requestOptions, returnAxios = false }: QuickBaseRequestRunReport & { returnAxios?: false }): Promise<QuickBaseResponseRunReport>;
	public async runReport({ reportId, tableId, skip, top, requestOptions, returnAxios = true }: QuickBaseRequestRunReport & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseRunReport>>;
	public async runReport({ reportId, tableId, skip, top, requestOptions, returnAxios = false }: QuickBaseRequestRunReport): Promise<QuickBaseResponseRunReport | AxiosResponse<QuickBaseResponseRunReport>> {
		const results = await this.api<QuickBaseResponseRunReport>({
			method: 'POST',
			url: `/reports/${reportId}/run`,
			params: {
				tableId,
				skip,
				top
			}
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Get fields for a table
	 *
	 * Gets the properties for all fields in a specific table. The properties for each field are the same as in Get field.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/getFields)
	 *
	 * @param options Get fields for a table method options object
	 * @param options.tableId The unique identifier (dbid) of the table.
	 * @param options.includeFieldPerms Set to 'true' if you'd like to get back the custom permissions for the field(s).
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async getFields({ tableId, includeFieldPerms, requestOptions, returnAxios = false }: QuickBaseRequestGetFields & { returnAxios?: false }): Promise<QuickBaseResponseGetFields>;
	public async getFields({ tableId, includeFieldPerms, requestOptions, returnAxios = true }: QuickBaseRequestGetFields & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseGetFields>>;
	public async getFields({ tableId, includeFieldPerms, requestOptions, returnAxios = false }: QuickBaseRequestGetFields): Promise<QuickBaseResponseGetFields | AxiosResponse<QuickBaseResponseGetFields>> {
		const results = await this.api<QuickBaseResponseGetFields>({
			method: 'GET',
			url: `/fields`,
			params: {
				tableId,
				includeFieldPerms
			}
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Create a field
	 *
	 * Creates a field within a table, including the custom permissions of that field.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/createField)
	 *
	 * @param options Create a field method options object
	 * @param options.tableId The unique identifier of the table.
	 * @param options.audited Indicates if the field is being tracked as part of Quickbase Audit Logs. You can only set this property to "true" if the app has audit logs enabled. See Enable data change logs under [Quickbase Audit Logs](https://help.quickbase.com/user-assistance/audit_logs.html). Defaults to false.
	 * @param options.fieldHelp The configured help text shown to users within the product.
	 * @param options.bold Indicates if the field is configured to display in bold in the product. Defaults to false.
	 * @param options.properties.comments The comments entered on the field properties by an administrator.
	 * @param options.properties.doesTotal Whether this field totals in reports within the product.
	 * @param options.properties.autoSave Whether the link field will auto save.
	 * @param options.properties.defaultValueLuid Default user id value.
	 * @param options.properties.useI18NFormat Whether phone numbers should be in E.164 standard international format
	 * @param options.properties.maxVersions The maximum number of versions configured for a file attachment.
	 * @param options.properties.format The format to display time.
	 * @param options.properties.carryChoices Whether the field should carry its multiple choice fields when copied.
	 * @param options.properties.maxLength The maximum number of characters allowed for entry in Quickbase for this field.
	 * @param options.properties.linkText The configured text value that replaces the URL that users see within the product.
	 * @param options.properties.parentFieldId The id of the parent composite field, when applicable.
	 * @param options.properties.displayTimezone Indicates whether to display the timezone within the product.
	 * @param options.properties.allowNewChoices Indicates if users can add new choices to a selection list.
	 * @param options.properties.defaultToday Indicates if the field value is defaulted today for new records.
	 * @param options.properties.units The units label.
	 * @param options.properties.openTargetIn Indicates which target the URL should open in when a user clicks it within the product.
	 * @param options.properties.sourceFieldId The id of the source field.
	 * @param options.properties.doesAverage Whether this field averages in reports within the product.
	 * @param options.properties.formula The formula of the field as configured in Quickbase.
	 * @param options.properties.decimalPlaces The number of decimal places displayed in the product for this field.
	 * @param options.properties.defaultCountryCode Controls the default country shown on international phone widgets on forms. Country code should be entered in the ISO 3166-1 alpha-2 format.
	 * @param options.properties.displayMonth How to display months.
	 * @param options.properties.seeVersions Indicates if the user can see other versions, aside from the most recent, of a file attachment within the product.
	 * @param options.properties.numLines The number of lines shown in Quickbase for this text field.
	 * @param options.properties.defaultKind The user default type.
	 * @param options.properties.displayEmail How the email is displayed.
	 * @param options.properties.coverText An alternate user friendly text that can be used to display a link in the browser.
	 * @param options.properties.currencySymbol The current symbol used when displaying field values within the product.
	 * @param options.properties.targetFieldId The id of the target field.
	 * @param options.properties.displayUser The configured option for how users display within the product.
	 * @param options.properties.blankIsZero Whether a blank value is treated the same as 0 in calculations within the product.
	 * @param options.properties.exact Whether an exact match is required for a report link.
	 * @param options.properties.defaultDomain Default email domain.
	 * @param options.properties.defaultValue The default value configured for a field when a new record is added.
	 * @param options.properties.abbreviate Don't show the URL protocol when showing the URL.
	 * @param options.properties.numberFormat The format used for displaying numeric values in the product (decimal, separators, digit group).
	 * @param options.properties.targetTableName The field's target table name.
	 * @param options.properties.appearsAs The link text, if empty, the url will be used as link text.
	 * @param options.properties.width The field's html input width in the product.
	 * @param options.properties.currencyFormat The currency format used when displaying field values within the product.
	 * @param options.properties.displayDayOfWeek Indicates whether to display the day of the week within the product.
	 * @param options.properties.commaStart The number of digits before commas display in the product, when applicable.
	 * @param options.properties.choices An array of entries that exist for a field that offers choices to the user. Note that these choices refer to the valid values of any records added in the future. You are allowed to remove values from the list of choices even if there are existing records with those values in this field. They will be displayed in red when users look at the data in the browser but there is no other effect. While updating a field with this property, the old choices are removed and replaced by the new choices.
	 * @param options.properties.targetTableId The id of the target table.
	 * @param options.properties.displayRelative Whether to display time as relative.
	 * @param options.properties.compositeFields An array of the fields that make up a composite field (e.g., address).
	 * @param options.properties.displayCheckboxAsText Indicates whether the checkbox values will be shown as text in reports.
	 * @param options.properties.displayTime Indicates whether to display the time, in addition to the date.
	 * @param options.properties.versionMode Version modes for files. Keep all versions vs keep last version.
	 * @param options.properties.snapFieldId The id of the field that is used to snapshot values from, when applicable.
	 * @param options.properties.hours24 Indicates whether or not to display time in the 24-hour format within the product.
	 * @param options.properties.sortAlpha Whether to sort alphabetically, default sort is by record ID.
	 * @param options.properties.sortAsGiven Indicates if the listed entries sort as entered vs alphabetically.
	 * @param options.properties.hasExtension Whether this field has a phone extension.
	 * @param options.properties.useNewWindow Indicates if the file should open a new window when a user clicks it within the product.
	 * @param options.properties.appendOnly Whether this field is append only.
	 * @param options.properties.displayAsLink Indicates if a field that is part of the relationship should be shown as a hyperlink to the parent record within the product.
	 * @param options.appearsByDefault Indicates if the field is marked as a default in reports. Defaults to true.
	 * @param options.fieldType The [field types](https://help.quickbase.com/user-assistance/field_types.html), click on any of the field type links for more info.
	 * @param options.permissions[].role The role associated with a given permission for the field
	 * @param options.permissions[].permissionType The permission given to the role for this field
	 * @param options.permissions[].roleId The Id of the given role
	 * @param options.addToForms Whether the field you are adding should appear on forms. Defaults to false.
	 * @param options.label The label (name) of the field.
	 * @param options.findEnabled Indicates if the field is marked as searchable. Defaults to true.
	 * @param options.noWrap Indicates if the field is configured to not wrap when displayed in the product. Defaults to false.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async createField({ tableId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestCreateField & { returnAxios?: false }): Promise<QuickBaseResponseCreateField>;
	public async createField({ tableId, requestOptions, returnAxios = true, ...body }: QuickBaseRequestCreateField & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseCreateField>>;
	public async createField({ tableId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestCreateField): Promise<QuickBaseResponseCreateField | AxiosResponse<QuickBaseResponseCreateField>> {
		const results = await this.api<QuickBaseResponseCreateField>({
			method: 'POST',
			url: `/fields`,
			data: body,
			params: {
				tableId
			}
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Delete field(s)
	 *
	 * Deletes one or many fields in a table, based on field id. This will also permanently delete any data or calculations in that field.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/deleteFields)
	 *
	 * @param options Delete field(s) method options object
	 * @param options.tableId The unique identifier of the table.
	 * @param options.fieldIds List of field ids to be deleted.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async deleteFields({ tableId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestDeleteFields & { returnAxios?: false }): Promise<QuickBaseResponseDeleteFields>;
	public async deleteFields({ tableId, requestOptions, returnAxios = true, ...body }: QuickBaseRequestDeleteFields & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseDeleteFields>>;
	public async deleteFields({ tableId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestDeleteFields): Promise<QuickBaseResponseDeleteFields | AxiosResponse<QuickBaseResponseDeleteFields>> {
		const results = await this.api<QuickBaseResponseDeleteFields>({
			method: 'DELETE',
			url: `/fields`,
			data: body,
			params: {
				tableId
			}
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Get field
	 *
	 * Gets the properties of an individual field, based on field id.  
	 * Properties present on all field types are returned at the top level. Properties unique to a specific type of field are returned under the 'properties' attribute. Please see [Field types page](../fieldInfo) for more details on the properties for each field type.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/getField)
	 *
	 * @param options Get field method options object
	 * @param options.fieldId The unique identifier (fid) of the field.
	 * @param options.tableId The unique identifier (dbid) of the table.
	 * @param options.includeFieldPerms Set to 'true' if you'd like to get back the custom permissions for the field(s).
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async getField({ fieldId, tableId, includeFieldPerms, requestOptions, returnAxios = false }: QuickBaseRequestGetField & { returnAxios?: false }): Promise<QuickBaseResponseGetField>;
	public async getField({ fieldId, tableId, includeFieldPerms, requestOptions, returnAxios = true }: QuickBaseRequestGetField & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseGetField>>;
	public async getField({ fieldId, tableId, includeFieldPerms, requestOptions, returnAxios = false }: QuickBaseRequestGetField): Promise<QuickBaseResponseGetField | AxiosResponse<QuickBaseResponseGetField>> {
		const results = await this.api<QuickBaseResponseGetField>({
			method: 'GET',
			url: `/fields/${fieldId}`,
			params: {
				tableId,
				includeFieldPerms
			}
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Update a field
	 *
	 * Updates the properties and custom permissions of a field. The attempt to update certain properties might cause existing data to no longer obey the field’s new properties and may be rejected. See the descriptions of required, unique, and choices, below, for specific situations. Any properties of the field that you do not specify in the request body will remain unchanged.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/updateField)
	 *
	 * @param options Update a field method options object
	 * @param options.fieldId The unique identifier (fid) of the field.
	 * @param options.tableId The unique identifier of the table.
	 * @param options.audited Indicates if the field is being tracked as part of Quickbase Audit Logs. You can only set this property to "true" if the app has audit logs enabled. See Enable data change logs under [Quickbase Audit Logs](https://help.quickbase.com/user-assistance/audit_logs.html).
	 * @param options.fieldHelp The configured help text shown to users within the product.
	 * @param options.bold Indicates if the field is configured to display in bold in the product.
	 * @param options.required Indicates if the field is required (i.e. if every record must have a non-null value in this field). If you attempt to change a field from not-required to required, and the table currently contains records that have null values in that field, you will get an error indicating that there are null values of the field. In this case you need to find and update those records with null values of the field before changing the field to required.
	 * @param options.properties.comments The comments entered on the field properties by an administrator.
	 * @param options.properties.doesTotal Whether this field totals in reports within the product.
	 * @param options.properties.autoSave Whether the link field will auto save.
	 * @param options.properties.defaultValueLuid Default user id value.
	 * @param options.properties.useI18NFormat Whether phone numbers should be in E.164 standard international format
	 * @param options.properties.maxVersions The maximum number of versions configured for a file attachment.
	 * @param options.properties.format The format to display time.
	 * @param options.properties.carryChoices Whether the field should carry its multiple choice fields when copied.
	 * @param options.properties.maxLength The maximum number of characters allowed for entry in Quickbase for this field.
	 * @param options.properties.linkText The configured text value that replaces the URL that users see within the product.
	 * @param options.properties.parentFieldId The id of the parent composite field, when applicable.
	 * @param options.properties.displayTimezone Indicates whether to display the timezone within the product.
	 * @param options.properties.summaryTargetFieldId The id of the field that is used to aggregate values from the child, when applicable. This displays 0 if the summary function doesn’t require a field selection (like count).
	 * @param options.properties.allowNewChoices Indicates if users can add new choices to a selection list.
	 * @param options.properties.defaultToday Indicates if the field value is defaulted today for new records.
	 * @param options.properties.units The units label.
	 * @param options.properties.openTargetIn Indicates which target the URL should open in when a user clicks it within the product.
	 * @param options.properties.lookupTargetFieldId The id of the field that is the target on the parent table for this lookup.
	 * @param options.properties.summaryFunction The accumulation type for the summary field.
	 * @param options.properties.sourceFieldId The id of the source field.
	 * @param options.properties.doesAverage Whether this field averages in reports within the product.
	 * @param options.properties.formula The formula of the field as configured in Quickbase.
	 * @param options.properties.decimalPlaces The number of decimal places displayed in the product for this field.
	 * @param options.properties.defaultCountryCode Controls the default country shown on international phone widgets on forms. Country code should be entered in the ISO 3166-1 alpha-2 format.
	 * @param options.properties.displayMonth How to display months.
	 * @param options.properties.seeVersions Indicates if the user can see other versions, aside from the most recent, of a file attachment within the product.
	 * @param options.properties.numLines The number of lines shown in Quickbase for this text field.
	 * @param options.properties.defaultKind The user default type.
	 * @param options.properties.displayEmail How the email is displayed.
	 * @param options.properties.coverText An alternate user friendly text that can be used to display a link in the browser.
	 * @param options.properties.currencySymbol The current symbol used when displaying field values within the product.
	 * @param options.properties.summaryQuery The summary query.
	 * @param options.properties.targetFieldId The id of the target field.
	 * @param options.properties.displayUser The configured option for how users display within the product.
	 * @param options.properties.blankIsZero Whether a blank value is treated the same as 0 in calculations within the product.
	 * @param options.properties.exact Whether an exact match is required for a report link.
	 * @param options.properties.defaultDomain Default email domain.
	 * @param options.properties.defaultValue The default value configured for a field when a new record is added.
	 * @param options.properties.abbreviate Don't show the URL protocol when showing the URL.
	 * @param options.properties.numberFormat The format used for displaying numeric values in the product (decimal, separators, digit group).
	 * @param options.properties.targetTableName The field's target table name.
	 * @param options.properties.appearsAs The link text, if empty, the url will be used as link text.
	 * @param options.properties.width The field's html input width in the product.
	 * @param options.properties.currencyFormat The currency format used when displaying field values within the product.
	 * @param options.properties.displayDayOfWeek Indicates whether to display the day of the week within the product.
	 * @param options.properties.summaryReferenceFieldId The id of the field that is the reference in the relationship for this summary.
	 * @param options.properties.commaStart The number of digits before commas display in the product, when applicable.
	 * @param options.properties.choices An array of entries that exist for a field that offers choices to the user. Note that these choices refer to the valid values of any records added in the future. You are allowed to remove values from the list of choices even if there are existing records with those values in this field. They will be displayed in red when users look at the data in the browser but there is no other effect. While updating a field with this property, the old choices are removed and replaced by the new choices.
	 * @param options.properties.targetTableId The id of the target table.
	 * @param options.properties.displayRelative Whether to display time as relative.
	 * @param options.properties.compositeFields An array of the fields that make up a composite field (e.g., address).
	 * @param options.properties.displayCheckboxAsText Indicates whether the checkbox values will be shown as text in reports.
	 * @param options.properties.summaryTableId The table the summary field references fields from.
	 * @param options.properties.displayTime Indicates whether to display the time, in addition to the date.
	 * @param options.properties.versionMode Version modes for files. Keep all versions vs keep last version.
	 * @param options.properties.snapFieldId The id of the field that is used to snapshot values from, when applicable.
	 * @param options.properties.hours24 Indicates whether or not to display time in the 24-hour format within the product.
	 * @param options.properties.sortAlpha Whether to sort alphabetically, default sort is by record ID.
	 * @param options.properties.sortAsGiven Indicates if the listed entries sort as entered vs alphabetically.
	 * @param options.properties.hasExtension Whether this field has a phone extension.
	 * @param options.properties.useNewWindow Indicates if the file should open a new window when a user clicks it within the product.
	 * @param options.properties.appendOnly Whether this field is append only.
	 * @param options.properties.displayAsLink Indicates if a field that is part of the relationship should be shown as a hyperlink to the parent record within the product.
	 * @param options.properties.lookupReferenceFieldId The id of the field that is the reference in the relationship for this lookup.
	 * @param options.appearsByDefault Indicates if the field is marked as a default in reports.
	 * @param options.unique Indicates if every record in the table must contain a unique value of this field. If you attempt to change a field from not-unique to unique, and the table currently contains records with the same value of this field, you will get an error. In this case you need to find and update those records with duplicate values of the field before changing the field to unique.
	 * @param options.permissions[].role The role associated with a given permission for the field
	 * @param options.permissions[].permissionType The permission given to the role for this field
	 * @param options.permissions[].roleId The Id of the given role
	 * @param options.addToForms Whether the field you are adding should appear on forms.
	 * @param options.label The label (name) of the field.
	 * @param options.findEnabled Indicates if the field is marked as searchable.
	 * @param options.noWrap Indicates if the field is configured to not wrap when displayed in the product.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async updateField({ fieldId, tableId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestUpdateField & { returnAxios?: false }): Promise<QuickBaseResponseUpdateField>;
	public async updateField({ fieldId, tableId, requestOptions, returnAxios = true, ...body }: QuickBaseRequestUpdateField & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseUpdateField>>;
	public async updateField({ fieldId, tableId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestUpdateField): Promise<QuickBaseResponseUpdateField | AxiosResponse<QuickBaseResponseUpdateField>> {
		const results = await this.api<QuickBaseResponseUpdateField>({
			method: 'POST',
			url: `/fields/${fieldId}`,
			data: body,
			params: {
				tableId
			}
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Get usage for all fields
	 *
	 * Get all the field usage statistics for a table. This is a summary of the information that can be found in the usage table of field properties.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/getFieldsUsage)
	 *
	 * @param options Get usage for all fields method options object
	 * @param options.tableId The unique identifier (dbid) of the table.
	 * @param options.skip The number of fields to skip from the list.
	 * @param options.top The maximum number of fields to return.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async getFieldsUsage({ tableId, skip, top, requestOptions, returnAxios = false }: QuickBaseRequestGetFieldsUsage & { returnAxios?: false }): Promise<QuickBaseResponseGetFieldsUsage>;
	public async getFieldsUsage({ tableId, skip, top, requestOptions, returnAxios = true }: QuickBaseRequestGetFieldsUsage & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseGetFieldsUsage>>;
	public async getFieldsUsage({ tableId, skip, top, requestOptions, returnAxios = false }: QuickBaseRequestGetFieldsUsage): Promise<QuickBaseResponseGetFieldsUsage | AxiosResponse<QuickBaseResponseGetFieldsUsage>> {
		const results = await this.api<QuickBaseResponseGetFieldsUsage>({
			method: 'GET',
			url: `/fields/usage`,
			params: {
				tableId,
				skip,
				top
			}
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Get usage for a field
	 *
	 * Get a single fields usage statistics. This is a summary of the information that can be found in the usage table of field properties.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/getFieldUsage)
	 *
	 * @param options Get usage for a field method options object
	 * @param options.fieldId The unique identifier (fid) of the field.
	 * @param options.tableId The unique identifier (dbid) of the table.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async getFieldUsage({ fieldId, tableId, requestOptions, returnAxios = false }: QuickBaseRequestGetFieldUsage & { returnAxios?: false }): Promise<QuickBaseResponseGetFieldUsage>;
	public async getFieldUsage({ fieldId, tableId, requestOptions, returnAxios = true }: QuickBaseRequestGetFieldUsage & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseGetFieldUsage>>;
	public async getFieldUsage({ fieldId, tableId, requestOptions, returnAxios = false }: QuickBaseRequestGetFieldUsage): Promise<QuickBaseResponseGetFieldUsage | AxiosResponse<QuickBaseResponseGetFieldUsage>> {
		const results = await this.api<QuickBaseResponseGetFieldUsage>({
			method: 'GET',
			url: `/fields/usage/${fieldId}`,
			params: {
				tableId
			}
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Run a formula
	 *
	 * Allows running a formula via an API call. Use this method in custom code to get the value back of a formula without a discrete field on a record.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/runFormula)
	 *
	 * @param options Run a formula method options object
	 * @param options.formula The formula to run. This must be a valid Quickbase formula.
	 * @param options.rid The record ID to run the formula against. Only necessary for formulas that are run in the context of a record. For example, the formula User() does not need a record ID.
	 * @param options.tableId The unique identifier (dbid) of the table.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async runFormula({ tableId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestRunFormula & { returnAxios?: false }): Promise<QuickBaseResponseRunFormula>;
	public async runFormula({ tableId, requestOptions, returnAxios = true, ...body }: QuickBaseRequestRunFormula & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseRunFormula>>;
	public async runFormula({ tableId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestRunFormula): Promise<QuickBaseResponseRunFormula | AxiosResponse<QuickBaseResponseRunFormula>> {
		const results = await this.api<QuickBaseResponseRunFormula>({
			method: 'POST',
			url: `/formula/run`,
			data: {
				from: tableId,
				...body
			},
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Insert/Update record(s)
	 *
	 * Insert and/or update record(s) in a table. In this single API call, inserts and updates can be submitted. Update can use the key field on the table, or any other supported unique field. Refer to the [Field types page](../fieldInfo) for more information about how each field type should be formatted. This operation allows for incremental processing of successful records, even when some of the records fail.  
	 * **Note:** This endpoint supports a maximum payload size of 10MB.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/upsert)
	 *
	 * @param options Insert/Update record(s) method options object
	 * @param options.tableId The table identifier.
	 * @param options.data Record data array, where each record contains key-value mappings of fields to be defined/updated and their values.
	 * @param options.mergeFieldId The merge field id.
	 * @param options.fieldsToReturn Specify an array of field ids that will return data for any updates or added record. Record ID (FID 3) is always returned if any field ID is requested.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async upsert({ tableId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestUpsert & { returnAxios?: false }): Promise<QuickBaseResponseUpsert>;
	public async upsert({ tableId, requestOptions, returnAxios = true, ...body }: QuickBaseRequestUpsert & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseUpsert>>;
	public async upsert({ tableId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestUpsert): Promise<QuickBaseResponseUpsert | AxiosResponse<QuickBaseResponseUpsert>> {
		const results = await this.api<QuickBaseResponseUpsert>({
			method: 'POST',
			url: `/records`,
			data: {
				to: tableId,
				...body
			},
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Delete record(s)
	 *
	 * Deletes record(s) in a table based on a query. Alternatively, all records in the table can be deleted.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/deleteRecords)
	 *
	 * @param options Delete record(s) method options object
	 * @param options.tableId The unique identifier of the table.
	 * @param options.where The filter to delete records. To delete all records specify a filter that will include all records, for example \{3.GT.0\} where 3 is the ID of the Record ID field.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async deleteRecords({ tableId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestDeleteRecords & { returnAxios?: false }): Promise<QuickBaseResponseDeleteRecords>;
	public async deleteRecords({ tableId, requestOptions, returnAxios = true, ...body }: QuickBaseRequestDeleteRecords & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseDeleteRecords>>;
	public async deleteRecords({ tableId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestDeleteRecords): Promise<QuickBaseResponseDeleteRecords | AxiosResponse<QuickBaseResponseDeleteRecords>> {
		const results = await this.api<QuickBaseResponseDeleteRecords>({
			method: 'DELETE',
			url: `/records`,
			data: {
				from: tableId,
				...body
			},
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Query for data
	 *
	 * Pass in a query in the [Quickbase query language](https://help.quickbase.com/api-guide/componentsquery.html). Returns record data with [intelligent pagination](../pagination) based on the approximate size of each record. The metadata object will include the necessary information to iterate over the response and gather more data.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/runQuery)
	 *
	 * @param options Query for data method options object
	 * @param options.options.skip The number of records to skip.
	 * @param options.options.compareWithAppLocalTime Whether to run the query against a date time field with respect to the application's local time. The query is run with UTC time by default.
	 * @param options.options.top The maximum number of records to display.
	 * @param options.where The filter, using the Quickbase query language, which determines the records to return. If this parameter is omitted, the query will return all records.
	 * @param options.groupBy[].fieldId The unique identifier of a field in a table.
	 * @param options.groupBy[].grouping Group by based on ascending order (ASC), descending order (DESC) or equal values (equal-values)
	 * @param options.sortBy[].fieldId The unique identifier of a field in a table.
	 * @param options.sortBy[].order Sort based on ascending order (ASC), descending order (DESC) or equal values (equal-values)
	 * @param options.select An array of field ids for the fields that should be returned in the response. If empty, the default columns on the table will be returned.
	 * @param options.tableId The table identifier.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async runQuery({ tableId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestRunQuery & { returnAxios?: false }): Promise<QuickBaseResponseRunQuery>;
	public async runQuery({ tableId, requestOptions, returnAxios = true, ...body }: QuickBaseRequestRunQuery & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseRunQuery>>;
	public async runQuery({ tableId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestRunQuery): Promise<QuickBaseResponseRunQuery | AxiosResponse<QuickBaseResponseRunQuery>> {
		const results = await this.api<QuickBaseResponseRunQuery>({
			method: 'POST',
			url: `/records/query`,
			data: {
				from: tableId,
				...body
			},
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Get a temporary token for a dbid
	 *
	 * Use this endpoint to get a temporary authorization token, scoped to either an app or a table. You can then use this token to make other API calls (see [authorization](../auth)).  This token expires in 5 minutes.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/getTempTokenDBID)
	 *
	 * @param options Get a temporary token for a dbid method options object
	 * @param options.dbid The unique identifier of an app or table.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async getTempTokenDBID({ dbid, requestOptions, returnAxios = false }: QuickBaseRequestGetTempTokenDBID & { returnAxios?: false }): Promise<QuickBaseResponseGetTempTokenDBID>;
	public async getTempTokenDBID({ dbid, requestOptions, returnAxios = true }: QuickBaseRequestGetTempTokenDBID & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseGetTempTokenDBID>>;
	public async getTempTokenDBID({ dbid, requestOptions, returnAxios = false }: QuickBaseRequestGetTempTokenDBID): Promise<QuickBaseResponseGetTempTokenDBID | AxiosResponse<QuickBaseResponseGetTempTokenDBID>> {
		const results = await this.api<QuickBaseResponseGetTempTokenDBID>({
			method: 'GET',
			url: `/auth/temporary/${dbid}`,
		}, requestOptions);
	
		this.setTempToken(dbid, results.data.temporaryAuthorization);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Clone a user token
	 *
	 * Clones the authenticated user token. All applications associated with that token are automatically associated with the new token.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/cloneUserToken)
	 *
	 * @param options Clone a user token method options object
	 * @param options.name The new name for the cloned user token.
	 * @param options.description The description for the cloned user token.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async cloneUserToken({ requestOptions, returnAxios = false, ...body }: QuickBaseRequestCloneUserToken & { returnAxios?: false }): Promise<QuickBaseResponseCloneUserToken>;
	public async cloneUserToken({ requestOptions, returnAxios = true, ...body }: QuickBaseRequestCloneUserToken & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseCloneUserToken>>;
	public async cloneUserToken({ requestOptions, returnAxios = false, ...body }: QuickBaseRequestCloneUserToken): Promise<QuickBaseResponseCloneUserToken | AxiosResponse<QuickBaseResponseCloneUserToken>> {
		const results = await this.api<QuickBaseResponseCloneUserToken>({
			method: 'POST',
			url: `/usertoken/clone`,
			data: body,
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Deactivate a user token
	 *
	 * Deactivates the authenticated user token. Once this is done, the user token must be reactivated in the user interface.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/deactivateUserToken)
	 *
	 * @param options Deactivate a user token method options object
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async deactivateUserToken({ requestOptions, returnAxios = false }: QuickBaseRequestDeactivateUserToken & { returnAxios?: false }): Promise<QuickBaseResponseDeactivateUserToken>;
	public async deactivateUserToken({ requestOptions, returnAxios = true }: QuickBaseRequestDeactivateUserToken & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseDeactivateUserToken>>;
	public async deactivateUserToken({ requestOptions, returnAxios = false }: QuickBaseRequestDeactivateUserToken = {}): Promise<QuickBaseResponseDeactivateUserToken | AxiosResponse<QuickBaseResponseDeactivateUserToken>> {
		const results = await this.api<QuickBaseResponseDeactivateUserToken>({
			method: 'POST',
			url: `/usertoken/deactivate`,
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Delete a user token
	 *
	 * Deletes the authenticated user token. This is not reversible.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/deleteUserToken)
	 *
	 * @param options Delete a user token method options object
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async deleteUserToken({ requestOptions, returnAxios = false }: QuickBaseRequestDeleteUserToken & { returnAxios?: false }): Promise<QuickBaseResponseDeleteUserToken>;
	public async deleteUserToken({ requestOptions, returnAxios = true }: QuickBaseRequestDeleteUserToken & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseDeleteUserToken>>;
	public async deleteUserToken({ requestOptions, returnAxios = false }: QuickBaseRequestDeleteUserToken = {}): Promise<QuickBaseResponseDeleteUserToken | AxiosResponse<QuickBaseResponseDeleteUserToken>> {
		const results = await this.api<QuickBaseResponseDeleteUserToken>({
			method: 'DELETE',
			url: `/usertoken`,
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Download file
	 *
	 * Downloads the file attachment, with the file attachment content encoded in base64 format. The API response returns the file name in the `Content-Disposition` header. Meta-data about files can be retrieved from the /records and /reports endpoints, where applicable. Use those endpoints to get the necessary information to fetch files.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/downloadFile)
	 *
	 * @param options Download file method options object
	 * @param options.tableId The unique identifier of the table.
	 * @param options.recordId The unique identifier of the record.
	 * @param options.fieldId The unique identifier of the field.
	 * @param options.versionNumber The file attachment version number.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async downloadFile({ tableId, recordId, fieldId, versionNumber, requestOptions, returnAxios = false }: QuickBaseRequestDownloadFile & { returnAxios?: false }): Promise<QuickBaseResponseDownloadFile>;
	public async downloadFile({ tableId, recordId, fieldId, versionNumber, requestOptions, returnAxios = true }: QuickBaseRequestDownloadFile & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseDownloadFile>>;
	public async downloadFile({ tableId, recordId, fieldId, versionNumber, requestOptions, returnAxios = false }: QuickBaseRequestDownloadFile): Promise<QuickBaseResponseDownloadFile | AxiosResponse<QuickBaseResponseDownloadFile>> {
		const results = await this.api<QuickBaseResponseDownloadFile>({
			method: 'GET',
			url: `/files/${tableId}/${recordId}/${fieldId}/${versionNumber}`,
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Delete file
	 *
	 * Deletes one file attachment version. Meta-data about files can be retrieved from the /records and /reports endpoints, where applicable. Use those endpoints to get the necessary information to delete file versions.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/deleteFile)
	 *
	 * @param options Delete file method options object
	 * @param options.tableId The unique identifier of the table.
	 * @param options.recordId The unique identifier of the record.
	 * @param options.fieldId The unique identifier of the field.
	 * @param options.versionNumber The file attachment version number.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async deleteFile({ tableId, recordId, fieldId, versionNumber, requestOptions, returnAxios = false }: QuickBaseRequestDeleteFile & { returnAxios?: false }): Promise<QuickBaseResponseDeleteFile>;
	public async deleteFile({ tableId, recordId, fieldId, versionNumber, requestOptions, returnAxios = true }: QuickBaseRequestDeleteFile & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseDeleteFile>>;
	public async deleteFile({ tableId, recordId, fieldId, versionNumber, requestOptions, returnAxios = false }: QuickBaseRequestDeleteFile): Promise<QuickBaseResponseDeleteFile | AxiosResponse<QuickBaseResponseDeleteFile>> {
		const results = await this.api<QuickBaseResponseDeleteFile>({
			method: 'DELETE',
			url: `/files/${tableId}/${recordId}/${fieldId}/${versionNumber}`,
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Get users
	 *
	 * Get all users in an account or narrowed down list of users filtered by email(s). The returned users may be paginated depending on the user count. The count of the returned users may vary. When `nextPageToken` value in the response is not empty, that indicates that there are more results to be returned, you can use this value to get the next result set ('page').
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/getUsers)
	 *
	 * @param options Get users method options object
	 * @param options.accountId The account id being used to get users. If no value is specified, the first account associated with the requesting user token is chosen.
	 * @param options.emails When provided, the returned users will be narrowed down only to the users included in this list.
	 * @param options.appIds When provided, the returned users will be narrowed down only to the users assigned to the app id's provided in this list. The provided app id's should belong to the same account.
	 * @param options.nextPageToken Next page token used to get the next 'page' of results when available. When this field is empty, the first page is returned.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async getUsers({ accountId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestGetUsers & { returnAxios?: false }): Promise<QuickBaseResponseGetUsers>;
	public async getUsers({ accountId, requestOptions, returnAxios = true, ...body }: QuickBaseRequestGetUsers & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseGetUsers>>;
	public async getUsers({ accountId, requestOptions, returnAxios = false, ...body }: QuickBaseRequestGetUsers): Promise<QuickBaseResponseGetUsers | AxiosResponse<QuickBaseResponseGetUsers>> {
		const results = await this.api<QuickBaseResponseGetUsers>({
			method: 'POST',
			url: `/users`,
			data: body,
			params: {
				accountId
			}
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Deny users
	 *
	 * Denies users access to the realm but leaves them listed in groups they have been added to.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/denyUsers)
	 *
	 * @param options Deny users method options object
	 * @param options.accountId The account id being used to deny users. If no value is specified, the first account associated with the requesting user token is chosen.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async denyUsers({ accountId, requestOptions, returnAxios = false }: QuickBaseRequestDenyUsers & { returnAxios?: false }): Promise<QuickBaseResponseDenyUsers>;
	public async denyUsers({ accountId, requestOptions, returnAxios = true }: QuickBaseRequestDenyUsers & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseDenyUsers>>;
	public async denyUsers({ accountId, requestOptions, returnAxios = false }: QuickBaseRequestDenyUsers): Promise<QuickBaseResponseDenyUsers | AxiosResponse<QuickBaseResponseDenyUsers>> {
		const results = await this.api<QuickBaseResponseDenyUsers>({
			method: 'PUT',
			url: `/users/deny`,
			params: {
				accountId
			}
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Deny and remove users from groups
	 *
	 * Denies users access to the realm and allows you to remove them from groups.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/denyUsersAndGroups)
	 *
	 * @param options Deny and remove users from groups method options object
	 * @param options.shouldDeleteFromGroups Specifies if the users should also be removed from all groups.
	 * @param options.accountId The account id being used to deny users. If no value is specified, the first account associated with the requesting user token is chosen.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async denyUsersAndGroups({ shouldDeleteFromGroups, accountId, requestOptions, returnAxios = false }: QuickBaseRequestDenyUsersAndGroups & { returnAxios?: false }): Promise<QuickBaseResponseDenyUsersAndGroups>;
	public async denyUsersAndGroups({ shouldDeleteFromGroups, accountId, requestOptions, returnAxios = true }: QuickBaseRequestDenyUsersAndGroups & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseDenyUsersAndGroups>>;
	public async denyUsersAndGroups({ shouldDeleteFromGroups, accountId, requestOptions, returnAxios = false }: QuickBaseRequestDenyUsersAndGroups): Promise<QuickBaseResponseDenyUsersAndGroups | AxiosResponse<QuickBaseResponseDenyUsersAndGroups>> {
		const results = await this.api<QuickBaseResponseDenyUsersAndGroups>({
			method: 'PUT',
			url: `/users/deny/${shouldDeleteFromGroups}`,
			params: {
				accountId
			}
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Undeny users
	 *
	 * Grants users that have previously been denied access to the realm.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/undenyUsers)
	 *
	 * @param options Undeny users method options object
	 * @param options.accountId The account id being used to undeny users. If no value is specified, the first account associated with the requesting user token is chosen.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async undenyUsers({ accountId, requestOptions, returnAxios = false }: QuickBaseRequestUndenyUsers & { returnAxios?: false }): Promise<QuickBaseResponseUndenyUsers>;
	public async undenyUsers({ accountId, requestOptions, returnAxios = true }: QuickBaseRequestUndenyUsers & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseUndenyUsers>>;
	public async undenyUsers({ accountId, requestOptions, returnAxios = false }: QuickBaseRequestUndenyUsers): Promise<QuickBaseResponseUndenyUsers | AxiosResponse<QuickBaseResponseUndenyUsers>> {
		const results = await this.api<QuickBaseResponseUndenyUsers>({
			method: 'PUT',
			url: `/users/undeny`,
			params: {
				accountId
			}
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Add members
	 *
	 * Adds a list of users to a given group as members.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/addMembersToGroup)
	 *
	 * @param options Add members method options object
	 * @param options.gid This is the ID of the group being modified.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async addMembersToGroup({ gid, requestOptions, returnAxios = false }: QuickBaseRequestAddMembersToGroup & { returnAxios?: false }): Promise<QuickBaseResponseAddMembersToGroup>;
	public async addMembersToGroup({ gid, requestOptions, returnAxios = true }: QuickBaseRequestAddMembersToGroup & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseAddMembersToGroup>>;
	public async addMembersToGroup({ gid, requestOptions, returnAxios = false }: QuickBaseRequestAddMembersToGroup): Promise<QuickBaseResponseAddMembersToGroup | AxiosResponse<QuickBaseResponseAddMembersToGroup>> {
		const results = await this.api<QuickBaseResponseAddMembersToGroup>({
			method: 'POST',
			url: `/groups/${gid}/members`,
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Remove members
	 *
	 * Removes a list of members from a given group.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/removeMembersFromGroup)
	 *
	 * @param options Remove members method options object
	 * @param options.gid This is the ID of the group being modified.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async removeMembersFromGroup({ gid, requestOptions, returnAxios = false }: QuickBaseRequestRemoveMembersFromGroup & { returnAxios?: false }): Promise<QuickBaseResponseRemoveMembersFromGroup>;
	public async removeMembersFromGroup({ gid, requestOptions, returnAxios = true }: QuickBaseRequestRemoveMembersFromGroup & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseRemoveMembersFromGroup>>;
	public async removeMembersFromGroup({ gid, requestOptions, returnAxios = false }: QuickBaseRequestRemoveMembersFromGroup): Promise<QuickBaseResponseRemoveMembersFromGroup | AxiosResponse<QuickBaseResponseRemoveMembersFromGroup>> {
		const results = await this.api<QuickBaseResponseRemoveMembersFromGroup>({
			method: 'DELETE',
			url: `/groups/${gid}/members`,
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Add managers
	 *
	 * Adds a list of users to a given group as managers.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/addManagersToGroup)
	 *
	 * @param options Add managers method options object
	 * @param options.gid This is the ID of the group being modified.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async addManagersToGroup({ gid, requestOptions, returnAxios = false }: QuickBaseRequestAddManagersToGroup & { returnAxios?: false }): Promise<QuickBaseResponseAddManagersToGroup>;
	public async addManagersToGroup({ gid, requestOptions, returnAxios = true }: QuickBaseRequestAddManagersToGroup & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseAddManagersToGroup>>;
	public async addManagersToGroup({ gid, requestOptions, returnAxios = false }: QuickBaseRequestAddManagersToGroup): Promise<QuickBaseResponseAddManagersToGroup | AxiosResponse<QuickBaseResponseAddManagersToGroup>> {
		const results = await this.api<QuickBaseResponseAddManagersToGroup>({
			method: 'POST',
			url: `/groups/${gid}/managers`,
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Remove managers
	 *
	 * Removes a list of managers from a given group.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/removeManagersFromGroup)
	 *
	 * @param options Remove managers method options object
	 * @param options.gid This is the ID of the group being modified.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async removeManagersFromGroup({ gid, requestOptions, returnAxios = false }: QuickBaseRequestRemoveManagersFromGroup & { returnAxios?: false }): Promise<QuickBaseResponseRemoveManagersFromGroup>;
	public async removeManagersFromGroup({ gid, requestOptions, returnAxios = true }: QuickBaseRequestRemoveManagersFromGroup & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseRemoveManagersFromGroup>>;
	public async removeManagersFromGroup({ gid, requestOptions, returnAxios = false }: QuickBaseRequestRemoveManagersFromGroup): Promise<QuickBaseResponseRemoveManagersFromGroup | AxiosResponse<QuickBaseResponseRemoveManagersFromGroup>> {
		const results = await this.api<QuickBaseResponseRemoveManagersFromGroup>({
			method: 'DELETE',
			url: `/groups/${gid}/managers`,
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Add child groups
	 *
	 * Adds a list of groups to a given group.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/addSubgroupsToGroup)
	 *
	 * @param options Add child groups method options object
	 * @param options.gid This is the ID of the group being modified.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async addSubgroupsToGroup({ gid, requestOptions, returnAxios = false }: QuickBaseRequestAddSubgroupsToGroup & { returnAxios?: false }): Promise<QuickBaseResponseAddSubgroupsToGroup>;
	public async addSubgroupsToGroup({ gid, requestOptions, returnAxios = true }: QuickBaseRequestAddSubgroupsToGroup & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseAddSubgroupsToGroup>>;
	public async addSubgroupsToGroup({ gid, requestOptions, returnAxios = false }: QuickBaseRequestAddSubgroupsToGroup): Promise<QuickBaseResponseAddSubgroupsToGroup | AxiosResponse<QuickBaseResponseAddSubgroupsToGroup>> {
		const results = await this.api<QuickBaseResponseAddSubgroupsToGroup>({
			method: 'POST',
			url: `/groups/${gid}/subgroups`,
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Remove child groups
	 *
	 * Removes a list of groups from a given group.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/removeSubgroupsFromGroup)
	 *
	 * @param options Remove child groups method options object
	 * @param options.gid This is the ID of the group being modified.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async removeSubgroupsFromGroup({ gid, requestOptions, returnAxios = false }: QuickBaseRequestRemoveSubgroupsFromGroup & { returnAxios?: false }): Promise<QuickBaseResponseRemoveSubgroupsFromGroup>;
	public async removeSubgroupsFromGroup({ gid, requestOptions, returnAxios = true }: QuickBaseRequestRemoveSubgroupsFromGroup & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseRemoveSubgroupsFromGroup>>;
	public async removeSubgroupsFromGroup({ gid, requestOptions, returnAxios = false }: QuickBaseRequestRemoveSubgroupsFromGroup): Promise<QuickBaseResponseRemoveSubgroupsFromGroup | AxiosResponse<QuickBaseResponseRemoveSubgroupsFromGroup>> {
		const results = await this.api<QuickBaseResponseRemoveSubgroupsFromGroup>({
			method: 'DELETE',
			url: `/groups/${gid}/subgroups`,
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Get audit logs
	 *
	 * Returns 1000 audit events with the nextToken parameter which can be passed back to the API to fetch subsequent logs.  
	 * **Note:** This API is available for enterprise users only.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/audit)
	 *
	 * @param options Get audit logs method options object
	 * @param options.nextToken Token specifying start of page. For first page don't supply this.
	 * @param options.queryId The query id of an audit log request. This id is needed to fetch subsequent paged results of a single query.
	 * @param options.date The date for which audit logs need to be fetched. This must be date-time only, as YYYY-MM-DD, and a valid date in the past.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async audit({ requestOptions, returnAxios = false, ...body }: QuickBaseRequestAudit & { returnAxios?: false }): Promise<QuickBaseResponseAudit>;
	public async audit({ requestOptions, returnAxios = true, ...body }: QuickBaseRequestAudit & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponseAudit>>;
	public async audit({ requestOptions, returnAxios = false, ...body }: QuickBaseRequestAudit): Promise<QuickBaseResponseAudit | AxiosResponse<QuickBaseResponseAudit>> {
		const results = await this.api<QuickBaseResponseAudit>({
			method: 'POST',
			url: `/audit`,
			data: body,
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

	/**
	 * Get read summaries
	 *
	 * Get user read and integration read summaries for any day in the past.  
	 * **Note:** This API is available for enterprise users only.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/operation/platformAnalyticReads)
	 *
	 * @param options Get read summaries method options object
	 * @param options.day The date for which read summaries need to be fetched. This must be date-time only, as YYYY-MM-DD, and a valid date in the past.
	 * @param options.requestOptions Override axios request configuration
	 * @param options.returnAxios If `true`, the returned object will be the entire `AxiosResponse` object
	 */
	public async platformAnalyticReads({ day, requestOptions, returnAxios = false }: QuickBaseRequestPlatformAnalyticReads & { returnAxios?: false }): Promise<QuickBaseResponsePlatformAnalyticReads>;
	public async platformAnalyticReads({ day, requestOptions, returnAxios = true }: QuickBaseRequestPlatformAnalyticReads & { returnAxios: true }): Promise<AxiosResponse<QuickBaseResponsePlatformAnalyticReads>>;
	public async platformAnalyticReads({ day, requestOptions, returnAxios = false }: QuickBaseRequestPlatformAnalyticReads): Promise<QuickBaseResponsePlatformAnalyticReads | AxiosResponse<QuickBaseResponsePlatformAnalyticReads>> {
		const results = await this.api<QuickBaseResponsePlatformAnalyticReads>({
			method: 'GET',
			url: `/analytics/reads`,
			params: {
				day
			}
		}, requestOptions);
	
		return returnAxios ? results : results.data;
	}

}

/* Types */
export type QuickBaseOptions = Partial<{
	/**
	 * Quickbase API Server FQDN
	 *
	 * Default is `api.quickbase.com`
	 */
	server: string;

	/**
	 * Quickbase API Version
	 *
	 * Default is `v1`
	 */
	version: string;

	/**
	 * Quickbase Realm.
	 *
	 * For example, if your Quickbase url is: `demo.quickbase.com`
	 * Your realm is: `demo`
	 */
	realm: string;

	/**
	 * A Quickbase User Token.
	 *
	 * If both a `userToken` and `tempToken` are defined, the `tempToken` will be used
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/auth)
	 */
	userToken: string;

	/**
	 * A Temporary Authentication Token or Temporary Table Authentication Token.
	 *
	 * If both a `userToken` and `tempToken` are defined, the `tempToken` will be used
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/auth)
	 */
	tempToken: string;

	/**
	 * A Temporary Authentication Token or Temporary Table Authentication Token's Application or Table ID.
	 *
	 * [Quickbase Documentation](https://developer.quickbase.com/auth)
	 */
	tempTokenDbid: string;

	/**
	 * A Quickbase Application Token
	 *
	 * Only required when using Temporary Tokens
	 *
	 * [Quickbase Documentation](https://help.quickbase.com/user-assistance/app_tokens.html)
	 */
	appToken: string;

	/**
	 * Provide a custom User-Agent to help track API usage within your logs
	 *
	 * When used in the browser, this sets the X-User-Agent header instead
	 * as the browser will block any attempt to set a custom User-Agent
	 */
	userAgent: string;

	/**
	 * Automatically renew Temporary Tokens after they expire
	 *
	 * Default is `true`
	 */
	autoRenewTempTokens: boolean;

	/**
	 * The maximum number of open, pending API connections to Quickbase
	 *
	 * Default is `10`
	 */
	connectionLimit: number;

	/**
	 * The period length, in milliseconds, of connection limit
	 *
	 * Default is `1000`
	 */
	connectionLimitPeriod: number;

	/**
	 * Throw an error if the connection limit is exceeded
	 *
	 * Default is `false`
	 */
	errorOnConnectionLimit: boolean;

	/**
	 * Automatically retry if the Quickbase API rate limit is exceeded
	 *
	 * Default is `true`
	 */
	retryOnQuotaExceeded: boolean;

	/**
	 * Allows the use of a proxy for Quickbase API requests
	 *
	 * Default is `false`
	 */
	proxy: false | {
		host: string;
		port: number;
		auth?: {
			username: string;
			password: string;
		}
	}
}>;

export type QuickBaseRequest = {
	requestOptions?: AxiosRequestConfig;
	returnAxios?: boolean;
};

export type QuickBaseRequestCreateApp = QuickBaseRequest & {
	/**
	 * Set to true if you would like to assign the app to the user token you used to create the application. The default is false.
	 */
	assignToken?: boolean;
	/**
	 * The app variables. A maximum of 10 variables can be inserted at a time. See [About Application Variables](https://help.quickbase.com/user-assistance/variables.html)
	 */
	variables?: {
		/**
		 * The name for the variable.
		 */
		name: string;
		/**
		 * The value for the variable.
		 */
		value: string;
	}[];
	/**
	 * The app name. You are allowed to create multiple apps with the same name, in the same realm, because they will have different dbid values. We urge you to be careful about doing this.
	 */
	name: string;
	/**
	 * Application security properties.
	 */
	securityProperties?: {
		/**
		 * Hide from public application searches
		 */
		hideFromPublic: boolean;
		/**
		 * Only "approved" users may access this application
		 */
		mustBeRealmApproved: boolean;
		/**
		 * Allow users who are not administrators to copy
		 */
		allowClone: boolean;
		/**
		 * Only users logging in from "approved" IP addresses may access this application
		 */
		useIPFilter: boolean;
		/**
		 * Allow users who are not administrators to export data
		 */
		allowExport: boolean;
		/**
		 * Require Application Tokens
		 */
		enableAppTokens: boolean;
	};
	/**
	 * The description for the app. If this property is left out, the app description will be blank.
	 */
	description?: string;
};

export type QuickBaseRequestGetApp = QuickBaseRequest & {
	/**
	 * The unique identifier of an app
	 */
	appId: string;
};

export type QuickBaseRequestUpdateApp = QuickBaseRequest & {
	/**
	 * The unique identifier of an app
	 */
	appId: string;
	/**
	 * The app variables. A maximum of 10 variables can be updated at a time. See [About Application Variables](https://help.quickbase.com/user-assistance/variables.html)
	 */
	variables?: {
		/**
		 * The name for the variable.
		 */
		name: string;
		/**
		 * The value for the variable.
		 */
		value: string;
	}[];
	/**
	 * The name for the app.
	 */
	name?: string;
	/**
	 * Security properties of the application
	 */
	securityProperties?: {
		/**
		 * Hide from public application searches
		 */
		hideFromPublic: boolean;
		/**
		 * Only "approved" users may access this application
		 */
		mustBeRealmApproved: boolean;
		/**
		 * Allow users who are not administrators to copy
		 */
		allowClone: boolean;
		/**
		 * Only users logging in from "approved" IP addresses may access this application
		 */
		useIPFilter: boolean;
		/**
		 * Allow users who are not administrators to export data
		 */
		allowExport: boolean;
		/**
		 * Require Application Tokens
		 */
		enableAppTokens: boolean;
	};
	/**
	 * The description for the app.
	 */
	description?: string;
};

export type QuickBaseRequestDeleteApp = QuickBaseRequest & {
	/**
	 * The unique identifier of an app
	 */
	appId: string;
	/**
	 * To confirm application deletion we ask for application name.
	 */
	name: string;
};

export type QuickBaseRequestGetAppEvents = QuickBaseRequest & {
	/**
	 * The unique identifier of an app
	 */
	appId: string;
};

export type QuickBaseRequestCopyApp = QuickBaseRequest & {
	/**
	 * The unique identifier of an app
	 */
	appId: string;
	/**
	 * The name of the newly copied app
	 */
	name: string;
	/**
	 * The description of the newly copied app
	 */
	description?: string;
	/**
	 * The configuration properties for performing the app copy
	 */
	properties?: {
		/**
		 * Whether to add the user token used to make this request to the new app
		 */
		assignUserToken: boolean;
		/**
		 * If keepData is true, whether to copy the file attachments as well. If keepData is false, this property is ignored
		 */
		excludeFiles: boolean;
		/**
		 * Whether to copy the app's data along with the schema
		 */
		keepData: boolean;
		/**
		 * If true, users will be copied along with their assigned roles. If false, users and roles will be copied but roles will not be assigned
		 */
		usersAndRoles: boolean;
	};
};

export type QuickBaseRequestCreateTable = QuickBaseRequest & {
	/**
	 * The unique identifier of an app
	 */
	appId: string;
	/**
	 * The name for the table.
	 */
	name: string;
	/**
	 * The plural noun for records in the table. If this value is not passed the default value is 'Records'.
	 */
	pluralRecordName?: string;
	/**
	 * The singular noun for records in the table. If this value is not passed the default value is 'Record'.
	 */
	singleRecordName?: string;
	/**
	 * The description for the table. If this value is not passed the default value is blank.
	 */
	description?: string;
};

export type QuickBaseRequestGetAppTables = QuickBaseRequest & {
	/**
	 * The unique identifier of an app
	 */
	appId: string;
};

export type QuickBaseRequestGetTable = QuickBaseRequest & {
	/**
	 * The unique identifier (dbid) of the table.
	 */
	tableId: string;
	/**
	 * The unique identifier of an app
	 */
	appId: string;
};

export type QuickBaseRequestUpdateTable = QuickBaseRequest & {
	/**
	 * The unique identifier (dbid) of the table.
	 */
	tableId: string;
	/**
	 * The unique identifier of an app
	 */
	appId: string;
	/**
	 * The name for the table.
	 */
	name?: string;
	/**
	 * The plural noun for records in the table. If this value is not passed the default value is 'Records'.
	 */
	pluralRecordName?: string;
	/**
	 * The singular noun for records in the table. If this value is not passed the default value is 'Record'.
	 */
	singleRecordName?: string;
	/**
	 * The description for the table. If this value is not passed the default value is blank.
	 */
	description?: string;
};

export type QuickBaseRequestDeleteTable = QuickBaseRequest & {
	/**
	 * The unique identifier (dbid) of the table.
	 */
	tableId: string;
	/**
	 * The unique identifier of an app
	 */
	appId: string;
};

export type QuickBaseRequestGetRelationships = QuickBaseRequest & {
	/**
	 * The unique identifier (dbid) of the child table.
	 */
	childTableId: string;
	/**
	 * The number of relationships to skip.
	 */
	skip?: number;
};

export type QuickBaseRequestCreateRelationship = QuickBaseRequest & {
	/**
	 * The unique identifier (dbid) of the table. This will be the child table.
	 */
	childTableId: string;
	/**
	 * Array of summary field objects which will turn into summary fields in the parent table. When you specify the 'COUNT' accumulation type, you have to specify 0 as the summaryFid (or not set it in the request). 'DISTINCT-COUNT' requires that summaryFid be set to an actual fid.
	 */
	summaryFields?: {
		/**
		 * The field id to summarize.
		 */
		summaryFid?: number;
		/**
		 * The label for the summary field.
		 */
		label?: string;
		/**
		 * The accumulation type for the summary field.
		 */
		accumulationType: 'AVG' | 'SUM' | 'MAX' | 'MIN' | 'STD-DEV' | 'COUNT' | 'COMBINED-TEXT' | 'DISTINCT-COUNT';
		/**
		 * The filter, using the Quickbase query language, which determines the records to return.
		 */
		where?: string;
	}[];
	/**
	 * Array of field ids in the parent table that will become lookup fields in the child table.
	 */
	lookupFieldIds?: number[];
	/**
	 * The parent table id for the relationship.
	 */
	parentTableId: string;
	/**
	 * This property is optional.  If it is not provided, the foreign key field will be created with the label ‘Related <record>’, where <record> is the name of a record in the parent table.
	 */
	foreignKeyField?: {
		/**
		 * The label for the foreign key field.
		 */
		label: string;
	};
};

export type QuickBaseRequestUpdateRelationship = QuickBaseRequest & {
	/**
	 * The unique identifier (dbid) of the table. This will be the child table.
	 */
	childTableId: string;
	/**
	 * The relationship id. This is the field id of the reference field on the child table.
	 */
	relationshipId: number;
	/**
	 * An array of objects, each representing a configuration of one field from the child table, that will become summary fields on the parent table. When you specify the 'COUNT' accumulation type, you have to specify 0 as the summaryFid (or not set it in the request). 'DISTINCT-COUNT' requires that summaryFid be set to an actual fid.
	 */
	summaryFields?: {
		/**
		 * The field id to summarize.
		 */
		summaryFid?: number;
		/**
		 * The label for the summary field.
		 */
		label?: string;
		/**
		 * The accumulation type for the summary field.
		 */
		accumulationType: 'AVG' | 'SUM' | 'MAX' | 'MIN' | 'STD-DEV' | 'COUNT' | 'COMBINED-TEXT' | 'DISTINCT-COUNT';
		/**
		 * The filter, using the Quickbase query language, which determines the records to return.
		 */
		where?: string;
	}[];
	/**
	 * An array of field ids on the parent table that will become lookup fields on the child table.
	 */
	lookupFieldIds?: number[];
};

export type QuickBaseRequestDeleteRelationship = QuickBaseRequest & {
	/**
	 * The unique identifier (dbid) of the table. This will be the child table.
	 */
	childTableId: string;
	/**
	 * The relationship id. This is the field id of the reference field on the child table.
	 */
	relationshipId: number;
};

export type QuickBaseRequestGetTableReports = QuickBaseRequest & {
	/**
	 * The unique identifier of the table.
	 */
	tableId: string;
};

export type QuickBaseRequestGetReport = QuickBaseRequest & {
	/**
	 * The identifier of the report, unique to the table.
	 */
	reportId: string;
	/**
	 * The unique identifier of table.
	 */
	tableId: string;
};

export type QuickBaseRequestRunReport = QuickBaseRequest & {
	/**
	 * The identifier of the report, unique to the table.
	 */
	reportId: string;
	/**
	 * The identifier of the table for the report.
	 */
	tableId: string;
	/**
	 * The number of records to skip. You can set this value when paginating through a set of results.
	 */
	skip?: number;
	/**
	 * The maximum number of records to return. You can override the default Quickbase pagination to get more or fewer results. If your requested value here exceeds the dynamic maximums, we will return a subset of results and the rest can be gathered in subsequent API calls.
	 */
	top?: number;
};

export type QuickBaseRequestGetFields = QuickBaseRequest & {
	/**
	 * The unique identifier (dbid) of the table.
	 */
	tableId: string;
	/**
	 * Set to 'true' if you'd like to get back the custom permissions for the field(s).
	 */
	includeFieldPerms?: boolean;
};

export type QuickBaseRequestCreateField = QuickBaseRequest & {
	/**
	 * The unique identifier of the table.
	 */
	tableId: string;
	/**
	 * Indicates if the field is being tracked as part of Quickbase Audit Logs. You can only set this property to "true" if the app has audit logs enabled. See Enable data change logs under [Quickbase Audit Logs](https://help.quickbase.com/user-assistance/audit_logs.html). Defaults to false.
	 */
	audited?: boolean;
	/**
	 * The configured help text shown to users within the product.
	 */
	fieldHelp?: string;
	/**
	 * Indicates if the field is configured to display in bold in the product. Defaults to false.
	 */
	bold?: boolean;
	/**
	 * Specific field properties.
	 */
	properties?: {
		/**
		 * The comments entered on the field properties by an administrator.
		 */
		comments?: string;
		/**
		 * Whether this field totals in reports within the product.
		 */
		doesTotal?: boolean;
		/**
		 * Whether the link field will auto save.
		 */
		autoSave?: boolean;
		/**
		 * Default user id value.
		 */
		defaultValueLuid?: number;
		/**
		 * Whether phone numbers should be in E.164 standard international format
		 */
		useI18NFormat?: boolean;
		/**
		 * The maximum number of versions configured for a file attachment.
		 */
		maxVersions?: number;
		/**
		 * The format to display time.
		 */
		format?: number;
		/**
		 * Whether the field should carry its multiple choice fields when copied.
		 */
		carryChoices?: boolean;
		/**
		 * The maximum number of characters allowed for entry in Quickbase for this field.
		 */
		maxLength?: number;
		/**
		 * The configured text value that replaces the URL that users see within the product.
		 */
		linkText?: string;
		/**
		 * The id of the parent composite field, when applicable.
		 */
		parentFieldId?: number;
		/**
		 * Indicates whether to display the timezone within the product.
		 */
		displayTimezone?: boolean;
		/**
		 * Indicates if users can add new choices to a selection list.
		 */
		allowNewChoices?: boolean;
		/**
		 * Indicates if the field value is defaulted today for new records.
		 */
		defaultToday?: boolean;
		/**
		 * The units label.
		 */
		units?: string;
		/**
		 * Indicates which target the URL should open in when a user clicks it within the product.
		 */
		openTargetIn?: 'sameWindow' | 'newWindow' | 'popup';
		/**
		 * The id of the source field.
		 */
		sourceFieldId?: number;
		/**
		 * Whether this field averages in reports within the product.
		 */
		doesAverage?: boolean;
		/**
		 * The formula of the field as configured in Quickbase.
		 */
		formula?: string;
		/**
		 * The number of decimal places displayed in the product for this field.
		 */
		decimalPlaces?: number;
		/**
		 * Controls the default country shown on international phone widgets on forms. Country code should be entered in the ISO 3166-1 alpha-2 format.
		 */
		defaultCountryCode?: string;
		/**
		 * How to display months.
		 */
		displayMonth?: string;
		/**
		 * Indicates if the user can see other versions, aside from the most recent, of a file attachment within the product.
		 */
		seeVersions?: boolean;
		/**
		 * The number of lines shown in Quickbase for this text field.
		 */
		numLines?: number;
		/**
		 * The user default type.
		 */
		defaultKind?: string;
		/**
		 * How the email is displayed.
		 */
		displayEmail?: string;
		/**
		 * An alternate user friendly text that can be used to display a link in the browser.
		 */
		coverText?: string;
		/**
		 * The current symbol used when displaying field values within the product.
		 */
		currencySymbol?: string;
		/**
		 * The id of the target field.
		 */
		targetFieldId?: number;
		/**
		 * The configured option for how users display within the product.
		 */
		displayUser?: string;
		/**
		 * Whether a blank value is treated the same as 0 in calculations within the product.
		 */
		blankIsZero?: boolean;
		/**
		 * Whether an exact match is required for a report link.
		 */
		exact?: boolean;
		/**
		 * Default email domain.
		 */
		defaultDomain?: string;
		/**
		 * The default value configured for a field when a new record is added.
		 */
		defaultValue?: string;
		/**
		 * Don't show the URL protocol when showing the URL.
		 */
		abbreviate?: boolean;
		/**
		 * The format used for displaying numeric values in the product (decimal, separators, digit group).
		 */
		numberFormat?: number;
		/**
		 * The field's target table name.
		 */
		targetTableName?: string;
		/**
		 * The link text, if empty, the url will be used as link text.
		 */
		appearsAs?: string;
		/**
		 * The field's html input width in the product.
		 */
		width?: number;
		/**
		 * The currency format used when displaying field values within the product.
		 */
		currencyFormat?: 'left' | 'right' | 'middle';
		/**
		 * Indicates whether to display the day of the week within the product.
		 */
		displayDayOfWeek?: boolean;
		/**
		 * The number of digits before commas display in the product, when applicable.
		 */
		commaStart?: number;
		/**
		 * An array of entries that exist for a field that offers choices to the user. Note that these choices refer to the valid values of any records added in the future. You are allowed to remove values from the list of choices even if there are existing records with those values in this field. They will be displayed in red when users look at the data in the browser but there is no other effect. While updating a field with this property, the old choices are removed and replaced by the new choices.
		 */
		choices?: string[];
		/**
		 * The id of the target table.
		 */
		targetTableId?: string;
		/**
		 * Whether to display time as relative.
		 */
		displayRelative?: boolean;
		/**
		 * An array of the fields that make up a composite field (e.g., address).
		 */
		compositeFields?: number[];
		/**
		 * Indicates whether the checkbox values will be shown as text in reports.
		 */
		displayCheckboxAsText?: boolean;
		/**
		 * Indicates whether to display the time, in addition to the date.
		 */
		displayTime?: boolean;
		/**
		 * Version modes for files. Keep all versions vs keep last version.
		 */
		versionMode?: 'keepallversions' | 'keeplastversions';
		/**
		 * The id of the field that is used to snapshot values from, when applicable.
		 */
		snapFieldId?: number;
		/**
		 * Indicates whether or not to display time in the 24-hour format within the product.
		 */
		hours24?: boolean;
		/**
		 * Whether to sort alphabetically, default sort is by record ID.
		 */
		sortAlpha?: boolean;
		/**
		 * Indicates if the listed entries sort as entered vs alphabetically.
		 */
		sortAsGiven?: boolean;
		/**
		 * Whether this field has a phone extension.
		 */
		hasExtension?: boolean;
		/**
		 * Indicates if the file should open a new window when a user clicks it within the product.
		 */
		useNewWindow?: boolean;
		/**
		 * Whether this field is append only.
		 */
		appendOnly?: boolean;
		/**
		 * Indicates if a field that is part of the relationship should be shown as a hyperlink to the parent record within the product.
		 */
		displayAsLink?: boolean;
	};
	/**
	 * Indicates if the field is marked as a default in reports. Defaults to true.
	 */
	appearsByDefault?: boolean;
	/**
	 * The [field types](https://help.quickbase.com/user-assistance/field_types.html), click on any of the field type links for more info.
	 */
	fieldType: 'text' | 'text-multiple-choice' | 'text-multi-line' | 'rich-text' | 'numeric' | 'currency' | 'rating' | 'percent' | 'multitext' | 'email' | 'url' | 'duration' | 'date' | 'datetime' | 'timestamp' | 'timeofday' | 'checkbox' | 'user' | 'multiuser' | 'address' | 'phone' | 'file';
	/**
	 * Field Permissions for different roles.
	 */
	permissions?: {
		/**
		 * The role associated with a given permission for the field
		 */
		role: string;
		/**
		 * The permission given to the role for this field
		 */
		permissionType: 'None' | 'View' | 'Modify';
		/**
		 * The Id of the given role
		 */
		roleId: number;
	}[];
	/**
	 * Whether the field you are adding should appear on forms. Defaults to false.
	 */
	addToForms?: boolean;
	/**
	 * The label (name) of the field.
	 */
	label: string;
	/**
	 * Indicates if the field is marked as searchable. Defaults to true.
	 */
	findEnabled?: boolean;
	/**
	 * Indicates if the field is configured to not wrap when displayed in the product. Defaults to false.
	 */
	noWrap?: boolean;
};

export type QuickBaseRequestDeleteFields = QuickBaseRequest & {
	/**
	 * The unique identifier of the table.
	 */
	tableId: string;
	/**
	 * List of field ids to be deleted.
	 */
	fieldIds: number[];
};

export type QuickBaseRequestGetField = QuickBaseRequest & {
	/**
	 * The unique identifier (fid) of the field.
	 */
	fieldId: number;
	/**
	 * The unique identifier (dbid) of the table.
	 */
	tableId: string;
	/**
	 * Set to 'true' if you'd like to get back the custom permissions for the field(s).
	 */
	includeFieldPerms?: boolean;
};

export type QuickBaseRequestUpdateField = QuickBaseRequest & {
	/**
	 * The unique identifier (fid) of the field.
	 */
	fieldId: number;
	/**
	 * The unique identifier of the table.
	 */
	tableId: string;
	/**
	 * Indicates if the field is being tracked as part of Quickbase Audit Logs. You can only set this property to "true" if the app has audit logs enabled. See Enable data change logs under [Quickbase Audit Logs](https://help.quickbase.com/user-assistance/audit_logs.html).
	 */
	audited?: boolean;
	/**
	 * The configured help text shown to users within the product.
	 */
	fieldHelp?: string;
	/**
	 * Indicates if the field is configured to display in bold in the product.
	 */
	bold?: boolean;
	/**
	 * Indicates if the field is required (i.e. if every record must have a non-null value in this field). If you attempt to change a field from not-required to required, and the table currently contains records that have null values in that field, you will get an error indicating that there are null values of the field. In this case you need to find and update those records with null values of the field before changing the field to required.
	 */
	required?: boolean;
	/**
	 * Specific field properties.
	 */
	properties?: {
		/**
		 * The comments entered on the field properties by an administrator.
		 */
		comments?: string;
		/**
		 * Whether this field totals in reports within the product.
		 */
		doesTotal?: boolean;
		/**
		 * Whether the link field will auto save.
		 */
		autoSave?: boolean;
		/**
		 * Default user id value.
		 */
		defaultValueLuid?: number;
		/**
		 * Whether phone numbers should be in E.164 standard international format
		 */
		useI18NFormat?: boolean;
		/**
		 * The maximum number of versions configured for a file attachment.
		 */
		maxVersions?: number;
		/**
		 * The format to display time.
		 */
		format?: number;
		/**
		 * Whether the field should carry its multiple choice fields when copied.
		 */
		carryChoices?: boolean;
		/**
		 * The maximum number of characters allowed for entry in Quickbase for this field.
		 */
		maxLength?: number;
		/**
		 * The configured text value that replaces the URL that users see within the product.
		 */
		linkText?: string;
		/**
		 * The id of the parent composite field, when applicable.
		 */
		parentFieldId?: number;
		/**
		 * Indicates whether to display the timezone within the product.
		 */
		displayTimezone?: boolean;
		/**
		 * The id of the field that is used to aggregate values from the child, when applicable. This displays 0 if the summary function doesn’t require a field selection (like count).
		 */
		summaryTargetFieldId?: number;
		/**
		 * Indicates if users can add new choices to a selection list.
		 */
		allowNewChoices?: boolean;
		/**
		 * Indicates if the field value is defaulted today for new records.
		 */
		defaultToday?: boolean;
		/**
		 * The units label.
		 */
		units?: string;
		/**
		 * Indicates which target the URL should open in when a user clicks it within the product.
		 */
		openTargetIn?: 'sameWindow' | 'newWindow' | 'popup';
		/**
		 * The id of the field that is the target on the parent table for this lookup.
		 */
		lookupTargetFieldId?: number;
		/**
		 * The accumulation type for the summary field.
		 */
		summaryFunction?: 'AVG' | 'SUM' | 'MAX' | 'MIN' | 'STD-DEV' | 'COUNT' | 'COMBINED-TEXT' | 'DISTINCT-COUNT';
		/**
		 * The id of the source field.
		 */
		sourceFieldId?: number;
		/**
		 * Whether this field averages in reports within the product.
		 */
		doesAverage?: boolean;
		/**
		 * The formula of the field as configured in Quickbase.
		 */
		formula?: string;
		/**
		 * The number of decimal places displayed in the product for this field.
		 */
		decimalPlaces?: number;
		/**
		 * Controls the default country shown on international phone widgets on forms. Country code should be entered in the ISO 3166-1 alpha-2 format.
		 */
		defaultCountryCode?: string;
		/**
		 * How to display months.
		 */
		displayMonth?: string;
		/**
		 * Indicates if the user can see other versions, aside from the most recent, of a file attachment within the product.
		 */
		seeVersions?: boolean;
		/**
		 * The number of lines shown in Quickbase for this text field.
		 */
		numLines?: number;
		/**
		 * The user default type.
		 */
		defaultKind?: string;
		/**
		 * How the email is displayed.
		 */
		displayEmail?: string;
		/**
		 * An alternate user friendly text that can be used to display a link in the browser.
		 */
		coverText?: string;
		/**
		 * The current symbol used when displaying field values within the product.
		 */
		currencySymbol?: string;
		/**
		 * The summary query.
		 */
		summaryQuery?: string;
		/**
		 * The id of the target field.
		 */
		targetFieldId?: number;
		/**
		 * The configured option for how users display within the product.
		 */
		displayUser?: string;
		/**
		 * Whether a blank value is treated the same as 0 in calculations within the product.
		 */
		blankIsZero?: boolean;
		/**
		 * Whether an exact match is required for a report link.
		 */
		exact?: boolean;
		/**
		 * Default email domain.
		 */
		defaultDomain?: string;
		/**
		 * The default value configured for a field when a new record is added.
		 */
		defaultValue?: string;
		/**
		 * Don't show the URL protocol when showing the URL.
		 */
		abbreviate?: boolean;
		/**
		 * The format used for displaying numeric values in the product (decimal, separators, digit group).
		 */
		numberFormat?: number;
		/**
		 * The field's target table name.
		 */
		targetTableName?: string;
		/**
		 * The link text, if empty, the url will be used as link text.
		 */
		appearsAs?: string;
		/**
		 * The field's html input width in the product.
		 */
		width?: number;
		/**
		 * The currency format used when displaying field values within the product.
		 */
		currencyFormat?: 'left' | 'right' | 'middle';
		/**
		 * Indicates whether to display the day of the week within the product.
		 */
		displayDayOfWeek?: boolean;
		/**
		 * The id of the field that is the reference in the relationship for this summary.
		 */
		summaryReferenceFieldId?: number;
		/**
		 * The number of digits before commas display in the product, when applicable.
		 */
		commaStart?: number;
		/**
		 * An array of entries that exist for a field that offers choices to the user. Note that these choices refer to the valid values of any records added in the future. You are allowed to remove values from the list of choices even if there are existing records with those values in this field. They will be displayed in red when users look at the data in the browser but there is no other effect. While updating a field with this property, the old choices are removed and replaced by the new choices.
		 */
		choices?: string[];
		/**
		 * The id of the target table.
		 */
		targetTableId?: string;
		/**
		 * Whether to display time as relative.
		 */
		displayRelative?: boolean;
		/**
		 * An array of the fields that make up a composite field (e.g., address).
		 */
		compositeFields?: number[];
		/**
		 * Indicates whether the checkbox values will be shown as text in reports.
		 */
		displayCheckboxAsText?: boolean;
		/**
		 * The table the summary field references fields from.
		 */
		summaryTableId?: string;
		/**
		 * Indicates whether to display the time, in addition to the date.
		 */
		displayTime?: boolean;
		/**
		 * Version modes for files. Keep all versions vs keep last version.
		 */
		versionMode?: 'keepallversions' | 'keeplastversions';
		/**
		 * The id of the field that is used to snapshot values from, when applicable.
		 */
		snapFieldId?: number;
		/**
		 * Indicates whether or not to display time in the 24-hour format within the product.
		 */
		hours24?: boolean;
		/**
		 * Whether to sort alphabetically, default sort is by record ID.
		 */
		sortAlpha?: boolean;
		/**
		 * Indicates if the listed entries sort as entered vs alphabetically.
		 */
		sortAsGiven?: boolean;
		/**
		 * Whether this field has a phone extension.
		 */
		hasExtension?: boolean;
		/**
		 * Indicates if the file should open a new window when a user clicks it within the product.
		 */
		useNewWindow?: boolean;
		/**
		 * Whether this field is append only.
		 */
		appendOnly?: boolean;
		/**
		 * Indicates if a field that is part of the relationship should be shown as a hyperlink to the parent record within the product.
		 */
		displayAsLink?: boolean;
		/**
		 * The id of the field that is the reference in the relationship for this lookup.
		 */
		lookupReferenceFieldId?: number;
	};
	/**
	 * Indicates if the field is marked as a default in reports.
	 */
	appearsByDefault?: boolean;
	/**
	 * Indicates if every record in the table must contain a unique value of this field. If you attempt to change a field from not-unique to unique, and the table currently contains records with the same value of this field, you will get an error. In this case you need to find and update those records with duplicate values of the field before changing the field to unique.
	 */
	unique?: boolean;
	/**
	 * Field Permissions for different roles.
	 */
	permissions?: {
		/**
		 * The role associated with a given permission for the field
		 */
		role: string;
		/**
		 * The permission given to the role for this field
		 */
		permissionType: 'None' | 'View' | 'Modify';
		/**
		 * The Id of the given role
		 */
		roleId: number;
	}[];
	/**
	 * Whether the field you are adding should appear on forms.
	 */
	addToForms?: boolean;
	/**
	 * The label (name) of the field.
	 */
	label?: string;
	/**
	 * Indicates if the field is marked as searchable.
	 */
	findEnabled?: boolean;
	/**
	 * Indicates if the field is configured to not wrap when displayed in the product.
	 */
	noWrap?: boolean;
};

export type QuickBaseRequestGetFieldsUsage = QuickBaseRequest & {
	/**
	 * The unique identifier (dbid) of the table.
	 */
	tableId: string;
	/**
	 * The number of fields to skip from the list.
	 */
	skip?: number;
	/**
	 * The maximum number of fields to return.
	 */
	top?: number;
};

export type QuickBaseRequestGetFieldUsage = QuickBaseRequest & {
	/**
	 * The unique identifier (fid) of the field.
	 */
	fieldId: number;
	/**
	 * The unique identifier (dbid) of the table.
	 */
	tableId: string;
};

export type QuickBaseRequestRunFormula = QuickBaseRequest & {
	/**
	 * The formula to run. This must be a valid Quickbase formula.
	 */
	formula: string;
	/**
	 * The record ID to run the formula against. Only necessary for formulas that are run in the context of a record. For example, the formula User() does not need a record ID.
	 */
	rid?: number;
	/**
	 * The unique identifier (dbid) of the table.
	 */
	tableId: string;
};

export type QuickBaseRequestUpsert = QuickBaseRequest & {
	/**
	 * The table identifier.
	 */
	tableId: string;
	/**
	 * Record data array, where each record contains key-value mappings of fields to be defined/updated and their values.
	 */
	data?: Record<string, { value: any }>[];
	/**
	 * The merge field id.
	 */
	mergeFieldId?: number;
	/**
	 * Specify an array of field ids that will return data for any updates or added record. Record ID (FID 3) is always returned if any field ID is requested.
	 */
	fieldsToReturn?: number[];
};

export type QuickBaseRequestDeleteRecords = QuickBaseRequest & {
	/**
	 * The unique identifier of the table.
	 */
	tableId: string;
	/**
	 * The filter to delete records. To delete all records specify a filter that will include all records, for example \{3.GT.0\} where 3 is the ID of the Record ID field.
	 */
	where: string;
};

export type QuickBaseRequestRunQuery = QuickBaseRequest & {
	/**
	 * Additional query options.
	 */
	options?: {
		/**
		 * The number of records to skip.
		 */
		skip: number;
		/**
		 * Whether to run the query against a date time field with respect to the application's local time. The query is run with UTC time by default.
		 */
		compareWithAppLocalTime?: boolean;
		/**
		 * The maximum number of records to display.
		 */
		top: number;
	};
	/**
	 * The filter, using the Quickbase query language, which determines the records to return. If this parameter is omitted, the query will return all records.
	 */
	where?: string;
	/**
	 * An array that contains the fields to group the records by.
	 */
	groupBy?: {
		/**
		 * The unique identifier of a field in a table.
		 */
		fieldId: number;
		/**
		 * Group by based on ascending order (ASC), descending order (DESC) or equal values (equal-values)
		 */
		grouping: 'ASC' | 'DESC' | 'equal-values' | 'first-word' | 'first-letter' | 'equal-values' | '1000000' | '100000' | '10000' | '1000' | '100' | '10' | '1' | '.1' | '.01' | '.001';
	}[];
	/**
	 * By default, queries will be sorted by the given sort fields or the default sort if the query does not provide any. Set to false to avoid sorting when the order of the data returned is not important. Returning data without sorting can improve performance.
	 */
	sortBy?: {
		/**
		 * The unique identifier of a field in a table.
		 */
		fieldId: number;
		/**
		 * Sort based on ascending order (ASC), descending order (DESC) or equal values (equal-values)
		 */
		order: 'ASC' | 'DESC' | 'equal-values';
	}[] | false;
	/**
	 * An array of field ids for the fields that should be returned in the response. If empty, the default columns on the table will be returned.
	 */
	select?: number[];
	/**
	 * The table identifier.
	 */
	tableId: string;
};

export type QuickBaseRequestGetTempTokenDBID = QuickBaseRequest & {
	/**
	 * The unique identifier of an app or table.
	 */
	dbid: string;
};

export type QuickBaseRequestCloneUserToken = QuickBaseRequest & {
	/**
	 * The new name for the cloned user token.
	 */
	name: string;
	/**
	 * The description for the cloned user token.
	 */
	description: string;
};

export type QuickBaseRequestDeactivateUserToken = QuickBaseRequest & {
};

export type QuickBaseRequestDeleteUserToken = QuickBaseRequest & {
};

export type QuickBaseRequestDownloadFile = QuickBaseRequest & {
	/**
	 * The unique identifier of the table.
	 */
	tableId: string;
	/**
	 * The unique identifier of the record.
	 */
	recordId: number;
	/**
	 * The unique identifier of the field.
	 */
	fieldId: number;
	/**
	 * The file attachment version number.
	 */
	versionNumber: number;
};

export type QuickBaseRequestDeleteFile = QuickBaseRequest & {
	/**
	 * The unique identifier of the table.
	 */
	tableId: string;
	/**
	 * The unique identifier of the record.
	 */
	recordId: number;
	/**
	 * The unique identifier of the field.
	 */
	fieldId: number;
	/**
	 * The file attachment version number.
	 */
	versionNumber: number;
};

export type QuickBaseRequestGetUsers = QuickBaseRequest & {
	/**
	 * The account id being used to get users. If no value is specified, the first account associated with the requesting user token is chosen.
	 */
	accountId?: number;
	/**
	 * When provided, the returned users will be narrowed down only to the users included in this list.
	 */
	emails: string[];
	/**
	 * When provided, the returned users will be narrowed down only to the users assigned to the app id's provided in this list. The provided app id's should belong to the same account.
	 */
	appIds: string[];
	/**
	 * Next page token used to get the next 'page' of results when available. When this field is empty, the first page is returned.
	 */
	nextPageToken: string;
};

export type QuickBaseRequestDenyUsers = QuickBaseRequest & {
	/**
	 * The account id being used to deny users. If no value is specified, the first account associated with the requesting user token is chosen.
	 */
	accountId?: number;
};

export type QuickBaseRequestDenyUsersAndGroups = QuickBaseRequest & {
	/**
	 * Specifies if the users should also be removed from all groups.
	 */
	shouldDeleteFromGroups: boolean;
	/**
	 * The account id being used to deny users. If no value is specified, the first account associated with the requesting user token is chosen.
	 */
	accountId?: number;
};

export type QuickBaseRequestUndenyUsers = QuickBaseRequest & {
	/**
	 * The account id being used to undeny users. If no value is specified, the first account associated with the requesting user token is chosen.
	 */
	accountId?: number;
};

export type QuickBaseRequestAddMembersToGroup = QuickBaseRequest & {
	/**
	 * This is the ID of the group being modified.
	 */
	gid: number;
};

export type QuickBaseRequestRemoveMembersFromGroup = QuickBaseRequest & {
	/**
	 * This is the ID of the group being modified.
	 */
	gid: number;
};

export type QuickBaseRequestAddManagersToGroup = QuickBaseRequest & {
	/**
	 * This is the ID of the group being modified.
	 */
	gid: number;
};

export type QuickBaseRequestRemoveManagersFromGroup = QuickBaseRequest & {
	/**
	 * This is the ID of the group being modified.
	 */
	gid: number;
};

export type QuickBaseRequestAddSubgroupsToGroup = QuickBaseRequest & {
	/**
	 * This is the ID of the group being modified.
	 */
	gid: number;
};

export type QuickBaseRequestRemoveSubgroupsFromGroup = QuickBaseRequest & {
	/**
	 * This is the ID of the group being modified.
	 */
	gid: number;
};

export type QuickBaseRequestAudit = QuickBaseRequest & {
	/**
	 * Token specifying start of page. For first page don't supply this.
	 */
	nextToken: string;
	/**
	 * The query id of an audit log request. This id is needed to fetch subsequent paged results of a single query.
	 */
	queryId: string;
	/**
	 * The date for which audit logs need to be fetched. This must be date-time only, as YYYY-MM-DD, and a valid date in the past.
	 */
	date: string;
};

export type QuickBaseRequestPlatformAnalyticReads = QuickBaseRequest & {
	/**
	 * The date for which read summaries need to be fetched. This must be date-time only, as YYYY-MM-DD, and a valid date in the past.
	 */
	day?: string;
};

export type QuickBaseResponseCreateApp = {
	/**
	 * The app name. You are allowed to create multiple apps with the same name, in the same realm, because they will have different dbid values. We urge you to be careful about doing this.
	 */
	name: string;
	/**
	 * The description for the app. If this property is left out, the app description will be blank.
	 */
	description: string;
	/**
	 * The time and date the app was created, in the ISO 8601 time format YYYY-MM-DDThh:mm:ss.sssZ (in UTC time zone).
	 */
	created: string;
	/**
	 * The time and date the app was last updated, in the ISO 8601 time format YYYY-MM-DDThh:mm:ss.sssZ (in UTC time zone).
	 */
	updated: string;
	/**
	 * A description of the format used when displaying date values in this app. Note that this is a browser-only parameter - see the [Field type details](../fieldInfo) page in the API Guide for how time values are returned in API calls. See [About Localizing Dates](https://help.quickbase.com/user-assistance/about_localizing_dates_numbers.html) to set the app’s date format.
	 */
	dateFormat: 'MM-DD-YYYY' | 'MM-DD-YY' | 'DD-MM-YYYY' | 'DD-MM-YY' | 'YYYY-MM-DD';
	/**
	 * A description of the time zone used when displaying time values in this app. Note that this is a browser-only parameter - see the [Field type details](../fieldInfo) page in the portal for how time values are returned in API calls. See [Set the Time Zone for Both the Application and the Account](https://help.quickbase.com/user-assistance/application_local_timezone.html) to set the application’s time zone.
	 */
	timeZone: string;
	/**
	 * The unique identifier for this application.
	 */
	id: string;
	/**
	 * Indicates whether app includes Everyone On The Internet access. See [Sharing apps with Everyone on the Internet (EOTI).](https://help.quickbase.com/user-assistance/share_with_everyone_on_internet.html)
	 */
	hasEveryoneOnTheInternet: boolean;
	/**
	 * The app variables. See [About Application Variables](https://help.quickbase.com/user-assistance/variables.html)
	 */
	variables: {
		/**
		 * Variable name.
		 */
		name: string;
		/**
		 * Variable value.
		 */
		value: string;
	}[];
	/**
	 * The Data Classification label assigned to the application. If Data Classification is not turned on, this will not be returned. If Data Classification is turned on, but application is not labeled, we return “None".  Data Classification labels can be added in the Admin Console by a Realm Administrator for Platform+ plans.
	 */
	dataClassification?: string;
	/**
	 * Security properties of the application
	 */
	securityProperties: {
		/**
		 * Allow users who are not administrators to copy
		 */
		allowClone: boolean;
		/**
		 * Allow users who are not administrators to export data
		 */
		allowExport: boolean;
		/**
		 * Hide from public application searches
		 */
		hideFromPublic: boolean;
		/**
		 * Require Application Tokens
		 */
		enableAppTokens: boolean;
		/**
		 * Only users logging in from "approved" IP addresses may access this application
		 */
		useIPFilter: boolean;
		/**
		 * Only "approved" users may access this application
		 */
		mustBeRealmApproved: boolean;
	};
};

export type QuickBaseResponseGetApp = {
	/**
	 * The app name. You are allowed to create multiple apps with the same name, in the same realm, because they will have different dbid values. We urge you to be careful about doing this.
	 */
	name: string;
	/**
	 * The description for the app. If this property is left out, the app description will be blank.
	 */
	description: string;
	/**
	 * The time and date the app was created, in the ISO 8601 time format YYYY-MM-DDThh:mm:ss.sssZ (in UTC time zone).
	 */
	created: string;
	/**
	 * The time and date the app was last updated, in the ISO 8601 time format YYYY-MM-DDThh:mm:ss.sssZ (in UTC time zone).
	 */
	updated: string;
	/**
	 * A description of the format used when displaying date values in this app. Note that this is a browser-only parameter - see the [Field type details](../fieldInfo) page in the API Guide for how time values are returned in API calls. See [About Localizing Dates](https://help.quickbase.com/user-assistance/about_localizing_dates_numbers.html) to set the app’s date format.
	 */
	dateFormat: string;
	/**
	 * A description of the time zone used when displaying time values in this app. Note that this is a browser-only parameter - see the [Field type details](../fieldInfo) page in the portal for how time values are returned in API calls. See [Set the Time Zone for Both the Application and the Account](https://help.quickbase.com/user-assistance/application_local_timezone.html) to set the application’s time zone.
	 */
	timeZone: string;
	/**
	 * The unique identifier for this application.
	 */
	id: string;
	/**
	 * Indicates whether app includes Everyone On The Internet access. See [Sharing apps with Everyone on the Internet (EOTI).](https://help.quickbase.com/user-assistance/share_with_everyone_on_internet.html)
	 */
	hasEveryoneOnTheInternet: boolean;
	/**
	 * The app variables. See [About Application Variables](https://help.quickbase.com/user-assistance/variables.html)
	 */
	variables: {
		/**
		 * Variable name.
		 */
		name: string;
		/**
		 * Variable value.
		 */
		value: string;
	}[];
	/**
	 * The Data Classification label assigned to the application. If Data Classification is not turned on, this will not be returned. If Data Classification is turned on, but application is not labeled, we return “None".  Data Classification labels can be added in the Admin Console by a Realm Administrator for Platform+ plans.
	 */
	dataClassification?: string;
	/**
	 * Security properties of the application
	 */
	securityProperties: {
		/**
		 * Allow users who are not administrators to copy
		 */
		allowClone: boolean;
		/**
		 * Allow users who are not administrators to export data
		 */
		allowExport: boolean;
		/**
		 * Hide from public application searches
		 */
		hideFromPublic: boolean;
		/**
		 * Require Application Tokens
		 */
		enableAppTokens: boolean;
		/**
		 * Only users logging in from "approved" IP addresses may access this application
		 */
		useIPFilter: boolean;
		/**
		 * Only "approved" users may access this application
		 */
		mustBeRealmApproved: boolean;
	};
};

export type QuickBaseResponseUpdateApp = {
	/**
	 * The app name. You are allowed to create multiple apps with the same name, in the same realm, because they will have different dbid values. We urge you to be careful about doing this.
	 */
	name: string;
	/**
	 * The description for the app. If this property is left out, the app description will be blank.
	 */
	description: string;
	/**
	 * The time and date the app was created, in the ISO 8601 time format YYYY-MM-DDThh:mm:ss.sssZ (in UTC time zone).
	 */
	created: string;
	/**
	 * The time and date the app was last updated, in the ISO 8601 time format YYYY-MM-DDThh:mm:ss.sssZ (in UTC time zone).
	 */
	updated: string;
	/**
	 * A description of the format used when displaying date values in this app. Note that this is a browser-only parameter - see the [Field type details](../fieldInfo) page in the API Guide for how time values are returned in API calls. See [About Localizing Dates](https://help.quickbase.com/user-assistance/about_localizing_dates_numbers.html) to set the app’s date format.
	 */
	dateFormat: string;
	/**
	 * A description of the time zone used when displaying time values in this app. Note that this is a browser-only parameter - see the [Field type details](../fieldInfo) page in the portal for how time values are returned in API calls. See [Set the Time Zone for Both the Application and the Account](https://help.quickbase.com/user-assistance/application_local_timezone.html) to set the application’s time zone.
	 */
	timeZone: string;
	/**
	 * The unique identifier for this application.
	 */
	id: string;
	/**
	 * Indicates whether app includes Everyone On The Internet access. See [Sharing apps with Everyone on the Internet (EOTI).](https://help.quickbase.com/user-assistance/share_with_everyone_on_internet.html)
	 */
	hasEveryoneOnTheInternet: boolean;
	/**
	 * The app variables. See [About Application Variables](https://help.quickbase.com/user-assistance/variables.html)
	 */
	variables: {
		/**
		 * Variable name.
		 */
		name: string;
		/**
		 * Variable value.
		 */
		value: string;
	}[];
	/**
	 * The Data Classification label assigned to the application. If Data Classification is not turned on, this will not be returned. If Data Classification is turned on, but application is not labeled, we return “None".  Data Classification labels can be added in the Admin Console by a Realm Administrator for Platform+ plans.
	 */
	dataClassification?: string;
	/**
	 * Security properties of the application
	 */
	securityProperties: {
		/**
		 * Allow users who are not administrators to copy
		 */
		allowClone: boolean;
		/**
		 * Allow users who are not administrators to export data
		 */
		allowExport: boolean;
		/**
		 * Hide from public application searches
		 */
		hideFromPublic: boolean;
		/**
		 * Require Application Tokens
		 */
		enableAppTokens: boolean;
		/**
		 * Only users logging in from "approved" IP addresses may access this application
		 */
		useIPFilter: boolean;
		/**
		 * Only "approved" users may access this application
		 */
		mustBeRealmApproved: boolean;
	};
};

export type QuickBaseResponseDeleteApp = {
	/**
	 * An ID of deleted application.
	 */
	deletedAppId: string;
};

export type QuickBaseResponseGetAppEvents = {
	/**
	 * Indication of whether current event is active.
	 */
	isActive: boolean;
	/**
	 * Type of an event.
	 */
	type: 'webhook' | 'qb-action' | 'email-notification' | 'subscription' | 'reminder' | 'automation';
	/**
	 * The name of the event. This property is not returned for automations.
	 */
	name: string;
	/**
	 * The url to automation that can be accessed from the browser. Only returned for automations.
	 */
	url: string;
	/**
	 * The user that owns the event.
	 */
	owner: {
		/**
		 * User full name.
		 */
		name: string;
		/**
		 * User Id.
		 */
		id: string;
		/**
		 * User email.
		 */
		email: string;
		/**
		 * User Name as updated in user properties. Optional, appears if not the same as user email.
		 */
		userName: string;
	};
	/**
	 * The unique identifier of the table to which event belongs to.
	 */
	tableId: string;
}[];

export type QuickBaseResponseCopyApp = {
	/**
	 * The app name. You are allowed to create multiple apps with the same name, in the same realm, because they will have different dbid values. We urge you to be careful about doing this.
	 */
	name: string;
	/**
	 * The description for the app
	 */
	description: string;
	/**
	 * The time and date the app was created, in the ISO 8601 time format YYYY-MM-DDThh:mm:ss.sssZ (in UTC time zone).
	 */
	created: string;
	/**
	 * The time and date the app was last updated, in the ISO 8601 time format YYYY-MM-DDThh:mm:ss.sssZ (in UTC time zone).
	 */
	updated: string;
	/**
	 * A description of the format used when displaying date values in this app. Note that this is a browser-only parameter - see the [Field type details](../fieldInfo) page in the API Guide for how time values are returned in API calls. See [About Localizing Dates](https://help.quickbase.com/user-assistance/about_localizing_dates_numbers.html) to set the app’s date format.
	 */
	dateFormat: string;
	/**
	 * A description of the time zone used when displaying time values in this app. Note that this is a browser-only parameter - see the [Field type details](../fieldInfo) page in the portal for how time values are returned in API calls. See [Set the Time Zone for Both the Application and the Account](https://help.quickbase.com/user-assistance/application_local_timezone.html) to set the application’s time zone.
	 */
	timeZone: string;
	/**
	 * The unique identifier for this application.
	 */
	id: string;
	/**
	 * Indicates whether app includes Everyone On The Internet access. See [Sharing apps with Everyone on the Internet (EOTI).](https://help.quickbase.com/user-assistance/share_with_everyone_on_internet.html)
	 */
	hasEveryoneOnTheInternet: boolean;
	/**
	 * The app variables. See [About Application Variables](https://help.quickbase.com/user-assistance/variables.html)
	 */
	variables: {
		/**
		 * Variable name.
		 */
		name: string;
		/**
		 * Variable value.
		 */
		value: string;
	}[];
	/**
	 * The id of the app from which this app was copied
	 */
	ancestorId: string;
	/**
	 * The Data Classification label assigned to the application. If Data Classification is not turned on, this will not be returned. If Data Classification is turned on, but application is not labeled, we return “None".  Data Classification labels can be added in the Admin Console by a Realm Administrator for Platform+ plans.
	 */
	dataClassification?: string;
};

export type QuickBaseResponseCreateTable = {
	/**
	 * The name of the table.
	 */
	name: string;
	/**
	 * The unique identifier (dbid) of the table.
	 */
	id: string;
	/**
	 * The automatically-created table alias for the table.
	 */
	alias: string;
	/**
	 * The description of the table, as configured by an application administrator.
	 */
	description: string;
	/**
	 * The time and date when the table was created, in the ISO 8601 time format YYYY-MM-DDThh:mm:ss.sssZ (in UTC time zone).
	 */
	created: string;
	/**
	 * The time and date when the table schema or data was last updated, in the ISO 8601 time format YYYY-MM-DDThh:mm:ss.sssZ (in UTC time zone).
	 */
	updated: string;
	/**
	 * The incremental Record ID that will be used when the next record is created, as determined when the API call was ran.
	 */
	nextRecordId: number;
	/**
	 * The incremental Field ID that will be used when the next field is created, as determined when the API call was ran.
	 */
	nextFieldId: number;
	/**
	 * The id of the field that is configured for default sorting.
	 */
	defaultSortFieldId: number;
	/**
	 * The configuration of the default sort order on the table.
	 */
	defaultSortOrder: 'ASC' | 'DESC';
	/**
	 * The id of the field that is configured to be the key on this table, which is usually the Quickbase Record ID.
	 */
	keyFieldId: number;
	/**
	 * The builder-configured singular noun of the table.
	 */
	singleRecordName: string;
	/**
	 * The builder-configured plural noun of the table.
	 */
	pluralRecordName: string;
	/**
	 * The size limit for the table.
	 */
	sizeLimit: string;
	/**
	 * The amount of space currently being used by the table.
	 */
	spaceUsed: string;
	/**
	 * The amount of space remaining for use by the table.
	 */
	spaceRemaining: string;
};

export type QuickBaseResponseGetAppTables = {
	/**
	 * The name of the table.
	 */
	name: string;
	/**
	 * The unique identifier (dbid) of the table.
	 */
	id: string;
	/**
	 * The automatically-created table alias for the table.
	 */
	alias: string;
	/**
	 * The description of the table, as configured by an application administrator.
	 */
	description: string;
	/**
	 * The time and date when the table was created, in the ISO 8601 time format YYYY-MM-DDThh:mm:ss.sssZ (in UTC time zone).
	 */
	created: string;
	/**
	 * The time and date when the table schema or data was last updated, in the ISO 8601 time format YYYY-MM-DDThh:mm:ss.sssZ (in UTC time zone).
	 */
	updated: string;
	/**
	 * The incremental Record ID that will be used when the next record is created, as determined when the API call was ran.
	 */
	nextRecordId: number;
	/**
	 * The incremental Field ID that will be used when the next field is created, as determined when the API call was ran.
	 */
	nextFieldId: number;
	/**
	 * The id of the field that is configured for default sorting.
	 */
	defaultSortFieldId: number;
	/**
	 * The configuration of the default sort order on the table.
	 */
	defaultSortOrder: 'ASC' | 'DESC';
	/**
	 * The id of the field that is configured to be the key on this table, which is usually the Quickbase Record ID.
	 */
	keyFieldId: number;
	/**
	 * The builder-configured singular noun of the table.
	 */
	singleRecordName: string;
	/**
	 * The builder-configured plural noun of the table.
	 */
	pluralRecordName: string;
	/**
	 * The size limit for the table.
	 */
	sizeLimit: string;
	/**
	 * The amount of space currently being used by the table.
	 */
	spaceUsed: string;
	/**
	 * The amount of space remaining for use by the table.
	 */
	spaceRemaining: string;
}[];

export type QuickBaseResponseGetTable = {
	/**
	 * The name of the table.
	 */
	name: string;
	/**
	 * The unique identifier (dbid) of the table.
	 */
	id: string;
	/**
	 * The automatically-created table alias for the table.
	 */
	alias: string;
	/**
	 * The description of the table, as configured by an application administrator.
	 */
	description: string;
	/**
	 * The time and date when the table was created, in the ISO 8601 time format YYYY-MM-DDThh:mm:ss.sssZ (in UTC time zone).
	 */
	created: string;
	/**
	 * The time and date when the table schema or data was last updated, in the ISO 8601 time format YYYY-MM-DDThh:mm:ss.sssZ (in UTC time zone).
	 */
	updated: string;
	/**
	 * The incremental Record ID that will be used when the next record is created, as determined when the API call was ran.
	 */
	nextRecordId: number;
	/**
	 * The incremental Field ID that will be used when the next field is created, as determined when the API call was ran.
	 */
	nextFieldId: number;
	/**
	 * The id of the field that is configured for default sorting.
	 */
	defaultSortFieldId: number;
	/**
	 * The configuration of the default sort order on the table.
	 */
	defaultSortOrder: 'ASC' | 'DESC';
	/**
	 * The id of the field that is configured to be the key on this table, which is usually the Quickbase Record ID.
	 */
	keyFieldId: number;
	/**
	 * The builder-configured singular noun of the table.
	 */
	singleRecordName: string;
	/**
	 * The builder-configured plural noun of the table.
	 */
	pluralRecordName: string;
	/**
	 * The size limit for the table.
	 */
	sizeLimit: string;
	/**
	 * The amount of space currently being used by the table.
	 */
	spaceUsed: string;
	/**
	 * The amount of space remaining for use by the table.
	 */
	spaceRemaining: string;
};

export type QuickBaseResponseUpdateTable = {
	/**
	 * The name of the table.
	 */
	name: string;
	/**
	 * The unique identifier (dbid) of the table.
	 */
	id: string;
	/**
	 * The automatically-created table alias for the table.
	 */
	alias: string;
	/**
	 * The description of the table, as configured by an application administrator.
	 */
	description: string;
	/**
	 * The time and date when the table was created, in the ISO 8601 time format YYYY-MM-DDThh:mm:ss.sssZ (in UTC time zone).
	 */
	created: string;
	/**
	 * The time and date when the table schema or data was last updated, in the ISO 8601 time format YYYY-MM-DDThh:mm:ss.sssZ (in UTC time zone).
	 */
	updated: string;
	/**
	 * The incremental Record ID that will be used when the next record is created, as determined when the API call was ran.
	 */
	nextRecordId: number;
	/**
	 * The incremental Field ID that will be used when the next field is created, as determined when the API call was ran.
	 */
	nextFieldId: number;
	/**
	 * The id of the field that is configured for default sorting.
	 */
	defaultSortFieldId: number;
	/**
	 * The configuration of the default sort order on the table.
	 */
	defaultSortOrder: 'ASC' | 'DESC';
	/**
	 * The id of the field that is configured to be the key on this table, which is usually the Quickbase Record ID.
	 */
	keyFieldId: number;
	/**
	 * The builder-configured singular noun of the table.
	 */
	singleRecordName: string;
	/**
	 * The builder-configured plural noun of the table.
	 */
	pluralRecordName: string;
	/**
	 * The size limit for the table.
	 */
	sizeLimit: string;
	/**
	 * The amount of space currently being used by the table.
	 */
	spaceUsed: string;
	/**
	 * The amount of space remaining for use by the table.
	 */
	spaceRemaining: string;
};

export type QuickBaseResponseDeleteTable = {
	/**
	 * The deleted table id.
	 */
	deletedTableId: string;
};

export type QuickBaseResponseGetRelationships = {
	/**
	 * The relationships in a table.
	 */
	relationships: {
		/**
		 * The relationship id (foreign key field id).
		 */
		id: number;
		/**
		 * The parent table id of the relationship.
		 */
		parentTableId: string;
		/**
		 * The child table id of the relationship.
		 */
		childTableId: string;
		/**
		 * The foreign key field information.
		 */
		foreignKeyField?: {
			/**
			 * Field id.
			 */
			id: number;
			/**
			 * Field label.
			 */
			label: string;
			/**
			 * Field type.
			 */
			type: 'text' | 'text-multiple-choice' | 'text-multi-line' | 'rich-text' | 'numeric' | 'currency' | 'rating' | 'percent' | 'multitext' | 'email' | 'url' | 'duration' | 'date' | 'datetime' | 'timestamp' | 'timeofday' | 'checkbox' | 'user' | 'multiuser' | 'address' | 'phone' | 'file';
		};
		/**
		 * Whether this is a cross-app relationship.
		 */
		isCrossApp: boolean;
		/**
		 * The lookup fields array.
		 */
		lookupFields?: {
			/**
			 * Field id.
			 */
			id: number;
			/**
			 * Field label.
			 */
			label: string;
			/**
			 * Field type.
			 */
			type: 'text' | 'text-multiple-choice' | 'text-multi-line' | 'rich-text' | 'numeric' | 'currency' | 'rating' | 'percent' | 'multitext' | 'email' | 'url' | 'duration' | 'date' | 'datetime' | 'timestamp' | 'timeofday' | 'checkbox' | 'user' | 'multiuser' | 'address' | 'phone' | 'file';
		}[];
		/**
		 * The summary fields array.
		 */
		summaryFields?: {
			/**
			 * Field id.
			 */
			id: number;
			/**
			 * Field label.
			 */
			label: string;
			/**
			 * Field type.
			 */
			type: 'text' | 'text-multiple-choice' | 'text-multi-line' | 'rich-text' | 'numeric' | 'currency' | 'rating' | 'percent' | 'multitext' | 'email' | 'url' | 'duration' | 'date' | 'datetime' | 'timestamp' | 'timeofday' | 'checkbox' | 'user' | 'multiuser' | 'address' | 'phone' | 'file';
		}[];
	}[];
	/**
	 * Additional information about the results that may be helpful.
	 */
	metadata?: {
		/**
		 * The number of relationships to skip.
		 */
		skip: number;
		/**
		 * The total number of relationships.
		 */
		totalRelationships: number;
		/**
		 * The number of relationships in the current response object.
		 */
		numRelationships: number;
	};
};

export type QuickBaseResponseCreateRelationship = {
	/**
	 * The relationship id (foreign key field id).
	 */
	id: number;
	/**
	 * The parent table id of the relationship.
	 */
	parentTableId: string;
	/**
	 * The child table id of the relationship.
	 */
	childTableId: string;
	/**
	 * The foreign key field information.
	 */
	foreignKeyField: {
		/**
		 * Field id.
		 */
		id: number;
		/**
		 * Field label.
		 */
		label: string;
		/**
		 * Field type.
		 */
		type: 'text' | 'text-multiple-choice' | 'text-multi-line' | 'rich-text' | 'numeric' | 'currency' | 'rating' | 'percent' | 'multitext' | 'email' | 'url' | 'duration' | 'date' | 'datetime' | 'timestamp' | 'timeofday' | 'checkbox' | 'user' | 'multiuser' | 'address' | 'phone' | 'file';
	};
	/**
	 * Whether this is a cross-app relationship.
	 */
	isCrossApp: boolean;
	/**
	 * The lookup fields array.
	 */
	lookupFields: {
		/**
		 * Field id.
		 */
		id: number;
		/**
		 * Field label.
		 */
		label: string;
		/**
		 * Field type.
		 */
		type: 'text' | 'text-multiple-choice' | 'text-multi-line' | 'rich-text' | 'numeric' | 'currency' | 'rating' | 'percent' | 'multitext' | 'email' | 'url' | 'duration' | 'date' | 'datetime' | 'timestamp' | 'timeofday' | 'checkbox' | 'user' | 'multiuser' | 'address' | 'phone' | 'file';
	}[];
	/**
	 * The summary fields array.
	 */
	summaryFields: {
		/**
		 * Field id.
		 */
		id: number;
		/**
		 * Field label.
		 */
		label: string;
		/**
		 * Field type.
		 */
		type: 'text' | 'text-multiple-choice' | 'text-multi-line' | 'rich-text' | 'numeric' | 'currency' | 'rating' | 'percent' | 'multitext' | 'email' | 'url' | 'duration' | 'date' | 'datetime' | 'timestamp' | 'timeofday' | 'checkbox' | 'user' | 'multiuser' | 'address' | 'phone' | 'file';
	}[];
};

export type QuickBaseResponseUpdateRelationship = {
	/**
	 * The relationship id (foreign key field id).
	 */
	id: number;
	/**
	 * The parent table id of the relationship.
	 */
	parentTableId: string;
	/**
	 * The child table id of the relationship.
	 */
	childTableId: string;
	/**
	 * The foreign key field information.
	 */
	foreignKeyField?: {
		/**
		 * Field id.
		 */
		id: number;
		/**
		 * Field label.
		 */
		label: string;
		/**
		 * Field type.
		 */
		type: 'text' | 'text-multiple-choice' | 'text-multi-line' | 'rich-text' | 'numeric' | 'currency' | 'rating' | 'percent' | 'multitext' | 'email' | 'url' | 'duration' | 'date' | 'datetime' | 'timestamp' | 'timeofday' | 'checkbox' | 'user' | 'multiuser' | 'address' | 'phone' | 'file';
	};
	/**
	 * Whether this is a cross-app relationship.
	 */
	isCrossApp: boolean;
	/**
	 * The lookup fields array.
	 */
	lookupFields?: {
		/**
		 * Field id.
		 */
		id: number;
		/**
		 * Field label.
		 */
		label: string;
		/**
		 * Field type.
		 */
		type: 'text' | 'text-multiple-choice' | 'text-multi-line' | 'rich-text' | 'numeric' | 'currency' | 'rating' | 'percent' | 'multitext' | 'email' | 'url' | 'duration' | 'date' | 'datetime' | 'timestamp' | 'timeofday' | 'checkbox' | 'user' | 'multiuser' | 'address' | 'phone' | 'file';
	}[];
	/**
	 * The summary fields array.
	 */
	summaryFields?: {
		/**
		 * Field id.
		 */
		id: number;
		/**
		 * Field label.
		 */
		label: string;
		/**
		 * Field type.
		 */
		type: 'text' | 'text-multiple-choice' | 'text-multi-line' | 'rich-text' | 'numeric' | 'currency' | 'rating' | 'percent' | 'multitext' | 'email' | 'url' | 'duration' | 'date' | 'datetime' | 'timestamp' | 'timeofday' | 'checkbox' | 'user' | 'multiuser' | 'address' | 'phone' | 'file';
	}[];
};

export type QuickBaseResponseDeleteRelationship = {
	/**
	 * The relationship id.
	 */
	relationshipId: number;
};

export type QuickBaseResponseGetTableReports = {
	/**
	 * The identifier of the report, unique to the table.
	 */
	id: string;
	/**
	 * The configured name of the report.
	 */
	name: string;
	/**
	 * The type of report in Quickbase (e.g., chart).
	 */
	type: 'map' | 'gedit' | 'chart' | 'summary' | 'table' | 'timeline' | 'calendar';
	/**
	 * The configured description of a report.
	 */
	description: string;
	/**
	 * Optional, showed only for personal reports. The user ID of report owner.
	 */
	ownerId: number;
	/**
	 * The query definition as configured in Quickbase that gets executed when the report is run.
	 */
	query: {
		/**
		 * The table identifier for the report.
		 */
		tableId: string;
		/**
		 * Filter used to query for data.
		 */
		filter: string;
		/**
		 * Calculated formula fields.
		 */
		formulaFields: {
			/**
			 * Formula field identifier.
			 */
			id: number;
			/**
			 * Formula field label.
			 */
			label: string;
			/**
			 * Resulting formula value type.
			 */
			fieldType: 'rich-text' | 'text' | 'numeric' | 'currency' | 'percent' | 'rating' | 'date' | 'timestamp' | 'timeofday' | 'duration' | 'checkbox' | 'phone' | 'email' | 'user' | 'multiuser' | 'url';
			/**
			 * Formula text.
			 */
			formula: string;
			/**
			 * For numeric formula the number precision.
			 */
			decimalPrecision: number;
		}[];
	};
	/**
	 * A list of properties specific to the report type. To see a detailed description of the properties for each report type, See [Report Types.](../reportTypes)
	 */
	properties: any;
	/**
	 * The instant at which a report was last used.
	 */
	usedLast: string;
	/**
	 * The number of times a report has been used.
	 */
	usedCount: number;
}[];

export type QuickBaseResponseGetReport = {
	/**
	 * The identifier of the report, unique to the table.
	 */
	id: string;
	/**
	 * The configured name of the report.
	 */
	name: string;
	/**
	 * The type of report in Quickbase (e.g., chart).
	 */
	type: 'map' | 'gedit' | 'chart' | 'summary' | 'table' | 'timeline' | 'calendar';
	/**
	 * The configured description of a report.
	 */
	description: string;
	/**
	 * Optional, showed only for personal reports. The user ID of report owner.
	 */
	ownerId: number;
	/**
	 * The query definition as configured in Quickbase that gets executed when the report is run.
	 */
	query: {
		/**
		 * The table identifier for the report.
		 */
		tableId: string;
		/**
		 * Filter used to query for data.
		 */
		filter: string;
		/**
		 * Calculated formula fields.
		 */
		formulaFields: {
			/**
			 * Formula field identifier.
			 */
			id: number;
			/**
			 * Formula field label.
			 */
			label: string;
			/**
			 * Resulting formula value type.
			 */
			fieldType: 'rich-text' | 'text' | 'numeric' | 'currency' | 'percent' | 'rating' | 'date' | 'timestamp' | 'timeofday' | 'duration' | 'checkbox' | 'phone' | 'email' | 'user' | 'multiuser' | 'url';
			/**
			 * Formula text.
			 */
			formula: string;
			/**
			 * For numeric formula the number precision.
			 */
			decimalPrecision: number;
		}[];
		/**
		 * An array of field ids used in the report
		 */
		fields: number[];
		/**
		 * An array of fields used in sorting the report
		 */
		sortBy: {
			/**
			 * Field ID to sort by
			 */
			fieldId: number;
			/**
			 * Order to sort the field by
			 */
			order: 'ASC' | 'DESC';
		}[];
		/**
		 * An array of fields used in grouping the report
		 */
		groupBy: {
			/**
			 * Field ID to group by
			 */
			fieldId: number;
			/**
			 * Function to group the field by
			 */
			grouping: 'first-word' | 'first-letter' | 'equal-values' | '1000000' | '100000' | '10000' | '1000' | '100' | '10' | '1' | '.1' | '.01' | '.001';
		}[];
	};
	/**
	 * A list of properties specific to the report type. To see a detailed description of the properties for each report type, See [Report Types.](../reportTypes)
	 */
	properties: any;
	/**
	 * The instant at which a report was last used.
	 */
	usedLast: string;
	/**
	 * The number of times a report has been used.
	 */
	usedCount: number;
};

export type QuickBaseResponseRunReport = {
	/**
	 * An array of objects that contains limited meta-data of each field displayed in the report. This assists in building logic that depends on field types and IDs.
	 */
	fields: {
		/**
		 * Field id.
		 */
		id: number;
		/**
		 * Field label.
		 */
		label: string;
		/**
		 * Field type.
		 */
		type: 'text' | 'text-multiple-choice' | 'text-multi-line' | 'rich-text' | 'numeric' | 'currency' | 'rating' | 'percent' | 'multitext' | 'email' | 'url' | 'duration' | 'date' | 'datetime' | 'timestamp' | 'timeofday' | 'checkbox' | 'user' | 'multiuser' | 'address' | 'phone' | 'file';
		/**
		 * Column heading label override for field in report.
		 */
		labelOverride: string;
	}[];
	/**
	 * An array of objects that either represents the record data or summarized values, depending on the report type.
	 */
	data: Record<string, { value: any }>[];
	/**
	 * Additional information about the results that may be helpful. Pagination may be needed if either you specify a smaller number of results to skip than is available, or if the API automatically returns fewer results. numRecords can be compared to totalRecords to determine if further pagination is needed.
	 */
	metadata: {
		/**
		 * The number of records to skip
		 */
		skip?: number;
		/**
		 * The number of fields in each record in the current response object
		 */
		numFields: number;
		/**
		 * If present, the maximum number of records requested by the caller
		 */
		top?: number;
		/**
		 * The total number of records in the result set
		 */
		totalRecords: number;
		/**
		 * The number of records in the current response object
		 */
		numRecords: number;
	};
};

export type QuickBaseResponseGetFields = {
	/**
	 * The id of the field, unique to this table.
	 */
	id: number;
	/**
	 * The type of field, as described [here](https://help.quickbase.com/user-assistance/field_types.html).
	 */
	fieldType?: string;
	/**
	 * For derived fields, this will be 'lookup', 'summary', or 'formula', to indicate the type of derived field.  For non-derived fields, this will be blank.
	 */
	mode?: string;
	/**
	 * The label (name) of the field.
	 */
	label?: string;
	/**
	 * Indicates if the field is configured to not wrap when displayed in the product.
	 */
	noWrap?: boolean;
	/**
	 * Indicates if the field is configured to display in bold in the product.
	 */
	bold?: boolean;
	/**
	 * Indicates if the field is marked required.
	 */
	required?: boolean;
	/**
	 * Indicates if the field is marked as a default in reports.
	 */
	appearsByDefault?: boolean;
	/**
	 * Indicates if the field is marked as searchable.
	 */
	findEnabled?: boolean;
	/**
	 * Indicates if the field is marked unique.
	 */
	unique?: boolean;
	/**
	 * Indicates if the field data will copy when a user copies the record.
	 */
	doesDataCopy?: boolean;
	/**
	 * The configured help text shown to users within the product.
	 */
	fieldHelp?: string;
	/**
	 * Indicates if the field is being tracked as part of Quickbase Audit Logs.
	 */
	audited?: boolean;
	/**
	 * Additional properties for the field. Please see [Field type details](../fieldInfo) page for more details on the properties for each field type.
	 */
	properties?: {
		/**
		 * The comments entered on the field properties by an administrator.
		 */
		comments: string;
		/**
		 * Whether this field totals in reports within the product.
		 */
		doesTotal: boolean;
		/**
		 * Whether the link field will auto save.
		 */
		autoSave: boolean;
		/**
		 * Default user id value.
		 */
		defaultValueLuid: number;
		/**
		 * Whether phone numbers should be in E.164 standard international format.
		 */
		useI18NFormat: boolean;
		/**
		 * The maximum number of versions configured for a file attachment.
		 */
		maxVersions: number;
		/**
		 * Whether the field should carry its multiple choice fields when copied.
		 */
		carryChoices: boolean;
		/**
		 * The format to display time.
		 */
		format: number;
		/**
		 * The maximum number of characters allowed for entry in Quickbase for this field.
		 */
		maxLength: number;
		/**
		 * The configured text value that replaces the URL that users see within the product.
		 */
		linkText: string;
		/**
		 * The id of the parent composite field, when applicable.
		 */
		parentFieldId: number;
		/**
		 * Indicates whether to display the timezone within the product.
		 */
		displayTimezone: boolean;
		/**
		 * The id of the field that is used to aggregate values from the child, when applicable. This displays 0 if the summary function doesn’t require a field selection (like count).
		 */
		summaryTargetFieldId: number;
		/**
		 * Indicates if users can add new choices to a selection list.
		 */
		allowNewChoices: boolean;
		/**
		 * The id of the field that is the reference in the relationship.
		 */
		masterChoiceFieldId: number;
		/**
		 * Indicates if the field value is defaulted today for new records.
		 */
		defaultToday: boolean;
		/**
		 * The units label.
		 */
		units: string;
		/**
		 * The id of the field that is the target on the master table for this lookup.
		 */
		lookupTargetFieldId: number;
		/**
		 * The summary accumulation function type.
		 */
		summaryFunction: 'AVG' | 'SUM' | 'MAX' | 'MIN' | 'STD-DEV' | 'COUNT' | 'COMBINED-TEXT' | 'DISTINCT-COUNT';
		/**
		 * The id of the source field.
		 */
		sourceFieldId: number;
		/**
		 * The table alias for the master table in the relationship this field is part of.
		 */
		masterTableTag: string;
		/**
		 * Whether this field averages in reports within the product.
		 */
		doesAverage: boolean;
		/**
		 * The formula of the field as configured in Quickbase.
		 */
		formula: string;
		/**
		 * The number of decimal places displayed in the product for this field.
		 */
		decimalPlaces: number;
		/**
		 * Controls the default country shown on international phone widgets on forms. Country code should be entered in the ISO 3166-1 alpha-2 format.
		 */
		defaultCountryCode: string;
		/**
		 * Indicates if the user can see other versions, aside from the most recent, of a file attachment within the product.
		 */
		seeVersions: boolean;
		/**
		 * How to display months.
		 */
		displayMonth: string;
		/**
		 * The number of lines shown in Quickbase for this text field.
		 */
		numLines: number;
		/**
		 * How the email is displayed.
		 */
		displayEmail: string;
		/**
		 * The user default type.
		 */
		defaultKind: string;
		/**
		 * An alternate user friendly text that can be used to display a link in the browser.
		 */
		coverText: string;
		/**
		 * The current symbol used when displaying field values within the product.
		 */
		currencySymbol: string;
		/**
		 * The id of the table that is the master in this relationship.
		 */
		masterChoiceTableId: string;
		/**
		 * The id of the target field.
		 */
		targetFieldId: number;
		/**
		 * The configured option for how users display within the product.
		 */
		displayUser: string;
		/**
		 * Whether a blank value is treated the same as 0 in calculations within the product.
		 */
		blankIsZero: boolean;
		/**
		 * Whether an exact match is required for a report link.
		 */
		exact: boolean;
		/**
		 * The start field id.
		 */
		startField: number;
		/**
		 * Default email domain.
		 */
		defaultDomain: string;
		/**
		 * The default value configured for a field when a new record is added.
		 */
		defaultValue: string;
		/**
		 * List of user choices.
		 */
		choicesLuid: string[];
		/**
		 * Don't show the URL protocol when showing the URL.
		 */
		abbreviate: boolean;
		/**
		 * The field's xml tag.
		 */
		xmlTag: string;
		/**
		 * The field's target table name.
		 */
		targetTableName: string;
		/**
		 * The format used for displaying numeric values in the product (decimal, separators, digit group).
		 */
		numberFormat: number;
		/**
		 * The link text, if empty, the url will be used as link text.
		 */
		appearsAs: string;
		/**
		 * The field's html input width in the product.
		 */
		width: number;
		/**
		 * The currency format used when displaying field values within the product.
		 */
		currencyFormat: 'left' | 'right' | 'middle';
		/**
		 * Indicates if the field is a foreign key (or reference field) in a relationship.
		 */
		foreignKey: boolean;
		/**
		 * Indicates whether to display the day of the week within the product.
		 */
		displayDayOfWeek: boolean;
		/**
		 * The id of the field that is the reference in the relationship for this summary.
		 */
		summaryReferenceFieldId: number;
		/**
		 * The number of digits before commas display in the product, when applicable.
		 */
		commaStart: number;
		/**
		 * An array of entries that exist for a field that offers choices to the user.
		 */
		choices: string[];
		/**
		 * The id of the target table.
		 */
		targetTableId: string;
		/**
		 * Whether to display time as relative.
		 */
		displayRelative: boolean;
		/**
		 * An array of the fields that make up a composite field (e.g., address).
		 */
		compositeFields: number[];
		/**
		 * Indicates whether the checkbox values will be shown as text in reports.
		 */
		displayCheckboxAsText: boolean;
		/**
		 * Version modes for files. Keep all versions vs keep last version.
		 */
		versionMode: 'keepallversions' | 'keeplastversions';
		/**
		 * Indicates whether to display the time, in addition to the date.
		 */
		displayTime: boolean;
		/**
		 * The duration field id.
		 */
		durationField: number;
		/**
		 * The id of the field that is used to snapshot values from, when applicable.
		 */
		snapFieldId: number;
		/**
		 * Indicates whether or not to display time in the 24-hour format within the product.
		 */
		hours24: boolean;
		/**
		 * Whether to sort alphabetically, default sort is by record ID.
		 */
		sortAlpha: boolean;
		/**
		 * Indicates if the listed entries sort as entered vs alphabetically.
		 */
		sortAsGiven: boolean;
		/**
		 * Whether this field has a phone extension.
		 */
		hasExtension: boolean;
		/**
		 * The work week type.
		 */
		workWeek: number;
		/**
		 * Indicates if the URL should open a new window when a user clicks it within the product.
		 */
		useNewWindow: boolean;
		/**
		 * Whether this field is append only.
		 */
		appendOnly: boolean;
		/**
		 * Indicates if a field that is part of the relationship should be shown as a hyperlink to the parent record within the product.
		 */
		displayAsLink: boolean;
		/**
		 * Whether this field allows html.
		 */
		allowHTML: boolean;
		/**
		 * The id of the field that is the reference in the relationship for this lookup.
		 */
		lookupReferenceFieldId: number;
	};
	/**
	 * Field Permissions for different roles.
	 */
	permissions?: {
		/**
		 * The role associated with a given permission for the field
		 */
		role: string;
		/**
		 * The permission given to the role for this field
		 */
		permissionType: 'None' | 'View' | 'Modify';
		/**
		 * The Id of the given role
		 */
		roleId: number;
	}[];
}[];

export type QuickBaseResponseCreateField = {
	/**
	 * The id of the field, unique to this table.
	 */
	id: number;
	/**
	 * The type of field, as described [here](https://help.quickbase.com/user-assistance/field_types.html).
	 */
	fieldType?: string;
	/**
	 * For derived fields, this will be 'lookup', 'summary', or 'formula', to indicate the type of derived field.  For non-derived fields, this will be blank.
	 */
	mode?: string;
	/**
	 * The label (name) of the field.
	 */
	label?: string;
	/**
	 * Indicates if the field is configured to not wrap when displayed in the product.
	 */
	noWrap?: boolean;
	/**
	 * Indicates if the field is configured to display in bold in the product.
	 */
	bold?: boolean;
	/**
	 * Indicates if the field is marked required.
	 */
	required?: boolean;
	/**
	 * Indicates if the field is marked as a default in reports.
	 */
	appearsByDefault?: boolean;
	/**
	 * Indicates if the field is marked as searchable.
	 */
	findEnabled?: boolean;
	/**
	 * Indicates if the field is marked unique.
	 */
	unique?: boolean;
	/**
	 * Indicates if the field data will copy when a user copies the record.
	 */
	doesDataCopy?: boolean;
	/**
	 * The configured help text shown to users within the product.
	 */
	fieldHelp?: string;
	/**
	 * Indicates if the field is being tracked as part of Quickbase Audit Logs.
	 */
	audited?: boolean;
	/**
	 * Additional properties for the field. Please see [Field type details](../fieldInfo) page for more details on the properties for each field type.
	 */
	properties?: {
		/**
		 * The comments entered on the field properties by an administrator.
		 */
		comments: string;
		/**
		 * Whether this field totals in reports within the product.
		 */
		doesTotal: boolean;
		/**
		 * Whether the link field will auto save.
		 */
		autoSave: boolean;
		/**
		 * Default user id value.
		 */
		defaultValueLuid: number;
		/**
		 * Whether phone numbers should be in E.164 standard international format.
		 */
		useI18NFormat: boolean;
		/**
		 * The maximum number of versions configured for a file attachment.
		 */
		maxVersions: number;
		/**
		 * Whether the field should carry its multiple choice fields when copied.
		 */
		carryChoices: boolean;
		/**
		 * The format to display time.
		 */
		format: number;
		/**
		 * The maximum number of characters allowed for entry in Quickbase for this field.
		 */
		maxLength: number;
		/**
		 * The configured text value that replaces the URL that users see within the product.
		 */
		linkText: string;
		/**
		 * The id of the parent composite field, when applicable.
		 */
		parentFieldId: number;
		/**
		 * Indicates whether to display the timezone within the product.
		 */
		displayTimezone: boolean;
		/**
		 * The id of the field that is used to aggregate values from the child, when applicable. This displays 0 if the summary function doesn’t require a field selection (like count).
		 */
		summaryTargetFieldId: number;
		/**
		 * Indicates if users can add new choices to a selection list.
		 */
		allowNewChoices: boolean;
		/**
		 * The id of the field that is the reference in the relationship.
		 */
		masterChoiceFieldId: number;
		/**
		 * Indicates if the field value is defaulted today for new records.
		 */
		defaultToday: boolean;
		/**
		 * The units label.
		 */
		units: string;
		/**
		 * The id of the field that is the target on the master table for this lookup.
		 */
		lookupTargetFieldId: number;
		/**
		 * The summary accumulation function type.
		 */
		summaryFunction: 'AVG' | 'SUM' | 'MAX' | 'MIN' | 'STD-DEV' | 'COUNT' | 'COMBINED-TEXT' | 'DISTINCT-COUNT';
		/**
		 * The id of the source field.
		 */
		sourceFieldId: number;
		/**
		 * The table alias for the master table in the relationship this field is part of.
		 */
		masterTableTag: string;
		/**
		 * Whether this field averages in reports within the product.
		 */
		doesAverage: boolean;
		/**
		 * The formula of the field as configured in Quickbase.
		 */
		formula: string;
		/**
		 * The number of decimal places displayed in the product for this field.
		 */
		decimalPlaces: number;
		/**
		 * Controls the default country shown on international phone widgets on forms. Country code should be entered in the ISO 3166-1 alpha-2 format.
		 */
		defaultCountryCode: string;
		/**
		 * Indicates if the user can see other versions, aside from the most recent, of a file attachment within the product.
		 */
		seeVersions: boolean;
		/**
		 * How to display months.
		 */
		displayMonth: string;
		/**
		 * The number of lines shown in Quickbase for this text field.
		 */
		numLines: number;
		/**
		 * How the email is displayed.
		 */
		displayEmail: string;
		/**
		 * The user default type.
		 */
		defaultKind: string;
		/**
		 * An alternate user friendly text that can be used to display a link in the browser.
		 */
		coverText: string;
		/**
		 * The current symbol used when displaying field values within the product.
		 */
		currencySymbol: string;
		/**
		 * The id of the table that is the master in this relationship.
		 */
		masterChoiceTableId: string;
		/**
		 * The id of the target field.
		 */
		targetFieldId: number;
		/**
		 * The configured option for how users display within the product.
		 */
		displayUser: string;
		/**
		 * Whether a blank value is treated the same as 0 in calculations within the product.
		 */
		blankIsZero: boolean;
		/**
		 * Whether an exact match is required for a report link.
		 */
		exact: boolean;
		/**
		 * The start field id.
		 */
		startField: number;
		/**
		 * Default email domain.
		 */
		defaultDomain: string;
		/**
		 * The default value configured for a field when a new record is added.
		 */
		defaultValue: string;
		/**
		 * List of user choices.
		 */
		choicesLuid: string[];
		/**
		 * Don't show the URL protocol when showing the URL.
		 */
		abbreviate: boolean;
		/**
		 * The field's xml tag.
		 */
		xmlTag: string;
		/**
		 * The field's target table name.
		 */
		targetTableName: string;
		/**
		 * The format used for displaying numeric values in the product (decimal, separators, digit group).
		 */
		numberFormat: number;
		/**
		 * The link text, if empty, the url will be used as link text.
		 */
		appearsAs: string;
		/**
		 * The field's html input width in the product.
		 */
		width: number;
		/**
		 * The currency format used when displaying field values within the product.
		 */
		currencyFormat: 'left' | 'right' | 'middle';
		/**
		 * Indicates if the field is a foreign key (or reference field) in a relationship.
		 */
		foreignKey: boolean;
		/**
		 * Indicates whether to display the day of the week within the product.
		 */
		displayDayOfWeek: boolean;
		/**
		 * The id of the field that is the reference in the relationship for this summary.
		 */
		summaryReferenceFieldId: number;
		/**
		 * The number of digits before commas display in the product, when applicable.
		 */
		commaStart: number;
		/**
		 * An array of entries that exist for a field that offers choices to the user.
		 */
		choices: string[];
		/**
		 * The id of the target table.
		 */
		targetTableId: string;
		/**
		 * Whether to display time as relative.
		 */
		displayRelative: boolean;
		/**
		 * An array of the fields that make up a composite field (e.g., address).
		 */
		compositeFields: number[];
		/**
		 * Indicates whether the checkbox values will be shown as text in reports.
		 */
		displayCheckboxAsText: boolean;
		/**
		 * Version modes for files. Keep all versions vs keep last version.
		 */
		versionMode: 'keepallversions' | 'keeplastversions';
		/**
		 * Indicates whether to display the time, in addition to the date.
		 */
		displayTime: boolean;
		/**
		 * The duration field id.
		 */
		durationField: number;
		/**
		 * The id of the field that is used to snapshot values from, when applicable.
		 */
		snapFieldId: number;
		/**
		 * Indicates whether or not to display time in the 24-hour format within the product.
		 */
		hours24: boolean;
		/**
		 * Whether to sort alphabetically, default sort is by record ID.
		 */
		sortAlpha: boolean;
		/**
		 * Indicates if the listed entries sort as entered vs alphabetically.
		 */
		sortAsGiven: boolean;
		/**
		 * Whether this field has a phone extension.
		 */
		hasExtension: boolean;
		/**
		 * The work week type.
		 */
		workWeek: number;
		/**
		 * Indicates if the URL should open a new window when a user clicks it within the product.
		 */
		useNewWindow: boolean;
		/**
		 * Whether this field is append only.
		 */
		appendOnly: boolean;
		/**
		 * Indicates if a field that is part of the relationship should be shown as a hyperlink to the parent record within the product.
		 */
		displayAsLink: boolean;
		/**
		 * Whether this field allows html.
		 */
		allowHTML: boolean;
		/**
		 * The id of the field that is the reference in the relationship for this lookup.
		 */
		lookupReferenceFieldId: number;
	};
	/**
	 * Field Permissions for different roles.
	 */
	permissions?: {
		/**
		 * The role associated with a given permission for the field
		 */
		role: string;
		/**
		 * The permission given to the role for this field
		 */
		permissionType: 'None' | 'View' | 'Modify';
		/**
		 * The Id of the given role
		 */
		roleId: number;
	}[];
};

export type QuickBaseResponseDeleteFields = {
	/**
	 * List of field ids to were deleted.
	 */
	deletedFieldIds: number[];
	/**
	 * List of errors found.
	 */
	errors: string[];
};

export type QuickBaseResponseGetField = {
	/**
	 * The id of the field, unique to this table.
	 */
	id: number;
	/**
	 * The type of field, as described [here](https://help.quickbase.com/user-assistance/field_types.html).
	 */
	fieldType?: string;
	/**
	 * For derived fields, this will be 'lookup', 'summary', or 'formula', to indicate the type of derived field.  For non-derived fields, this will be blank.
	 */
	mode?: string;
	/**
	 * The label (name) of the field.
	 */
	label?: string;
	/**
	 * Indicates if the field is configured to not wrap when displayed in the product.
	 */
	noWrap?: boolean;
	/**
	 * Indicates if the field is configured to display in bold in the product.
	 */
	bold?: boolean;
	/**
	 * Indicates if the field is marked required.
	 */
	required?: boolean;
	/**
	 * Indicates if the field is marked as a default in reports.
	 */
	appearsByDefault?: boolean;
	/**
	 * Indicates if the field is marked as searchable.
	 */
	findEnabled?: boolean;
	/**
	 * Indicates if the field is marked unique.
	 */
	unique?: boolean;
	/**
	 * Indicates if the field data will copy when a user copies the record.
	 */
	doesDataCopy?: boolean;
	/**
	 * The configured help text shown to users within the product.
	 */
	fieldHelp?: string;
	/**
	 * Indicates if the field is being tracked as part of Quickbase Audit Logs.
	 */
	audited?: boolean;
	/**
	 * Additional properties for the field. Please see [Field type details](../fieldInfo) page for more details on the properties for each field type.
	 */
	properties?: {
		/**
		 * The comments entered on the field properties by an administrator.
		 */
		comments: string;
		/**
		 * Whether this field totals in reports within the product.
		 */
		doesTotal: boolean;
		/**
		 * Whether the link field will auto save.
		 */
		autoSave: boolean;
		/**
		 * Default user id value.
		 */
		defaultValueLuid: number;
		/**
		 * Whether phone numbers should be in E.164 standard international format.
		 */
		useI18NFormat: boolean;
		/**
		 * The maximum number of versions configured for a file attachment.
		 */
		maxVersions: number;
		/**
		 * Whether the field should carry its multiple choice fields when copied.
		 */
		carryChoices: boolean;
		/**
		 * The format to display time.
		 */
		format: number;
		/**
		 * The maximum number of characters allowed for entry in Quickbase for this field.
		 */
		maxLength: number;
		/**
		 * The configured text value that replaces the URL that users see within the product.
		 */
		linkText: string;
		/**
		 * The id of the parent composite field, when applicable.
		 */
		parentFieldId: number;
		/**
		 * Indicates whether to display the timezone within the product.
		 */
		displayTimezone: boolean;
		/**
		 * The id of the field that is used to aggregate values from the child, when applicable. This displays 0 if the summary function doesn’t require a field selection (like count).
		 */
		summaryTargetFieldId: number;
		/**
		 * Indicates if users can add new choices to a selection list.
		 */
		allowNewChoices: boolean;
		/**
		 * The id of the field that is the reference in the relationship.
		 */
		masterChoiceFieldId: number;
		/**
		 * Indicates if the field value is defaulted today for new records.
		 */
		defaultToday: boolean;
		/**
		 * The units label.
		 */
		units: string;
		/**
		 * The id of the field that is the target on the master table for this lookup.
		 */
		lookupTargetFieldId: number;
		/**
		 * The summary accumulation function type.
		 */
		summaryFunction: 'AVG' | 'SUM' | 'MAX' | 'MIN' | 'STD-DEV' | 'COUNT' | 'COMBINED-TEXT' | 'DISTINCT-COUNT';
		/**
		 * The id of the source field.
		 */
		sourceFieldId: number;
		/**
		 * The table alias for the master table in the relationship this field is part of.
		 */
		masterTableTag: string;
		/**
		 * Whether this field averages in reports within the product.
		 */
		doesAverage: boolean;
		/**
		 * The formula of the field as configured in Quickbase.
		 */
		formula: string;
		/**
		 * The number of decimal places displayed in the product for this field.
		 */
		decimalPlaces: number;
		/**
		 * Controls the default country shown on international phone widgets on forms. Country code should be entered in the ISO 3166-1 alpha-2 format.
		 */
		defaultCountryCode: string;
		/**
		 * Indicates if the user can see other versions, aside from the most recent, of a file attachment within the product.
		 */
		seeVersions: boolean;
		/**
		 * How to display months.
		 */
		displayMonth: string;
		/**
		 * The number of lines shown in Quickbase for this text field.
		 */
		numLines: number;
		/**
		 * How the email is displayed.
		 */
		displayEmail: string;
		/**
		 * The user default type.
		 */
		defaultKind: string;
		/**
		 * An alternate user friendly text that can be used to display a link in the browser.
		 */
		coverText: string;
		/**
		 * The current symbol used when displaying field values within the product.
		 */
		currencySymbol: string;
		/**
		 * The id of the table that is the master in this relationship.
		 */
		masterChoiceTableId: string;
		/**
		 * The id of the target field.
		 */
		targetFieldId: number;
		/**
		 * The configured option for how users display within the product.
		 */
		displayUser: string;
		/**
		 * Whether a blank value is treated the same as 0 in calculations within the product.
		 */
		blankIsZero: boolean;
		/**
		 * Whether an exact match is required for a report link.
		 */
		exact: boolean;
		/**
		 * The start field id.
		 */
		startField: number;
		/**
		 * Default email domain.
		 */
		defaultDomain: string;
		/**
		 * The default value configured for a field when a new record is added.
		 */
		defaultValue: string;
		/**
		 * List of user choices.
		 */
		choicesLuid: string[];
		/**
		 * Don't show the URL protocol when showing the URL.
		 */
		abbreviate: boolean;
		/**
		 * The field's xml tag.
		 */
		xmlTag: string;
		/**
		 * The field's target table name.
		 */
		targetTableName: string;
		/**
		 * The format used for displaying numeric values in the product (decimal, separators, digit group).
		 */
		numberFormat: number;
		/**
		 * The link text, if empty, the url will be used as link text.
		 */
		appearsAs: string;
		/**
		 * The field's html input width in the product.
		 */
		width: number;
		/**
		 * The currency format used when displaying field values within the product.
		 */
		currencyFormat: 'left' | 'right' | 'middle';
		/**
		 * Indicates if the field is a foreign key (or reference field) in a relationship.
		 */
		foreignKey: boolean;
		/**
		 * Indicates whether to display the day of the week within the product.
		 */
		displayDayOfWeek: boolean;
		/**
		 * The id of the field that is the reference in the relationship for this summary.
		 */
		summaryReferenceFieldId: number;
		/**
		 * The number of digits before commas display in the product, when applicable.
		 */
		commaStart: number;
		/**
		 * An array of entries that exist for a field that offers choices to the user.
		 */
		choices: string[];
		/**
		 * The id of the target table.
		 */
		targetTableId: string;
		/**
		 * Whether to display time as relative.
		 */
		displayRelative: boolean;
		/**
		 * An array of the fields that make up a composite field (e.g., address).
		 */
		compositeFields: number[];
		/**
		 * Indicates whether the checkbox values will be shown as text in reports.
		 */
		displayCheckboxAsText: boolean;
		/**
		 * Version modes for files. Keep all versions vs keep last version.
		 */
		versionMode: 'keepallversions' | 'keeplastversions';
		/**
		 * Indicates whether to display the time, in addition to the date.
		 */
		displayTime: boolean;
		/**
		 * The duration field id.
		 */
		durationField: number;
		/**
		 * The id of the field that is used to snapshot values from, when applicable.
		 */
		snapFieldId: number;
		/**
		 * Indicates whether or not to display time in the 24-hour format within the product.
		 */
		hours24: boolean;
		/**
		 * Whether to sort alphabetically, default sort is by record ID.
		 */
		sortAlpha: boolean;
		/**
		 * Indicates if the listed entries sort as entered vs alphabetically.
		 */
		sortAsGiven: boolean;
		/**
		 * Whether this field has a phone extension.
		 */
		hasExtension: boolean;
		/**
		 * The work week type.
		 */
		workWeek: number;
		/**
		 * Indicates if the URL should open a new window when a user clicks it within the product.
		 */
		useNewWindow: boolean;
		/**
		 * Whether this field is append only.
		 */
		appendOnly: boolean;
		/**
		 * Indicates if a field that is part of the relationship should be shown as a hyperlink to the parent record within the product.
		 */
		displayAsLink: boolean;
		/**
		 * Whether this field allows html.
		 */
		allowHTML: boolean;
		/**
		 * The id of the field that is the reference in the relationship for this lookup.
		 */
		lookupReferenceFieldId: number;
	};
	/**
	 * Field Permissions for different roles.
	 */
	permissions?: {
		/**
		 * The role associated with a given permission for the field
		 */
		role: string;
		/**
		 * The permission given to the role for this field
		 */
		permissionType: 'None' | 'View' | 'Modify';
		/**
		 * The Id of the given role
		 */
		roleId: number;
	}[];
};

export type QuickBaseResponseUpdateField = {
	/**
	 * The id of the field, unique to this table.
	 */
	id: number;
	/**
	 * The type of field, as described [here](https://help.quickbase.com/user-assistance/field_types.html).
	 */
	fieldType?: string;
	/**
	 * For derived fields, this will be 'lookup', 'summary', or 'formula', to indicate the type of derived field.  For non-derived fields, this will be blank.
	 */
	mode?: string;
	/**
	 * The label (name) of the field.
	 */
	label?: string;
	/**
	 * Indicates if the field is configured to not wrap when displayed in the product.
	 */
	noWrap?: boolean;
	/**
	 * Indicates if the field is configured to display in bold in the product.
	 */
	bold?: boolean;
	/**
	 * Indicates if the field is marked required.
	 */
	required?: boolean;
	/**
	 * Indicates if the field is marked as a default in reports.
	 */
	appearsByDefault?: boolean;
	/**
	 * Indicates if the field is marked as searchable.
	 */
	findEnabled?: boolean;
	/**
	 * Indicates if the field is marked unique.
	 */
	unique?: boolean;
	/**
	 * Indicates if the field data will copy when a user copies the record.
	 */
	doesDataCopy?: boolean;
	/**
	 * The configured help text shown to users within the product.
	 */
	fieldHelp?: string;
	/**
	 * Indicates if the field is being tracked as part of Quickbase Audit Logs.
	 */
	audited?: boolean;
	/**
	 * Additional properties for the field. Please see [Field type details](../fieldInfo) page for more details on the properties for each field type.
	 */
	properties?: {
		/**
		 * The comments entered on the field properties by an administrator.
		 */
		comments: string;
		/**
		 * Whether this field totals in reports within the product.
		 */
		doesTotal: boolean;
		/**
		 * Whether the link field will auto save.
		 */
		autoSave: boolean;
		/**
		 * Default user id value.
		 */
		defaultValueLuid: number;
		/**
		 * Whether phone numbers should be in E.164 standard international format.
		 */
		useI18NFormat: boolean;
		/**
		 * The maximum number of versions configured for a file attachment.
		 */
		maxVersions: number;
		/**
		 * Whether the field should carry its multiple choice fields when copied.
		 */
		carryChoices: boolean;
		/**
		 * The format to display time.
		 */
		format: number;
		/**
		 * The maximum number of characters allowed for entry in Quickbase for this field.
		 */
		maxLength: number;
		/**
		 * The configured text value that replaces the URL that users see within the product.
		 */
		linkText: string;
		/**
		 * The id of the parent composite field, when applicable.
		 */
		parentFieldId: number;
		/**
		 * Indicates whether to display the timezone within the product.
		 */
		displayTimezone: boolean;
		/**
		 * The id of the field that is used to aggregate values from the child, when applicable. This displays 0 if the summary function doesn’t require a field selection (like count).
		 */
		summaryTargetFieldId: number;
		/**
		 * Indicates if users can add new choices to a selection list.
		 */
		allowNewChoices: boolean;
		/**
		 * The id of the field that is the reference in the relationship.
		 */
		masterChoiceFieldId: number;
		/**
		 * Indicates if the field value is defaulted today for new records.
		 */
		defaultToday: boolean;
		/**
		 * The units label.
		 */
		units: string;
		/**
		 * The id of the field that is the target on the master table for this lookup.
		 */
		lookupTargetFieldId: number;
		/**
		 * The summary accumulation function type.
		 */
		summaryFunction: 'AVG' | 'SUM' | 'MAX' | 'MIN' | 'STD-DEV' | 'COUNT' | 'COMBINED-TEXT' | 'DISTINCT-COUNT';
		/**
		 * The id of the source field.
		 */
		sourceFieldId: number;
		/**
		 * The table alias for the master table in the relationship this field is part of.
		 */
		masterTableTag: string;
		/**
		 * Whether this field averages in reports within the product.
		 */
		doesAverage: boolean;
		/**
		 * The formula of the field as configured in Quickbase.
		 */
		formula: string;
		/**
		 * The number of decimal places displayed in the product for this field.
		 */
		decimalPlaces: number;
		/**
		 * Controls the default country shown on international phone widgets on forms. Country code should be entered in the ISO 3166-1 alpha-2 format.
		 */
		defaultCountryCode: string;
		/**
		 * Indicates if the user can see other versions, aside from the most recent, of a file attachment within the product.
		 */
		seeVersions: boolean;
		/**
		 * How to display months.
		 */
		displayMonth: string;
		/**
		 * The number of lines shown in Quickbase for this text field.
		 */
		numLines: number;
		/**
		 * How the email is displayed.
		 */
		displayEmail: string;
		/**
		 * The user default type.
		 */
		defaultKind: string;
		/**
		 * An alternate user friendly text that can be used to display a link in the browser.
		 */
		coverText: string;
		/**
		 * The current symbol used when displaying field values within the product.
		 */
		currencySymbol: string;
		/**
		 * The id of the table that is the master in this relationship.
		 */
		masterChoiceTableId: string;
		/**
		 * The id of the target field.
		 */
		targetFieldId: number;
		/**
		 * The configured option for how users display within the product.
		 */
		displayUser: string;
		/**
		 * Whether a blank value is treated the same as 0 in calculations within the product.
		 */
		blankIsZero: boolean;
		/**
		 * Whether an exact match is required for a report link.
		 */
		exact: boolean;
		/**
		 * The start field id.
		 */
		startField: number;
		/**
		 * Default email domain.
		 */
		defaultDomain: string;
		/**
		 * The default value configured for a field when a new record is added.
		 */
		defaultValue: string;
		/**
		 * List of user choices.
		 */
		choicesLuid: string[];
		/**
		 * Don't show the URL protocol when showing the URL.
		 */
		abbreviate: boolean;
		/**
		 * The field's xml tag.
		 */
		xmlTag: string;
		/**
		 * The field's target table name.
		 */
		targetTableName: string;
		/**
		 * The format used for displaying numeric values in the product (decimal, separators, digit group).
		 */
		numberFormat: number;
		/**
		 * The link text, if empty, the url will be used as link text.
		 */
		appearsAs: string;
		/**
		 * The field's html input width in the product.
		 */
		width: number;
		/**
		 * The currency format used when displaying field values within the product.
		 */
		currencyFormat: 'left' | 'right' | 'middle';
		/**
		 * Indicates if the field is a foreign key (or reference field) in a relationship.
		 */
		foreignKey: boolean;
		/**
		 * Indicates whether to display the day of the week within the product.
		 */
		displayDayOfWeek: boolean;
		/**
		 * The id of the field that is the reference in the relationship for this summary.
		 */
		summaryReferenceFieldId: number;
		/**
		 * The number of digits before commas display in the product, when applicable.
		 */
		commaStart: number;
		/**
		 * An array of entries that exist for a field that offers choices to the user.
		 */
		choices: string[];
		/**
		 * The id of the target table.
		 */
		targetTableId: string;
		/**
		 * Whether to display time as relative.
		 */
		displayRelative: boolean;
		/**
		 * An array of the fields that make up a composite field (e.g., address).
		 */
		compositeFields: number[];
		/**
		 * Indicates whether the checkbox values will be shown as text in reports.
		 */
		displayCheckboxAsText: boolean;
		/**
		 * Version modes for files. Keep all versions vs keep last version.
		 */
		versionMode: 'keepallversions' | 'keeplastversions';
		/**
		 * Indicates whether to display the time, in addition to the date.
		 */
		displayTime: boolean;
		/**
		 * The duration field id.
		 */
		durationField: number;
		/**
		 * The id of the field that is used to snapshot values from, when applicable.
		 */
		snapFieldId: number;
		/**
		 * Indicates whether or not to display time in the 24-hour format within the product.
		 */
		hours24: boolean;
		/**
		 * Whether to sort alphabetically, default sort is by record ID.
		 */
		sortAlpha: boolean;
		/**
		 * Indicates if the listed entries sort as entered vs alphabetically.
		 */
		sortAsGiven: boolean;
		/**
		 * Whether this field has a phone extension.
		 */
		hasExtension: boolean;
		/**
		 * The work week type.
		 */
		workWeek: number;
		/**
		 * Indicates if the URL should open a new window when a user clicks it within the product.
		 */
		useNewWindow: boolean;
		/**
		 * Whether this field is append only.
		 */
		appendOnly: boolean;
		/**
		 * Indicates if a field that is part of the relationship should be shown as a hyperlink to the parent record within the product.
		 */
		displayAsLink: boolean;
		/**
		 * Whether this field allows html.
		 */
		allowHTML: boolean;
		/**
		 * The id of the field that is the reference in the relationship for this lookup.
		 */
		lookupReferenceFieldId: number;
	};
	/**
	 * Field Permissions for different roles.
	 */
	permissions?: {
		/**
		 * The role associated with a given permission for the field
		 */
		role: string;
		/**
		 * The permission given to the role for this field
		 */
		permissionType: 'None' | 'View' | 'Modify';
		/**
		 * The Id of the given role
		 */
		roleId: number;
	}[];
};

export type QuickBaseResponseGetFieldsUsage = {
	/**
	 * Basic information about the field.
	 */
	field: {
		/**
		 * Field name.
		 */
		name: string;
		/**
		 * Field id.
		 */
		id: number;
		/**
		 * Field type.
		 */
		type: 'text' | 'text-multiple-choice' | 'text-multi-line' | 'rich-text' | 'numeric' | 'currency' | 'rating' | 'percent' | 'multitext' | 'email' | 'url' | 'duration' | 'date' | 'datetime' | 'timestamp' | 'timeofday' | 'checkbox' | 'user' | 'multiuser' | 'address' | 'phone' | 'file';
	};
	/**
	 * Usage Information about the field.
	 */
	usage: {
		/**
		 * The number of default reports where the given field is referenced.
		 */
		defaultReports: {
			/**
			 * the number of times a field has been used for the given item.
			 */
			count: number;
		};
		/**
		 * The number of notifications where the given field is referenced.
		 */
		notifications: {
			/**
			 * the number of times a field has been used for the given item.
			 */
			count: number;
		};
		/**
		 * The number of reminders where the given field is referenced.
		 */
		reminders: {
			/**
			 * the number of times a field has been used for the given item.
			 */
			count: number;
		};
		/**
		 * The number of forms where the given field is referenced.
		 */
		forms: {
			/**
			 * the number of times a field has been used for the given item.
			 */
			count: number;
		};
		/**
		 * The number of quickbase actions where the given field is referenced.
		 */
		actions: {
			/**
			 * the number of times a field has been used for the given item.
			 */
			count: number;
		};
		/**
		 * The number of personal reports where the given field is referenced.
		 */
		personalReports: {
			/**
			 * the number of times a field has been used for the given item.
			 */
			count: number;
		};
		/**
		 * The number of roles where the given field is referenced.
		 */
		roles: {
			/**
			 * the number of times a field has been used for the given item.
			 */
			count: number;
		};
		/**
		 * The number of reports where the given field is referenced.
		 */
		reports: {
			/**
			 * the number of times a field has been used for the given item.
			 */
			count: number;
		};
		/**
		 * The number of fields where the given field is referenced.
		 */
		fields: {
			/**
			 * the number of times a field has been used for the given item.
			 */
			count: number;
		};
		/**
		 * The number of relationships where the given field is referenced.
		 */
		relationships: {
			/**
			 * the number of times a field has been used for the given item.
			 */
			count: number;
		};
		/**
		 * The number of webhooks where the given field is referenced.
		 */
		webhooks: {
			/**
			 * the number of times a field has been used for the given item.
			 */
			count: number;
		};
		/**
		 * The number of app home pages where the given field is referenced.
		 */
		appHomePages: {
			/**
			 * the number of times a field has been used for the given item.
			 */
			count: number;
		};
		/**
		 * The number of exact forms where the given field is referenced.
		 */
		exactForms: {
			/**
			 * the number of times a field has been used for the given item.
			 */
			count: number;
		};
	};
}[];

export type QuickBaseResponseGetFieldUsage = {
	/**
	 * Basic information about the field.
	 */
	field: {
		/**
		 * Field name.
		 */
		name: string;
		/**
		 * Field id.
		 */
		id: number;
		/**
		 * Field type.
		 */
		type: 'text' | 'text-multiple-choice' | 'text-multi-line' | 'rich-text' | 'numeric' | 'currency' | 'rating' | 'percent' | 'multitext' | 'email' | 'url' | 'duration' | 'date' | 'datetime' | 'timestamp' | 'timeofday' | 'checkbox' | 'user' | 'multiuser' | 'address' | 'phone' | 'file';
	};
	/**
	 * Usage Information about the field.
	 */
	usage: {
		/**
		 * The number of default reports where the given field is referenced.
		 */
		defaultReports: {
			/**
			 * the number of times a field has been used for the given item.
			 */
			count: number;
		};
		/**
		 * The number of notifications where the given field is referenced.
		 */
		notifications: {
			/**
			 * the number of times a field has been used for the given item.
			 */
			count: number;
		};
		/**
		 * The number of reminders where the given field is referenced.
		 */
		reminders: {
			/**
			 * the number of times a field has been used for the given item.
			 */
			count: number;
		};
		/**
		 * The number of forms where the given field is referenced.
		 */
		forms: {
			/**
			 * the number of times a field has been used for the given item.
			 */
			count: number;
		};
		/**
		 * The number of quickbase actions where the given field is referenced.
		 */
		actions: {
			/**
			 * the number of times a field has been used for the given item.
			 */
			count: number;
		};
		/**
		 * The number of personal reports where the given field is referenced.
		 */
		personalReports: {
			/**
			 * the number of times a field has been used for the given item.
			 */
			count: number;
		};
		/**
		 * The number of roles where the given field is referenced.
		 */
		roles: {
			/**
			 * the number of times a field has been used for the given item.
			 */
			count: number;
		};
		/**
		 * The number of reports where the given field is referenced.
		 */
		reports: {
			/**
			 * the number of times a field has been used for the given item.
			 */
			count: number;
		};
		/**
		 * The number of fields where the given field is referenced.
		 */
		fields: {
			/**
			 * the number of times a field has been used for the given item.
			 */
			count: number;
		};
		/**
		 * The number of relationships where the given field is referenced.
		 */
		relationships: {
			/**
			 * the number of times a field has been used for the given item.
			 */
			count: number;
		};
		/**
		 * The number of webhooks where the given field is referenced.
		 */
		webhooks: {
			/**
			 * the number of times a field has been used for the given item.
			 */
			count: number;
		};
		/**
		 * The number of app home pages where the given field is referenced.
		 */
		appHomePages: {
			/**
			 * the number of times a field has been used for the given item.
			 */
			count: number;
		};
		/**
		 * The number of exact forms where the given field is referenced.
		 */
		exactForms: {
			/**
			 * the number of times a field has been used for the given item.
			 */
			count: number;
		};
	};
}[];

export type QuickBaseResponseRunFormula = {
	/**
	 * The formula execution result.
	 */
	result: string;
};

export type QuickBaseResponseUpsert = {
	/**
	 * Information about created records, updated records, referenced but unchanged records, and records having any errors while being processed.
	 */
	metadata: {
		/**
		 * Array containing the created record ids.
		 */
		createdRecordIds: number[];
		/**
		 * This will only be returned in the case of failed records. It is a collection of errors that occurred when processing the incoming data that resulted in records not being processed. Each object has a key representing the sequence number of the record in the original payload (starting from 1). The value is a list of errors occurred.
		 */
		lineErrors: Record<string, string[]>;
		/**
		 * Array containing the unchanged record ids.
		 */
		unchangedRecordIds: number[];
		/**
		 * Array containing the updated record ids.
		 */
		updatedRecordIds: number[];
		/**
		 * Number of records processed. Includes successful and failed record updates.
		 */
		totalNumberOfRecordsProcessed: number;
	};
	/**
	 * The data that is expected to be returned.
	 */
	data: Record<string, { value: any }>[];
};

export type QuickBaseResponseDeleteRecords = {
	/**
	 * The number of records deleted.
	 */
	numberDeleted: number;
};

export type QuickBaseResponseRunQuery = {
	/**
	 * An array of objects that contains limited meta-data of each field displayed in the report. This assists in building logic that depends on field types and IDs.
	 */
	fields: {
		/**
		 * Field id.
		 */
		id: number;
		/**
		 * Field label.
		 */
		label: string;
		/**
		 * Field type.
		 */
		type: 'text' | 'text-multiple-choice' | 'text-multi-line' | 'rich-text' | 'numeric' | 'currency' | 'rating' | 'percent' | 'multitext' | 'email' | 'url' | 'duration' | 'date' | 'datetime' | 'timestamp' | 'timeofday' | 'checkbox' | 'user' | 'multiuser' | 'address' | 'phone' | 'file';
	}[];
	/**
	 * An array of objects that either represents the record data or summarized values, depending on the report type.
	 */
	data: Record<string, { value: any }>[];
	/**
	 * Additional information about the results that may be helpful. Pagination may be needed if either you specify a smaller number of results to skip than is available, or if the API automatically returns fewer results. numRecords can be compared to totalRecords to determine if further pagination is needed.
	 */
	metadata: {
		/**
		 * The number of records to skip
		 */
		skip?: number;
		/**
		 * The number of fields in each record in the current response object
		 */
		numFields: number;
		/**
		 * If present, the maximum number of records requested by the caller
		 */
		top?: number;
		/**
		 * The total number of records in the result set
		 */
		totalRecords: number;
		/**
		 * The number of records in the current response object
		 */
		numRecords: number;
	};
};

export type QuickBaseResponseGetTempTokenDBID = {
	/**
	 * Temporary authorization token.
	 */
	temporaryAuthorization: string;
};

export type QuickBaseResponseCloneUserToken = {
	/**
	 * Whether the user token is active.
	 */
	active: boolean;
	/**
	 * The list of apps this user token is assigned to.
	 */
	apps: {
		/**
		 * The unique identifier for this application.
		 */
		id: string;
		/**
		 * The application's name.
		 */
		name: string;
	}[];
	/**
	 * The last date this user token was used, in the ISO 8601 time format YYYY-MM-DDThh:mm:ss.sssZ (in UTC time zone).
	 */
	lastUsed: string;
	/**
	 * User Token description.
	 */
	description: string;
	/**
	 * User Token id.
	 */
	id: number;
	/**
	 * User Token name.
	 */
	name: string;
	/**
	 * User Token value.
	 */
	token: string;
};

export type QuickBaseResponseDeactivateUserToken = {
	/**
	 * The user token id.
	 */
	id: number;
};

export type QuickBaseResponseDeleteUserToken = {
	/**
	 * The user token id.
	 */
	id: number;
};

export type QuickBaseResponseDownloadFile = string;

export type QuickBaseResponseDeleteFile = {
	/**
	 * The number of deleted version.
	 */
	versionNumber: number;
	/**
	 * The name of file associated with deleted version.
	 */
	fileName: string;
	/**
	 * The timestamp when the version was originally uploaded.
	 */
	uploaded: string;
	/**
	 * The user that uploaded version.
	 */
	creator: {
		/**
		 * User full name.
		 */
		name: string;
		/**
		 * User Id.
		 */
		id: string;
		/**
		 * User email.
		 */
		email: string;
		/**
		 * User Name as updated in user properties. Optional, appears if not the same as user email.
		 */
		userName: string;
	};
};

export type QuickBaseResponseGetUsers = {
	/**
	 * A list of users found in an account with the given criterias
	 */
	users: {
		userName: string;
		firstName: string;
		lastName: string;
		emailAddress: string;
		hashId: string;
	}[];
	/**
	 * Additional request information
	 */
	metadata: {
		nextPageToken: string;
	};
};

export type QuickBaseResponseDenyUsers = {
	/**
	 * A list of users that couldn't be denied. This also includes the ID's of users that are not valid.
	 */
	failure: string[];
	/**
	 * A list of users that have successfully been denied.
	 */
	success: string[];
};

export type QuickBaseResponseDenyUsersAndGroups = {
	/**
	 * A list of users that couldn't be denied. This also includes the ID's of users that are not valid.
	 */
	failure: string[];
	/**
	 * A list of users that have successfully been denied.
	 */
	success: string[];
};

export type QuickBaseResponseUndenyUsers = {
	/**
	 * A list of users that couldn't be undenied. This also includes the ID's of users that are not valid.
	 */
	failure: string[];
	/**
	 * A list of users that have successfully been undenied.
	 */
	success: string[];
};

export type QuickBaseResponseAddMembersToGroup = {
	/**
	 * A list of users that couldn’t be added to the group. This includes a list of IDs that represent invalid users and users who have already been added to the group.
	 */
	failure: string[];
	/**
	 * A list of users that have been added to the group successfully.
	 */
	success: string[];
};

export type QuickBaseResponseRemoveMembersFromGroup = {
	/**
	 * A list of users that couldn’t be removed from the group. This includes a list of IDs that represent invalid users.
	 */
	failure: string[];
	/**
	 * A list of users that have been removed from the group successfully.
	 */
	success: string[];
};

export type QuickBaseResponseAddManagersToGroup = {
	/**
	 * A list of users that couldn’t be added to the group. This includes a list of IDs that represent invalid users and users who have already been added to the group.
	 */
	failure: string[];
	/**
	 * A list of users that have been added to the group successfully.
	 */
	success: string[];
};

export type QuickBaseResponseRemoveManagersFromGroup = {
	/**
	 * A list of users that couldn’t be removed from the group. This includes a list of IDs that represent invalid users.
	 */
	failure: string[];
	/**
	 * A list of users that have been removed from the group successfully.
	 */
	success: string[];
};

export type QuickBaseResponseAddSubgroupsToGroup = {
	/**
	 * A list of child groups that couldn’t be added to the group. This includes a list of IDs that represent invalid groups and groups that have already been added to the group.
	 */
	failure: string[];
	/**
	 * A list of child groups that have been added to the group successfully.
	 */
	success: string[];
};

export type QuickBaseResponseRemoveSubgroupsFromGroup = {
	/**
	 * A list of child groups that couldn’t be removed from the group. This includes a list of IDs that represent invalid groups.
	 */
	failure: string[];
	/**
	 * A list of child groups that have been removed from the group successfully.
	 */
	success: string[];
};

export type QuickBaseResponseAudit = {
	/**
	 * Query id of the requested audit log.
	 */
	queryId: string;
	/**
	 * All events of the audit log.
	 */
	events?: {
		/**
		 * Log ID.
		 */
		id: string;
		/**
		 * User's first name.
		 */
		firstname: string;
		/**
		 * User's last name.
		 */
		lastname: string;
		/**
		 * User's email address.
		 */
		email: string;
		/**
		 * What action was taken, such as log in, create app, report access, or table search.
		 */
		topic: string;
		/**
		 * Exact time the action was taken, including date, and time with hour, minutes and seconds. Time zone is the browser time zone.
		 */
		time: string;
		/**
		 * The IP address the action was taken from.
		 */
		ipaddress: string;
		/**
		 * The browser and OS the action was taken from.
		 */
		useragent: string;
		/**
		 * UI for user interface or API for an API call.
		 */
		application: string;
		/**
		 * A brief description of the action that you can click to see additional details.
		 */
		description: string;
		/**
		 * The data changes that have occured to a field that has been marked as audited.
		 */
		payloadChanges?: {
			/**
			 * An object describing the changes that occured on record changes.
			 */
			changes: {
				/**
				 * The current value of the fields that have been changed.
				 */
				current: any;
				/**
				 * The previous value of the fields that have been changed.
				 */
				previous: any;
				/**
				 * The list of fields and their types that have been changed.
				 */
				fields: any;
			};
			/**
			 * The recordId that has been edited.
			 */
			rid: number;
			/**
			 * The change type that occured for a record. Could be one of add, edit, delete.
			 */
			changeType: string;
			/**
			 * A placeholder for type changes.
			 */
			type: string;
		};
	}[];
	/**
	 * Token to fetch the next 1000 logs.
	 */
	nextToken?: string;
};

export type QuickBaseResponsePlatformAnalyticReads = {
	/**
	 * The date of the requested summary.
	 */
	date: string;
	/**
	 * Total reads for the specified date.
	 */
	reads: {
		/**
		 * Total user reads for the realm on the specified date.
		 */
		user: number;
		/**
		 * Total integration reads for the realm on the specified date.
		 */
		integrations: {
			/**
			 * Total reads by anonymous users for the realm on the specified date.
			 */
			eoti: number;
			/**
			 * Total API reads for the realm on the specified date.
			 */
			api: number;
			/**
			 * Total pipeline reads for the realm on the specified date.
			 */
			pipelines: number;
		};
	};
};

/* Export to Browser */
if(IS_BROWSER){
	window.QuickBase = QuickBase;
}
