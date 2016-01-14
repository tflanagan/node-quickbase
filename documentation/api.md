# Node-QuickBase Documentation

### Quick Links
- [Promises &#8599;](http://bluebirdjs.com/docs/api-reference.html)
- [Initialization](api.md#initialization)
- [API_AddField](api.md#api_addfield)
- [API_AddGroupToRole](api.md#api_addgrouptorole)
- [API_AddRecord](api.md#api_addrecord)
- [API_AddReplaceDBPage](api.md#api_addreplacedbpage)
- [API_AddSubGroup](api.md#api_addsubgroup)
- [API_AddUserToGroup](api.md#api_addUsertogroup)
- [API_AddUserToRole](api.md#api_addUsertorole)
- [API_Authenticate](api.md#api_authenticate)
- [API_ChangeGroupInfo](api.md#api_changegroupinfo)
- [API_ChangeManager](api.md#api_changemanager)
- [API_ChangeRecordOwner](api.md#api_changerecordowner)
- [API_ChangeUserRole](api.md#api_changeuserrole)
- [API_CloneDatabase](api.md#api_clonedatabase)
- [API_CopyGroup](api.md#api_copygroup)
- [API_CopyMasterDetail](api.md#api_copymasterdetail)
- [API_CreateDatabase](api.md#api_createdatabase)
- [API_CreateGroup](api.md#api_creategroup)
- [API_CreateTable](api.md#api_createtable)
- [API_DeleteDatabase](api.md#api_deletedatabase)
- [API_DeleteField](api.md#api_deletefield)
- [API_DeleteGroup](api.md#api_deletegroup)
- [API_DeleteRecord](api.md#api_deleterecord)
- [API_DoQuery](api.md#api_doquery)
- [API_DoQueryCount](api.md#api_doquerycount)
- [API_EditRecord](api.md#api_editrecord)
- [API_FieldAddChoices](api.md#api_fieldaddchoices)
- [API_FieldRemoveChoices](api.md#api_fieldremovechoices)
- [API_FindDBByName](api.md#api_finddbbyname)
- [API_GenAddRecordForm](api.md#api_genaddrecordform)
- [API_GenResultsTable](api.md#api_genresultstable)
- [API_GetAncestorInfo](api.md#api_getancestorinfo)
- [API_GetAppDTMInfo](api.md#api_getappdtminfo)
- [API_GetDBPage](api.md#api_getdbpage)
- [API_GetDBInfo](api.md#api_getdbinfo)
- [API_GetDBVar](api.md#api_getdbvar)
- [API_GetGroupRole](api.md#api_getgrouprole)
- [API_GetNumRecords](api.md#api_getnumrecords)
- [API_GetSchema](api.md#api_getschema)
- [API_GetRecordAsHTML](api.md#api_getrecordashtml)
- [API_GetRecordInfo](api.md#api_getrecordinfo)
- [API_GetRoleInfo](api.md#api_getroleinfo)
- [API_GetUserInfo](api.md#api_getuserinfo)
- [API_GetUserRole](api.md#api_getuserrole)
- [API_GetUsersInGroup](api.md#api_getusersingroup)
- [API_GrantedDBs](api.md#api_granteddbs)
- [API_GrantedDBsForGroup](api.md#api_granteddbsforgroup)
- [API_GrantedGroups](api.md#api_grantedgroups)
- [API_ImportFromCSV](api.md#api_importfromcsv)
- [API_ProvisionUser](api.md#api_provisionuser)
- [API_PurgeRecords](api.md#api_purgerecords)
- [API_RemoveGroupFromRole](api.md#api_removegroupfromrole)
- [API_RemoveSubgroup](api.md#api_removesubgroup)
- [API_RemoveUserFromGroup](api.md#api_removeuserfromgroup)
- [API_RemoveUserFromRole](api.md#api_removeuserfromrole)
- [API_RenameApp](api.md#api_renameapp)
- [API_RunImport](api.md#api_runimport)
- [API_SendInvitation](api.md#api_sendinvitation)
- [API_SetDBVar](api.md#api_setdbvar)
- [API_SetFieldProperties](api.md#api_setfieldproperties)
- [API_SetKeyField](api.md#api_setkeyfield)
- [API_SignOut](api.md#api_signout)
- [API_UploadFile](api.md#api_uploadfile)
- [API_UserRoles](api.md#api_userroles)

## Initialization
### Nodejs
```javascript
var QuickBase = require('quickbase');

var quickbase = new QuickBase({
	realm: 'subdomain/realm',
	appToken: 'application token'
});
```

### Browser
```html
<script type="text/javascript" src="quickbase.browserify.min.js"></script>
<script type="text/javascript">
	var quickbase = new QuickBase({
		realm: 'subdomain/realm',
		appToken: 'application token'
	});
</script>
```

## API Calls

### API_AddField
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#add_field.html)
```javascript
quickbase.api('API_AddField', {
	dbid: 'bddnn3uz9',  /* Required */
	add_to_forms: true,
	label: 'Label',     /* Required                       */
	mode: 'virtual',    /* Required for Lookup or Formula */
	type: 'formula'     /* Required                       */
}).then((results) => {
	/* results = {
	 * 	action: 'API_AddField',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	fid: 8,
	 * 	label: 'Label'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_AddGroupToRole
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#api_addgrouptorole.html)
```javascript
quickbase.api('API_AddGroupToRole', {
	dbid: 'bddnn3uz9',  /* Required */
	gid: '345889.ksld', /* Required */
	roleid: 12          /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_AddGroupToRole',
	 * 	errcode: 0,
	 * 	errtext: 'No error'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_AddRecord
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#add_record.html)
```javascript
quickbase.api('API_AddRecord', {
	dbid: 'bddnn3uz9',           /* Required */
	fields: [                    /* Required */
		{ fid: 6, value: 'Hi!' }
	],
	disprec: false,
	fform: false,
	ignoreError: false,
	msInUTC: false
}).then((results) => {
	/* results = {
	 * 	action: 'API_AddRecord',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	rid: 21,
	 * 	update_id: 1206177014451
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_AddReplaceDBPage
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#add_replace_dbpage.html)
```javascript
quickbase.api('API_AddReplaceDBPage', {
	dbid: 'bddnn3uz9',        /* Required */
	pagename: 'newpage.html', /* Required for new pages */
	pageid: 12,               /* Required for updating pages */
	pagetype: 1,              /* Required */
	pagebody: '<html></html>' /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_AddReplaceDBPage',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	pageID: 12
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_AddSubGroup
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#api_addsubgroup.html)
```javascript
quickbase.api('API_AddSubGroup', {
	gid: '345889.sdfs',       /* Required */
	subgroupid: '820935.ksjf' /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_AddSubGroup',
	 * 	errcode: 0,
	 * 	errtext: 'No error'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_AddUserToGroup
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#api_addusertogroup.html)
```javascript
quickbase.api('API_AddUserToGroup', {
	gid: '345889.sdfd',    /* Required */
	userid: '898790.qntp', /* Required */
	allowAdminAccess: false
}).then((results) => {
	/* results = {
	 * 	action: 'API_AddUserToGroup',
	 * 	errcode: 0,
	 * 	errtext: 'No error'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_AddUserToRole
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#add_user_to_role.html)
```javascript
quickbase.api('API_AddUserToRole', {
	dbid: 'bddnn3uz9',     /* Required */
	userid: '112245.efy7', /* Required */
	roleid: 10             /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_AddUserToRole',
	 * 	errcode: 0,
	 * 	errtext: 'No error'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_Authenticate
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#authenticate.html)
```javascript
quickbase.api('API_Authenticate', {
	username: 'PTBarnum',  /* Required */
	password: 'TopSecret', /* Required */
	hours: 12
}).then((results) => {
	/* results = {
	 * 	action: 'API_Authenticate',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	ticket: '2_beeinrxmv_dpvx_b_crf8ttndjwyf9bui94rhciirqcs',
	 * 	userid: '112245.efy7'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_ChangeGroupInfo
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#api_changegroupinfo.html)
```javascript
quickbase.api('API_ChangeGroupInfo', {
	gid: '345889.sdjl',                                /* Required */
	name: 'AcmeSalesTeamLeads',
	description: 'Team Leaders for the Acme division',
	accountID: 456789,
	allowsAdminAccess: false
}).then((results) => {
	/* results = {
	 * 	action: 'API_ChangeGroupInfo',
	 * 	errcode: 0,
	 * 	errtext: 'No error'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_ChangeManager
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#api_changemanager.html)
```javascript
quickbase.api('API_ChangeManager', {
	newmgr: 'angela_leon@gmail.com' /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_ChangeManager',
	 * 	errcode: 0,
	 * 	errtext: 'No error'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_ChangeRecordOwner
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#change_record_owner.html)
```javascript
quickbase.api('API_ChangeRecordOwner', {
	dbid: 'bddnn3uz9', /* Required */
	rid: 3,            /* Required */
	newowner: 'Muggsy' /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_ChangeRecordOwner',
	 * 	errcode: 0,
	 * 	errtext: 'No error'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_ChangeUserRole
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#change_user_role.html)
```javascript
quickbase.api('API_ChangeUserRole', {
	dbid: 'bddnn3uz9',     /* Required */
	userid: '112248.5nzg', /* Required */
	roleid: 11,            /* Required */
	newroleid: 12          /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_ChangeUserRole',
	 * 	errcode: 0,
	 * 	errtext: 'No error'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_CloneDatabase
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#clone_database.html)
```javascript
quickbase.api('API_CloneDatabase', {
	dbid: 'bddnn3uz9',                       /* Required */
	newdbname: 'YellowDots',                 /* Required */
	newdbdesc: 'Database copy with no data',
	keepData: true,
	exludeFiles: true,
	usersandroles: false
}).then((results) => {
	/* results = {
	 * 	action: 'API_CloneDatabase',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	newdbid: 'bddnc6pn7'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_CopyGroup
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#api_copygroup.html)
```javascript
quickbase.api('API_CopyGroup', {
	gid: '1213.dsfj',                                          /* Required */
	name: 'SalesTeamLeadsCopy',                                /* Required */
	description: 'Copy of the current Sales Team Leads Group',
	gacct: ''
}).then((results) => {
	/* results = {
	 * 	action: 'API_CopyGroup',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	group: {
	 * 		id: '1219.d47h',
	 * 		name: 'SalesTeamLeadsCopy',
	 * 		description: 'Copy of the current Sales Team Leads Group',
	 * 		managedByUser: true
	 * 	}
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_CopyMasterDetail
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#api_copymasterdetail.html)
```javascript
quickbase.api('API_CopyMasterDetail', {
	dbid: 'bddnn3uz9',  /* Required */
	destrid: 0,         /* Required */
	sourcerid: 1,       /* Required */
	copyfid: 6,         /* Required */
	recurse: true,
	relfids: 'all'
}).then((results) => {
	/* results = {
	 * 	action: 'API_CopyMasterDetail',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	parentrid: 1,
	 * 	numcreated: 4
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_CreateDatabase
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#create_database.html)
```javascript
quickbase.api('API_CreateDatabase', {
	dbname: 'FuelCharter',                   /* Required */
	dbdesc: 'Vehicle and Fuel Cost Tracker',
	createapptoken: true
}).then((results) => {
	/* results = {
	 * 	action: 'API_CreateDatabase',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	dbid: 'bddnn3uz9',
	 * 	appdbid: 'bddnn3ub7',
	 * 	apptoken: 'cmzaaz3dgdmmwwksdb7zcd7a9wg'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_CreateGroup
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#api_creategroup.html)
```javascript
quickbase.api('API_CreateGroup', {
	name: 'MarketingSupport',                             /* Required */
	description: 'Support staff for sr marketing group',
	accountID: 456789
}).then((results) => {
	/* results = {
	 * 	action: 'API_CreateGroup',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	group: {
	 * 		id: '1217.dgpt',
	 * 		name: 'MarketingSupport',
	 * 		description: 'Support staff for sr marketing group',
	 * 		managedByUser: true
	 * 	}
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_CreateTable
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#create_table.html)
```javascript
quickbase.api('API_CreateTable', {
	dbid: 'bddnn3uz9',        /* Required */
	tname: 'My Vehicle List', /* Required */
	pnoun: 'Vehicles'         /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_CreateTable',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	newdbid: 'bddfa5nbx'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_DeleteDatabase
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#delete_database.html)
```javascript
quickbase.api('API_DeleteDatabase', {
	dbid: 'bddnn3uz9' /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_DeleteDatabase',
	 * 	errcode: 0,
	 * 	errtext: 'No error'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_DeleteField
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#delete_field.html)
```javascript
quickbase.api('API_DeleteField', {
	dbid: 'bddnn3uz9', /* Required */
	fid: 6             /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_DeleteField',
	 * 	errcode: 0,
	 * 	errtext: 'No error'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_DeleteGroup
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#api_deletegroup.html)
```javascript
quickbase.api('API_DeleteGroup', {
	gid: '345889.skef' /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_DeleteGroup',
	 * 	errcode: 0,
	 * 	errtext: 'No error'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_DeleteRecord
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#delete_record.html)
```javascript
quickbase.api('API_DeleteRecord', {
	dbid: 'bddnn3uz9', /* Required */
	rid: 6
}).then((results) => {
	/* results = {
	 * 	action: 'API_DeleteRecord',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	rid: 6
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_DoQuery
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#do_query.html)
```javascript
quickbase.api('API_DoQuery', {
	dbid: 'bddnn3uz9',                                            /* Required */
	query: "{'5'.CT.'Ragnar Lodbrok'}AND{'5'.CT.'Acquisitions'}",
	/* qid: 1, */
	/* qname: 'List All', */
	clist: '3',
	slist: '3',
	options: 'num-r.sortorder-A.skp-10.onlynew',
	fmt: 'structured',
	returnpercentage: true,
	includeRids: true
}).then((results) => {
	/* results = {
	 * 	action: 'API_DoQuery',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	qid: -1,
	 * 	qname: '',
	 * 	table: {
	 * 		name: 'API created Sample',
	 * 		desc: 'This is a sample table.',
	 * 		original: {
	 * 			table_id: 'bh9ckdaue',
	 * 			app_id: 'bh9ckc9ft',
	 * 			cre_date: 1204586581894,
	 * 			mod_date: 1206583187767,
	 * 			next_record_id: 34,
	 * 			next_field_id: 24,
	 * 			next_query_id: 5,
	 * 			def_sort_fid: 6,
	 * 			def_sort_order: 1
	 * 		},
	 * 		variables: {
	 * 			Blue: 14,
	 * 			Jack: 14,
	 * 			Magenta: 12,
	 * 			usercode: 14
	 * 		},
	 * 		queries: [
	 * 			{
	 * 				id: 1,
	 * 				qyname: 'List All',
	 * 				qytype: 'table',
	 * 				qycalst: '0.0'
	 * 			}
	 * 		],
	 * 		fields: [
	 * 			{
	 * 				id: 3,
	 * 				field_type: 'recordid',
	 * 				base_type: 'int32',
	 * 				role: 'recordid',
	 * 				mode: 'virtual',
	 * 				label: 'Record ID#',
	 * 				nowrap: 1,
	 * 				bold: 1,
	 * 				required: 0,
	 * 				appears_by_default: 0,
	 * 				find_enabled: 1,
	 * 				allow_new_choices: 0,
	 * 				sort_as_given: 0,
	 * 				default_value: 10,
	 * 				carrychoices: 1,
	 * 				foreignkey: 0,
	 * 				unique: 1,
	 * 				doesdatacopy: 0,
	 * 				fieldhelp: '',
	 * 				comma_start: 0,
	 * 				does_average: 0,
	 * 				does_total: 0,
	 * 				blank_is_zero: 0
	 * 			}
	 * 		],
	 * 		lastluserid: 0,
	 * 		lusers: [
	 * 			{
	 * 				id: '112149.bhsv',
	 * 				name: 'AppBoss'
	 * 			}
	 * 		],
	 * 		records: [
	 * 			{
	 * 				rid: 4,
	 * 				3: 4
	 * 			}
	 * 		]
	 * 	}
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_DoQueryCount
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#do_query_count.html)
```javascript
quickbase.api('API_DoQueryCount', {
	dbid: 'bddnn3uz9',            /* Required */
	query: "{'7'.XCT.'blue car'}" /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_DoQueryCount',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	numMatches: 1
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_EditRecord
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#edit_record.html)
```javascript
quickbase.api('API_EditRecord', {
	dbid: 'bddnn3uz9',               /* Required */
	rid: 17,                         /* Required */
	/* update_id: 1205700075470, */
	fields: [                        /* Required */
		{ fid: 6, value: 'Hi!' },
		{ name: 'File Attachment', value: 'base64', filename: 'image.png' }
	],
	disprec: false,
	fform: false,
	ignoreError: false,
	msInUTC: true
}).then((results) => {
	/* results = {
	 * 	action: 'API_EditRecord',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	rid: 17,
	 * 	num_fields_changed: 2,
	 * 	update_id: 1205700275470
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_FieldAddChoices
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#field_add_choices.html)
```javascript
quickbase.api('API_FieldAddChoices', {
	dbid: 'bddnn3uz9',  /* Required */
	fid: 11,            /* Required */
	choice: 'Don Tomas' /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_FieldAddChoices',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	fid: 11,
	 * 	fname: 'Fumables',
	 * 	numadded: 1
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_FieldRemoveChoices
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#field_remove_choices.html)
```javascript
quickbase.api('API_FieldRemoveChoices', {
	dbid: 'bddnn3uz9', /* Required */
	fid: 11,           /* Required */
	choice: 'Black'    /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_FieldRemoveChoices',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	fid: 11,
	 * 	fname: 'Color Choice',
	 * 	numremoved: 1
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_FindDBByName
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#find_db_by_name.html)
```javascript
quickbase.api('API_FindDBByName', {
	dbname: 'TestTable', /* Required */
	ParentsOnly: false
}).then((results) => {
	/* results = {
	 * 	action: 'API_FindDBByName',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	dbid: 'bdcagynhs'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_GenAddRecordForm
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#gen_add_record_form.html)
```javascript
quickbase.api('API_GenAddRecordForm', {
	dbid: 'bddnn3uz9',                          /* Required */
	fields: [
		{ name: 'Vehicle Make', value: 'Ford' }
	]
}).then((results) => {
	/* results = '<html>...</html>' */
}).catch((error) => {
	// Handle error
});
```

### API_GenResultsTable
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#gen_results_table.html)
```javascript
quickbase.api('API_GenResultsTable', {
	dbid: 'bddnn3uz9',                         /* Required */
	query: "{'11'.CT.'Bob'}AND{'19'.GTE.'5'}",
	/* qid: 1, */
	/* qname: 'List All', */
	clist: '6.7.9.11.16',
	slist: '11.6'
	options: 'num-4.sortorder-D',              /* Required */
	jht: 'n',                                  /* Required */
	jsa: false,
}).then((results) => {
	/* results = '<html>...</html>'	*/
}).catch((error) => {
	// Handle error
});
```

### API_GetAncestorInfo
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#getancestorinfo.html)
```javascript
quickbase.api('API_GetAncestorInfo', {
	dbid: 'bddnn3uz9' /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_GetAncestorInfo',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	ancestorappid: 'bbyhxrmsv',
	 * 	oldestancestorappid: 'bbyhxrmsv'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_GetAppDTMInfo
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#get_app_dtm_info.html)
```javascript
quickbase.api('API_GetAppDTMInfo', {
	dbid: 'bguin9b8e' /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_GetAppDTMInfo',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	RequestTime: 1227657049750,
	 * 	RequestNextAllowedTime: 1227657049750,
	 * 	app: {
	 * 		id: 'bdzk2ecg5',
	 * 		lastModifiedTime: 1227657049750,
	 * 		lastRecModTime: 1227647748330
	 * 	},
	 * 	tables: [
	 * 		{
	 * 			id: 'bdzk2ecg6',
	 * 			lastModifiedTime: 1227647748440,
	 * 			lastRecModTime: 1227647748330
	 * 		},
	 * 		...
	 * 	]
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_GetDBPage
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#get_db_page.html)
```javascript
quickbase.api('API_GetDBPage', {
	dbid: 'bguin9b8e', /* Required */
	pageID: 3          /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_GetDBPage',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	pagebody: '<html></html>'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_GetDBInfo
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#get_db_info.html)
```javascript
quickbase.api('API_GetDBInfo', {
	dbid: 'bguin9b8e' /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_GetDBInfo',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	dbname: 'test',
	 * 	lastRecModTime: 1205806751959,
	 * 	lastModifiedTime: 1205877093679,
	 * 	createdTime: 1204745351407,
	 * 	numRecords: 3,
	 * 	mgrID: '112149.bhsv',
	 * 	mgrName: 'AppBoss',
	 * 	version: '2.0',
	 * 	time_zone: '(UTC-08:00) Pacific Time (US & Canada)'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_GetDBVar
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#getdbvar.html)
```javascript
quickbase.api('API_GetDBVar', {
	dbid: 'bguin9b8e',  /* Required */
	varname: 'usercode' /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_GetDBVar',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	value: 12
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_GetGroupRole
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#api_getgrouprole.html)
```javascript
quickbase.api('API_GetGroupRole', {
	dbid: 'bguin9b8e', /* Required */
	gid: '345889.klsd' /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_GetGroupRole',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	roles: [
	 * 		{
	 * 			id: '23528',
	 * 			name: 'Human Resources'
	 * 		},
	 * 		...
	 * 	]
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_GetNumRecords
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#getnumrecords.html)
```javascript
quickbase.api('API_GetNumRecords', {
	dbid: 'bguin9b8e' /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_GetNumRecords',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	num_records: 17
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_GetSchema
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#getschema.html)
```javascript
quickbase.api('API_GetSchema', {
	dbid: 'bddnn3uz9' /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_GetSchema',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	time_zone: '(UTC-05:00) Eastern Time (US & Canada)',
	 * 	date_format: 'MM-DD-YYYY',
	 * 	table: {
	 * 		name: 'Pages',
	 * 		original: {
	 * 			table_id: 'biy2j7bme',
	 * 			app_id: 'biy2ikx6n',
	 * 			cre_date: 1398827549677,
	 * 			mod_date: 1440184904503,
	 * 			next_record_id: 172,
	 * 			next_field_id: 41,
	 * 			next_query_id: 7,
	 * 			def_sort_fid: 25,
	 * 			def_sort_order: 1
	 * 		},
	 * 		variables: {
	 * 			varName: 'varValue',
	 * 			...
	 * 		},
	 * 		chdbids: [
	 * 			{
	 * 				name: '_dbid_doug_s_api_created_sample',
	 * 				dbid: 'bdb5rjd6g'
	 * 			},
	 * 			...
	 * 		],
	 * 		queries: [
	 * 			{
	 * 				id: 1,
	 * 				qyname: 'List All',
	 * 				qytype: 'table',
	 * 				qycalst: '0.0',
	 * 				...
	 * 			},
	 * 			...
	 * 		],
	 * 		fields: [
	 * 			{
	 * 				id: 6,
	 * 				field_type: 'text',
	 * 				base_type: 'text'
	 * 				label: 'Additional Information',
	 * 				...
	 * 			},
	 * 			...
	 * 		]
	 * 	}
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_GetRecordAsHTML
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#getrecordashtml.html)
```javascript
quickbase.api('API_GetRecordAsHTML', {
	dbid: 'bguin9b8e', /* Required */
	rid: 2,            /* Required */
	dfid: 10
}).then((results) => {
	/* results = '<html>...</html>' */
}).catch((error) => {
	// Handle error
});
```

### API_GetRecordInfo
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#getrecordinfo.html)
```javascript
quickbase.api('API_GetRecordInfo', {
	dbid: 'bguin9b8e', /* Required */
	rid: 2             /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_GetRecordInfo',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	rid: 2,
	 * 	num_fields: 28,
	 * 	update_id: 1205780029699,
	 * 	field: [
	 * 		{
	 * 			fid: 26,
	 * 			name: 'Parent Page',
	 * 			type: 'Numeric',
	 * 			value: 166
	 * 		},
	 * 		...
	 * 	]
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_GetRoleInfo
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#getroleinfo.html)
```javascript
quickbase.api('API_GetRoleInfo', {
	dbid: 'bguin9b8e' /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_GetRoleInfo',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	roles: [
	 * 		{
	 * 			id: 11,
	 * 			name: 'Participant',
	 * 			access: {
	 * 				id: 3,
	 * 				name: 'Basic Access'
	 * 			}
	 * 		},
	 * 		...
	 * 	]
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_GetUserInfo
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#getuserinfo.html)
```javascript
quickbase.api('API_GetUserInfo').then((results) => {
	/* results = {
	 * 	action: 'API_GetUserInfo',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	user: {
	 * 		id: '112149.bhsv',
	 * 		firstName: 'Ragnar',
	 * 		lastName: 'Lodbrok',
	 * 		login: 'Ragnar',
	 * 		email: 'Ragnar-Lodbrok@paris.net',
	 * 		screenName: 'Ragnar',
	 * 		externalAuth: 0,
	 * 		isVerified: 1
	 * 	}
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_GetUserRole
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#getuserrole.html)
```javascript
quickbase.api('API_GetUserRole', {
	dbid: 'bguin9b8e',     /* Required */
	userid: '112245.efy7',
	inclgrps: 1
}).then((results) => {
	/* results = {
	 * 	action: 'API_GetUserRole',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	user: {
	 * 		id: '112245.efy7',
	 * 		name: 'John Doe',
	 * 		roles: [
	 * 			{
	 * 				id: 11,
	 * 				name: 'Participant',
	 * 				access: {
	 * 					id: 3,
	 * 					name: 'Basic Access'
	 * 				},
	 * 				member: {
	 * 					type: 'user',
	 * 					name: 'John Doe'
	 * 				}
	 * 			},
	 * 			...
	 * 		]
	 * 	}
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_GetUsersInGroup
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#api_getusersingroup.html)
```javascript
quickbase.api('API_GetUsersInGroup', {
	gid: '2345.skdj',
	includeAllMgrs: false
}).then((results) => {
	/* results = {
	 * 	action: 'API_GetUsersInGroup',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	group: {
	 * 		id: '2345.sdfk',
	 * 		name: 'GroupInfoTestGroup',
	 * 		description: 'My Group description',
	 * 		users: [
	 * 			{
	 * 				id: '112149.bhsv',
	 * 				firstName: 'john',
	 * 				lastName: 'doe',
	 * 				email: 'jdoe.qb@gmail.com',
	 * 				screenName: '',
	 * 				isAdmin: 'false'
	 * 			},
	 * 			...
	 * 		],
	 * 		managers: [
	 * 			{
	 * 				id: '52731770.b82h',
	 * 				firstName: 'Angela',
	 * 				lastName: 'Leon',
	 * 				email: 'angela_leon@aleon.com',
	 * 				screenName: 'aqleon',
	 * 				isMember: 'true'
	 * 			},
	 * 			...
	 * 		],
	 * 		subgroups: [
	 * 			{ id: '3450.aefs' }
	 * 			...
	 * 		]
	 * 	}
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_GrantedDBs
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#granteddbs.html)
```javascript
quickbase.api('API_GrantedDBs', {
	adminOnly: false,
	excludeparents: 0,
	includeancestors: 0,
	withembeddedtables: 0
}).then((results) => {
	/* results = {
	 * 	action: 'API_GrantedDBs',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	databases: [
	 * 		{
	 * 			dbname: 'Projects',
	 * 			dbid: 'bhgnyxp3v'
	 * 		},
	 * 		...
	 * 	]
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_GrantedDBsForGroup
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#api_granteddbsforgroup.html)
```javascript
quickbase.api('API_GrantedDBsForGroup', {
	gid: '1217.dgpt' /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_GrantedDBsForGroup',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	databases: [
	 * 		{
	 * 			dbname: 'Projects',
	 * 			dbid: 'bhgnyxp3v'
	 * 		},
	 * 		...
	 * 	]
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_GrantedGroups
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#api_grantedgroups.html)
```javascript
quickbase.api('API_GrantedGroups', {
	userid: '930245.jlpw', /* Required */
	adminonly: false
}).then((results) => {
	/* results = {
	 * 	action: 'API_GrantedGroups',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	groups: [
	 * 		{
	 * 			id: '1217.dgpt',
	 * 			name: 'GroupInfoTestGroup',
	 * 			description: 'Demo Test Group',
	 * 			managedByUser: 'false'
	 * 		},
	 * 		...
	 * 	]
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_ImportFromCSV
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#importfromcsv.html)
```javascript
quickbase.api('API_ImportFromCSV', {
	dbid: 'bguin9b8e',                                                        /* Required */
	records_csv: [                                                            /* Required */
		'First Name,Last Name,Company,Phone,Cell Phone,Zip',
		'Bruce,Anderson,Reyes Inc,(474) 555-0514,(390) 555-8927,<-80145>',
		'Judy,Atwell,Conner Supplies,(499) 555-1072,(763) 555-1325,<-50737>',
		'Kris,Babs,Willis Orchards,(428) 555-6791,(481) 555-1335,<-81504>',
	],
	clist: '7.8.6.5.4',                                                       /* Required */
	clist_output: '',
	skipfirst: false,
	msInUTC: true
}).then((results) => {
	/* results = {
	 * 	action: 'API_ImportFromCSV',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	num_recs_input: 8,
	 * 	num_recs_added: 4,
	 * 	rids: [
	 * 		{ // Edit Record
	 * 			update_id: 1057961999003,
	 * 			rid: 1
	 * 		},
	 * 		{ // Add Record
	 * 			rid: 2
	 * 		},
	 * 		...
	 * 	]
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_ProvisionUser
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#provisionuser.html)
```javascript
quickbase.api('API_ProvisionUser', {
	dbid: 'bguin9b8e',              /* Required */
	email: 'sanskor@sbcglobal.com', /* Required */
	roleid: 11,
	fname: 'Margi',                 /* Required */
	lname: 'Rita'                   /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_ProvisionUser',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	userid: '112248.5nzg'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_PurgeRecords
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#purgerecords.html)
```javascript
quickbase.api('API_PurgeRecords', {
	dbid: 'bguin9b8e',      /* Required */
	query: ''
	/* qid: 1            */
	/* qname: 'List All' */
}).then((results) => {
	/* results = {
	 * 	action: 'API_PurgeRecords',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	num_records_deleted: 21
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_RemoveGroupFromRole
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#api_removegroupfromrole.html)
```javascript
quickbase.api('API_RemoveGroupFromRole', {
	dbid: 'bguin9b8e',        /* Required */
	gid: '345889.sjkl',       /* Required */
	roleid: 12,               /* Required */
	allRoles: false	
}).then((results) => {
	/* results = {
	 * 	action: 'API_RemoveGroupFromRole',
	 * 	errcode: 0,
	 * 	errtext: 'No error'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_RemoveSubgroup
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#api_removesubgroup.html)
```javascript
quickbase.api('API_RemoveSubgroup', {
	dbid: 'bguin9b8e',        /* Required */
	gid: '345889.sjkl',       /* Required */
	subgroupid: '345889.skld' /* Required */
	
}).then((results) => {
	/* results = {
	 * 	action: 'API_RemoveSubgroup',
	 * 	errcode: 0,
	 * 	errtext: 'No error'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_RemoveUserFromGroup
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#api_removeuserfromgroup.html)
```javascript
quickbase.api('API_RemoveUserFromGroup', {
	dbid: 'bguin9b8e',     /* Required */
	gid: '345889.sjkl',    /* Required */
	userid: '9380434.rtgf' /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_RemoveUserFromGroup',
	 * 	errcode: 0,
	 * 	errtext: 'No error'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_RemoveUserFromRole
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#removeuserfromrole.html)
```javascript
quickbase.api('API_RemoveUserFromRole', {
	dbid: 'bguin9b8e',     /* Required */
	userid: '112245.efy7', /* Required */
	roleid: 11             /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_RemoveUserFromRole',
	 * 	errcode: 0,
	 * 	errtext: 'No error'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_RenameApp
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#renameapp.html)
```javascript
quickbase.api('API_RenameApp', {
	dbid: 'bguin9b8e',     /* Required */
	newappname: 'Refueler' /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_RenameApp',
	 * 	errcode: 0,
	 * 	errtext: 'No error'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_RunImport
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#runimport.html)
```javascript
quickbase.api('API_RunImport', {
	dbid: 'bguin9b8e', /* Required */
	id: 10             /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_RunImport',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	import_status: '3 new records were created.'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_SendInvitation
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#sendinvitation.html)
```javascript
quickbase.api('API_SendInvitation', {
	dbid: 'bguin9b8e',     /* Required */
	userid: '112249.ctdg', /* Required */
	usertext: 'Welcome!'
}).then((results) => {
	/* results = {
	 * 	action: 'API_SendInvitation',
	 * 	errcode: 0,
	 * 	errtext: 'No error'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_SetDBVar
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#setdbvar.html)
```javascript
quickbase.api('API_SetDBVar', {
	dbid: 'bguin9b8e',   /* Required */
	varname: 'usercode', /* Required */
	value: 14            /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_SetDBVar',
	 * 	errcode: 0,
	 * 	errtext: 'No error'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_SetFieldProperties
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#setfieldproperties.html)
```javascript
quickbase.api('API_SetFieldProperties', {
	dbid: 'bguin9b8e',                    /* Required */
	fid: 6,                               /* Required */
	/* property_name: 'property value' */ /* Refer to QuickBase Documentation for a list of Properties */
}).then((results) => {
	/* results = {
	 * 	action: 'API_SetFieldProperties',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	fid: 6,
	 * 	fname: 'Business Phone Number'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_SetKeyField
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#setkeyfield.html)
```javascript
quickbase.api('API_SetKeyField', {
	dbid: 'bguin9b8e', /* Required */
	fid: 6             /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_SetKeyField',
	 * 	errcode: 0,
	 * 	errtext: 'No error'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_SignOut
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#signout.html)
```javascript
quickbase.api('API_SignOut').then((results) => {
	/* results = {
	 * 	action: 'API_SignOut',
	 * 	errcode: 0,
	 * 	errtext: 'No error'
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_UploadFile
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#uploadfile.html)
```javascript
quickbase.api('API_UploadFile', {
	dbid: 'bguin9b8e',          /* Required */
	rid: 12,                    /* Required */
	field: {                    /* Required */
		fid: 18,
		filename: 'photo1.jpg',
		value: 'base64'
	}
}).then((results) => {
	/* results = {
	 * 	action: 'API_UploadFile',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	file_fields: [
	 * 		field: [
	 * 			{
	 * 				id: 13,
	 * 				url: 'https://target_domain/up/bc4gzy4nx/g/rc/ep/va/qchain.log'
	 * 			}
	 * 		]
	 * 	]
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```

### API_UserRoles
[QuickBase Documentation &#8599;](https://www.quickbase.com/api-guide/index.html#userroles.html)
```javascript
quickbase.api('API_UserRoles', {
	dbid: 'bguin9b8e' /* Required */
}).then((results) => {
	/* results = {
	 * 	action: 'API_UserRoles',
	 * 	errcode: 0,
	 * 	errtext: 'No error',
	 * 	users: [
	 * 		{
	 * 			type: 'user',
	 * 			id: '112149.bhsv',
	 * 			name: 'Jack Danielsson',
	 * 			lastAccess: 1403035235243,
	 * 			lastAccessAppLocal: '06-17-2014 01:00 PM',
	 * 			firstName: 'Jack',
	 * 			lastName: 'Danielsson',
	 * 			roles: [
	 * 				{
	 * 					id: 12,
	 * 					name: 'Administrator',
	 * 					access: {
	 * 						id: 1,
	 * 						name: 'Administrator'
	 * 					}
	 * 				}
	 * 			]
	 * 		}
	 * 	]
	 * }
	*/
}).catch((error) => {
	// Handle error
});
```