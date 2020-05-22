'use strict';

/* Dependencies */
import * as dotenv from 'dotenv';
import { serial as test } from 'ava';
import { QuickBase, QuickBaseOptions } from '../quickbase';

/* Tests */
dotenv.config();

const QB_REALM = process.env.QB_REALM!;
const QB_USERTOKEN = process.env.QB_USERTOKEN!;

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

const testValue: string = 'test value' // - б, в, г, д, ж, з, к, л, м, н, п, р, с, т, ф, х, ц, ч, ш, щ, а, э, ы, у, о, я, е, ё, ю, и';

let newAppId: string;
let newDbid: string;
let newFid: number;
let newRid: number;

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
	if(!newDbid){
		return t.pass();
	}

	const results = await qb.deleteTable({
		appId: newAppId,
		tableId: newDbid
	});

	t.truthy(results.deletedTableId === newDbid);
});

test.after.always('deleteApp()', async (t) => {
	if(!newAppId){
		return t.pass();
	}

	const results = await qb.deleteApp({
		appId: newAppId,
		name: 'Test Node Quick Base Application'
	});

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

test('createTable()', async (t) => {
	const results = await qb.createTable({
		appId: newAppId,
		name: 'Test Name',
		description: 'Test Description'
	});

	newDbid = results.id;

	t.truthy(newDbid && results.name === 'Test Name');
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
	const results = await qb.createField({
		tableId: newDbid,
		fieldType: 'text',
		label: 'Test Field'
	});

	newFid = results.id;

	t.truthy(newFid && results.label === 'Test Field');
});

test('updateField()', async (t) => {
	const results = await qb.updateField({
		tableId: newDbid,
		fieldId: newFid,
		label: 'Test Field 2',
		appearsByDefault: true
	});

	t.truthy(results.label === 'Test Field 2');
});

test('getField()', async (t) => {
	const results = await qb.getField({
		tableId: newDbid,
		fieldId: newFid
	});

	t.truthy(results.id && results.label === 'Test Field 2');
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
	const results = await qb.upsertRecords({
		tableId: newDbid,
		data: [
			{
				[newFid]: {
					value: testValue
				}
			}
		]
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

	t.truthy(results.fields[0].id === newFid && results.data[0][newFid].value === testValue);
});

test('runReport()', async (t) => {
	const results = await qb.runReport({
		tableId: newDbid,
		reportId: 1
	});

	t.truthy(results.data[0][newFid].value === testValue);
});
