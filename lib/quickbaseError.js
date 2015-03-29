var quickbaseError = (function(){
	var quickbaseError = function(code, text, detail){
		this.code = code;
		this.name = text;
		this.message = detail;

		if(this.message instanceof Object){
			this.message = this.message._;
		}

		return this;
	};

	quickbaseError.prototype = Object.create(Error.prototype);
	quickbaseError.prototype.constructor = quickbaseError;

	return quickbaseError;
})();

module.exports = quickbaseError;