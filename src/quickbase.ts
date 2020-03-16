'use strict';

/* Depedencies */
import merge from 'merge';
const xml = require('xml2js');
const http = require('http');
const https = require('https');
const debugRequest = require('debug')('quickbase:request');
const debugResponse = require('debug')('quickbase:response');
const Promise = require('bluebird');

/* Quick Base */
interface QuickBaseOptions {
	realm: string;
	domain?: string;
	path?: string;
	useSSL?: boolean;

	username?: string;
	password?: string;
	appToken?: string;
	userToken?: string;
	ticket?: string;

	flags?: {
		useXML?: boolean;
		msInUTC?: boolean;
		includeRids?: boolean;
		returnPercentage?: boolean;
		fmt?: string;
		encoding?: string;
		dbidAsParam?: boolean;
	};

	status?: {
		errcode?: number;
		errtext?: string;
		errdetail?: string;
	};

	reqOptions?: object;

	maxErrorRetryAttempts?: number;
	connectionLimit?: number;
	errorOnConnectionLimit?: boolean;
};

const defaults = {
	realm: 'www',
	domain: 'quickbase.com',
	path: '/',
	useSSL: true,

	username: '',
	password: '',
	appToken: '',
	userToken: '',
	ticket: '',

	flags: {
		useXML: true,
		msInUTC: true,
		includeRids: true,
		returnPercentage: false,
		fmt: 'structured',
		encoding: 'ISO-8859-1',
		dbidAsParam: false
	},

	status: {
		errcode: 0,
		errtext: 'No error',
		errdetail: ''
	},

	reqOptions: {},

	maxErrorRetryAttempts: 3,
	connectionLimit: 10,
	errorOnConnectionLimit: false
};

export class QuickBase {

	settings: QuickBaseOptions;

	constructor(options: QuickBaseOptions){
		this.settings = merge(defaults, options);
	}

	api(action: string, options?: any){

	}

}
