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
 - Add explicit types for generic-throttle
 - Add explicit types for QuickBaseResponseReport
 - Add tests
 - Add backwards compatibility with older API
*/

'use strict';

/* Dependencies */
import merge from 'merge';
import * as Debug from 'debug';

import axios, {
	AxiosRequestConfig
} from 'axios';

const Throttle = require('generic-throttle');

/* Debug */
const debug = Debug('quickbase');
const debugRequest = Debug('quickbase:request');
const debugResponse = Debug('quickbase:response');

/* Globals */
const VERSION = require('../package.json').version;
const IS_BROWSER = typeof(window) !== 'undefined';

/* Main Class */
export class QuickBase {

	static VERSION = VERSION;
	static defaults: QuickBaseOptions = {
		server: 'api.quickbase.com',
		version: 'v1',

		realm: 'www',
		userToken: '',

		userAgent: `node-quickbase/v${VERSION} ${IS_BROWSER ? (window.navigator ? window.navigator.userAgent : '') : 'nodejs/' + process.version}`,

		connectionLimit: 10,
		errorOnConnectionLimit: false
	};

	private _id: number = 0;
	private throttle: any;

	public settings: QuickBaseOptions;

	constructor(options?: QuickBaseOptions){
		this.settings = merge({}, QuickBase.defaults, options || {});

		this.throttle = new Throttle(this.settings.connectionLimit, -1, this.settings.errorOnConnectionLimit);

		debug('New Instance', this.settings);

		return this;
	}

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

	private async request(actOptions: AxiosRequestConfig, reqOptions?: AxiosRequestConfig): Promise<any> {
		try {
			await this.throttle.acquire();
		}catch(err){
			debug('Throttle Error', err);

			throw err;
		}
		
		const id = 0 + (++this._id);
		const options = merge(this.getBasicRequest(), actOptions, reqOptions || {});

		debugRequest(id, options);

		try {
			const results = (await axios.request(options)).data;

			debugResponse(id, results);

			return results;
		}catch(err){
			if(!err.isAxiosError || !err.response){
				debugResponse(id, err);

				throw err;
			}

			const data = err.response.data || {
				message: 'Unknown Quick Base Error'
			};

			const nErr = new QuickBaseError(err.response.status, data.message, data.description);

			debugResponse(id, nErr);

			throw nErr;
		}
	}

	async deleteRecord({ tableId, where, requestOptions }: QuickBaseRequestDeleteRecord): Promise<QuickBaseResponseDelete> {
		return await this.request({
			method: 'DELETE',
			url: 'records',
			data: {
				from: tableId,
				where: where
			}
		}, requestOptions);
	}

	async getApp({ appId, requestOptions }: QuickBaseRequestGetApp): Promise<QuickBaseResponseApp> {
		return await this.request({
			url: `apps/${appId}`
		}, requestOptions);
	}

	async getAppTables({ appId, requestOptions }: QuickBaseRequestGetAppTables): Promise<QuickBaseResponseTable[]> {
		return await this.request({
			url: 'tables',
			params: {
				appId: appId
			}
		}, requestOptions);
	}

	async getField({ tableId, fieldId, requestOptions }: QuickBaseRequestGetField): Promise<QuickBaseResponseField> {
		return await this.request({
			url: `fields/${fieldId}`,
			params: {
				tableId: tableId
			}
		}, requestOptions);
	}

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

	async getFieldUsage({ tableId, fieldId, requestOptions }: QuickBaseRequestGetFieldUsage): Promise<QuickBaseResponseFieldUsage[]> {
		return await this.request({
			url: `fields/usage/${fieldId}`,
			params: {
				tableId: tableId
			}
		}, requestOptions);
	}

	async getReport({ tableId, reportId, requestOptions }: QuickBaseRequestGetReport): Promise<QuickBaseResponseReport> {
		return await this.request({
			url: `reports/${reportId}`,
			params: {
				tableId: tableId
			}
		}, requestOptions);
	}

	async getTable({ tableId, requestOptions }: QuickBaseRequestGetTable): Promise<QuickBaseResponseTable> {
		return await this.request({
			url: `tables/${tableId}`
		}, requestOptions);
	}

	async getTableReports({ tableId, requestOptions }: QuickBaseRequestGetTableReports): Promise<QuickBaseResponseReport[]> {
		return await this.request({
			url: 'reports',
			params: {
				tableId: tableId
			}
		}, requestOptions);
	}

	async runQuery({ tableId, query, requestOptions }: QuickBaseRequestRunQuery): Promise<QuickBaseResponseRunQuery> {
		query.from = tableId;

		return await this.request({
			method: 'POST',
			url: 'records/query',
			data: query
		}, requestOptions);
	}

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

	async upsertRecords({ tableId, data, mergeFieldId, requestOptions }: QuickBaseRequestUpsertRecords): Promise<QuickBaseResponseUpsertRecords> {
		return await this.request({
			method: 'POST',
			url: 'records',
			data: {
				to: tableId,
				data: data,
				mergeFieldId: mergeFieldId
			}
		}, requestOptions);
	}

}

/* Quick Base Error */
export class QuickBaseError extends Error {

	constructor(public code: number, public message: string, public description?: string) {
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

export interface QuickBaseRequestDeleteRecord extends QuickBaseRequest {
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
	query: QuickBaseQuery;
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
		formulaFields: any;
		fields: number[];
		sorting: any;
		grouping: any;
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

export interface QuickBaseResponseDelete {
	numberDeleted: number;
}

export interface QuickBaseQuery {
	from?: string;
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

/* Export Supporting Types/Classes */
export {
	AxiosRequestConfig
} from 'axios';

/* Export to Browser */
if(IS_BROWSER){
	// TypeScript doesn't perform typecheck on string properties
	window['QuickBase'] = QuickBase;
}
