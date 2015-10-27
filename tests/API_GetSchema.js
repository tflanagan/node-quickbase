/* Copyright 2014 Tristian Flanagan
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

/* Dependencies */
const QuickBase = require('../');
const common = require('./_common.js');

/* Expected Structures */
const expectedGetSchema = {
	action: 'API_GetSchema',
	errcode: 0,
	errtext: 'No error',
	time_zone: '',
	date_format: '',
	table: {
		name: '',
		original: {
			table_id: '',
			app_id: '',
			cre_date: 0,
			mod_date: 0,
			next_record_id: 0,
			next_field_id: 0,
			next_query_id: 0,
			def_sort_fid: 0,
			def_sort_order: 0
		},
		variables: {
			test: ''
		},
		queries: [
			{
				id: 1,
				qycalst: 0,
				qyopts: 'nos.',
				qytype: 'table',
				qyname: 'List All'
			}, {
				id: 2,
				qycalst: 0,
				qyopts: 'so-D.onlynew.nos.',
				qytype: 'table',
				qyname: 'List Changes',
				qydesc: 'Sorted by Date Modified',
				qyslst: 2
			}
		],
		fields: [
			{
				label: 'Date Created',
				nowrap: 1,
				bold: 0,
				required: 0,
				appears_by_default: 0,
				find_enabled: 0,
				allow_new_choices: 0,
				sort_as_given: 1,
				carrychoices: 1,
				foreignkey: 0,
				unique: 0,
				doesdatacopy: 0,
				fieldhelp: '',
				allowInRecTemplate: 0,
				display_time: 1,
				display_relative: 0,
				display_month: 'number',
				default_today: 0,
				display_dow: 0,
				display_zone: 0,
				id: 1,
				field_type: 'timestamp',
				base_type: 'int64',
				role: 'created'
			}, {
				label: 'Date Modified',
				nowrap: 1,
				bold: 0,
				required: 0,
				appears_by_default: 0,
				find_enabled: 0,
				allow_new_choices: 0,
				sort_as_given: 1,
				carrychoices: 1,
				foreignkey: 0,
				unique: 0,
				doesdatacopy: 0,
				fieldhelp: '',
				allowInRecTemplate: 0,
				display_time: 1,
				display_relative: 0,
				display_month: 'number',
				default_today: 0,
				display_dow: 0,
				display_zone: 0,
				id: 2,
				field_type: 'timestamp',
				base_type: 'int64',
				role: 'modified'
			}, {
				label: 'Record ID#',
				nowrap: 1,
				bold: 0,
				required: 0,
				appears_by_default: 0,
				find_enabled: 1,
				allow_new_choices: 0,
				sort_as_given: 1,
				carrychoices: 1,
				foreignkey: 0,
				unique: 1,
				doesdatacopy: 0,
				fieldhelp: '',
				allowInRecTemplate: 0,
				decimal_places: 0,
				comma_start: 4,
				numberfmt: 0,
				does_average: 0,
				does_total: 0,
				blank_is_zero: 1,
				id: 3,
				field_type: 'recordid',
				base_type: 'int32',
				role: 'recordid',
				mode: 'virtual'
			}, {
				label: 'Record Owner',
				nowrap: 1,
				bold: 0,
				required: 0,
				appears_by_default: 0,
				find_enabled: 1,
				allow_new_choices: 1,
				sort_as_given: 1,
				carrychoices: 1,
				foreignkey: 0,
				unique: 0,
				doesdatacopy: 0,
				fieldhelp: '',
				allowInRecTemplate: 0,
				display_user: 'fullnamelf',
				default_kind: 'none',
				id: 4,
				field_type: 'userid',
				base_type: 'text',
				role: 'owner'
			}, {
				label: 'Last Modified By',
				nowrap: 1,
				bold: 0,
				required: 0,
				appears_by_default: 0,
				find_enabled: 1,
				allow_new_choices: 1,
				sort_as_given: 1,
				carrychoices: 1,
				foreignkey: 0,
				unique: 0,
				doesdatacopy: 0,
				fieldhelp: '',
				allowInRecTemplate: 0,
				display_user: 'fullnamelf',
				default_kind: 'none',
				id: 5,
				field_type: 'userid',
				base_type: 'text',
				role: 'modifier'
			}
		]
	}
};

/* Main */
module.exports = function(pass, fail){
	let qb = new QuickBase({
		realm: process.env.realm,
		appToken: process.env.appToken,
		ticket: process.env.ticket
	});

	return qb.api('API_GetSchema', {
		dbid: process.env.dbid
	}).then((results) => {
		common.objStrctEqual(results, expectedGetSchema, 'Mismatched API_GetSchema Data Structure');

		return results;
	}).then(pass).catch(fail);
};
