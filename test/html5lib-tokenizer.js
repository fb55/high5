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

		describe(n, function(){
			(test.tests||test.xmlViolationTests).forEach(function(test){
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
						console.log(test.description, e.message);
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
	    attribs = null,
	    name = "";

	function noop(){}

	return {
		token: token,
		onopentagname: function(n){
			attribs = {};
			tag = ["StartTag", n.toLowerCase().replace(/\0/g, "\ufffd"), attribs];
		},
		onclosetag: function(n){
			token.push(["EndTag", n.toLowerCase().replace(/\0/g, "\ufffd")]);
		},
		ontext: function(t){
			token.push(["Character", t]);
		},
		oncomment: function(t){
			token.push(["Comment", t]);
		},
		onboguscomment: function(t){
			token.push(["Comment", t]);
		},
		onattribname: function(n){
			name = n.toLowerCase().replace(/\0/g, "\ufffd");
			if(name in attribs) name = "";
			else attribs[name] = "";
		},
		onattribdata: function(v){
			if(name) attribs[name] += v;
		},
		onattribend: function(){
			name = "";
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
		ondoctypename: function(name){
			token.push(["DOCTYPE", name.toLowerCase().replace(/\0/g, "\ufffd") || null, null, null, true]);
		},
		ondoctypepublic: function(p){
			token[token.length-1][2] = p.replace(/\0/g, "\ufffd");
		},
		ondoctypesystem: function(s){
			token[token.length-1][3] = s.replace(/\0/g, "\ufffd");
		},
		ondtquirksend: function(){
			token[token.length-1][4] = false;
		},
		onboguscommentend: noop,
		oncommentend: noop,
		ondoctypeend: noop,
		onend: noop
	};
}

function unescape(c){
	return c.replace(/\\u([\dA-F]+)/g, function(_, c){ return String.fromCharCode(parseInt(c, 16)); });
}

function reduceCollection(c){
	var out = [];

	c.forEach(function handle(t){
		if(t === "ParseError"){
			return;
		}
		t = t.slice(0);
		switch(t[0]){
			case "Comment":
			case "Character":
				t[1] = unescape(t[1]);
				t[1] = t[1].replace(/\r\n?/g, "\n");
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

function executeTest(test, initialState){
	var collector = getCollector(),
	    tokenizer = new Tokenizer({decodeEntities: true}, collector);

	if(initialState) tokenizer._state = initialState;
	if(test.lastStartTag) tokenizer._sequence = test.lastStartTag;
	test.input = unescape(test.input);

	tokenizer.end(test.input);
	assert.deepEqual(reduceCollection(collector.token), reduceCollection(test.output));
}

function describe(name, func){
	//console.log(name);
	func();
}

console.log("Total:", succ + fail, "Failed:", fail, "Success:", succ);

process.exit(fail);