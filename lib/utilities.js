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
			i = 0, d;

		if(typeof(arguments[nObjs - 1]) === 'boolean'){
			overwrite = arguments[nObjs - 1];
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
		var str = '', v;

		for(v in obj){
			if(str !== ''){
				str += delim;
			}

			if(typeof obj[v] === 'object' || obj[v] instanceof Array){
				str += this.joinArray(obj[v], delim);
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

		var result,
			o = 0, k = 0,
			i = 0, l = obj.length;

		for(; i < l; ++i){
			if(typeof key == 'object' || key instanceof Array){
				result = new Array(key.length);
				result = this.setAll(result, false);

				for(o = 0, k = result.length; o < k; ++o){
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
		var node, pFloat, plural, singular;

		for(node in xml){
			if(typeof(xml[node]) === 'object' && xml[node].length == 1){
				xml[node] = xml[node][0];
			}

			if(typeof(xml[node]) === 'object'){
				xml[node] = this.cleanXML(xml[node]);
			}

			plural = node.substr(-1, 1);
			singular = node.substring(0, node.length - 1);

			if(xml[node] instanceof Object && Object.keys(xml[node]).length === 1 && plural === 's' && xml[node].hasOwnProperty(singular)){
				xml[node] = xml[node][singular]
			}

			// Ensure that the int version is safe to use
			if(typeof(xml[node]) === 'string' && xml[node] < 9007199254740991){
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