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

const getRetryDelay = (headers: {
	'retry-after'?: string;
	'x-ratelimit-reset'?: string;
}) => {
	const retryAfter = headers['retry-after'];

	if(retryAfter){
		let retryDelay = Math.round(parseFloat(retryAfter) * 1000);

		if (isNaN(retryDelay)) {
			retryDelay = Math.max(0, new Date(retryAfter).valueOf() - new Date().valueOf());
		}

		return retryDelay;
	}

	return +(headers['x-ratelimit-reset'] || 10000);
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
		scheme: 'https',
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

	private assignAuthorizationHeaders(headers?: AxiosRequestConfig['headers'], addToken = true) {
		if(!headers){
			headers = {};
		}

		if(this.settings.userToken){
			if(addToken){
				headers.Authorization = `QB-USER-TOKEN ${this.settings.userToken}`;
			}
		}else{
			if(this.settings.appToken){
				headers['QB-App-Token'] = this.settings.appToken;
			}

			if(addToken && this.settings.tempToken){
				headers.Authorization = `QB-TEMP-TOKEN ${this.settings.tempToken}`;
			}
		}

		return headers;
	}

	private getBaseRequest(){
		return {
			method: 'GET',
			baseURL: `${this.settings.scheme}://${this.settings.server}/${this.settings.version}`,
			headers: {
				'Content-Type': 'application/json; charset=UTF-8',
				[IS_BROWSER ? 'X-User-Agent' : 'User-Agent']: `${this.settings.userAgent} node-quickbase/v${VERSION} ${IS_BROWSER ? (window.navigator ? window.navigator.userAgent : '') : 'nodejs/' + process.version}`.trim(),
				'QB-Realm-Hostname': this.settings.realm
			},
			proxy: this.settings.proxy
		};
	}

	private async request<T = any>(options: AxiosRequestConfig, attempt = 0): Promise<AxiosResponse<T>> {
		const id = 0 + (++this._id);

		try {
			debugRequest(id, options);

			options.headers = this.assignAuthorizationHeaders(options.headers, !options.url?.startsWith('/auth/temporary'));

			const results = await axios.request<T>(options);

			debugResponse(id, results);

			return results;
		}catch(err: any){
			if(err.response){
				const headers = objKeysToLowercase<{
					'x-ratelimit-reset': string;
					'retry-after': string;
					'qb-api-ray': string;
				}>(err.response.headers);

				const qbErr = new QuickBaseError(
					err.response.status,
					err.response.data.message,
					err.response.data.description,
					headers['qb-api-ray']
				);

				debugResponse(id, 'Quickbase Error', qbErr);

				if(this.settings.retryOnQuotaExceeded && qbErr.code === 429){
					const delayMs = getRetryDelay(headers);

					debugResponse(id, `Waiting ${delayMs}ms until retrying...`);

					await delay(delayMs);

					debugResponse(id, `Retrying...`);

					return await this.request<T>(options);
				}

				if(attempt >= 3){
					throw qbErr;
				}

				const errDescription = '' + (qbErr.description || '');

				if(this.settings.autoRenewTempTokens && this.settings.tempTokenDbid && (
					errDescription.match(/Your ticket has expired/i)
					||
					errDescription.match(/Invalid Authorization/i)
					||
					errDescription.match(/Required header 'authorization' not found/i)
				)){
					debugResponse(id, `Getting new temporary ticket for ${this.settings.tempTokenDbid}...`);

					const results = await this.request(merge.all([
						this.getBaseRequest(),
						{
							url: `auth/temporary/${this.settings.tempTokenDbid}`,
							withCredentials: true
						}
					]), attempt + 1);

					this.setTempToken(this.settings.tempTokenDbid, results.data.temporaryAuthorization);

					debugResponse(id, `Retrying...`);

					return await this.request<T>(options, attempt + 1);
				}

				throw qbErr;
			}

			debugResponse(id, 'Error', err);

			throw err;
		}
	}

	// @ts-ignore/@remove-line - `api` is consumed by the genarated code, typescript doesn't know this
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

//** API CALLS **//

}

/* Types */
export type QuickBaseOptions = Partial<{
	/**
	 * Quickbase API Server scheme
	 *
	 * Default is `https`
	 */
	scheme: string;

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

//** REQUEST TYPES **//

//** RESPONSE TYPES **//

/* Export to Browser */
if(IS_BROWSER){
	window.QuickBase = exports;
}
