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

/* TODO:
 - Get rid of any explicit anys, if possible
 - Add backwards compatibility with older API?
*/

'use strict';

/* Dependencies */
import merge from 'merge';
import { debug } from 'debug';
import { Throttle } from 'generic-throttle';
import axios, {
	AxiosRequestConfig
} from 'axios';
import { version } from '../package.json';

/* Debug */
const debugMain = debug('quickbase');
const debugRequest = debug('quickbase:request');
const debugResponse = debug('quickbase:response');

/* Globals */
const IS_BROWSER = typeof(window) !== 'undefined';

/* Main Class */
export class QuickBase {

	static readonly VERSION: string = version;
	static defaults: QuickBaseOptions = {
		server: 'api.quickbase.com',
		version: 'v1',

		realm: 'www',
		userToken: '',

		userAgent: `node-quickbase/v${version} ${IS_BROWSER ? (window.navigator ? window.navigator.userAgent : '') : 'nodejs/' + process.version}`,

		connectionLimit: 10,
		errorOnConnectionLimit: false
	};

	private _id: number = 0;
	private throttle: Throttle;

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
		this.settings = merge({}, QuickBase.defaults, options || {});

		this.throttle = new Throttle(this.settings.connectionLimit, -1, this.settings.errorOnConnectionLimit);

		debugMain('New Instance', this.settings);

		return this;
	}

	/**
	 * Returns a simple axios request configuration block
	 * 
	 * @returns Simple GET configuration with required authorization
	 */
	private getBasicRequest(): AxiosRequestConfig {
		return {
			method: 'GET',
			baseURL: `https://${this.settings.server}/${this.settings.version}`,
			headers: {
				'User-Agent': this.settings.userAgent,
				'Authorization': `QB-USER-TOKEN ${this.settings.userToken}`,
				'QB-Realm-Hostname': this.settings.realm
			}
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
	private async request(actOptions: AxiosRequestConfig, reqOptions?: AxiosRequestConfig): Promise<any> {
		return await this.throttle.acquire(async (resolve, reject) => {
			const id = 0 + (++this._id);
			const options = merge(this.getBasicRequest(), actOptions, reqOptions || {});

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

				const data = err.response.data || {
					message: 'Unknown Quick Base Error',
					details: 'We were unable to determine the true error, please check your request and try again'
				};

				const nErr = new QuickBaseError(err.response.status, data.message, data.details);

				debugResponse(id, nErr);

				reject(nErr);
			}
		});
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
	 * @param param0 API Call Parameters
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
	 * @param param0 API Call Parameters
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
	 * @param param0 API Call Parameters
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
	 * @param param0 API Call Parameters
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
	 * @param param0 API Call Parameters
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
	 * @param param0 API Call Parameters
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
	 * @param param0 API Call Parameters
	 * @param param0.tableId Quick Base Table DBID
	 * @param param0.fieldId Quick Base Field ID
	 * @param param0.requestOptions Override axios request configuration
	 */
	async getFieldUsage({ tableId, fieldId, requestOptions }: QuickBaseRequestGetFieldUsage): Promise<QuickBaseResponseFieldUsage> {
		return await this.request({
			url: `fields/usage/${fieldId}`,
			params: {
				tableId: tableId
			}
		}, requestOptions);
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
	 * @param param0 API Call Parameters
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
	 * @param param0 API Call Parameters
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
	 * @param param0 API Call Parameters
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
	 * @param param0 API Call Parameters
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
	 * @param param0 API Call Parameters
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
	 * @param param0 API Call Parameters
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
	 * @param details Error details
	 */
	constructor(public code: number, public message: string, public details?: string) {
		super(message);
	}

}

/* Quick Base Interfaces */
export interface QuickBaseOptions {
	server?: string;
	version?: string;

	realm: string;
	userToken: string;

	userAgent?: string;

	connectionLimit?: number;
	errorOnConnectionLimit?: boolean;
}

export interface QuickBaseRequest {
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
	sortBy?: {
		fieldId?: number;
		order?: string;
	}[];
	select?: number[];
	options?: {
		skip?: number;
		top?: number;
	};
	groupBy?: {
		fieldId?: number;
		by?: 'string';
	}[];
}

export interface QuickBaseRequestRunReport extends QuickBaseRequest {
	tableId: string;
	reportId: number;
	options?: {
		skip: number;
		top: number;
	};
}

export interface QuickBaseRequestUpsertRecords extends QuickBaseRequest {
	tableId: string;
	data: QuickBaseRecord[];
	mergeFieldId?: number;
	fieldsToReturn?: number[];
}

export interface QuickBaseResponseApp {
	id: string;
	created: number;
	updated: number;
	name: string;
	timeZone: string;
	dateFormat: string;
	variables: {
		name: string;
		value: string;
	}[];
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

export interface QuickBaseResponseField {
	id: number;
	fieldType: string;
	mode: string;
	label: string;
	nowrap: boolean;
	bold: boolean;
	required: boolean;
	appearsByDefault: boolean;
	findEnabled: boolean;
	unique: boolean;
	doesDataCopy: boolean;
	audited: boolean;
	properties: {
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

export interface QuickBaseResponseReport {
	id: string;
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
		sorting: {
			fieldId?: number;
			order?: string;
		}[];
		grouping: {
			fieldId?: number;
			by?: 'string';
		}[];
	};
	properties: any;
}

export interface QuickBaseRecord {
	[index: number]: {
		value: any;
	};
}

export interface QuickBaseResponseUpsertRecords {
	data: QuickBaseRecord;
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

export interface QuickBaseResponseFieldUsage {
	field: {
		id: number;
		name: string;
		type: string;
	};
	usage: {
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
	};
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
