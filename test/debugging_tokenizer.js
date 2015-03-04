var Tokenizer = require("../"),
    util = require("util");

module.exports = DebuggingTokenizer;

function DebuggingTokenizer(){
    Tokenizer.apply(this, arguments);
}

util.inherits(DebuggingTokenizer, Tokenizer);

Object.keys(Tokenizer.prototype).forEach(function(k){
    var func = Tokenizer.prototype[k],
        name = func.name;

    if(!isNaN(k) && name){
        DebuggingTokenizer.prototype[k] = function(c){
            console.log("-> %j %s", c, name);
            func.call(this, c);
        };
    }
});

DebuggingTokenizer.prototype._finish = function(){
    var data = this._buffer.substr(this._sectionStart);

	console.log("-| %s %j", Tokenizer.prototype[this._state].name, data);

    Tokenizer.prototype._finish.call(this);
};
