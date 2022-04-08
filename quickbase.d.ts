import http from 'http';
import Promise from 'bluebird';

export = QuickBase;

type Callback<T = any> = (err: Error | QuickBaseError | null, results: T) => void;
type ReqHook = (this: QueryBuilder, request: http.ClientRequest) => void;

declare class QuickBase {
    static checkIsArrAndConvert(obj: any): any;
    static cleanXML<T = any>(xml: any): T;
    constructor(options: Partial<QuickBaseSettings>);
    _id: number;
    className: string;
    settings: QuickBaseSettings;
    throttle: Throttle;
    api<T = any>(action: string, options?: any, callback?: Callback<T>, reqHook?: ReqHook): Promise<T>;
}

declare namespace QuickBase {
	export const QuickBase: QuickBase;
    export const QueryBuilder: QueryBuilder;
    export const Throttle: Throttle;
    export const QuickBaseError: QuickBaseError;
    export { Promise };
    export const actions: Actions;
    export const prepareOptions: PrepareOptions;
    export const xmlNodeParsers: XMLNodeParsers;
    export const className: string;
    export const defaults: QuickBaseSettings;
}

declare class Throttle {
    constructor(requestsPerPeriod?: number, periodLength?: number, errorOnLimit?: boolean);
    requestsPerPeriod: number;
    periodLength: number;
    errorOnLimit: boolean;
    _tick: NodeJS.Timeout;
    _nRequests: number;
    _times: number[];
    _pending: {
		resolve: Promise<any>;
		reject: Promise<any>;
	}[];
    _acquire(): Promise<void>;
    _testTick(): void;
    acquire(fn?: () => any): Promise<any>;
}

declare class QueryBuilder {
    constructor(parent: QuickBase, action: string, options: Partial<QuickBaseQueryOptions>, callback: Callback);
    parent: QuickBase;
    action: string;
    options: Partial<QuickBaseQueryOptions>;
    callback?: Callback;
    settings: QuickBaseSettings;
    _id: number;
    _nErr: number;
    actionRequest(): QueryBuilder;
    actionResponse(): QueryBuilder;
    addFlags(): QueryBuilder;
    catchError(err: QuickBaseError): Promise<void>;
    results: any;
    constructPayload(): QueryBuilder;
    payload: string;
    processQuery(reqHook?: ReqHook): Promise<any>;
    processOptions(): QueryBuilder;
}

declare class QuickBaseError extends Error {
    constructor(code: number, name: string, message: string, action: string);
    code: number;
    name: string;
    message: string;
    action: string;
}

declare interface Actions {
	[key: string]: {
		request?: (query: QueryBuilder) => void;
		response?: (query: QueryBuilder) => void;
	}
}

declare interface PrepareOptions {
	[key: string]: (val: any) => any
}

declare interface XMLNodeParsers {
	[key: string]: (val: any) => any
}

declare type QuickBaseQueryOptions = {
	apptoken: string;
	usertoken: string;
	ticket: string;
} & QuickBaseSettings['flags'];

declare interface QuickBaseSettings {
    realm: string;
    domain: string;
    path: string;
    useRelative: boolean;
    useSSL: boolean;
    win1252: boolean;
    username: string;
    password: string;
    appToken: string;
    userToken: string;
    ticket: string;
    flags: {
        useXML: boolean;
		msInUTC: boolean;
        includeRids: boolean;
        returnPercentage: boolean;
        fmt: string;
        encoding: string;
        dbidAsParam: boolean;
        returnHttpError: boolean;
    }
    status: {
        errcode: number;
        errtext: string;
        errdetail: string;
    }
    reqOptions: {};
    maxErrorRetryAttempts: number;
    connectionLimit: number;
    errorOnConnectionLimit: boolean;
}