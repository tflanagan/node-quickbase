import test from 'ava';
import * as dotenv from 'dotenv';
import { QuickBase } from '../quickbase';

dotenv.config();

const QB_REALM = process.env.QB_REALM!;
const QB_USERTOKEN = process.env.QB_USERTOKEN!;
const QB_APPID = process.env.QB_APPID!;
const QB_TABLEID = process.env.QB_TABLEID!;
const QB_FIELDID = process.env.QB_FIELDID!;

const qb = new QuickBase({
	realm: QB_REALM,
	userToken: QB_USERTOKEN
});

test('getApp()', async (t) => {
	const results = await qb.getApp({
		appId: QB_APPID
	});

	t.truthy(results.id);
});

test('getAppTables()', async (t) => {
	const results = await qb.getAppTables({
		appId: QB_APPID
	});

	t.truthy(results[0].id);
});

test('getTable()', async (t) => {
	const results = await qb.getTable({
		tableId: QB_TABLEID
	});

	t.truthy(results.id);
});

test('getTableReports()', async (t) => {
	const results = await qb.getTableReports({
		tableId: QB_TABLEID
	});

	t.truthy(results[0].id);
});

test('getReport()', async (t) => {
	const results = await qb.getReport({
		tableId: QB_TABLEID,
		reportId: 1
	});

	t.truthy(results.id);
});

test('getField()', async (t) => {
	const results = await qb.getField({
		tableId: QB_TABLEID,
		fieldId: 1
	});

	t.truthy(results.id);
});

test('getFields()', async (t) => {
	const results = await qb.getFields({
		tableId: QB_TABLEID
	});

	t.truthy(results[0].id);
});

test('getFieldUsage()', async (t) => {
	const results = await qb.getFieldUsage({
		tableId: QB_TABLEID,
		fieldId: 1
	});

	t.truthy(results.field.id);
});

test('getFieldsUsage()', async (t) => {
	const results = await qb.getFieldsUsage({
		tableId: QB_TABLEID
	});

	t.truthy(results[0].field.id);
});

test('runQuery()', async (t) => {
	const results = await qb.runQuery({
		tableId: QB_TABLEID,
		query: {
			where: "{'3'.XEX.''}",
			select: [3]
		}
	});

	t.truthy(results.fields[0].id);
});

test('runReport()', async (t) => {
	const results = await qb.runReport({
		tableId: QB_TABLEID,
		reportId: 1
	});

	t.truthy(results.fields[0].id);
});

let newRid: number;

test.serial('upsertRecords()', async (t) => {
	const results = await qb.upsertRecords({
		tableId: QB_TABLEID,
		data: [
			{
				[QB_FIELDID]: {
					value: 'test value'
				}
			}
		]
	});

	newRid = results.metadata.createdRecordIds[0];

	t.truthy(newRid);
});

test.serial('deleteRecords()', async (t) => {
	if(!newRid){
		return t.fail('upsertRecords() failed, no record to delete');
	}

	const results = await qb.deleteRecords({
		tableId: QB_TABLEID,
		where: `{'3'.EX.'${newRid}'}`
	});

	t.truthy(results.numberDeleted);
});
