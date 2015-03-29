var prepareOptions = (function(){
	var prepareOptions = function(options){
		this.options = options;

		return this;
	};

	prepareOptions.prototype.prepare = function(){
		var arg;

		if(this.options.fields !== undefined){
			this.options.field = this.options.fields;

			delete this.options.fields;
		}

		for(arg in this.options){
			if(this[arg] instanceof Function){
				this.options[arg] = this[arg](this.options[arg]);
			}
		}

		return this;
	};

	prepareOptions.prototype.clist = function(val){
		return val instanceof Array ? val.join('.') : val;
	};

	prepareOptions.prototype.clist_output = function(val){
		return val instanceof Array ? val.join('.') : val;
	};

	prepareOptions.prototype.slist = function(val){
		return val instanceof Array ? val.join('.') : val;
	};

	prepareOptions.prototype.options = function(val){
		return val instanceof Array ? val.join('.') : val;
	};

	prepareOptions.prototype.records_csv = function(val){
		return val instanceof Array ? val.join('\n') : val;
	};

	prepareOptions.prototype.field = function(val){
		var newValue = {},
			l = val.length,
			i = 0;

		for(; i < l; ++i){
			newValue = {
				$: {},
				_: val[i].value
			};

			if(parseFloat(val[i].fid) !== NaN && parseFloat(val[i].fid) == val[i].fid){
				newValue.$.fid = val[i].fid;
			}else{
				newValue.$.name = val[i].fid;
			}

			val[i] = newValue;
		}

		return val;
	};

	return prepareOptions;
})();

module.exports = prepareOptions;