'use strict';

/* Types */
type SwaggerResponseBody = SwaggerBodyPropertyArray | SwaggerBodyPropertyObject;

type SwaggerBodyPropertyArray = {
	description: string;
	type: 'array';
	items: SwaggerBodySchema;
};

type SwaggerBodyPropertyBoolean = {
	description: string;
	type: 'boolean';
};

type SwaggerBodyPropertyInteger = {
	description: string;
	type: 'integer';
};

type SwaggerBodyPropertyString = {
	description: string;
	type: 'string';
	enum?: string[];
};

type SwaggerBodyPropertyObject = {
	description: string;
	type: 'object';
	additionalProperties: boolean;
	properties: SwaggerBodySchema;
	required?: string[] | false;
};

type SwaggerBodyPropertyUnion = {
	description?: string;
	'x-amf-union': SwaggerBodyProperty[];
};

type SwaggerBodyProperty = SwaggerBodyPropertyUnion | SwaggerBodyPropertyObject | SwaggerBodyPropertyArray | SwaggerBodyPropertyBoolean | SwaggerBodyPropertyInteger | SwaggerBodyPropertyString;

type SwaggerBodySchema = {
	type: 'object';
	description?: string;
	required?: string[] | false;
	additionalProperties: boolean;
	properties: Record<string, SwaggerBodyProperty>
};

type SwaggerParameterBody = {
	name: 'generated';
	in: 'body';
	schema: SwaggerBodySchema;
};

type SwaggerParameterPath = {
	name: string;
	description: string;
	required: boolean;
	in: 'path';
	example: string | number;
	type: 'string' | 'integer';
};

type SwaggerParameterQuery = {
	name: string;
	description: string;
	required: boolean;
	in: 'query';
	example: string | number;
	type: 'string' | 'integer';
};

type SwaggerParameterHeader = {
	name: string;
	description: string;
	required: boolean;
	in: 'header';
	example: any;
	type: 'string'
};

type SwaggerParameter = SwaggerParameterQuery | SwaggerParameterBody | SwaggerParameterHeader | SwaggerParameterPath;

type SwaggerRequest = {
	description: string;
	summary: string;
	operationId: string;
	consumes: string[];
	produces: string[];
	parameters: SwaggerParameter[];
};

type SwaggerOperation = {
	id: string;
	path: string;
	method: 'post' | 'get' | 'delete' | 'put';
	pathParams: SwaggerParameterPath[];
	queryParams: SwaggerParameterQuery[];
	parameters: SwaggerParameter[];
	responses: {
		'200': {
			description: string;
			schema: SwaggerResponseBody;
		}
	}
};

type SwaggerAPI = {
	host: string;
	basePath: string;
	paths: {
		[key: string]: {
			post?: SwaggerRequest;
			get?: SwaggerRequest;
			delete?: SwaggerRequest;
			put?: SwaggerRequest;
		}
	};
	operations: SwaggerOperation[]
};

type FnArgHelp = {
	arg: string;
	description: string;
	definedParam?: boolean;
	defaultValue?: string;
};

/* Dependencies */
import fs from 'fs/promises';

import Debug from 'debug';
import merge from 'deepmerge';

const debug = Debug('quickbase:generate');
const apiSpec: SwaggerAPI = require('../../assets/QuickBase_RESTful_API.json');

/* Overrides */
const typeOverrides = {
	dateFormat: {
		enum: [
			'MM-DD-YYYY',
			'MM-DD-YY',
			'DD-MM-YYYY',
			'DD-MM-YY',
			'YYYY-MM-DD'
		]
	},
	fieldType: {
		enum: [
			'text',
			'text-multiple-choice',
			'text-multi-line',
			'rich-text',
			'numeric',
			'currency',
			'rating',
			'percent',
			'multitext',
			'email',
			'url',
			'duration',
			'date',
			'datetime',
			'timestamp',
			'timeofday',
			'checkbox',
			'user',
			'multiuser',
			'address',
			'phone',
			'file'
		]
	},
	grouping: {
		description: 'Group by based on equal values (equal-values), first word (first-word), etc',
		enum: [
			'first-word',
			'first-letter',
			'equal-values',
			'1000000',
			'100000',
			'10000',
			'1000',
			'100',
			'10',
			'1',
			'.1',
			'.01',
			'.001'
		]
	},
	permissionType: {
		enum: [
			'None',
			'View',
			'Modify'
		]
	},
	order: {
		description: 'Sort based on ascending order (ASC) or descending order (DESC)',
		enum: [
			'ASC',
			'DESC'
		]
	},
	reportType: {
		enum: [
			'map',
			'gedit',
			'chart',
			'summary',
			'table',
			'timeline',
			'calendar'
		]
	}
};

const overrides: Record<string, Partial<{
	request: Partial<{
		args: Record<string, string>,
		schema: Partial<SwaggerBodySchema>
	}>;
	response: Partial<SwaggerResponseBody>;
	arrayMerge?: boolean;
}>> = {
	copyApp: {
		response: {
			required: [
				'name',
				'description',
				'created',
				'updated',
				'dateFormat',
				'timeZone',
				'id',
				'hasEveryoneOnTheInternet',
				'variables',
				'ancestorId'
			]
		}
	},
	createApp: {
		response: {
			required: [
				'name',
				'description',
				'created',
				'updated',
				'dateFormat',
				'timeZone',
				'id',
				'hasEveryoneOnTheInternet',
				'variables',
				'securityProperties'
			],
			properties: {
				// @ts-ignore
				dateFormat: typeOverrides.dateFormat
			}
		}
	},
	createField: {
		request: {
			schema: {
				properties: {
					// @ts-ignore
					properties: {
						required: []
					},
					permissions: {
						items: {
							properties: {
								// @ts-ignore
								permissionType: typeOverrides.permissionType
							}
						}
					}
				}
			}
		},
		response: {
			properties: {
				// @ts-ignore
				permissions: {
					items: {
						properties: {
							permissionType: typeOverrides.permissionType
						}
					}
				}
			}
		}
	},
	createRelationship: {
		request: {
			args: {
				tableId: 'childTableId'
			}
		},
		response: {
			required: [
				'id',
				'parentTableId',
				'childTableId',
				'foreignKeyField',
				'isCrossApp',
				'lookupFields',
				'summaryFields'
			],
			properties: {
				// @ts-ignore
				foreignKeyField: {
					properties: {
						type: typeOverrides.fieldType
					}
				},
				lookupFields: {
					items: {
						properties: {
							type: typeOverrides.fieldType
						}
					}
				},
				summaryFields: {
					items: {
						properties: {
							type: typeOverrides.fieldType
						}
					}
				}
			}
		}
	},
	deleteFields: {
		response: {
			required: [
				'deletedFieldIds'
			]
		},
		arrayMerge: true
	},
	deleteRecords: {
		request: {
			args: {
				from: 'tableId'
			}
		}
	},
	deleteRelationship: {
		request: {
			args: {
				tableId: 'childTableId'
			}
		}
	},
	getApp: {
		response: {
			required: [
				'name',
				'description',
				'created',
				'updated',
				'dateFormat',
				'timeZone',
				'id',
				'hasEveryoneOnTheInternet',
				'variables',
				'securityProperties'
			]
		}
	},
	getField: {
		response: {
			properties: {
				// @ts-ignore
				permissions: {
					items: {
						properties: {
							permissionType: typeOverrides.permissionType
						}
					}
				}
			}
		}
	},
	getFieldUsage: {
		response: {
			items: {
				properties: {
					field: {
						properties: {
							// @ts-ignore
							type: typeOverrides.fieldType
						}
					}
				}
			}
		}
	},
	getFields: {
		response: {
			items: {
				properties: {
					// @ts-ignore
					permissions: {
						items: {
							properties: {
								// @ts-ignore
								permissionType: typeOverrides.permissionType
							}
						}
					}
				}
			}
		}
	},
	getFieldsUsage: {
		response: {
			items: {
				properties: {
					field: {
						properties: {
							// @ts-ignore
							type: typeOverrides.fieldType
						}
					}
				}
			}
		}
	},
	getRelationships: {
		request: {
			args: {
				tableId: 'childTableId'
			}
		},
		response: {
			properties: {
				// @ts-ignore
				relationships: {
					items: {
						properties: {
							foreignKeyField: {
								properties: {
									type: typeOverrides.fieldType
								}
							},
							lookupFields: {
								items: {
									properties: {
										type: typeOverrides.fieldType
									}
								}
							},
							summaryFields: {
								items: {
									properties: {
										type: typeOverrides.fieldType
									}
								}
							}
						}
					}
				}
			}
		}
	},
	getReport: {
		response: {
			properties: {
				// @ts-ignore
				type: {
					enum: [
						'map',
						'gedit',
						'chart',
						'summary',
						'table',
						'timeline',
						'calendar'
					]
				},
				// @ts-ignore
				query: {
					properties: {
						fields: {
							description: 'An array of field ids used in the report',
							type: 'array',
							items: {
								type: 'integer'
							}
						},
						sortBy: {
							description: 'An array of fields used in sorting the report',
							type: 'array',
							items: {
								type: 'object',
								properties: {
									fieldId: {
										description: 'Field ID to sort by',
										type: 'integer'
									},
									order: {
										description: 'Order to sort the field by',
										type: 'string',
										enum: [
											'ASC',
											'DESC'
										]
									}
								}
							}
						},
						groupBy: {
							description: 'An array of fields used in grouping the report',
							type: 'array',
							items: {
								type: 'object',
								properties: {
									fieldId: {
										description: 'Field ID to group by',
										type: 'integer'
									},
									grouping: {
										description: 'Function to group the field by',
										type: 'string',
										enum: typeOverrides.grouping.enum
									}
								}
							}
						}
					}
				}
			}
		}
	},
	getTableReports: {
		response: {
			items: {
				properties: {
					// @ts-ignore
					type: typeOverrides.reportType
				}
			}
		}
	},
	runFormula: {
		request: {
			args: {
				from: 'tableId'
			}
		}
	},
	runQuery: {
		request: {
			args: {
				from: 'tableId'
			},
			schema: {
				properties: {
					// @ts-ignore
					options: {
						required: [
							'skip',
							'top'
						]
					},
					groupBy: {
						items: {
							properties: {
								// @ts-ignore
								grouping: {
									enum: typeOverrides.grouping.enum
								}
							}
						}
					}
				}
			}
		},
		response: {
			properties: {
				// @ts-ignore
				fields: {
					items: {
						properties: {
							type: typeOverrides.fieldType
						}
					}
				}
			}
		}
	},
	runReport: {
		response: {
			properties: {
				// @ts-ignore
				fields: {
					items: {
						properties: {
							type: typeOverrides.fieldType
						}
					}
				}
			}
		}
	},
	updateApp: {
		request: {
			schema: {
				required: []
			}
		},
		response: {
			required: [
				'name',
				'description',
				'created',
				'updated',
				'dateFormat',
				'timeZone',
				'id',
				'hasEveryoneOnTheInternet',
				'variables',
				'securityProperties'
			]
		}
	},
	updateField: {
		request: {
			schema: {
				required: [],
				properties: {
					// @ts-ignore
					properties: {
						required: []
					},
					permissions: {
						items: {
							properties: {
								// @ts-ignore
								permissionType: typeOverrides.permissionType
							}
						}
					}
				}
			}
		},
		response: {
			properties: {
				// @ts-ignore
				permissions: {
					items: {
						properties: {
							permissionType: typeOverrides.permissionType
						}
					}
				}
			}
		}
	},
	updateRelationship: {
		request: {
			args: {
				tableId: 'childTableId'
			},
			schema: {
				required: []
			}
		},
		response: {
			properties: {
				// @ts-ignore
				foreignKeyField: {
					properties: {
						type: typeOverrides.fieldType
					}
				},
				lookupFields: {
					items: {
						properties: {
							type: typeOverrides.fieldType
						}
					}
				},
				summaryFields: {
					items: {
						properties: {
							type: typeOverrides.fieldType
						}
					}
				}
			}
		}
	},
	updateTable: {
		request: {
			schema: {
				required: []
			}
		}
	},
	upsert: {
		request: {
			args: {
				to: 'tableId'
			}
		}
	}
};

/* Functions */
const buildAPIFunction = (operationObj: SwaggerOperation) => {
	const pathObj = apiSpec.paths[operationObj.path][operationObj.method];

	if(!pathObj){
		throw new Error(`Unable to find path object for: ${JSON.stringify(operationObj)}`);
	}

	if(pathObj.operationId !== operationObj.id){
		throw new Error(`Incorrect path obj returned for: ${JSON.stringify(operationObj)}, path ${JSON.stringify(pathObj)}`);
	}

	const capitalizedOperation = capitalizeFirstLetters(operationObj.id);

	const fnArgs: FnArgHelp[] = [];

	const reqTypeName = `QuickBaseRequest${capitalizedOperation}`;
	const reqType = [
		`type ${reqTypeName} = QuickBaseRequest & {`,
	];

	const resTypeName = `QuickBaseResponse${capitalizedOperation}`;
	const resType: string[] = [];

	const method = operationObj.method.toUpperCase();
	let url = operationObj.path;
	const bodyParam = operationObj.parameters.filter((param) => {
		return param.in === 'body' && param.schema.properties;
	})[0] as SwaggerParameterBody;

	operationObj.pathParams.forEach(({ name, type, description, required }) => {
		const override = overrides[operationObj.id]?.request;
		const origName = '' + name;
	
		if(override && override.args !== undefined && override.args[name]){
			name = override.args[name];

			// @ts-ignore
			delete overrides[operationObj.id].request.args[origName];
		}

		fnArgs.push({
			arg: name,
			description: description
		});

		url = url.replace('{' + origName + '}', '${' + name + '}');

		reqType.push(`	/**`);
		reqType.push(`	 * ${description}`);
		reqType.push(`	 */`);
		reqType.push(`	${name}${required ? '' : '?'}: ${transformType(type)};`);
	});

	operationObj.queryParams.forEach(({ name, type, description, required }) => {
		const override = overrides[operationObj.id]?.request;
	
		if(override && override.args !== undefined && override.args[name]){
			name = override.args[name];

			// @ts-ignore
			delete overrides[operationObj.id].request.args[origName];
		}

		fnArgs.push({
			arg: name,
			description: description
		});

		reqType.push(`	/**`);
		reqType.push(`	 * ${description}`);
		reqType.push(`	 */`);
		reqType.push(`	${name}${required ? '' : '?'}: ${transformType(type)};`);
	});

	if(bodyParam && bodyParam.schema.properties){
		const bodySchema = getBodySchema(operationObj, bodyParam.schema);

		reqType.push(buildBodyType(operationObj, bodySchema).join('\n'));

		buildFnHelpArgs(operationObj, bodySchema).forEach((fnArg) => {
			fnArgs.push(fnArg);
		});
	}

	if(operationObj.responses['200'] && operationObj.responses['200'].schema){
		if(operationObj.id === 'downloadFile'){
			resType.push(`type ${resTypeName} = string;`);
		}else{
			resType.push('type ' + buildType({
				operationObj,
				key: resTypeName,
				property: getResponseSchema(operationObj),
				isNested: false,
				tabLevel: 1
			}).map((line) => {
				return line.slice(1);
			}).join('\n').trim());
		}
	}

	const override = overrides[operationObj.id]?.request;

	if(override && override.args){
		Object.entries(override.args).forEach((arg) => {
			fnArgs.push({
				arg: arg[1],
				description: ''
			});
		});
	}

	fnArgs.push({
		arg: 'requestOptions',
		description: 'Override axios request configuration'
	});

	fnArgs.push({
		arg: 'returnAxios',
		description: 'If `true`, the returned object will be the entire `AxiosResponse` object'
	});

	if(bodyParam){
		fnArgs.push({
			arg: '...body',
			description: ''
		});
	}

	reqType.push('};');

	const argsList = (returnAxiosDefaultValue?: string) => fnArgs.filter(arg => arg.definedParam !== false).map(({ arg, defaultValue }) => {
		if(arg !== 'returnAxios' || !returnAxiosDefaultValue){
			return `${arg}${defaultValue ? ` = ${defaultValue}` : ''}`;
		}

		return `${arg} = ${returnAxiosDefaultValue}`;
	});
	const argsAreOptional = argsList().length <= 2;

	const functionDefinition = [
		'/**',
		` * ${pathObj.summary}`,
		' *',
		`${pathObj.description.split('\n').map((line) => {
			return ` * ${escapeDescription(line)}`;
		}).join('\n')}`,
		' *',
		` * [Quickbase Documentation](https://developer.quickbase.com/operation/${operationObj.id})`,
		' *',
		` * @param options ${pathObj.summary} method options object`,
		fnArgs.filter(({ description }) => !!description).map(({ arg, description }) => {
			return ` * @param options.${arg} ${escapeDescription(description)}`;
		}).join('\n'),
		' */',
		`public async ${operationObj.id}({ ${argsList('false').join(', ')} }: ${reqTypeName} & { returnAxios?: false }): Promise<${resTypeName}>;`,
		`public async ${operationObj.id}({ ${argsList('true').join(', ')} }: ${reqTypeName} & { returnAxios: true }): Promise<AxiosResponse<${resTypeName}>>;`,
		`public async ${operationObj.id}({ ${argsList('false').join(', ')} }: ${reqTypeName}${argsAreOptional ? ' = {}' : ''}): Promise<${resTypeName} | AxiosResponse<${resTypeName}>> {`,
		`	const results = await this.api<${resTypeName}>({`,
		`		method: '${method}',`,
		`		url: \`${url}\`,`,
		!!bodyParam ? `		data: ${getAxiosDataParam(operationObj)},` : false,
		operationObj.queryParams.length === 0 ? false : `		params: {\n${operationObj.queryParams.map((queryParam) => {
				return `			${queryParam.name}`;
			}).join(',\n')}
		}`,
		`	}, requestOptions);`,
		operationObj.id === 'getTempTokenDBID' ? [
			'',
			`	this.setTempToken(dbid, results.data.temporaryAuthorization);`
		].join('\n') : false,
		'',
		`	return returnAxios ? results : results.data;`,
		'}'
	].filter(val => val !== false).join('\n');

	return {
		functionDefinition,
		types: {
			req: reqType.join('\n'),
			res: resType.join('\n')
		}
	};
};

const buildFnHelpArgs = (operationObj: SwaggerOperation, schema: SwaggerBodySchema | SwaggerBodyPropertyObject) => {
	const results: FnArgHelp[] = [];

	Object.entries(schema.properties).forEach(([ key, property ]) => {
		buildFnHelp(operationObj, key, property).forEach((result) => {
			results.push(result);
		});
	});

	return results;
};

const buildFnHelp = (operationObj: SwaggerOperation, key: string, property: SwaggerBodyProperty): FnArgHelp[] => {
	const override = overrides[operationObj.id]?.request;

	if(override && override.args !== undefined && override.args[key]){
		key = override.args[key];
	}
	
	if(isSwaggerBodyPropertyUnion(property)){
		return buildFnHelp(operationObj, key, {
			description: property.description,
			...property['x-amf-union'][0]
		});
	}

	const results: FnArgHelp[] = [];

	if(property.type === 'array'){
		if(property.items && property.items.type === 'object' && property.items.properties){
			buildFnHelpArgs(operationObj, property.items).forEach((line) => {
				line.arg = [
					`${key}[]`,
					line.arg
				].join('.');

				results.push(line);
			});
		}else{
			results.push({
				arg: `${key}`,
				description: property.description,
				definedParam: false
			});
		}
	}else
	if(property.type === 'object'){
		if(property.properties){
			buildFnHelpArgs(operationObj, property).forEach((line) => {
				line.arg = [
					key,
					line.arg
				].join('.');

				results.push(line);
			});
		}else{
			debug(`[WARN] Missing fnHelp object type: ${key}. Please modify update.ts to account for this`);
		}
	}else{
		results.push({
			arg: key,
			description: property.description,
			definedParam: false
		});
	}

	return results;
};

const buildBodyType = (operationObj: SwaggerOperation, schema: SwaggerBodySchema | SwaggerBodyPropertyObject, tabLevel: number = 1) => {
	const results: string[] = [];

	Object.entries(schema.properties).forEach(([ key, property ]) => {
		buildType({
			operationObj,
			key,
			property,
			required: schema.required === undefined || schema.required === false || schema.required.indexOf(key) !== -1,
			tabLevel
		}).forEach((result) => {
			results.push(result);
		});
	});

	return results;
};

const buildType = ({
	operationObj,
	key,
	property,
	required = true,
	tabLevel = 1,
	isNested = true,
	unionProp
}: {
	operationObj: SwaggerOperation;
	key: string;
	property: SwaggerBodyProperty;
	required?: boolean;
	tabLevel?: number;
	isNested?: boolean;
	unionProp?: SwaggerBodyProperty;
}): string[] => {
	const override = overrides[operationObj.id]?.request;

	if(override && override.args !== undefined && override.args[key]){
		key = override.args[key];
	}

	if(isSwaggerBodyPropertyUnion(property)){
		return buildType({
			operationObj,
			key,
			property: {
				description: property.description,
				...property['x-amf-union'][0]
			},
			required: required,
			tabLevel,
			unionProp: property['x-amf-union'][1]
		});
	}

	const results: string[] = [];

	if(property.description){
		results.push(
			`/**`,
			` * ${escapeDescription(property.description)}`,
			` */`
		);
	}

	if(property.type === 'array'){
		if(property.items && property.items.type){
			if(property.items.type === 'object'){
				results.push(`${key}${required ? '' : '?'}${isNested ? ':' : ' ='} {`);

				buildBodyType(operationObj, property.items, isNested ? tabLevel : tabLevel).forEach((line) => {
					results.push(line);
				});

				results.push(`}[]${unionProp ? ' | false' : ''};`);
			}else{
				results.push(`${key}${required ? '' : '?'}: ${transformType(property.items.type)}[];`);
			}
		}else
		if(key === 'select' || key === 'compositeFields'){
			results.push(`${key}${required ? '' : '?'}: number[];`);
		}else
		if(key === 'choicesLuid'){
			results.push(`${key}${required ? '' : '?'}: string[];`);
		}else
		if(key === 'data'){
			results.push(`${key}${required ? '' : '?'}: Record<string, { value: any }>[];`);
		}else{
			debug(`[WARN] Missing items type: ${key}. Assigning as \`any\`.`);

			results.push(`${key}${required ? '' : '?'}: any;`);
		}
	}else
	if(property.type === 'object'){
		if(property.properties){
			results.push(`${key}${required ? '' : '?'}${isNested ? ':' : ' ='} {`);

			buildBodyType(operationObj, property, isNested ? tabLevel : tabLevel).forEach((line) => {
				results.push(line);
			});

			results.push(`};`);
		}else
		if(key === 'lineErrors'){
			results.push(`${key}${required ? '' : '?'}${isNested ? ':' : ' ='} Record<string, string[]>;`);
		}else{
			debug(`[WARN] Missing properties for object type: ${key}. Assigning as \`any\`.`);

			results.push(`${key}${required ? '' : '?'}${isNested ? ':' : ' ='} any;`);
		}
	}else{
		if(property.type){
			if(property.type === 'string' && property.enum){
				results.push(`${key}${required ? '' : '?'}: ${property.enum.map((val) => {
					return `'${val}'`;
				}).join(' | ')};`);
			}else{
				results.push(`${key}${required ? '' : '?'}: ${transformType(property.type)};`);
			}
		}else{
			debug(`[WARN] Missing type: ${key}. Assigning as \`any\`.`);

			results.push(`${key}${required ? '' : '?'}: any;`);
		}
	}

	return results.map((line) => {
		return ''.padStart(tabLevel, `\t`) + line;
	});
};

const capitalizeFirstLetter = (string: string) => {
	return string.charAt(0).toLocaleUpperCase() + string.slice(1);
};

const capitalizeFirstLetters = (string: string) => {
	return string.split(' ').map(capitalizeFirstLetter).join(' ');
};

const escapeDescription = (description: string) => {
	return description.replace(/\{/g, '\\{').replace(/\}/g, '\\}');
};

const getAxiosDataParam = (operationObj: SwaggerOperation) => {
	const override = overrides[operationObj.id]?.request;

	if(!override || override.args === undefined || Object.keys(override.args).length === 0){
		return 'body';
	}

	return `{
${Object.entries(override.args).map(([ orgArg, newArg ]) => {
	return `\t\t\t${orgArg}: ${newArg}`
}).join(',\n')},
\t\t\t...body
\t\t}`;
};

const getBodySchema = (operationObj: SwaggerOperation, schema: SwaggerBodySchema) => {
	return merge.all([
		schema,
		overrides[operationObj.id]?.request?.schema || {}
	]) as SwaggerBodySchema;
};

const getResponseSchema = (operationObj: SwaggerOperation) => {
	return merge.all([
		operationObj.responses['200'].schema,
		overrides[operationObj.id]?.response || {},
		{
			description: ''
		}
	]/*, overrides[operationObj.id]?.arrayMerge ? {
		// @ts-ignore unused vars
		// arrayMerge: (target, source, options) => source
	} : undefined */) as SwaggerBodyProperty;
};

const isSwaggerBodyPropertyUnion = (obj: any): obj is SwaggerBodyPropertyUnion => {
	return obj['x-amf-union'] !== undefined;
};

const transformType = (type: string) => {
	if(type === 'integer'){
		return 'number';
	}

	return type;
};

/* Main */
(async () => {
	try {
		const baseCodeBuffer = await fs.readFile(__dirname + '/base.ts');
		const baseCode = baseCodeBuffer.toString();

		const results = apiSpec.operations.map((operation) => {
			return {
				operation,
				api: buildAPIFunction(operation)
			};
		});

		await fs.writeFile(
			__dirname + '/../quickbase.ts',
			baseCode.split('\n').reduce((code, line) => {
				if(line.match(/\@remove\-line/)){
					return code;
				}

				return code + '\n' + line;
			}, '')
				.replace('//** API CALLS **//', results.map((result) => {
					return result.api.functionDefinition.split('\n').map((line) => {
						return `\t${line}`;
					}).join('\n');
				}).join('\n\n'))
				.replace('//** REQUEST TYPES **//', results.map((result) => {
					return `export ${result.api.types.req}`;
				}).join('\n\n'))
				.replace('//** RESPONSE TYPES **//', results.map((result) => {
					return `export ${result.api.types.res}`;
				}).join('\n\n'))
		);
	}catch(err: any){
		console.error(err);

		process.exit(1);
	}
})();
