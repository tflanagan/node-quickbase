'use strict';

/* Dependencies */
import * as dotenv from 'dotenv';
import { serial as test } from 'ava';
import { QuickBase, QuickBaseOptions, QuickBaseRecord } from '../quickbase';

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
	appToken: '',

	userAgent: 'Testing',

	autoConsumeTempTokens: true,
	autoRenewTempTokens: true,

	connectionLimit: 10,
	connectionLimitPeriod: 1000,
	errorOnConnectionLimit: false,

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

test.after.always('deleteRecords()', async (t) => {
	if(!newRid){
		return t.pass();
	}

	const results = await qb.deleteRecords({
		tableId: newDbid,
		where: `{'3'.EX.'${newRid}'}`
	});

	t.truthy(results.numberDeleted);
});

test.after.always('deleteFields()', async (t) => {
	if(!newFid){
		return t.pass();
	}

	const results = await qb.deleteFields({
		tableId: newDbid,
		fieldIds: [ newFid ]
	});

	t.truthy(results.deletedFieldIds[0] === newFid);
});

test.after.always('deleteTable()', async (t) => {
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

	t.truthy(results);
});

test.after.always('deleteApp()', async (t) => {
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

	t.truthy(results.deletedAppId === newAppId);
});

test('toJSON()', async (t) => {
	t.truthy(JSON.stringify(qb.toJSON()) === JSON.stringify(qbOptions));
});

test('fromJSON()', async (t) => {
	qb.fromJSON(qbOptions);

	t.truthy(JSON.stringify(qb.toJSON()) === JSON.stringify(qbOptions));
});

test('FromJSON()', async (t) => {
	const nQb = QuickBase.fromJSON(qbOptions);

	t.truthy(JSON.stringify(nQb.toJSON()) === JSON.stringify(qbOptions));
});

test('createApp()', async (t) => {
	const results = await qb.createApp({
		name: 'Test Node Quick Base Application',
		assignToken: true
	});

	newAppId = results.id;

	t.truthy(newAppId && results.name === 'Test Node Quick Base Application');
});

test('updateApp()', async (t) => {
	const results = await qb.updateApp({
		appId: newAppId,
		description: 'Test Node Quick Base Application',
		variables: [{
			name: 'Test Variable',
			value: 'Test Value'
		}]
	});

	t.truthy(results.description === 'Test Node Quick Base Application');
});

test('getApp()', async (t) => {
	const results = await qb.getApp({
		appId: newAppId
	});

	t.truthy(results.id);
});

test('copyApp()', async (t) => {
	const results = await qb.copyApp({
		appId: newAppId,
		name: 'New Copy Application',
		description: 'A copy of the first application',
		properties: {
			keepData: true
		}
	});

	t.truthy(results.id);
});

test('createTable()', async (t) => {
	const results = await qb.createTable({
		appId: newAppId,
		name: 'Test Name',
		description: 'Test Description'
	});

	newDbid = results.id;

	t.truthy(newDbid && results.name === 'Test Name');
});

test('createTable() - child', async (t) => {
	const results = await qb.createTable({
		appId: newAppId,
		name: 'Test Child Table',
		description: 'Child table for testing relationships'
	});

	newChildDbid = results.id;

	t.truthy(newChildDbid && results.name === 'Test Child Table');
});

test('getAppTables()', async (t) => {
	const results = await qb.getAppTables({
		appId: newAppId
	});

	t.truthy(results[0].id);
});

test('updateTable()', async (t) => {
	const results = await qb.updateTable({
		appId: newAppId,
		tableId: newDbid,
		name: 'New Name'
	});

	t.truthy(results.name === 'New Name' && results.description === 'Test Description');
});

test('getTable()', async (t) => {
	const results = await qb.getTable({
		appId: newAppId,
		tableId: newDbid
	});

	t.truthy(results.id === newDbid);
});

test('getTableReports()', async (t) => {
	const results = await qb.getTableReports({
		tableId: newDbid
	});

	t.truthy(results[0].id);
});

test('getReport()', async (t) => {
	const results = await qb.getReport({
		tableId: newDbid,
		reportId: 1
	});

	t.truthy(results.id);
});

test('createField()', async (t) => {
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

	t.truthy(newFid && results.label === 'Test Field');
});

test('updateField()', async (t) => {
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

	t.truthy(results.label === 'Test Field 2');
});

test('getField()', async (t) => {
	const results = await qb.getField({
		tableId: newDbid,
		fieldId: newFid
	});

	t.truthy(results.id);
});

test('getFields()', async (t) => {
	const results = await qb.getFields({
		tableId: newDbid
	});

	t.truthy(results[0].id === newFid);
});

test('getFieldUsage()', async (t) => {
	const results = await qb.getFieldUsage({
		tableId: newDbid,
		fieldId: newFid
	});

	t.truthy(results.field.id === newFid);
});

test('getFieldsUsage()', async (t) => {
	const results = await qb.getFieldsUsage({
		tableId: newDbid
	});

	t.truthy(results[0].field.id === newFid);
});

test('upsertRecords()', async (t) => {
	const record: QuickBaseRecord = {
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

	const results = await qb.upsertRecords({
		tableId: newDbid,
		data: [ record ]
	});

	newRid = results.metadata.createdRecordIds[0];

	t.truthy(newRid);
});

test('runQuery()', async (t) => {
	const results = await qb.runQuery({
		tableId: newDbid,
		where: "{'3'.XEX.''}",
		select: [ newFid ]
	});

	t.truthy(results.fields[0].id === newFid && results.data[0][newFid].value === testValue, `Expected values did not match: ${testValue} !== ${results.data[0][newFid].value}`);
});

test('runReport()', async (t) => {
	const results = await qb.runReport({
		tableId: newDbid,
		reportId: 1
	});

	t.truthy(results.data[0][newFid].value === testValue);
});

test('createRelationship()', async (t) => {
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

	t.truthy(results.foreignKeyField.label === 'Related Parent');
});

test('updateRelationship()', async (t) => {
	const results = await qb.updateRelationship({
		relationshipId: newRelationship,
		childTableId: newChildDbid,
		lookupFieldIds: [ 1 ]
	});

	t.truthy(newRelationship === results.id);
});

test('getRelationships()', async (t) => {
	const results = await qb.getRelationships({
		childTableId: newChildDbid
	});

	t.truthy(newRelationship === results.relationships[0].id);
});

test('deleteRelationship()', async (t) => {
	const results = await qb.deleteRelationship({
		relationshipId: newRelationship,
		childTableId: newChildDbid
	});

	t.truthy(newRelationship === results.relationshipId);
});

if(TEST_FILE){
	test('downloadFile()', async (t) => {
		const results = await qb.downloadFile({
			tableId: newDbid,
			fieldId: newFileFid,
			recordId: newRid,
			versionNumber: 0
		});

		t.truthy(results.data);
	});

	test('deleteFile()', async (t) => {
		const results = await qb.deleteFile({
			tableId: newDbid,
			fieldId: newFileFid,
			recordId: newRid,
			versionNumber: 0
		});

		t.truthy(results.fileName);
	});
}
