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
		var node, value, plural, singular,
			l = -1, i = -1, s = -1, e = -1,
			isInt = /^\-?\s*\d+$/,
			isDig = /^(\-?\s*\d*\.?\d*)$/;

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
				xml[node] = xml[node][singular];
			}

			/*
				JavaScript conforms to IEEE 754 Binary64 (Double Precision)

				Integer: -(2^53 - 1) <-> 2^53 - 1 (-9007199254740991 <-> 9007199254740991)
				 Digits: 15 (0.100000000000001)
				      E: 5e-324 <-> 1.79e308

				      0.10000000000000005

				That is what JavaScript can support. Anything above the safe
				integer isn't reliable and anything with more than 15 digits
				isn't reliable. ie:

					Number.MAX_SAFE_INTEGER     // 9007199254740991
					Number.MAX_SAFE_INTEGER + 1 // 9007199254740992
					Number.MAX_SAFE_INTEGER + 2 // 9007199254740992
					Number.MAX_SAFE_INTEGER + 3 // 9007199254740994

					16 Digits
					0.1000000000000001          // 0.1000000000000001
					0.1000000000000001 + 1      // 1.1
					0.1000000000000001 + 1.1    // 1.2000000000000002

					15 Digits
					0.100000000000001           // 0.100000000000001
					0.100000000000001 + 1       // 1.100000000000001
					0.100000000000001 + 1.1     // 1.200000000000001

					Number.MAX_VALUE * 2        // Infinity
					Number.MIN_VALUE / 2        // 0

				So what do you do?

				xml2js (v0.4.4) returns everything it parses as a string. It
				also lives as a string from the start, this is good. Any val
				that is unsafe can be kept as a string and the parsing would
				be aborted for that val.

				We could say fuck it and keep everything as a string, but we
				wouldn't get all the perks of having them be real numbers we
				can natively manipulate.
			*/
			
			if(typeof(xml[node]) === 'string'){
				value = xml[node].trim();

				if(value.match(isDig)){
					if(value.match(isInt)){
						if(Math.abs(parseInt(value)) <= Number.MAX_SAFE_INTEGER){
							xml[node] = parseInt(value);
						}
					}else{
						l = value.length;

						if(l <= 15){
							xml[node] = parseFloat(value);
						}else{
							for(i = 0, s = -1, e = -1; i < l && e - s <= 15; ++i){
								if(value.charAt(i) > 0){
									if(s === -1){
										s = i;
									}else{
										e = i;
									}
								}
							}

							if(e - s <= 15){
								xml[node] = parseFloat(value);
							}
						}
					}
				}
			}
		}

		return xml;
	};

	return new utilities;
})();

module.exports = utilities;