var path = require("path"),
    fs = require("fs"),
    assert = require("assert"),
    Parser = require("..");

describe("Events", readDir);

function readDir(){
	var dir = path.join(__dirname, "Events");

	fs
	.readdirSync(dir)
	.filter(RegExp.prototype.test, /^[^\._]/) //ignore all files with a leading dot or underscore
	.map(function(name){
		return path.join(dir, name);
	})
	.map(require)
	.forEach(function(file, i){
		it(i + 1 + " " + file.name, function(){
			runTest(file);
		});
	});
}

function runTest(file){
	var cbs = {},
	    token = [],
	    lastToken = null;

	function addToken(t){
		token.push(t);
		lastToken = t;
	}

	["opentag", "closetag", "doctype", "cdatastart", "cdataend"].forEach(function(name){
		cbs["on" + name] = function(){
			var t = Array.prototype.slice.call(arguments, 0);
			t.unshift(name);
			addToken(t);
		};
	});

	["text", "comment"].forEach(function(name){
		cbs["on" + name] = function(data){
			if(lastToken && lastToken[0] === name){
				token[token.length-1][1] += data;
				return;
			}
			addToken([name, data]);
		};
	});

	cbs.oncommentend = function(){ lastToken = null; };

	var parser = new Parser(cbs, file.options.parser);

	parser.end(file.html);

	file.expected.forEach(function(t){
		if(t.event === "opentagname" || t.event === "attribute" || t.event === "commentend") return;
		if(t.event === "processinginstruction"){
			t.event = "comment"; //FIXME
			t.data.shift();
			if(t.data[0].charAt(0) === "!") t.data[0] = t.data[0].substr(1);
		}

		var cmp = token.shift();

		assert.equal(t.event, cmp.shift(), "should be the same event");
		assert.deepEqual(t.data, cmp, "should have same payload");
	});

	assert.equal(token.length, 0, "all token should be checked");
}