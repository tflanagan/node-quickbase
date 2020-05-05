/*!
 * Copyright 2014 Tristian Flanagan
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

'use strict';

/* Dependencies */
import merge from 'deepmerge';
import { debug } from 'debug';
import { Throttle } from 'generic-throttle';
import axios, {
	AxiosRequestConfig
} from 'axios';

/* Debug */
const debugMain = debug('quickbase');
const debugRequest = debug('quickbase:request');
const debugResponse = debug('quickbase:response');

/* Globals */
const VERSION = require('../package.json').version;
const IS_BROWSER = typeof(window) !== 'undefined';

/* Main Class */
export class QuickBase {

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
	 * Returns a simple axios request configuration block
	 *
	 * @returns Simple GET configuration with required authorization
	 */
	private getBasicRequest(): AxiosRequestConfig {
		const headers = {
			[IS_BROWSER ? 'X-User-Agent' : 'User-Agent']: `${this.settings.userAgent} node-quickbase/v${VERSION} ${IS_BROWSER ? (window.navigator ? window.navigator.userAgent : '') : 'nodejs/' + process.version}`.trim(),
			'QB-Realm-Hostname': this.settings.realm
		};

		if(this.settings.tempToken){
			headers.Authorization = `QB-TEMP-TOKEN ${this.settings.tempToken}`;
		}else
		if(this.settings.userToken){
			headers.Authorization = `QB-USER-TOKEN ${this.settings.userToken}`;
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
	 *
	 * @returns Direct results from API request
	 */
	private async request<T>(actOptions: AxiosRequestConfig, reqOptions?: AxiosRequestConfig): Promise<T> {
		return await this.throttle.acquire(async (resolve, reject) => {
			const id = 0 + (++this._id);
			const options = merge.all([
				this.getBasicRequest(),
				actOptions,
				reqOptions || {}
			]);

			debugRequest(id, options);

			try {
				const results = (await axios.request(options)).data;

				debugResponse(id, results);

				resolve(results);
			}catch(err){
				if(!err.isAxiosError || !err.response){
					debugResponse(id, err);

					return reject(err);
				}

				// Error reporting seems a bit inconsistent
				const data: {
					message: string;
					description: string;
					errors?: string[];
				} = merge({
					message: 'Quick Base Error',
					description: 'There was an unexpected error, please check your request and try again'
				}, err.response.data || {});

				const nErr = new QuickBaseError(err.response.status, data.message, data.errors && data.errors.join(' ') || data.description);

				if(!this.settings.autoRenewTempTokens || this._tempTokenTable === false || !nErr.description || !nErr.description.match(/Your ticket has expired/)){
					debugResponse(id, nErr, data);

					return reject(nErr);
				}

				debugResponse(id, 'Expired token detected, renewing and trying again...', data);

				let results = await this.getTempToken({
					dbid: this._tempTokenTable
				});

				if(!this.settings.autoConsumeTempTokens){
					this.setTempToken(results.temporaryAuthorization, this._tempTokenTable);
				}

				return this.request(actOptions, reqOptions).then(resolve).catch(reject);
			}
		});
	}

	/**
	 * Create a Quick Base Field
	 *
	 * [Quick Base Documentation](https://www.ui.quickbase.com/ui/api-docs/operation/createField)
	 *
	 * @param param0.tableId Quick Base Table DBID
	 * @param param0.label Label of new field
	 * @param param0.fieldType Type of new field ([Quick Base Documentation](https://help.quickbase.com/user-assistance/field_types.html))
	 * @param param0.noWrap Wrap value of field in the Quick Base UI
	 * @param param0.bold Display value of field as bold in the Quick Base UI
	 * @param param0.required Required field
	 * @param param0.appearsByDefault Set field as default in reports
	 * @param param0.findEnabled Allows field to be searchable
	 * @param param0.unique Marks field as unique
	 * @param param0.doesDataCopy Allows field value to be copied
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
		required,
		appearsByDefault,
		findEnabled,
		unique,
		doesDataCopy,
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

		if(typeof(required) !== 'undefined'){
			data.required = required;
		}

		if(typeof(appearsByDefault) !== 'undefined'){
			data.appearsByDefault = appearsByDefault;
		}

		if(typeof(findEnabled) !== 'undefined'){
			data.findEnabled = findEnabled;
		}

		if(typeof(unique) !== 'undefined'){
			data.unique = unique;
		}

		if(typeof(doesDataCopy) !== 'undefined'){
			data.doesDataCopy = doesDataCopy;
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

		return await this.request({
			method: 'POST',
			url: `fields?tableId=${tableId}`,
			data: data
		}, requestOptions);
	}

	/**
	 * Create a Quick Base Table
	 *
	 * [Quick Base Documentation](https://www.ui.quickbase.com/ui/api-docs/operation/createTable)
	 *
	 * @param param0.appId Quick Base Application DBID
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

		return await this.request({
			method: 'POST',
			url: `tables?appId=${appId}`,
			data: data
		}, requestOptions);
	}

	/**
	 * Delete fields from a Quick Base Table
	 *
	 * [Quick Base Documentation](https://www.ui.quickbase.com/ui/api-docs/operation/deleteFields)
	 *
	 * Example:
	 * ```typescript
	 * await qb.deleteFields({
	 * 	tableId: 'xxxxxxxxx',
	 * 	fieldIds: [ 6 ]
	 * });
	 * ```
	 *
	 * @param param0.tableId Quick Base Table DBID
	 * @param param0.fieldIds An array of Quick Base Field IDs
	 * @param param0.requestOptions Override axios request configuration
	 */
	async deleteFields({ tableId, fieldIds, requestOptions }: QuickBaseRequestDeleteFields): Promise<QuickBaseResponseDeleteFields> {
		return await this.request({
			method: 'DELETE',
			url: `fields?tableId=${tableId}`,
			data: {
				fieldIds: fieldIds
			}
		}, requestOptions);
	}

	/**
	 * Delete records from a Quick Base Table
	 *
	 * [Quick Base Documentation](https://www.ui.quickbase.com/ui/api-docs/operation/deleteRecords)
	 *
	 * Example:
	 * ```typescript
	 * await qb.deleteRecords({
	 * 	tableId: 'xxxxxxxxx',
	 * 	where: "{'3'.GT.'0'}"
	 * });
	 * ```
	 *
	 * @param param0.tableId Quick Base Table DBID
	 * @param param0.where Quick Base Where Clause
	 * @param param0.requestOptions Override axios request configuration
	 */
	async deleteRecords({ tableId, where, requestOptions }: QuickBaseRequestDeleteRecords): Promise<QuickBaseResponseDeleteRecords> {
		return await this.request({
			method: 'DELETE',
			url: 'records',
			data: {
				from: tableId,
				where: where
			}
		}, requestOptions);
	}

	/**
	 * Delete a Table from a Quick Base Application
	 *
	 * [Quick Base Documentation](https://www.ui.quickbase.com/ui/api-docs/operation/deleteTable)
	 *
	 * Example:
	 * ```typescript
	 * await qb.deleteTable({
	 * 	appId: 'xxxxxxxxx',
	 * 	tableId: 'xxxxxxxxx'
	 * });
	 * ```
	 *
	 * @param param0.appId Quick Base Application DBID
	 * @param param0.tableId Quick Base Table DBID
	 * @param param0.requestOptions Override axios request configuration
	 */
	async deleteTable({ appId, tableId, requestOptions }: QuickBaseRequestDeleteTable): Promise<QuickBaseResponseDeleteTable> {
		return await this.request({
			method: 'DELETE',
			url: `tables/${tableId}?appId=${appId}`
		}, requestOptions);
	}

	/**
	 * Get the schema of a Quick Base Application
	 *
	 * [Quick Base Documentation](https://www.ui.quickbase.com/ui/api-docs/operation/getApp)
	 *
	 * Example:
	 * ```typescript
	 * await qb.getApp({
	 * 	appId: 'xxxxxxxxx'
	 * });
	 * ```
	 *
	 * @param param0.appId Quick Base Application DBID
	 * @param param0.requestOptions Override axios request configuration
	 */
	async getApp({ appId, requestOptions }: QuickBaseRequestGetApp): Promise<QuickBaseResponseApp> {
		return await this.request({
			url: `apps/${appId}`
		}, requestOptions);
	}

	/**
	 * Get all Quick Base Tables from a Quick Base Application
	 *
	 * [Quick Base Documentation](https://www.ui.quickbase.com/ui/api-docs/operation/getAppTables)
	 *
	 * Example:
	 * ```typescript
	 * await qb.getAppTables({
	 * 	appId: 'xxxxxxxxx'
	 * });
	 * ```
	 *
	 * @param param0.appId Quick Base Application DBID
	 * @param param0.requestOptions Override axios request configuration
	 */
	async getAppTables({ appId, requestOptions }: QuickBaseRequestGetAppTables): Promise<QuickBaseResponseTable[]> {
		return await this.request({
			url: 'tables',
			params: {
				appId: appId
			}
		}, requestOptions);
	}

	/**
	 * Get a single Quick Base Field from a Quick Base Table
	 *
	 * [Quick Base Documentation](https://www.ui.quickbase.com/ui/api-docs/operation/getField)
	 *
	 * Example:
	 * ```typescript
	 * await qb.getField({
	 * 	tableId: 'xxxxxxxxx',
	 * 	fieldId: 3
	 * });
	 * ```
	 *
	 * @param param0.tableId Quick Base Table DBID
	 * @param param0.fieldId Quick Base Field ID
	 * @param param0.requestOptions Override axios request configuration
	 */
	async getField({ tableId, fieldId, requestOptions }: QuickBaseRequestGetField): Promise<QuickBaseResponseField> {
		return await this.request({
			url: `fields/${fieldId}`,
			params: {
				tableId: tableId
			}
		}, requestOptions);
	}

	/**
	 * Get all Quick Base Fields from a Quick Base Table
	 *
	 * [Quick Base Documentation](https://www.ui.quickbase.com/ui/api-docs/operation/getFields)
	 *
	 * Example:
	 * ```typescript
	 * await qb.getFields({
	 * 	tableId: 'xxxxxxxxx'
	 * });
	 * ```
	 *
	 * @param param0.tableId Quick Base Table DBID
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

		return await this.request({
			url: 'fields',
			params: params
		}, requestOptions);
	}

	/**
	 * Get the usage of all Quick Base Fields in a Quick Base Table
	 *
	 * [Quick Base Documentation](https://www.ui.quickbase.com/ui/api-docs/operation/getFieldsUsage)
	 *
	 * Example:
	 * ```typescript
	 * await qb.getFieldsUsage({
	 * 	tableId: 'xxxxxxxxx'
	 * });
	 * ```
	 *
	 * @param param0.tableId Quick Base Table DBID
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

		return await this.request({
			url: 'fields/usage',
			params: params
		}, requestOptions);
	}

	/**
	 * Get the usage of a single Quick Base Field
	 *
	 * [Quick Base Documentation](https://www.ui.quickbase.com/ui/api-docs/operation/getFieldUsage)
	 *
	 * Example:
	 * ```typescript
	 * await qb.getFieldUsage({
	 * 	tableId: 'xxxxxxxxx',
	 * 	fieldId: 3
	 * });
	 * ```
	 *
	 * @param param0.tableId Quick Base Table DBID
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
	 * [Quick Base Documentation](https://www.ui.quickbase.com/ui/api-docs/operation/getReport)
	 *
	 * Example:
	 * ```typescript
	 * await qb.getReport({
	 * 	tableId: 'xxxxxxxxx',
	 * 	reportId: 1
	 * });
	 * ```
	 *
	 * @param param0.tableId Quick Base Table DBID
	 * @param param0.reportId Quick Base Report ID
	 * @param param0.requestOptions Override axios request configuration
	 */
	async getReport({ tableId, reportId, requestOptions }: QuickBaseRequestGetReport): Promise<QuickBaseResponseReport> {
		return await this.request({
			url: `reports/${reportId}`,
			params: {
				tableId: tableId
			}
		}, requestOptions);
	}

	/**
	 * Get the schema of a Quick Base Table
	 *
	 * [Quick Base Documentation](https://www.ui.quickbase.com/ui/api-docs/operation/getTable)
	 *
	 * Example:
	 * ```typescript
	 * await qb.getTable({
	 * 	tableId: 'xxxxxxxxx'
	 * });
	 * ```
	 *
	 * @param param0.tableId Quick Base Table DBID
	 * @param param0.requestOptions Override axios request configuration
	 */
	async getTable({ tableId, requestOptions }: QuickBaseRequestGetTable): Promise<QuickBaseResponseTable> {
		return await this.request({
			url: `tables/${tableId}`
		}, requestOptions);
	}

	/**
	 * Get all predefined reports of a Quick Base Table
	 *
	 * [Quick Base Documentation](https://www.ui.quickbase.com/ui/api-docs/operation/getTableReports)
	 *
	 * Example:
	 * ```typescript
	 * await qb.getTableReports({
	 * 	tableId: 'xxxxxxxxx'
	 * });
	 * ```
	 *
	 * @param param0.tableId Quick Base Table DBID
	 * @param param0.requestOptions Override axios request configuration
	 */
	async getTableReports({ tableId, requestOptions }: QuickBaseRequestGetTableReports): Promise<QuickBaseResponseReport[]> {
		return await this.request({
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
	 * [Quick Base Documentation](https://www.ui.quickbase.com/ui/api-docs/operation/getTempTokenDBID)
	 *
	 * @param param0.dbid Quick Base Application DBID or Table DBID
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
	 * [Quick Base Documentation](https://www.ui.quickbase.com/ui/api-docs/operation/runQuery)
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
	 * @param param0.tableId Quick Base Table DBID
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
		return await this.request({
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
	 * [Quick Base Documentation](https://www.ui.quickbase.com/ui/api-docs/operation/runReport)
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
	 * @param param0.tableId Quick Base Table DBID
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

		return await this.request({
			method: 'POST',
			url: `reports/${reportId}/run`,
			params: params
		}, requestOptions);
	}

	/**
	 * Set the internally stored `tempToken` for use in subsequent API calls
	 *
	 * @param tempToken Temporary Quick Base Authentication Token
	 * @param dbid Quick Base Application DBID or Table DBID
	 */
	setTempToken(tempToken: string, dbid?: string): QuickBase {
		this.settings.tempToken = tempToken;

		this._tempTokenTable = dbid || false;

		return this;
	}

	/**
	 * Update a Quick Base Field
	 *
	 * [Quick Base Documentation](https://www.ui.quickbase.com/ui/api-docs/operation/updateField)
	 *
	 * @param param0.tableId Quick Base Table DBID
	 * @param param0.fieldId Quick Base Field ID
	 * @param param0.label Label of field
	 * @param param0.fieldType Type of field ([Quick Base Documentation](https://help.quickbase.com/user-assistance/field_types.html))
	 * @param param0.noWrap Wrap value of field in the Quick Base UI
	 * @param param0.bold Display value of field as bold in the Quick Base UI
	 * @param param0.required Required field
	 * @param param0.appearsByDefault Set field as default in reports
	 * @param param0.findEnabled Allows field to be searchable
	 * @param param0.unique Marks field as unique
	 * @param param0.doesDataCopy Allows field value to be copied
	 * @param param0.fieldHelp Field help text
	 * @param param0.audited Allow field to be tracked by Quick Base Audit Logs
	 * @param param0.properties Field properties specific to `fieldType`
	 * @param param0.permissions Field permissions for Quick Base roles
	 * @param param0.requestOptions Override axios request configuration
	 */
	async updateField({
		tableId,
		fieldId,
		label,
		fieldType,
		noWrap,
		bold,
		required,
		appearsByDefault,
		findEnabled,
		unique,
		doesDataCopy,
		fieldHelp,
		audited,
		properties,
		permissions,
		requestOptions
	}: QuickBaseRequestUpdateField): Promise<QuickBaseResponseUpdateField> {
		const data: DataObj<QuickBaseRequestUpdateField> = {};

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

		if(typeof(required) !== 'undefined'){
			data.required = required;
		}

		if(typeof(appearsByDefault) !== 'undefined'){
			data.appearsByDefault = appearsByDefault;
		}

		if(typeof(findEnabled) !== 'undefined'){
			data.findEnabled = findEnabled;
		}

		if(typeof(unique) !== 'undefined'){
			data.unique = unique;
		}

		if(typeof(doesDataCopy) !== 'undefined'){
			data.doesDataCopy = doesDataCopy;
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

		return await this.request({
			method: 'POST',
			url: `fields/${fieldId}?tableId=${tableId}`,
			data: data
		}, requestOptions);
	}

	/**
	 * Update a Quick Base Table
	 *
	 * [Quick Base Documentation](https://www.ui.quickbase.com/ui/api-docs/operation/updateTable)
	 *
	 * @param param0.appId Quick Base Application DBID
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

		return await this.request({
			method: 'POST',
			url: `tables/${tableId}?appId=${appId}`,
			data: data
		}, requestOptions);
	}

	/**
	 * Creates or updates records in a Quick Base Table
	 *
	 * [Quick Base Documentation](https://www.ui.quickbase.com/ui/api-docs/operation/upsert)
	 *
	 * Example:
	 * ```typescript
	 * await qb.upsertRecords({
	 * 	tableId: 'xxxxxxxxx',
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
	 * @param param0.tableId Quick Base Table DBID
	 * @param param0.data Record data array
	 * @param param0.mergeFieldId Merge Field ID
	 * @param param0.fieldsToReturn An array of Field IDs to return
	 * @param param0.requestOptions Override axios request configuration
	 */
	async upsertRecords({ tableId, data, mergeFieldId, fieldsToReturn, requestOptions }: QuickBaseRequestUpsertRecords): Promise<QuickBaseResponseUpsertRecords> {
		return await this.request({
			method: 'POST',
			url: 'records',
			data: {
				to: tableId,
				data: data,
				mergeFieldId: mergeFieldId,
				fieldsToReturn: fieldsToReturn
			}
		}, requestOptions);
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
	 * const qbErr = new QuickBaseError(403, 'Access Denied', 'User token is invalid');
	 * ```
	 *
	 * @param code Error code
	 * @param message Error message
	 * @param description Error description
	 */
	constructor(public code: number, public message: string, public description?: string) {
		super(message);
	}

	/**
	 * Serialize the QuickBaseError instance into JSON
	 */
	toJSON(): QuickBaseErrorJSON {
		return {
			code: this.code,
			message: this.message,
			description: this.description
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

		return new QuickBaseError(json.code, json.message, json.description);
	}

}

/* Quick Base Interfaces */
type DataObj<T> = Partial<Omit<T, 'requestOptions'>>;

export interface QuickBaseQueryOptions {
	skip?: number;
	top?: number;
}

export interface QuickBaseSortBy {
	fieldId: number;
	order: string;
};

export interface QuickBaseGroupBy {
	fieldId: number;
	by: string;
}

export interface QuickBaseErrorJSON {
	code: number;
	message: string;
	description?: string;
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
	 * [Quick Base Documentation](https://www.ui.quickbase.com/ui/api-docs/auth)
	 */
	userToken?: string;

	/**
	 * A Temporary Authentication Token or Temporary Table Authentication Token.
	 *
	 * If both a `userToken` and `tempToken` are defined, the `tempToken` will be used
	 *
	 * [Quick Base Documentation](https://www.ui.quickbase.com/ui/api-docs/auth)
	 */
	tempToken?: string;

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

export interface QuickBaseRequestCreateField extends QuickBaseRequest, QuickBaseField {
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

export interface QuickBaseRequestUpdateField extends QuickBaseRequest, QuickBaseField {
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
	timeZone: string;
	dateFormat: string;
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
	dateFormat: string;
	keyFieldId: number;
	nextFieldId: number;
	nextRecordId: number;
	defaultSortFieldId: number;
	defaultSortOrder: string;
}

export interface QuickBaseResponseFieldPermission {
	role: string;
	roleId: number;
	permissionType: string;
}

interface QuickBaseField {
	fieldType: string;
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
	properties?: {
		defaultValue?: string;
		foreignKey?: false;
		allowNewChoices?: false;
		sortAsGiven?: false;
		carryChoices?: true;
		numLines?: number;
		maxLength?: number;
		appendOnly?: false;
		allowHTML?: false;
		width?: number;
		lookupTargetFieldId?: number;
		lookupReferenceFieldId?: number;
		displayTime?: boolean;
		displayRelative?: boolean;
		displayMonth?: string;
		defaultToday?: boolean;
		displayDayOfWeek?: boolean;
		displayTimezone?: boolean;
		doesAverage?: boolean;
		doesTotal?: boolean;
		displayImages?: boolean;
		snapshotFieldId?: number;
		blankIsZero?: boolean;
		currencySymbol?: string;
		currencyFormat?: string;
		decimalPlaces?: string;
		commaStart?: string;
		numberFormat?: string;
		formula?: string;
		displayUser?: string;
		defaultKind?: string;
		choices?: string[];
	};
	permissions?: QuickBaseResponseFieldPermission[];
}

export interface QuickBaseResponseField extends QuickBaseField {
	id: number;
}

export interface QuickBaseResponseReport {
	id: number;
	name: string;
	type: string;
	description: string;
	query: {
		tableId: string;
		filter: string;
		formulaFields: {
			formula: string;
			label: string;
			id: number;
			fieldType: string;
			decimalPrecision?: number;
		}[];
		fields: number[];
		sorting: QuickBaseSortBy[];
		grouping: QuickBaseGroupBy[];
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
	};
}

export interface QuickBaseResponseRunQuery {
	data: QuickBaseRecord[];
	fields: QuickBaseResponseField[];
	metadata: {
		numFields: number;
		numRecords: number;
		skip: number;
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
	field: {
		id: number;
		name: string;
		type: string;
	};
	usage: QuickBaseFieldUsage;
}

export interface QuickBaseResponseDeleteRecords {
	numberDeleted: number;
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
