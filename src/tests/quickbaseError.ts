'use strict';

/* Dependencies */
import ava from 'ava';
import { QuickBaseError } from '../quickbase';

/* Tests */
const errObj = {
	code: 403,
	message: 'Access Denied',
	description: 'User token is invalid',
	rayId: 'xxxx'
};

const qbErr = new QuickBaseError(errObj.code, errObj.message, errObj.description, errObj.rayId);

ava.serial('QuickBaseError', async (t) => {
	return t.truthy(qbErr.code === errObj.code && qbErr.message === errObj.message && qbErr.description === errObj.description && qbErr.rayId === errObj.rayId);
});

ava.serial('toJSON()', async (t) => {
	return t.truthy(JSON.stringify(qbErr.toJSON()) === JSON.stringify(errObj));
});

ava.serial('fromJSON()', async (t) => {
	qbErr.fromJSON(errObj);

	return t.truthy(JSON.stringify(qbErr.toJSON()) === JSON.stringify(errObj));
});

ava.serial('FromJSON()', async (t) => {
	const nQbErr = QuickBaseError.fromJSON(errObj);

	return t.truthy(JSON.stringify(nQbErr.toJSON()) === JSON.stringify(errObj));
});
