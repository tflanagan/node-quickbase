'use strict';

/* Dependencies */
import merge from 'deepmerge';
import { debug } from 'debug';
import { Throttle } from 'generic-throttle';
import axios, {
	AxiosRequestConfig
} from 'axios';

/* Debug */
const debugMain = debug('quickbase:main');
const debugRequest = debug('quickbase:request');
const debugResponse = debug('quickbase:response');

/* Globals */
const VERSION = require('../package.json').version;
const IS_BROWSER = typeof(window) !== 'undefined';

/* Main Class */
export class QuickBase {

	/**
	 * The class name
	 *
	 * Loading multiple instances of this class results in failed `instanceof` checks.
	 * `Function.name` is corrupted by the browserify/minify processes.
	 * Allow code to check if an object is this class by look at this `CLASS_NAME`
	 * property. Code can further check `VERSION` to ensure correct versioning
	 */
	public readonly CLASS_NAME: string = 'QuickBase';
	static readonly CLASS_NAME: string = 'QuickBase';

	/**
	 * The loaded library version
	 */
	static readonly VERSION: string = VERSION;

	/**
	 * The default settings of a `QuickBase` instance
	 */
	static defaults: QuickBaseOptions = {
		server: 'api.quickbase.com',
		version: 'v1',

		realm: IS_BROWSER ? window.location.host.split('.')[0] : '',
		userToken: '',
		tempToken: '',
		appToken: '',

		userAgent: '',

		autoConsumeTempTokens: true,
		autoRenewTempTokens: true,

		connectionLimit: 10,
		connectionLimitPeriod: 1000,
		errorOnConnectionLimit: false,

		proxy: false
	};

	/**
	 * The internal numerical id for API calls.
	 *
	 * Increments by 1 with each request.
	 */
	private _id: number = 0;

	/**
	 * The internal DBID assigned to the temp token
	 */
	private _tempTokenTable: false | string = false;

	/**
	 * The internal throttler for rate-limiting API calls
	 */
	private throttle: Throttle;

	/**
	 * The `QuickBase` instance settings
	 */
	public settings: QuickBaseOptions;

	/**
	 * Example:
	 * ```typescript
	 * const qb = new QuickBase({
	 * 	realm: 'www',
	 * 	userToken: 'xxxxxx_xxx_xxxxxxxxxxxxxxxxxxxxxxxxxx'
	 * });
	 * ```
	 */
	constructor(options?: QuickBaseOptions){
		this.settings = merge(QuickBase.defaults, options || {});

		this.throttle = new Throttle(this.settings.connectionLimit, this.settings.connectionLimitPeriod, this.settings.errorOnConnectionLimit);

		debugMain('New Instance', this.settings);

		return this;
	}

	/**
	 * Assigns debugging information from a Quick Base response to the passed in `debugObj` object
	 *
	 * @param debugObj Object containing Quick Base response debugging information
	 * @param headers axios response headers (lowercase keys, values as strings)
	 */
	private assignDebugHeaders(debugObj: Partial<QuickBaseResponseDebug>, headers: QuickBaseResponseDebug): void {
		const data = objKeysToLower(headers);

		debugObj.date = data['date'];
		debugObj['qb-api-ray'] = data['qb-api-ray'];
		debugObj['x-ratelimit-remaining'] = +data['x-ratelimit-remaining'];
		debugObj['x-ratelimit-limit'] = +data['x-ratelimit-limit'];
		debugObj['x-ratelimit-reset'] = +data['x-ratelimit-reset'];
	}

	/**
	 * Returns a simple axios request configuration block
	 *
	 * @returns Simple GET configuration with required authorization
	 */
	private getBasicRequest(): AxiosRequestConfig {
		const headers = {
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

	/**
	 * Executes Quick Base API call
	 *
	 * @param actOptions axios request configuration specific for API call
	 * @param reqOptions axios request configuration passed in from user
	 * @param passThrough resolve pure axios response object
	 *
	 * @returns Direct results from API request
	 */
	private async request<T>(actOptions: AxiosRequestConfig, reqOptions?: AxiosRequestConfig, passThrough: boolean = false): Promise<T> {
		return this.throttle.acquire(async () => {
			const id = 0 + (++this._id);
			const options = merge.all([
				this.getBasicRequest(),
				actOptions,
				reqOptions || {}
			]);
			const debugData: Partial<QuickBaseResponseDebug> = {};

			debugRequest(id, options);

			try {
				const results = await axios.request(options);

				if(results && results.headers){
					this.assignDebugHeaders(debugData, results.headers);
				}

				debugResponse(id, debugData, results.data);

				return passThrough ? results : results.data;
			}catch(err){
				if(err.response && err.response.headers){
					this.assignDebugHeaders(debugData, err.response.headers);
				}

				if(!err.isAxiosError || !err.response){
					debugResponse(id, debugData, err);

					throw err;
				}

				// Error reporting seems a bit inconsistent
				const data: {
					message: string;
					description: string;
					errors?: string[];
					error?: string;
					details?: string[];
				} = merge({
					message: 'Quick Base Error',
					description: 'There was an unexpected error, please check your request and try again'
				}, err.response.data || {});

				let description = data.errors && data.errors.join(' ') || data.error || data.description;

				if(data.details){
					description += ':\n' + data.details.join('\n');
				}

				const nErr = new QuickBaseError(err.response.status, data.message, description, debugData['qb-api-ray']);

				if(!this.settings.autoRenewTempTokens || this._tempTokenTable === false || !nErr.description || !nErr.description.match(/Your ticket has expired/)){
					debugResponse(id, nErr, debugData, data);

					throw nErr;
				}

				debugResponse(id, 'Expired token detected, renewing and trying again...', debugData, data);

				let results = await this.getTempToken({
					dbid: this._tempTokenTable
				});

				if(!this.settings.autoConsumeTempTokens){
					this.setTempToken(results.temporaryAuthorization, this._tempTokenTable);
				}

				return this.request(actOptions, reqOptions, passThrough);
			}
		});
	}

	/**
	 * Create a Quick Base Application
	 * 
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/createApp)
	 * 
	 * Example:
	 * ```typescript
	 * await qb.deleteApp({
	 * 	name: 'Application Name',
	 * 	description: 'A test application',
	 * 	assignToken: true,
	 * 	variables: [{
	 * 		name: 'Some Variable',
	 * 		value: 'Some Value'
	 * 	}]
	 * });
	 * ```
	 * 
	 * @param param0.name Application name
	 * @param param0.description Application description
	 * @param param0.assignToken Assign new application to current user token
	 * @param param0.variables Array of Quick Base Variables
	 * @param param0.requestOptions Override axios request configuration
	 */
	async createApp({ name, description = '', assignToken = false, variables, requestOptions }: QuickBaseRequestCreateApp): Promise<QuickBaseResponseApp> {
		const data: DataObj<QuickBaseRequestCreateApp> = {
			name: name,
			description: description,
			assignToken: assignToken
		};

		if(typeof(variables) !== 'undefined'){
			data.variables = variables;
		}

		return this.request({
			method: 'POST',
			url: 'apps',
			data: data
		}, requestOptions);
	}

	/**
	 * Create a Quick Base Field
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/createField)
	 *
	 * @param param0.tableId Quick Base Table ID
	 * @param param0.label Label of new field
	 * @param param0.fieldType Type of new field ([Quick Base Documentation](https://help.quickbase.com/user-assistance/field_types.html))
	 * @param param0.noWrap Wrap value of field in the Quick Base UI
	 * @param param0.bold Display value of field as bold in the Quick Base UI
	 * @param param0.appearsByDefault Set field as default in reports
	 * @param param0.findEnabled Allows field to be searchable
	 * @param param0.fieldHelp Field help text
	 * @param param0.audited Allow field to be tracked by Quick Base Audit Logs
	 * @param param0.properties Field properties specific to `fieldType`
	 * @param param0.permissions Field permissions for Quick Base roles
	 * @param param0.requestOptions Override axios request configuration
	 */
	async createField({
		tableId,
		label,
		fieldType,
		noWrap,
		bold,
		appearsByDefault,
		addToForms,
		findEnabled,
		fieldHelp,
		audited,
		properties,
		permissions,
		requestOptions
	}: QuickBaseRequestCreateField): Promise<QuickBaseResponseCreateField> {
		const data: DataObj<QuickBaseRequestCreateField> = {};

		if(typeof(label) !== 'undefined'){
			data.label = label;
		}

		if(typeof(fieldType) !== 'undefined'){
			data.fieldType = fieldType;
		}

		if(typeof(noWrap) !== 'undefined'){
			data.noWrap = noWrap;
		}

		if(typeof(bold) !== 'undefined'){
			data.bold = bold;
		}

		if(typeof(appearsByDefault) !== 'undefined'){
			data.appearsByDefault = appearsByDefault;
		}

		if(typeof(addToForms) !== 'undefined'){
			data.addToForms = addToForms;
		}

		if(typeof(findEnabled) !== 'undefined'){
			data.findEnabled = findEnabled;
		}

		if(typeof(fieldHelp) !== 'undefined'){
			data.fieldHelp = fieldHelp;
		}

		if(typeof(audited) !== 'undefined'){
			data.audited = audited;
		}

		if(typeof(properties) !== 'undefined'){
			data.properties = properties;
		}

		if(typeof(permissions) !== 'undefined'){
			data.permissions = permissions;
		}

		return this.request({
			method: 'POST',
			url: `fields?tableId=${tableId}`,
			data: data
		}, requestOptions);
	}

	/**
	 * Create a Quick Base Relationship
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/createRelationship)
	 *
	 * @param param0.parentTableId Quick Base Table ID of the Parent Table
	 * @param param0.childTableId Quick Base Table ID of the Child Table
	 * @param param0.foreignKeyField An Object with a label property to describe the new reference field
	 * @param param0.lookupFieldIds Array of Field IDs to bring from the Parent Table into the Child Table
	 * @param param0.summaryFields Array of Summary Fields to create in the Parent Table
	 * @param param0.requestOptions Override axios request configuration
	 */
	async createRelationship({ parentTableId, childTableId, foreignKeyField, lookupFieldIds, summaryFields, requestOptions }: QuickBaseRequestCreateRelationship): Promise<QuickBaseRelationship> {
		const data: DataObj<QuickBaseRequestCreateRelationship> = {
			parentTableId: parentTableId
		};

		if(typeof(foreignKeyField) !== undefined){
			data.foreignKeyField = foreignKeyField;
		}

		if(typeof(lookupFieldIds) !== undefined){
			data.lookupFieldIds = lookupFieldIds;
		}

		if(typeof(summaryFields) !== undefined){
			data.summaryFields = summaryFields;
		}

		return this.request({
			method: 'POST',
			url: `tables/${childTableId}/relationship`,
			data: data
		}, requestOptions);
	}

	/**
	 * Create a Quick Base Table
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/createTable)
	 *
	 * @param param0.appId Quick Base Application ID
	 * @param param0.name Name of the new table
	 * @param param0.description Description of the new table
	 * @param param0.iconName Icon for the new table
	 * @param param0.singularNoun Singular noun for a record in the new table
	 * @param param0.pluralNoun Plural noun for records in the new table
	 * @param param0.requestOptions Override axios request configuration
	 */
	async createTable({ appId, name, description, iconName, singularNoun, pluralNoun, requestOptions }: QuickBaseRequestCreateTable): Promise<QuickBaseResponseCreateTable> {
		const data: DataObj<QuickBaseRequestCreateTable> = {
			name: name
		};

		if(typeof(description) !== 'undefined'){
			data.description = description;
		}

		if(typeof(iconName) !== 'undefined'){
			data.iconName = iconName;
		}

		if(typeof(singularNoun) !== 'undefined'){
			data.singularNoun = singularNoun;
		}

		if(typeof(pluralNoun) !== 'undefined'){
			data.pluralNoun = pluralNoun;
		}

		return this.request({
			method: 'POST',
			url: `tables?appId=${appId}`,
			data: data
		}, requestOptions);
	}

	/**
	 * Delete an Application from Quick Base
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/deleteApp)
	 *
	 * Example:
	 * ```typescript
	 * await qb.deleteApp({
	 * 	appId: 'xxxxxxxxx',
	 * 	name: 'Application Name'
	 * });
	 * ```
	 *
	 * @param param0.appId Quick Base Application ID
	 * @param param0.name Quick Base Application Name
	 * @param param0.requestOptions Override axios request configuration
	 */
	async deleteApp({ appId, name, requestOptions }: QuickBaseRequestDeleteApp): Promise<QuickBaseResponseDeleteApp> {
		return this.request({
			method: 'DELETE',
			url: `apps/${appId}`,
			data: {
				name: name
			}
		}, requestOptions);
	}

	/**
	 * Delete fields from a Quick Base Table
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/deleteFields)
	 *
	 * Example:
	 * ```typescript
	 * await qb.deleteFields({
	 * 	tableId: 'xxxxxxxxx',
	 * 	fieldIds: [ 6 ]
	 * });
	 * ```
	 *
	 * @param param0.tableId Quick Base Table Table ID
	 * @param param0.fieldIds An array of Quick Base Field IDs
	 * @param param0.requestOptions Override axios request configuration
	 */
	async deleteFields({ tableId, fieldIds, requestOptions }: QuickBaseRequestDeleteFields): Promise<QuickBaseResponseDeleteFields> {
		const results = await this.request<{
			headers: QuickBaseResponseDebug
			data: QuickBaseResponseDeleteFields
		}>({
			method: 'DELETE',
			url: `fields?tableId=${tableId}`,
			data: {
				fieldIds: fieldIds
			}
		}, requestOptions, true);

		const response = results.data;

		if(response.deletedFieldIds.length === 0 && response.errors && response.errors.length > 0){
			throw new QuickBaseError(500, 'Error executing deleteFields', response.errors.join(' '), results.headers['qb-api-ray']);
		}

		return response;
	}

	/**
	 * Delete a file stored in a Quick Base file attachment field
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/deleteFile)
	 *
	 * @param param0.tableId Quick Base Table ID
	 * @param param0.recordId Quick Base Record ID
	 * @param param0.fieldId Quick Base Field ID
	 * @param param0.versionNumber File attachment version number
	 * @param param0.requestOptions Override axios request configuration
	 */
	async deleteFile({ tableId, recordId, fieldId, versionNumber, requestOptions }: QuickBaseRequestDeleteFile): Promise<QuickBaseResponseDeleteFile> {
		return this.request({
			method: 'DELETE',
			url: `files/${tableId}/${recordId}/${fieldId}/${versionNumber}`
		}, requestOptions);
	}

	/**
	 * Delete records from a Quick Base Table
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/deleteRecords)
	 *
	 * Example:
	 * ```typescript
	 * await qb.deleteRecords({
	 * 	tableId: 'xxxxxxxxx',
	 * 	where: "{'3'.GT.'0'}"
	 * });
	 * ```
	 *
	 * @param param0.tableId Quick Base Table ID
	 * @param param0.where Quick Base Where Clause
	 * @param param0.requestOptions Override axios request configuration
	 */
	async deleteRecords({ tableId, where, requestOptions }: QuickBaseRequestDeleteRecords): Promise<QuickBaseResponseDeleteRecords> {
		return this.request({
			method: 'DELETE',
			url: 'records',
			data: {
				from: tableId,
				where: where
			}
		}, requestOptions);
	}

	/**
	 * Delete a Quick Base Relationship
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/deleteRelationship)
	 *
	 * @param param0.childTableId Quick Base Table ID of the Child Table
	 * @param param0.relationshipId Quick Base Table Relationship ID
	 * @param param0.requestOptions Override axios request configuration
	 */
	async deleteRelationship({ childTableId, relationshipId, requestOptions }: QuickBaseRequestDeleteRelationship): Promise<QuickBaseResponseDeleteRelationship> {
		return this.request({
			method: 'DELETE',
			url: `tables/${childTableId}/relationship/${relationshipId}`
		}, requestOptions);
	}

	/**
	 * Delete a Table from a Quick Base Application
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/deleteTable)
	 *
	 * Example:
	 * ```typescript
	 * await qb.deleteTable({
	 * 	appId: 'xxxxxxxxx',
	 * 	tableId: 'xxxxxxxxx'
	 * });
	 * ```
	 *
	 * @param param0.appId Quick Base Application ID
	 * @param param0.tableId Quick Base Table ID
	 * @param param0.requestOptions Override axios request configuration
	 */
	async deleteTable({ appId, tableId, requestOptions }: QuickBaseRequestDeleteTable): Promise<QuickBaseResponseDeleteTable> {
		return this.request({
			method: 'DELETE',
			url: `tables/${tableId}?appId=${appId}`
		}, requestOptions);
	}

	/**
	 * Download a file stored in a Quick Base file attachment field
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/downloadFile)
	 *
	 * @param param0.tableId Quick Base Table ID
	 * @param param0.recordId Quick Base Record ID
	 * @param param0.fieldId Quick Base Field ID
	 * @param param0.versionNumber File attachment version number
	 * @param param0.requestOptions Override axios request configuration
	 */
	async downloadFile({ tableId, recordId, fieldId, versionNumber, requestOptions }: QuickBaseRequestDownloadFile): Promise<QuickBaseResponseDownloadFile> {
		const results = await this.request<{
			headers: {
				'content-disposition': string;
			};
			data: string
		}>({
			url: `files/${tableId}/${recordId}/${fieldId}/${versionNumber}`
		}, requestOptions, true);

		let filename = results.headers['content-disposition'];
		let match = filename.match(/filename=\"(.*)\";?/);

		if(match){
			filename = filename[1];
		}

		return {
			fileName: filename,
			data: Buffer.from(results.data, 'base64')
		};
	}

	/**
	 * Get the schema of a Quick Base Application
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/getApp)
	 *
	 * Example:
	 * ```typescript
	 * await qb.getApp({
	 * 	appId: 'xxxxxxxxx'
	 * });
	 * ```
	 *
	 * @param param0.appId Quick Base Application ID
	 * @param param0.requestOptions Override axios request configuration
	 */
	async getApp({ appId, requestOptions }: QuickBaseRequestGetApp): Promise<QuickBaseResponseApp> {
		return this.request({
			url: `apps/${appId}`
		}, requestOptions);
	}

	/**
	 * Get all Quick Base Tables from a Quick Base Application
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/getAppTables)
	 *
	 * Example:
	 * ```typescript
	 * await qb.getAppTables({
	 * 	appId: 'xxxxxxxxx'
	 * });
	 * ```
	 *
	 * @param param0.appId Quick Base Application ID
	 * @param param0.requestOptions Override axios request configuration
	 */
	async getAppTables({ appId, requestOptions }: QuickBaseRequestGetAppTables): Promise<QuickBaseResponseTable[]> {
		return this.request({
			url: 'tables',
			params: {
				appId: appId
			}
		}, requestOptions);
	}

	/**
	 * Get a single Quick Base Field from a Quick Base Table
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/getField)
	 *
	 * Example:
	 * ```typescript
	 * await qb.getField({
	 * 	tableId: 'xxxxxxxxx',
	 * 	fieldId: 3
	 * });
	 * ```
	 *
	 * @param param0.tableId Quick Base Table ID
	 * @param param0.fieldId Quick Base Field ID
	 * @param param0.requestOptions Override axios request configuration
	 */
	async getField({ tableId, fieldId, requestOptions }: QuickBaseRequestGetField): Promise<QuickBaseResponseField> {
		return this.request({
			url: `fields/${fieldId}`,
			params: {
				tableId: tableId
			}
		}, requestOptions);
	}

	/**
	 * Get all Quick Base Fields from a Quick Base Table
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/getFields)
	 *
	 * Example:
	 * ```typescript
	 * await qb.getFields({
	 * 	tableId: 'xxxxxxxxx'
	 * });
	 * ```
	 *
	 * @param param0.tableId Quick Base Table ID
	 * @param param0.includeFieldPerms If `true`, returns field permissions
	 * @param param0.requestOptions Override axios request configuration
	 */
	async getFields({ tableId, includeFieldPerms, requestOptions }: QuickBaseRequestGetFields): Promise<QuickBaseResponseField[]> {
		const params: {
			tableId: string;
			includeFieldPerms?: boolean;
		} = {
			tableId: tableId
		};

		if(typeof(includeFieldPerms) !== 'undefined'){
			params.includeFieldPerms = includeFieldPerms;
		}

		return this.request({
			url: 'fields',
			params: params
		}, requestOptions);
	}

	/**
	 * Get the usage of all Quick Base Fields in a Quick Base Table
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/getFieldsUsage)
	 *
	 * Example:
	 * ```typescript
	 * await qb.getFieldsUsage({
	 * 	tableId: 'xxxxxxxxx'
	 * });
	 * ```
	 *
	 * @param param0.tableId Quick Base Table ID
	 * @param param0.skip Number of fields to skip from list
	 * @param param0.requestOptions Override axios request configuration
	 */
	async getFieldsUsage({ tableId, skip, requestOptions }: QuickBaseRequestGetFieldsUsage): Promise<QuickBaseResponseFieldUsage[]> {
		const params: {
			tableId: string;
			skip?: number;
		} = {
			tableId: tableId
		};

		if(typeof(skip) !== 'undefined'){
			params.skip = skip;
		}

		return this.request({
			url: 'fields/usage',
			params: params
		}, requestOptions);
	}

	/**
	 * Get the usage of a single Quick Base Field
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/getFieldUsage)
	 *
	 * Example:
	 * ```typescript
	 * await qb.getFieldUsage({
	 * 	tableId: 'xxxxxxxxx',
	 * 	fieldId: 3
	 * });
	 * ```
	 *
	 * @param param0.tableId Quick Base Table ID
	 * @param param0.fieldId Quick Base Field ID
	 * @param param0.requestOptions Override axios request configuration
	 */
	async getFieldUsage({ tableId, fieldId, requestOptions }: QuickBaseRequestGetFieldUsage): Promise<QuickBaseResponseFieldUsage> {
		return (await this.request<QuickBaseResponseFieldUsage[]>({
			url: `fields/usage/${fieldId}`,
			params: {
				tableId: tableId
			}
		}, requestOptions))[0];
	}

	/**
	 * Get a predefined Quick Base Report
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/getReport)
	 *
	 * Example:
	 * ```typescript
	 * await qb.getReport({
	 * 	tableId: 'xxxxxxxxx',
	 * 	reportId: 1
	 * });
	 * ```
	 *
	 * @param param0.tableId Quick Base Table ID
	 * @param param0.reportId Quick Base Report ID
	 * @param param0.requestOptions Override axios request configuration
	 */
	async getReport({ tableId, reportId, requestOptions }: QuickBaseRequestGetReport): Promise<QuickBaseResponseReport> {
		return this.request({
			url: `reports/${reportId}`,
			params: {
				tableId: tableId
			}
		}, requestOptions);
	}

	/**
	 * Get all Quick Base Relationships for a given Quick Base Child Table
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/getRelationships)
	 *
	 * @param param0.childTableId Quick Base Child Table ID
	 * @param param0.requestOptions Override axios request configuration
	 */
	async getRelationships({ childTableId, requestOptions }: QuickBaseRequestGetRelationships): Promise<QuickBaseResponseRelationships> {
		return this.request({
			url: `tables/${childTableId}/relationships`
		}, requestOptions);
	}

	/**
	 * Get the schema of a Quick Base Table
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/getTable)
	 *
	 * Example:
	 * ```typescript
	 * await qb.getTable({
	 * 	tableId: 'xxxxxxxxx'
	 * });
	 * ```
	 *
	 * @param param0.tableId Quick Base Table ID
	 * @param param0.requestOptions Override axios request configuration
	 */
	async getTable({ appId, tableId, requestOptions }: QuickBaseRequestGetTable): Promise<QuickBaseResponseTable> {
		return this.request({
			url: `tables/${tableId}?appId=${appId}`
		}, requestOptions);
	}

	/**
	 * Get all predefined reports of a Quick Base Table
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/getTableReports)
	 *
	 * Example:
	 * ```typescript
	 * await qb.getTableReports({
	 * 	tableId: 'xxxxxxxxx'
	 * });
	 * ```
	 *
	 * @param param0.tableId Quick Base Table ID
	 * @param param0.requestOptions Override axios request configuration
	 */
	async getTableReports({ tableId, requestOptions }: QuickBaseRequestGetTableReports): Promise<QuickBaseResponseReport[]> {
		return this.request({
			url: 'reports',
			params: {
				tableId: tableId
			}
		}, requestOptions);
	}

	/**
	 * Get a temporary authentication token for Quick Base API requests for a specific Quick Base Application or Table.
	 *
	 * Only meant to be used client-side, passing the results server-side.
	 *
	 * Valid for 5 minutes. Only valid against passed in table.
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/getTempTokenDBID)
	 *
	 * Example:
	 * ```typescript
	 * const results = await qb.getTempToken({
	 * 	dbid: 'xxxxxxxxx'
	 * });
	 *
	 * console.log(results.temporaryAuthorization); // '<base64 type>.<base64 value>';
	 * ```
	 *
	 * @param param0.dbid Quick Base Application ID or Table ID
	 * @param param0.requestOptions Override axios request configuration
	 */
	async getTempToken({ dbid, requestOptions }: QuickBaseRequestGetTempToken): Promise<QuickBaseResponseGetTempToken> {
		var results = await this.request<QuickBaseResponseGetTempToken>({
			url: `auth/temporary/${dbid}`,
			withCredentials: true
		}, requestOptions);

		if(this.settings.autoConsumeTempTokens){
			this.setTempToken(results.temporaryAuthorization, dbid);
		}

		return results;
	}

	/**
	 * Run a custom Quick Base query
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/runQuery)
	 *
	 * Example:
	 * ```typescript
	 * await qb.runQuery({
	 * 	tableId: 'xxxxxxxxx',
	 * 	where: "{'3'.GT.'0'}",
	 * 	select: [ 3, 6, 7 ],
	 * 	sortBy: [{
	 * 		fieldId: 3,
	 * 		order: 'ASC'
	 * 	}],
	 * 	groupBy: [{
	 * 		fieldId: 6,
	 * 		by: 'same-value'
	 * 	}],
	 * 	options: {
	 * 		skip: 200,
	 * 		top: 100
	 * 	}
	 * });
	 * ```
	 *
	 * @param param0.tableId Quick Base Table ID
	 * @param param0.where Quick Base query string
	 * @param param0.select Array of Field IDs to return
	 * @param param0.sortBy Array of Fields to sort the results by
	 * @param param0.groupBy Array of Fields to group the results by
	 * @param param0.options Report Options Object
	 * @param param0.options.skip Number of records to skip
	 * @param param0.options.top Maximum number of records to return
	 * @param param0.requestOptions Override axios request configuration
	 */
	async runQuery({
		tableId,
		where,
		sortBy,
		select,
		options,
		groupBy,
		requestOptions
	}: QuickBaseRequestRunQuery): Promise<QuickBaseResponseRunQuery> {
		return this.request({
			method: 'POST',
			url: 'records/query',
			data: {
				from: tableId,
				where: where,
				sortBy: sortBy,
				select: select,
				options: options,
				groupBy: groupBy
			}
		}, requestOptions);
	}

	/**
	 * Run a predefined Quick Base report
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/runReport)
	 *
	 * Example:
	 * ```typescript
	 * await qb.runReport({
	 * 	tableId: 'xxxxxxxxx',
	 * 	reportId: 1,
	 * 	options: {
	 * 		skip: 200,
	 * 		top: 100
	 * 	}
	 * });
	 * ```
	 *
	 * @param param0.tableId Quick Base Table ID
	 * @param param0.reportId Quick Base Report ID
	 * @param param0.options Report Options Object
	 * @param param0.options.skip Number of records to skip
	 * @param param0.options.top Maximum number of records to return
	 * @param param0.requestOptions Override axios request configuration
	 */
	async runReport({ tableId, reportId, options, requestOptions }: QuickBaseRequestRunReport): Promise<QuickBaseResponseRunQuery> {
		const params: {
			tableId: string;
			skip?: number;
			top?: number;
		} = {
			tableId: tableId
		};

		if(options && typeof(options.skip) !== 'undefined'){
			params.skip = options.skip;
		}

		if(options && typeof(options.top) !== 'undefined'){
			params.top = options.top;
		}

		return this.request({
			method: 'POST',
			url: `reports/${reportId}/run`,
			params: params,
			data: {}
		}, requestOptions);
	}

	/**
	 * Set the internally stored `tempToken` for use in subsequent API calls
	 *
	 * Example:
	 * ```typescript
	 * qb.setTempToken('xxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'xxxxxxxxx');
	 * ```
	 *
	 * @param tempToken Temporary Quick Base Authentication Token
	 * @param dbid Quick Base Application ID or Table ID
	 */
	setTempToken(tempToken: string, dbid?: string): QuickBase {
		this.settings.tempToken = tempToken;

		this._tempTokenTable = dbid || false;

		return this;
	}

	/**
	 * Update a Quick Base Application
	 * 
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/updateApp)
	 * 
	 * Example:
	 * ```typescript
	 * await qb.updateApp({
	 * 	appId: 'xxxxxxxxx',
	 * 	name: 'Application Name',
	 * 	description: 'A test application',
	 * 	variables: [{
	 * 		name: 'Some Variable',
	 * 		value: 'Some Other Value'
	 * 	}]
	 * });
	 * ```
	 * 
	 * @param param0.appId Quick Base Application ID
	 * @param param0.name Application name
	 * @param param0.description Application Description
	 * @param param0.variables Array of Quick Base Variables
	 * @param param0.requestOptions Override axios request configuration
	 */
	async updateApp({ appId, name, description, variables, requestOptions }: QuickBaseRequestUpdateApp): Promise<QuickBaseResponseApp> {
		const data: DataObj<QuickBaseRequestUpdateApp> = {};

		if(typeof(name) !== 'undefined'){
			data.name = name;
		}

		if(typeof(description) !== 'undefined'){
			data.description = description;
		}

		if(typeof(variables) !== 'undefined'){
			data.variables = variables;
		}

		return this.request({
			method: 'POST',
			url: `apps/${appId}`,
			data: data
		}, requestOptions);
	}

	/**
	 * Update a Quick Base Field
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/updateField)
	 *
	 * @param param0.tableId Quick Base Table ID
	 * @param param0.fieldId Quick Base Field ID
	 * @param param0.label Label of field
	 * @param param0.unique Marks field as unique
	 * @param param0.required Required field
	 * @param param0.noWrap Wrap value of field in the Quick Base UI
	 * @param param0.bold Display value of field as bold in the Quick Base UI
	 * @param param0.appearsByDefault Set field as default in reports
	 * @param param0.addToForms Add field to forms by default
	 * @param param0.findEnabled Allows field to be searchable
	 * @param param0.fieldHelp Field help text
	 * @param param0.properties Field properties specific to `fieldType`
	 * @param param0.permissions Field permissions for Quick Base roles
	 * @param param0.requestOptions Override axios request configuration
	 */
	async updateField({
		tableId,
		fieldId,
		label,
		unique,
		required,
		noWrap,
		bold,
		appearsByDefault,
		addToForms,
		findEnabled,
		fieldHelp,
		properties,
		permissions,
		requestOptions
	}: QuickBaseRequestUpdateField): Promise<QuickBaseResponseUpdateField> {
		const data: DataObj<QuickBaseRequestUpdateField> = {};

		if(typeof(label) !== 'undefined'){
			data.label = label;
		}

		if(typeof(unique) !== 'undefined'){
			data.unique = unique;
		}

		if(typeof(required) !== 'undefined'){
			data.required = required;
		}

		if(typeof(noWrap) !== 'undefined'){
			data.noWrap = noWrap;
		}

		if(typeof(bold) !== 'undefined'){
			data.bold = bold;
		}

		if(typeof(appearsByDefault) !== 'undefined'){
			data.appearsByDefault = appearsByDefault;
		}

		if(typeof(findEnabled) !== 'undefined'){
			data.findEnabled = findEnabled;
		}

		if(typeof(addToForms) !== 'undefined'){
			data.addToForms = addToForms;
		}

		if(typeof(fieldHelp) !== 'undefined'){
			data.fieldHelp = fieldHelp;
		}

		if(typeof(properties) !== 'undefined'){
			data.properties = properties;
		}

		if(typeof(permissions) !== 'undefined'){
			data.permissions = permissions;
		}

		return this.request({
			method: 'POST',
			url: `fields/${fieldId}?tableId=${tableId}`,
			data: data
		}, requestOptions);
	}

	/**
	 * Update a Quick Base Relationship
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/updateRelationship)
	 *
	 * @param param0.relationshipId Quick Base Table Relationship ID
	 * @param param0.childTableId Quick Base Table ID of the Child Table
	 * @param param0.lookupFieldIds Array of Field IDs to bring from the Parent Table into the Child Table
	 * @param param0.summaryFields Array of Summary Fields to create in the Parent Table
	 * @param param0.requestOptions Override axios request configuration
	 */
	async updateRelationship({ relationshipId, childTableId, lookupFieldIds, summaryFields, requestOptions }: QuickBaseRequestUpdateRelationship): Promise<QuickBaseRelationship> {
		const data: DataObj<QuickBaseRequestUpdateRelationship> = {};

		if(typeof(lookupFieldIds) !== undefined){
			data.lookupFieldIds = lookupFieldIds;
		}

		if(typeof(summaryFields) !== undefined){
			data.summaryFields = summaryFields;
		}

		return this.request({
			method: 'POST',
			url: `tables/${childTableId}/relationship/${relationshipId}`,
			data: data
		}, requestOptions);
	}

	/**
	 * Update a Quick Base Table
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/updateTable)
	 *
	 * @param param0.appId Quick Base Application ID
	 * @param param0.name Name of the new table
	 * @param param0.description Description of the new table
	 * @param param0.iconName Icon for the new table
	 * @param param0.singularNoun Singular noun for a record in the new table
	 * @param param0.pluralNoun Plural noun for records in the new table
	 * @param param0.requestOptions Override axios request configuration
	 */
	async updateTable({ appId, tableId, name, description, iconName, singularNoun, pluralNoun, requestOptions }: QuickBaseRequestUpdateTable): Promise<QuickBaseResponseUpdateTable> {
		const data: DataObj<QuickBaseRequestUpdateTable> = {};

		if(typeof(name) !== 'undefined'){
			data.name = name;
		}

		if(typeof(description) !== 'undefined'){
			data.description = description;
		}

		if(typeof(iconName) !== 'undefined'){
			data.iconName = iconName;
		}

		if(typeof(singularNoun) !== 'undefined'){
			data.singularNoun = singularNoun;
		}

		if(typeof(pluralNoun) !== 'undefined'){
			data.pluralNoun = pluralNoun;
		}

		return this.request({
			method: 'POST',
			url: `tables/${tableId}?appId=${appId}`,
			data: data
		}, requestOptions);
	}

	/**
	 * Creates or updates records in a Quick Base Table
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/operation/upsert)
	 *
	 * Example:
	 * ```typescript
	 * await qb.upsertRecords({
	 * 	data: [{
	 * 		"6": {
	 * 			value: 'Record 1 Field 6'
	 * 		},
	 * 		"7": {
	 * 			value: 'Record 1 Field 7'
	 * 		}
	 * 	}, {
	 * 		"6": {
	 * 			value: 'Record 2 Field 6'
	 * 		}
	 * 		"7": {
	 * 			value: 'Record 2 Field 7'
	 * 		}
	 * 	}],
	 * 	mergeFieldId: 6,
	 * 	fieldsToReturn: [ 6, 7 ]
	 * });
	 * ```
	 *
	 * @param param0.tableId Quick Base Table ID
	 * @param param0.data Record data array
	 * @param param0.mergeFieldId Merge Field ID
	 * @param param0.fieldsToReturn An array of Field IDs to return
	 * @param param0.requestOptions Override axios request configuration
	 */
	async upsertRecords({ tableId, data, mergeFieldId, fieldsToReturn, requestOptions }: QuickBaseRequestUpsertRecords): Promise<QuickBaseResponseUpsertRecords> {
		const results = await this.request<{
			headers: QuickBaseResponseDebug
			data: QuickBaseResponseUpsertRecords
		}>({
			method: 'POST',
			url: 'records',
			data: {
				to: tableId,
				data: data,
				mergeFieldId: mergeFieldId,
				fieldsToReturn: fieldsToReturn
			}
		}, requestOptions, true);

		const response = results.data;

		if(response.metadata.lineErrors && response.data.length === 0){
			const lines = Object.keys(response.metadata.lineErrors);

			if(lines.length > 0){
				throw new QuickBaseError(500, 'Error executing upsertRecords', lines.map((line) => {
					return `Line #${line}: ${response.metadata.lineErrors![line].join('. ')}`;
				}).join('\n'), results.headers['qb-api-ray']);
			}
		}

		return response;
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
	toJSON(): QuickBaseOptions {
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

}

/* Quick Base Error */
export class QuickBaseError extends Error {

	/**
	 * Extends the native JavaScript `Error` object for use with Quick Base API errors
	 *
	 * Example:
	 * ```typescript
	 * const qbErr = new QuickBaseError(403, 'Access Denied', 'User token is invalid', 'xxxx');
	 * ```
	 *
	 * @param code Error code
	 * @param message Error message
	 * @param description Error description
	 * @param rayId Quick Base API Ray ID
	 */
	constructor(public code: number, public message: string, public description?: string, public rayId?: string) {
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

/* Helpers */
function objKeysToLower<O>(obj: O): O {
    return Object.keys(obj).reduce((result, key) => {
		(result as Indexable)[key.toLowerCase()] = (obj as Indexable)[key];

		return result;
	}, {}) as O;
}

/* Quick Base Interfaces */
interface Indexable {
	[index: string]: any;
}

type DataObj<T> = Partial<Omit<T, 'appId' | 'tableId' | 'childTableId' | 'fieldId' | 'requestOptions'>>;

export type accumulation = 'AVG' | 'SUM' | 'MAX' | 'MIN' | 'STD-DEV' | 'COUNT' | 'COMBINED-TEXT' | 'DISTINCT-COUNT';
export type dateFormat = 'MM-DD-YYYY' | 'MM-DD-YY' | 'DD-MM-YYYY' | 'DD-MM-YY' | 'YYYY-MM-DD';
export type fieldType = 'text' | 'text-multiple-choice' | 'text-multi-line' | 'multitext' | 'float' | 'currency' | 'percent' | 'rating' | 'date' | 'timestamp' | 'timeofday' | 'duration' | 'checkbox' | 'address' | 'phone' | 'email' | 'userid' | 'multiuserid' | 'file' | 'url' | 'dblink' | 'ICalendarButton' | 'vCardButton' | 'predecessor' | 'recordid';
export type reportType = 'map' | 'gedit' | 'chart' | 'summary' | 'table' | 'timeline' | 'calendar';
export type sortOrder = 'ASC' | 'DESC';
export type groupBy = 'first-word' | 'first-letter' | 'same-value' | '1000000' | '100000' | '10000' | '1000' | '100' | '10' | '5' | '1' | '.1' | '.01' | '.001';
export type permissionType = 'None' | 'View' | 'Modify';

interface QuickBaseResponseDebug {
	date: string;
	'qb-api-ray': string;
	'x-ratelimit-remaining': number;
	'x-ratelimit-limit': number;
	'x-ratelimit-reset': number;
}

export interface QuickBaseTruncatedField {
	id: number;
	name: string;
	type: fieldType;
}

export interface QuickBaseForeignKeyField extends Omit<QuickBaseTruncatedField, 'name'> {
	label: string;
}

export interface QuickBaseQueryOptions {
	skip?: number;
	top?: number;
}

export interface QuickBaseSortBy {
	fieldId: number;
	order: sortOrder;
};

export interface QuickBaseGroupBy {
	fieldId: number;
	grouping: groupBy;
}

export interface QuickBaseErrorJSON {
	code: number;
	message: string;
	description?: string;
	rayId?: string;
}

export interface QuickBaseOptions {
	/**
	 * Quick Base API Server FQDN
	 *
	 * Default is `api.quickbase.com`
	 */
	server?: string;

	/**
	 * Quick Base API Version
	 *
	 * Default is `v1`
	 */
	version?: string;

	/**
	 * Quick Base Realm.
	 *
	 * For example, if your Quick Base url is: `demo.quickbase.com`
	 * Your realm is: `demo`
	 */
	realm: string;

	/**
	 * A Quick Base User Token.
	 *
	 * If both a `userToken` and `tempToken` are defined, the `tempToken` will be used
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/auth)
	 */
	userToken?: string;

	/**
	 * A Temporary Authentication Token or Temporary Table Authentication Token.
	 *
	 * If both a `userToken` and `tempToken` are defined, the `tempToken` will be used
	 *
	 * [Quick Base Documentation](https://developer.quickbase.com/auth)
	 */
	tempToken?: string;

	/**
	 * A Quick Base Application Token
	 *
	 * Only required when using Temporary Tokens
	 *
	 * [Quick Base Documentation](https://help.quickbase.com/user-assistance/app_tokens.html)
	 */
	appToken?: string;

	/**
	 * Provide a custom User-Agent to help track API usage within your logs
	 *
	 * When used in the browser, this sets the X-User-Agent header instead
	 * as the browser will block any attempt to set a custom User-Agent
	 */
	userAgent?: string;

	/**
	 * Automatically call `setTempToken()` after receiving a new Temporary Token
	 *
	 * Default is `true`
	 */
	autoConsumeTempTokens?: boolean;

	/**
	 * Automatically renew Temporary Tokens after they expire
	 *
	 * Default is `true`
	 */
	autoRenewTempTokens?: boolean;

	/**
	 * The maximum number of open, pending API connections to Quick Base
	 *
	 * Default is `10`
	 */
	connectionLimit?: number;

	/**
	 * The period length, in milliseconds, of connection limit
	 *
	 * Default is `1000`
	 */
	connectionLimitPeriod?: number;

	/**
	 * Throw an error if the connection limit is exceeded
	 *
	 * Default is `false`
	 */
	errorOnConnectionLimit?: boolean;

	/**
	 * Allows the use of a proxy for Quick Base API requests
	 *
	 * Default is `false`
	 */
	proxy?: false | {
		host: string;
		port: number;
		auth?: {
			username: string;
			password: string;
		}
	}
}

interface QuickBaseRequest {
	requestOptions?: AxiosRequestConfig;
}

export interface QuickBaseRequestCreateApp extends QuickBaseRequest {
	name: string;
	description?: string;
	assignToken?: boolean;
	variables?: QuickBaseVariable[]
}

export interface QuickBaseRequestUpdateApp extends QuickBaseRequest {
	appId: string;
	name?: string;
	description?: string;
	variables?: QuickBaseVariable[]
}

export interface QuickBaseRequestDeleteApp extends QuickBaseRequest {
	appId: string;
	name: string;
}

export interface QuickBaseResponseDeleteApp {
	deletedAppId: string;
}

export interface QuickBaseRequestDeleteRecords extends QuickBaseRequest {
	tableId: string;
	where: string;
}

export interface QuickBaseRequestGetApp extends QuickBaseRequest {
	appId: string;
}

export interface QuickBaseRequestGetAppTables extends QuickBaseRequest {
	appId: string;
}

export interface QuickBaseRequestGetField extends QuickBaseRequest {
	tableId: string;
	fieldId: number;
}

export interface QuickBaseRequestGetFields extends QuickBaseRequest {
	tableId: string;
	includeFieldPerms?: boolean;
}

export interface QuickBaseRequestGetFieldsUsage extends QuickBaseRequest {
	tableId: string;
	skip?: number;
}

export interface QuickBaseRequestGetFieldUsage extends QuickBaseRequest {
	tableId: string;
	fieldId: number;
}

export interface QuickBaseRequestGetReport extends QuickBaseRequest {
	tableId: string;
	reportId: number;
}

export interface QuickBaseRequestGetTable extends QuickBaseRequest {
	appId: string;
	tableId: string;
}

export interface QuickBaseRequestGetTableReports extends QuickBaseRequest {
	tableId: string;
}

export interface QuickBaseRequestRunQuery extends QuickBaseRequest {
	tableId: string;
	where?: string;
	sortBy?: QuickBaseSortBy[];
	select?: number[];
	options?: QuickBaseQueryOptions;
	groupBy?: QuickBaseGroupBy[];
}

export interface QuickBaseRequestRunReport extends QuickBaseRequest {
	tableId: string;
	reportId: number;
	options?: QuickBaseQueryOptions;
}

export interface QuickBaseRequestUpsertRecords extends QuickBaseRequest {
	tableId: string;
	data: QuickBaseRecord[];
	mergeFieldId?: number;
	fieldsToReturn?: number[];
}

export interface QuickBaseRequestCreateTable extends QuickBaseRequest {
	appId: string;
	name: string;
	description?: string;
	iconName?: string;
	singularNoun?: string;
	pluralNoun?: string;
}

export interface QuickBaseRequestUpdateTable extends QuickBaseRequest {
	appId: string;
	tableId: string;
	name?: string;
	description?: string;
	iconName?: string;
	singularNoun?: string;
	pluralNoun?: string;
}

export interface QuickBaseRequestDeleteTable extends QuickBaseRequest {
	appId: string;
	tableId: string;
}

export interface QuickBaseResponseCreateTable {
	id: string;
	name: string;
	description: string;
	iconName: string;
	singularNoun: string;
	pluralNoun: string;
}

export interface QuickBaseResponseUpdateTable extends QuickBaseResponseCreateTable {
}

export interface QuickBaseResponseDeleteTable {
	deletedTableId: string;
}

export interface QuickBaseRequestCreateField extends QuickBaseRequest,
Pick<QuickBaseField, 'fieldType' | 'label' | 'noWrap' | 'bold' | 'appearsByDefault' | 'findEnabled' | 'fieldHelp' | 'addToForms' | 'audited' | 'properties' | 'permissions'> {
	tableId: string;
}

export interface QuickBaseResponseCreateField extends QuickBaseResponseField {
}

export interface QuickBaseRequestDeleteFields extends QuickBaseRequest {
	tableId: string;
	fieldIds: number[];
}

export interface QuickBaseResponseDeleteFields {
	deletedFieldIds: number[];
	errors: string[];
}

export interface QuickBaseRequestUpdateField extends QuickBaseRequest, Pick<QuickBaseField, 'required' | 'unique' | 'label' | 'noWrap' | 'bold' | 'appearsByDefault' | 'findEnabled' | 'fieldHelp' | 'addToForms' | 'properties' | 'permissions'> {
	tableId: string;
	fieldId: number;
}

export interface QuickBaseResponseUpdateField extends QuickBaseResponseField {
}

export interface QuickBaseRequestGetTempToken extends QuickBaseRequest {
	dbid: string;
}

export interface QuickBaseResponseGetTempToken {
	temporaryAuthorization: string;
}

export interface QuickBaseVariable {
	name: string;
	value: string;
}

export interface QuickBaseResponseApp {
	id: string;
	created: number;
	updated: number;
	name: string;
	description: string;
	timeZone: string;
	dateFormat: dateFormat;
	variables: QuickBaseVariable[];
	hasEveryoneOnTheInternet: boolean;
}

export interface QuickBaseResponseTable {
	id: string;
	alias: string;
	created: number;
	updated: number;
	name: string;
	description: string;
	singleRecordName: string;
	pluralRecordName: string;
	timeZone: string;
	dateFormat: dateFormat;
	keyFieldId: number;
	nextFieldId: number;
	nextRecordId: number;
	defaultSortFieldId: number;
	defaultSortOrder: sortOrder;
}

export interface QuickBaseResponseFieldPermission {
	role: string;
	roleId: number;
	permissionType: permissionType;
}

interface QuickBaseField {
	fieldType: fieldType;
	label: string;
	mode?: string;
	noWrap?: boolean;
	fieldHelp?: string;
	bold?: boolean;
	required?: boolean;
	appearsByDefault?: boolean;
	findEnabled?: boolean;
	unique?: boolean;
	doesDataCopy?: boolean;
	audited?: boolean;
	addToForms?: boolean;
	properties?: {
		abbreviate?: boolean;
		allowHTML?: boolean;
		allowNewChoices?: boolean;
		appearsAs?: string;
		appendOnly?: boolean;
		autoSave?: boolean;
		blankIsZero?: boolean;
		carryChoices?: boolean;
		choices?: string[];
		commaStart?: string;
		comments?: string;
		compositeFields?: QuickBaseTruncatedField[];
		currencyFormat?: string;
		currencySymbol?: string;
		decimalPlaces?: string;
		defaultDomain?: string;
		defaultKind?: string;
		defaultToday?: boolean;
		defaultValue?: string;
		defaultValueLuid?: number;
		displayDayOfWeek?: boolean;
		displayEmail?: string;
		displayImages?: boolean;
		displayMonth?: string;
		displayRelative?: boolean;
		displayTime?: boolean;
		displayTimezone?: boolean;
		displayUser?: string;
		doesAverage?: boolean;
		doesTotal?: boolean;
		exact?: boolean;
		foreignKey?: boolean;
		format?: string;
		formula?: string;
		hasExtension?: boolean;
		hours24?: boolean;
		linkText?: string;
		lookupTargetFieldId?: number;
		lookupReferenceFieldId?: number;
		maxLength?: number;
		maxVersions?: number;
		numberFormat?: string;
		numLines?: number;
		parentFieldId?: number;
		primaryKey?: boolean;
		seeVersions?: boolean;
		snapshotFieldId?: number;
		sortAlpha?: boolean;
		sortAsGiven?: boolean;
		sourceFieldId?: number;
		targetFieldId?: number;
		targetTableName?: string;
		units?: string;
		useNewWindow?: boolean;
		versionMode?: number;
		width?: number;
	};
	permissions?: QuickBaseResponseFieldPermission[];
}

export interface QuickBaseResponseField extends QuickBaseField {
	id: number;
}

export interface QuickBaseResponseReport {
	id: number;
	name: string;
	type: reportType;
	description: string;
	query: {
		tableId: string;
		filter: string;
		formulaFields: {
			formula: string;
			label: string;
			id: number;
			fieldType: fieldType;
			decimalPrecision?: number;
		}[];
		fields: number[];
		sortBy: QuickBaseSortBy[];
		groupBy: QuickBaseGroupBy[];
	};
	properties: any;
}

export type QuickBaseRecord = {
	[index in number | string]: {
		value: any;
	};
};

export interface QuickBaseResponseUpsertRecords {
	data: QuickBaseRecord[];
	metadata: {
		createdRecordIds: number[];
		totalNumberOfRecordsProcessed: number;
		unchangedRecordIds: number[];
		updatedRecordIds: number[];
		lineErrors?: {
			[index: string]: string[]
		}
	};
}

export interface QuickBaseResponseRunQuery {
	data: QuickBaseRecord[];
	fields: QuickBaseTruncatedField[];
	metadata: {
		numFields: number;
		numRecords: number;
		skip: number;
		top: number;
		totalRecords: number;
	};
}

export interface QuickBaseFieldUsage {
	actions: {
		count: number;
	};
	appHomePages: {
		count: number;
	};
	defaultReports: {
		count: number;
	};
	exactForms: {
		count: number;
	};
	fields: {
		count: number;
	};
	forms: {
		count: number;
	};
	notifications: {
		count: number;
	};
	personalReports: {
		count: number;
	};
	relationships: {
		count: number;
	};
	reminders: {
		count: number;
	};
	reports: {
		count: number;
	};
	roles: {
		count: number;
	};
	webhooks: {
		count: number;
	};
}

export interface QuickBaseResponseFieldUsage {
	field: QuickBaseTruncatedField;
	usage: QuickBaseFieldUsage;
}

export interface QuickBaseResponseDeleteRecords {
	numberDeleted: number;
}

export interface QuickBaseRequestGetRelationships extends QuickBaseRequest {
	childTableId: string;
}

export interface QuickBaseRelationship {
	id: number;
	isCrossApp: boolean;
	parentTableId: string;
	childTableId: string;
	foreignKeyField: QuickBaseForeignKeyField;
	lookupFields: QuickBaseTruncatedField[];
	summaryFields: QuickBaseTruncatedField[];
}

export interface QuickBaseResponseRelationships {
	metadata: {
		numRelationships: number;
		skip: number;
		totalRelationships: number;
	};
	relationships: QuickBaseRelationship[]
}

export interface QuickBaseSummaryField {
	summaryFid: number;
	label: string;
	accumulationType: accumulation;
	where?: string;
}

export interface QuickBaseRequestCreateRelationship extends QuickBaseRequest {
	parentTableId: string;
	childTableId: string;
	foreignKeyField: {
		label: string;
	};
	lookupFieldIds: number[];
	summaryFields: QuickBaseSummaryField[];
}

export interface QuickBaseRequestUpdateRelationship extends QuickBaseRequest {
	relationshipId: number;
	childTableId: string;
	lookupFieldIds?: number[];
	summaryFields?: QuickBaseSummaryField[];
}

export interface QuickBaseRequestDeleteRelationship extends QuickBaseRequest {
	childTableId: string;
	relationshipId: number;
}

export interface QuickBaseResponseDeleteRelationship {
	relationshipId: number;
}

export interface QuickBaseRequestDownloadFile extends QuickBaseRequest {
	tableId: string;
	recordId: number;
	fieldId: number;
	versionNumber: number;
}

export interface QuickBaseResponseDownloadFile {
	fileName: string;
	data: Buffer;
}

export interface QuickBaseRequestDeleteFile extends QuickBaseRequest {
	tableId: string;
	recordId: number;
	fieldId: number;
	versionNumber: number;
}

export interface QuickBaseResponseDeleteFile {
	versionNumber: number;
	fileName: string;
	uploaded: string;
	creator: {
		email: string;
		id: string;
		name: string;
	}
}

/* Export Supporting Types/Classes */
export {
	AxiosRequestConfig
} from 'axios';

/* Export to Browser */
if(IS_BROWSER){
	// @ts-ignore
	window.QuickBase = QuickBase;
}
