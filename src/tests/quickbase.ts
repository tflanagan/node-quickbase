'use strict';

/* Dependencies */
import * as dotenv from 'dotenv';
import ava from 'ava';

import { QuickBase, QuickBaseOptions } from '../quickbase';

/* Tests */
dotenv.config();

const QB_REALM = process.env.QB_REALM;
const QB_USERTOKEN = process.env.QB_USERTOKEN;

if(!QB_REALM || !QB_USERTOKEN){
	throw new Error('Please check your .env file');
}

const TEST_UTF_16 = process.env.TEST_UTF_16 === 'true';
const TEST_FILE = process.env.TEST_FILE === 'true';

const qbOptions: QuickBaseOptions = {
	server: 'api.quickbase.com',
	version: 'v1',

	realm: QB_REALM,
	userToken: QB_USERTOKEN,
	tempToken: '',
	tempTokenDbid: '',
	appToken: '',

	userAgent: 'Testing',

	autoRenewTempTokens: true,

	connectionLimit: 10,
	connectionLimitPeriod: 1000,
	errorOnConnectionLimit: false,
	retryOnQuotaExceeded: true,

	proxy: false
};

const qb = new QuickBase(qbOptions);

const testValue: string = 'test value' + (TEST_UTF_16 ? ' б, в, г, д, ж, з, к, л, м, н, п, р, с, т, ф, х, ц, ч, ш, щ, а, э, ы, у, о, я, е, ё, ю, и' : '');
const testFile: string = 'SGVsbG8gV29ybGQhDQo=';

let newAppId: string;
let copiedAppId: string;
let newDbid: string;
let newChildDbid: string;
let newFid: number;
let newFileFid: number;
let newRid: number;
let newRelationship: number;

ava.serial.after.always('deleteRecords()', async (t) => {
	if(!newRid){
		return t.pass();
	}

	const results = await qb.deleteRecords({
		tableId: newDbid,
		where: `{'3'.EX.'${newRid}'}`
	});

	return t.truthy(results.numberDeleted);
});

ava.serial.after.always('deleteFields()', async (t) => {
	if(!newFid){
		return t.pass();
	}

	const results = await qb.deleteFields({
		tableId: newDbid,
		fieldIds: [ newFid ]
	});

	return t.truthy(results.deletedFieldIds[0] === newFid);
});

ava.serial.after.always('deleteTable()', async (t) => {
	if(!newDbid && !newChildDbid){
		return t.pass();
	}

	let results = true;

	if(newDbid){
		if((await qb.deleteTable({
			appId: newAppId,
			tableId: newDbid
		})).deletedTableId !== newDbid){
			results = false;
		}
	}

	if(newChildDbid){
		if((await qb.deleteTable({
			appId: newAppId,
			tableId: newChildDbid
		})).deletedTableId !== newChildDbid){
			results = false;
		}
	}

	return t.truthy(results);
});

ava.serial.after.always('deleteApp()', async (t) => {
	if(!newAppId){
		return t.pass();
	}

	const results = await qb.deleteApp({
		appId: newAppId,
		name: 'Test Node Quick Base Application'
	});

	if(copiedAppId){
		await qb.deleteApp({
			appId: copiedAppId,
			name: 'New Copy Application'
		});
	}

	return t.truthy(results.deletedAppId === newAppId);
});

ava.serial('toJSON()', async (t) => {
	return t.truthy(JSON.stringify(qb.toJSON()) === JSON.stringify(qbOptions));
});

ava.serial('fromJSON()', async (t) => {
	qb.fromJSON(qbOptions);

	return t.truthy(JSON.stringify(qb.toJSON()) === JSON.stringify(qbOptions));
});

ava.serial('FromJSON()', async (t) => {
	const nQb = QuickBase.fromJSON(qbOptions);

	return t.truthy(JSON.stringify(nQb.toJSON()) === JSON.stringify(qbOptions));
});

ava.serial('createApp()', async (t) => {
	const results = await qb.createApp({
		name: 'Test Node Quick Base Application',
		assignToken: true
	});

	newAppId = results.id;

	return t.truthy(newAppId && results.name === 'Test Node Quick Base Application');
});

ava.serial('updateApp()', async (t) => {
	const results = await qb.updateApp({
		appId: newAppId,
		description: 'Test Node Quick Base Application',
		variables: [{
			name: 'Test Variable',
			value: 'Test Value'
		}]
	});

	return t.truthy(results.description === 'Test Node Quick Base Application');
});

ava.serial('getApp()', async (t) => {
	const results = await qb.getApp({
		appId: newAppId
	});

	return t.truthy(results.id);
});

ava.serial('getAppEvents()', async (t) => {
	const results = await qb.getAppEvents({
		appId: newAppId
	});

	// TODO: need some way to create an event

	return t.truthy(results.length === 0);
});

ava.serial('copyApp()', async (t) => {
	const results = await qb.copyApp({
		appId: newAppId,
		name: 'New Copy Application',
		description: 'A copy of the first application',
		properties: {
			keepData: true,
			assignUserToken: true,
			excludeFiles: false,
			usersAndRoles: true
		}
	});

	copiedAppId = results.id;

	return t.truthy(results.id);
});

ava.serial('createTable()', async (t) => {
	const results = await qb.createTable({
		appId: newAppId,
		name: 'Test Name',
		description: 'Test Description'
	});

	newDbid = results.id;

	return t.truthy(newDbid && results.name === 'Test Name');
});

ava.serial('createTable() - child', async (t) => {
	const results = await qb.createTable({
		appId: newAppId,
		name: 'Test Child Table',
		description: 'Child table for testing relationships'
	});

	newChildDbid = results.id;

	return t.truthy(newChildDbid && results.name === 'Test Child Table');
});

ava.serial('getAppTables()', async (t) => {
	const results = await qb.getAppTables({
		appId: newAppId
	});

	return t.truthy(results[0].id);
});

ava.serial('updateTable()', async (t) => {
	const results = await qb.updateTable({
		appId: newAppId,
		tableId: newDbid,
		name: 'New Name'
	});

	return t.truthy(results.name === 'New Name' && results.description === 'Test Description');
});

ava.serial('getTable()', async (t) => {
	const results = await qb.getTable({
		appId: newAppId,
		tableId: newDbid
	});

	return t.truthy(results.id === newDbid);
});

ava.serial('getTableReports()', async (t) => {
	const results = await qb.getTableReports({
		tableId: newDbid
	});

	return t.truthy(results[0].id);
});

ava.serial('getReport()', async (t) => {
	const results = await qb.getReport({
		tableId: newDbid,
		reportId: '1'
	});

	return t.truthy(results.id);
});

ava.serial('createField()', async (t) => {
	let results;

	if(TEST_FILE){
		results = await qb.createField({
			tableId: newDbid,
			fieldType: 'file',
			label: 'Test Field'
		});

		newFileFid = results.id;

		if(!newFileFid){
			return t.fail('Unable to create File field');
		}
	}

	results = await qb.createField({
		tableId: newDbid,
		fieldType: 'text',
		label: 'Test Field',
		noWrap: false,
		bold: false,
		appearsByDefault: false,
		findEnabled: false,
		fieldHelp: 'Test Help',
		addToForms: false,
		audited: false,
		properties: {
			maxLength: 0,
			appendOnly: true,
			defaultValue: 'Test value',
			comments: 'Test Comment'
		}
	});

	newFid = results.id;

	return t.truthy(newFid && results.label === 'Test Field');
});

ava.serial('updateField()', async (t) => {
	const results = await qb.updateField({
		tableId: newDbid,
		fieldId: newFid,
		label: 'Test Field 2',
		noWrap: true,
		bold: true,
		unique: true,
		required: true,
		appearsByDefault: true,
		findEnabled: true,
		fieldHelp: 'Test Help 2',
		addToForms: true,
		properties: {
			maxLength: 255,
			appendOnly: false,
			defaultValue: 'Test value 2'
		}
	});

	return t.truthy(results.label === 'Test Field 2');
});

ava.serial('getField()', async (t) => {
	const results = await qb.getField({
		tableId: newDbid,
		fieldId: newFid
	});

	return t.truthy(results.id);
});

ava.serial('getFields()', async (t) => {
	const results = await qb.getFields({
		tableId: newDbid
	});

	return t.truthy(results[0].id === newFid);
});

ava.serial('getFieldUsage()', async (t) => {
	const results = await qb.getFieldUsage({
		tableId: newDbid,
		fieldId: newFid
	});

	return t.truthy(results[0].field.id === newFid);
});

ava.serial('getFieldsUsage()', async (t) => {
	const results = await qb.getFieldsUsage({
		tableId: newDbid
	});

	return t.truthy(results[0].field.id === newFid);
});

ava.serial('upsert()', async (t) => {
	const record: Record<string, { value: any }> = {
		[newFid]: {
			value: testValue
		}
	};

	if(TEST_FILE){
		record[newFileFid] = {
			value: {
				fileName: "hello world.txt",
				data: testFile
			}
		};
	}

	const results = await qb.upsert({
		tableId: newDbid,
		data: [ record ]
	});

	newRid = results.metadata.createdRecordIds[0];

	return t.truthy(newRid);
});

ava.serial('runQuery()', async (t) => {
	const results = await qb.runQuery({
		tableId: newDbid,
		where: "{'3'.XEX.''}",
		select: [ newFid ]
	});

	return t.truthy(results.fields[0].id === newFid && results.data[0][newFid].value === testValue, `Expected values did not match: ${testValue} !== ${results.data[0][newFid].value}`);
});

ava.serial('runReport()', async (t) => {
	const results = await qb.runReport({
		tableId: newDbid,
		reportId: '1'
	});

	return t.truthy(results.data[0][newFid].value === testValue);
});

ava.serial('runReport() - returnAxios', async (t) => {
	const {
		data
	} = await qb.runReport({
		tableId: newDbid,
		reportId: '1',
		returnAxios: true
	});

	return t.truthy(data.data[0][newFid].value === testValue);
});

ava.serial('createRelationship()', async (t) => {
	const results = await qb.createRelationship({
		parentTableId: newDbid,
		childTableId: newChildDbid,
		foreignKeyField: {
			label: 'Related Parent'
		},
		lookupFieldIds: [ 6 ],
		summaryFields: [{
			label: 'Max Child Record ID#',
			summaryFid: 3,
			accumulationType: 'MAX'
		}]
	});

	newRelationship = results.id;

	return t.truthy(results.foreignKeyField.label === 'Related Parent');
});

ava.serial('updateRelationship()', async (t) => {
	const results = await qb.updateRelationship({
		relationshipId: newRelationship,
		childTableId: newChildDbid,
		lookupFieldIds: [ 1 ]
	});

	return t.truthy(newRelationship === results.id);
});

ava.serial('getRelationships()', async (t) => {
	const results = await qb.getRelationships({
		childTableId: newChildDbid
	});

	return t.truthy(newRelationship === results.relationships[0].id);
});

ava.serial('deleteRelationship()', async (t) => {
	const results = await qb.deleteRelationship({
		relationshipId: newRelationship,
		childTableId: newChildDbid
	});

	return t.truthy(newRelationship === results.relationshipId);
});

if(TEST_FILE){
	ava.serial('downloadFile()', async (t) => {
		const results = await qb.downloadFile({
			tableId: newDbid,
			fieldId: newFileFid,
			recordId: newRid,
			versionNumber: 0
		});

		return t.truthy(results);
	});

	ava.serial('deleteFile()', async (t) => {
		const results = await qb.deleteFile({
			tableId: newDbid,
			fieldId: newFileFid,
			recordId: newRid,
			versionNumber: 0
		});

		return t.truthy(results.fileName);
	});
}
