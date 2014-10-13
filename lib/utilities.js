var utilities = (function(){
	var utilities = function(){
		return this;
	};

	/* n_arguments - 1 = overwrite or not
	 * arguments < n_arguments - 1 = objects to merge
	 * returns a new object without any references
	 *
	 * TODO:
	 * Fix Array merging when overwrite = false
	*/
	utilities.prototype.mergeObjects = function(){
		var overwrite = true,
			nObjs = arguments.length,
			newObj = [],
			i = 0;

		if(typeof(arguments[arguments.length - 1]) === 'boolean'){
			overwrite = arguments[arguments.length - 1];
			--nObjs;
		}

		for(; i < nObjs; ++i){
			if(!(arguments[i] instanceof Array) && (arguments[i] instanceof Object)){
				newObj = {};

				break;
			}
		}

		for(i = 0; i < nObjs; ++i){
			if(!arguments[i + 1] || typeof(arguments[i + 1]) === 'boolean'){
				continue;
			}

			for(d in arguments[i + 1]){
				if(arguments[i].hasOwnProperty(d) && arguments[i + 1].hasOwnProperty(d)){
					if(typeof(arguments[i][d]) === 'object' && typeof(arguments[i + 1][d]) === 'object'){
						newObj[d] = this.mergeObjects(arguments[i][d], arguments[i + 1][d], overwrite);
					}else
					if(overwrite){
						newObj[d] = arguments[i + 1][d];
					}else{
						if(newObj[d] instanceof Array){
							newObj[d].push(arguments[i + 1][d]);
						}else{
							newObj[d] = [arguments[i][d], arguments[i + 1][d]];
						}
					}
				}else
				if(arguments[i + 1].hasOwnProperty(d) && typeof(arguments[i + 1][d]) === 'object'){
					newObj[d] = this.mergeObjects(arguments[i + 1][d] instanceof Array ? [] : {}, arguments[i + 1][d], overwrite);
				}else{
					newObj[d] = arguments[i + 1][d];
				}
			}

			for(d in arguments[i]){
				if(!(d in arguments[i + 1]) && arguments[i].hasOwnProperty(d)){
					if(typeof(arguments[i + 1][d]) === 'object'){
						newObj[d] = this.mergeObjects(arguments[i][d] instanceof Array ? [] : {}, arguments[i][d], overwrite);
					}else{
						newObj[d] = arguments[i][d];
					}
				}
			}
		}

		return newObj;
	};

	utilities.prototype.joinArray = function(obj, delim){
		var that = this,
			str = '',
			v;

		for(v in obj){
			if(str !== ''){
				str += delim;
			}

			if(typeof obj[v] === 'object' || obj[v] instanceof Array){
				str += that.joinArray(obj[v], delim);
			}else{
				str += obj[v];
			}
		}

		return str;
	};

	utilities.prototype.indexOfObj = function(obj, key, value){
		if(typeof obj != 'object' || !(obj instanceof Array)){
			return -1;
		}

		var that = this,
			result,
			o = 0,
			i = 0;

		for(; i < obj.length; ++i){
			if(typeof key == 'object' || key instanceof Array){
				result = new Array(key.length);
				result = that.setAll(result, false);

				for(o = 0; o < result.length; ++o){
					if(obj[i][key[o]] === value[o]){
						result[o] = true;
					}
				}

				if(result.indexOf(false) === -1){
					return i;
				}
			}else{
				if(obj[i][key] === value){
					return i;
				}
			}
		}

		return -1;
	};

	utilities.prototype.setAll = function(arr, value){
		var n = arr.length,
			i = 0;

		for(; i < n; ++i){
			arr[i] = value;
		}

		return arr;
	};

	utilities.prototype.cleanXML = function(xml){
		var node, pFloat;

		for(node in xml){
			if(typeof(xml[node]) === 'object' && xml[node].length == 1){
				xml[node] = xml[node][0];
			}

			if(typeof(xml[node]) === 'object'){
				xml[node] = this.cleanXML(xml[node]);
			}

			if(typeof(xml[node]) === 'string'){
				pFloat = parseFloat(xml[node]);

				if(pFloat !== NaN && pFloat == xml[node]){
					xml[node] = pFloat;
				}
			}
		}

		return xml;
	};

	return new utilities;
})();

module.exports = utilities;