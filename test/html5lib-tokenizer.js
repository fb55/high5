var fs = require("fs"),
    path = require("path"),
    assert = require("assert"),
    Tokenizer = require("../");

var root = path.join(__dirname, "html5lib-tests", "tokenizer");

describe("html5lib-tests Tokenizer", function(){
	fs
	.readdirSync(root)
	.filter(RegExp.prototype.test, /\.test$/)
	.forEach(function(n){
		var file = fs.readFileSync(path.join(root, n)),
		    test = JSON.parse(file.toString());

		if(!test.tests) return;

		describe(n, function(){
			test.tests.forEach(function(test){
				it(test.description, function(){
					iterateStates(test, false);
				});
			});
		});
	});
});

function iterateStates(test, debug){
	if(test.initialStates){
		test.initialStates.forEach(function(s){
			executeTest(test, s.replace(" state", ""), debug);
		});
	} else {
		executeTest(test, null, debug);
	}
}

function getCollector(){
	var token = [],
	    tag = null,
	    attribs = null;

	function noop(){}

	return {
		token: token,
		onopentagname: function(n){
			attribs = {};
			tag = ["StartTag", n, attribs];
		},
		onclosetag: function(n){
			token.push(["EndTag", n]);
		},
		ontext: function(t){
			token.push(["Character", t]);
		},
		oncomment: function(t){
			token.push(["Comment", t]);
		},
		onattribute: function(n, v){
			if(!(n in attribs)) attribs[n] = v;
		},
		onopentagend: function(){
			token.push(tag);
			tag = attribs = null;
		},
		onselfclosingtag: function(){
			tag.push(true);
			token.push(tag);
			tag = attribs = null;
		},
		ondoctype: function(name, publicIdent, systemIdent, normalMode){
			token.push(["DOCTYPE", name, publicIdent, systemIdent, normalMode]);
		},
		oncommentend: noop,
		onend: noop
	};
}

function unescape(c){
	return c.replace(/\\u[\dA-F]+/g, function(c){ return String.fromCharCode(parseInt(c.substr(2), 16)); });
}

function reduceCollection(c, esc){
	var out = [];

	c.forEach(function handle(t){
		if(t === "ParseError"){
			return;
		}
		t = t.slice(0);
		if(esc && t[1]) t[1] = unescape(t[1]);
		switch(t[0]){
			case "Comment":
			case "Character":
				if(out.length && out[out.length - 1][0] === t[0]){
					out[out.length - 1][1] += t[1];
				} else out.push(t);
				break;
			default:
				out.push(t);
		}
	});

	return out;
}

function preprocessInput(str){
	return unescape(str)
		.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|([^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g, "$1\ufffd");
}

function executeTest(test, initialState, debug){
	var collector = getCollector(),
	    tokenizer = new Tokenizer(collector, {decodeEntities: true, debug: debug});

	if(initialState){
		switch(initialState){
			case "RCDATA":
				tokenizer.consumeRCData(test.lastStartTag);
				break;
			case "RAWTEXT":
				tokenizer.consumeRawtext(test.lastStartTag);
				break;
			case "PLAINTEXT":
				tokenizer.consumePlaintext();
				break;
			default:
				throw new Error("not implemented");
		}
	}

	tokenizer.end(preprocessInput(test.input));
	assert.deepEqual(reduceCollection(collector.token), reduceCollection(test.output, true));
}
