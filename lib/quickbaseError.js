var quickbaseError = (function(){
	var quickbaseError = function(code, name, message){
		this.code = code;
		this.name = name;
		this.message = message;

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