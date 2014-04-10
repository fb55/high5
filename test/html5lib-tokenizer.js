var fs = require("fs"),
    path = require("path"),
    assert = require("assert"),
    Tokenizer = require("../Tokenizer.js");

var root = path.join(__dirname, "html5lib-tests", "tokenizer");

var succ = 0,
    fail = 0;

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
				describe(test.description, function(){
					try {
						if(test.initialStates){
							test.initialStates.forEach(function(s){
								executeTest(test, s.replace(" state", "_STATE"));
							});
						} else {
							executeTest(test);
						}
						succ++;
					} catch(e){
						console.log(test.description, test.input, e.message);
						fail++;
					}
				});
			});
		});
	});
});

function getCollector(){
	var token = [],
	    tag = null,
	    attribs = null;

	function noop(){}

	return {
		token: token,
		onopentagname: function(n){
			attribs = {};
			tag = ["StartTag", n.toLowerCase(), attribs];
		},
		onclosetag: function(n){
			token.push(["EndTag", n.toLowerCase()]);
		},
		ontext: function(t){
			token.push(["Character", t]);
		},
		oncomment: function(t){
			token.push(["Comment", t]);
		},
		onattribute: function(n, v){
			var name = n.toLowerCase();
			if(!(name in attribs)) attribs[name] = v;
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
			token.push(["DOCTYPE", name && name.toLowerCase(), publicIdent, systemIdent, normalMode]);
		},
		oncommentend: noop,
		onend: noop
	};
}

function unescape(c){
	return c.replace(/\\u([\dA-F]+)/g, function(_, c){ return String.fromCharCode(parseInt(c, 16)); });
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
		.replace(/\r\n?/g, "\n")
		.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|([^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g, "$1\ufffd");
}

function executeTest(test, initialState){
	var collector = getCollector(),
	    tokenizer = new Tokenizer(collector, {decodeEntities: true});

	if(initialState) tokenizer._state = initialState;
	if(test.lastStartTag) tokenizer._sequence = test.lastStartTag;

	tokenizer.end(preprocessInput(test.input));
	assert.deepEqual(reduceCollection(collector.token), reduceCollection(test.output, true));
}

function describe(name, func){
	//console.log(name);
	func();
}

console.log("Total:", succ + fail, "Failed:", fail, "Success:", succ);

process.exit(fail);
