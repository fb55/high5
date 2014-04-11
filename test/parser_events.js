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
	.forEach(runTest);
}

function runTest(file, i){
	console.log(i + 1, file.name);
	var token = [];

	var cbs = {};

	["opentag", "closetag", "doctype"].forEach(function(name){
		cbs["on" + name] = function(){
			var t = Array.prototype.slice.call(arguments, 0);
			t.unshift(name);
			token.push(t);
		};
	});

	["text", "comment"].forEach(function(name){
		cbs["on" + name] = function(data){
			if(token.length && token[token.length-1][0] === name){
				token[token.length-1][1] += data;
				return;
			}
			token.push([name, data]);
		};
	});

	file.options.parser.debug = true;

	var parser = new Parser(cbs, file.options.parser);

	parser.end(file.html);

	file.expected.forEach(function(t){
		if(t.event === "opentagname" || t.event === "attribute") return;
		var cmp = token.shift();
		console.log(t, cmp);
		assert.equal(t.event, cmp.shift(), "should be the same event");
		assert.deepEqual(t.data, cmp, "should have same payload");
	});
}

function describe(name, func){
	console.log(name);
	func();
}