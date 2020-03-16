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

/* VERSIONING */
const VERSION_MAJOR = 3;
const VERSION_MINOR = 0;
const VERSION_PATCH = 0;
const VERSION = [ VERSION_MAJOR, VERSION_MINOR, VERSION_PATCH ].join('.');

/* Dependencies */
import merge from 'merge';
import * as Debug from 'debug';

import axios, {
	AxiosRequestConfig,
	AxiosResponse
} from 'axios';

const Throttle = require('generic-throttle');

/* Debug */
const debug = Debug('quickbase');
const debugRequest = Debug('quickbase:request');
const debugResponse = Debug('quickbase:response');

/* Default Settings */
export interface QuickBaseOptions {
	server?: string;
	version?: string;

	realm: string;
	userToken: string;

	userAgent?: string;

	connectionLimit?: number;
	errorOnConnectionLimit?: boolean;
}

const defaults: QuickBaseOptions = {
	server: 'api.quickbase.com',
	version: 'v1',

	realm: 'www',
	userToken: '',

	userAgent: 'node-quickbase/v' + VERSION + ' ' + (typeof(window) !== 'undefined' ? (window.navigator ? window.navigator.userAgent : '') : 'nodejs/' + process.version),

	connectionLimit: 10,
	errorOnConnectionLimit: false
};

/* Main Class */
export class QuickBase {

	static defaults = defaults;

	private _id: number = 0;
	private throttle: any; // TODO: add types for throttle

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
			baseURL: 'https://' + this.settings.server + '/' + this.settings.version,
			headers: {
				'User-Agent': this.settings.userAgent,
				'Authorization': 'QB-USER-TOKEN ' + this.settings.userToken,
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

	async getApp(appId: string, requestOptions?: AxiosRequestConfig): Promise<QuickBaseApp> {
		return await this.request({
			url: 'apps/' + appId
		}, requestOptions);
	}

	async getAppTables(appId: string, requestOptions?: AxiosRequestConfig): Promise<QuickBaseTable[]> {
		return await this.request({
			url: 'tables?appId=' + appId
		}, requestOptions);
	}

	async getFields(tableId: string, requestOptions?: AxiosRequestConfig): Promise<QuickBaseField[]> {
		return await this.request({
			url: 'fields?tableId=' + tableId
		}, requestOptions);
	}

	async getField(tableId: string, fieldId: number, requestOptions?: AxiosRequestConfig): Promise<QuickBaseField> {
		return await this.request({
			url: 'fields/' + fieldId + '?tableId=' + tableId
		}, requestOptions);
	}

	async getReport(tableId: string, reportId: number, requestOptions?: AxiosRequestConfig): Promise<QuickBaseReport> {
		return await this.request({
			url: 'reports/' + reportId + '?tableId=' + tableId
		}, requestOptions);
	}

	async getTable(tableId: string, requestOptions?: AxiosRequestConfig): Promise<QuickBaseTable> {
		return await this.request({
			url: 'tables/' + tableId
		}, requestOptions);
	}

	async getTableReports(tableId: string, requestOptions?: AxiosRequestConfig): Promise<QuickBaseReport[]> {
		return await this.request({
			url: 'reports?tableId=' + tableId
		}, requestOptions);
	}

	// TODO assign response interface
	async runReport(tableId: string, reportId: number, requestOptions?: AxiosRequestConfig): Promise<AxiosResponse> {
		return await this.request({
			url: 'reports/' + tableId + '/' + reportId + '/run'
		}, requestOptions);
	}

}

/* Quick Base Error */
export class QuickBaseError extends Error {

	constructor(public code: number, public message: string, public description?: string){
		super(message);
	}

}

/* Quick Base Interfaces */
export interface QuickBaseApp {
	id: string;
	created: number;
	updated: number;
	name: string;
	timeZone: string;
	dateFormat: string;
	variables: { name: string, value: string }[];
	hasEveryoneOnTheInternet: boolean;
}

export interface QuickBaseTable {
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

export interface QuickBaseField {
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
		defaultValue: string;
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
	}
}

export interface QuickBaseReport {
	id: string;
	name: string;
	type: string;
	description: string;
	query: {
		tableId: string;
		filter: string;
		formulaFields: any; // TODO
		fields: number[];
		sorting: any; // TODO
		grouping: any; // TODO
	},
	properties: any; // TODO
}

/* Export Dependency Interfaces */ // TODO: Do I need to do this?
export { AxiosRequestConfig } from 'axios';
