var quickbaseError = (function(){
	var quickbaseError = function(code, text, detail){
		this.code = code || defaults.status.errcode;
		this.name = text || defaults.status.errtext;
		this.message = detail || defaults.status.errdetail;

		return this;
	};

	quickbaseError.prototype = Object.create(Error.prototype);
	quickbaseError.prototype.constructor = quickbaseError;

	return quickbaseError;
})();

module.exports = quickbaseError;