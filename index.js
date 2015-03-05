module.exports = Tokenizer;

var decodeCodePoint = require("entities/lib/decode_codepoint.js"),
    entityMap = require("entities/maps/entities.json"),
    legacyMap = require("entities/maps/legacy.json"),
    xmlMap    = require("entities/maps/xml.json"),

    n = 0;

const
    DATA                      = n++,
    RCDATA_STATE              = n++,
    RAWTEXT_STATE             = n++,
    SCRIPT_DATA_STATE         = n++,
    PLAINTEXT_STATE           = n++,

    TAG_OPEN                  = n++, //after <
    TAG_NAME                  = n++,
    SELF_CLOSING_START_TAG    = n++,
    END_TAG_OPEN              = n++,
    IN_CLOSING_TAG_NAME       = n++,
    AFTER_CLOSING_TAG_NAME    = n++,

    //attributes
    BEFORE_ATTRIBUTE_NAME     = n++,
    ATTRIBUTE_NAME            = n++,
    AFTER_ATTRIBUTE_NAME      = n++,
    BEFORE_ATTRIBUTE_VALUE    = n++,
    ATTRIBUTE_VALUE_DQ        = n++, // "
    ATTRIBUTE_VALUE_SQ        = n++, // '
    ATTRIBUTE_VALUE_NQ        = n++,

    //comments
    MARKUP_DECLARATION_OPEN   = n++, // !
    BOGUS_COMMENT             = n++,
    BEFORE_COMMENT            = n++,
    COMMENT_START             = n++,
    COMMENT_START_DASH        = n++,
    COMMENT                   = n++,
    COMMENT_END_DASH          = n++,
    COMMENT_END               = n++,
    COMMENT_END_BANG          = n++,

    //cdata
    BEFORE_CDATA              = n++,
    IN_CDATA                  = n++,
    AFTER_CDATA_1             = n++,  // ]
    AFTER_CDATA_2             = n++,  // ]

    BEFORE_ENTITY             = n++, //&
    BEFORE_NUMERIC_ENTITY     = n++, //#
    IN_NAMED_ENTITY           = n++,
    IN_NUMERIC_ENTITY         = n++,
    IN_HEX_ENTITY             = n++, //X

    END_TAG_NAME_STATE        = n++,

    RCDATA_LT_SIGN_STATE      = n++,
    RCDATA_END_TAG_NAME_STATE = n++,
    RAWTEXT_LT_SIGN_STATE     = n++,
    RAWTEXT_END_TAG_NAME_STATE= n++,
    SCRIPT_DATA_END_TAG_NAME_STATE = n++,

    SCRIPT_DATA_LT_SIGN_STATE = n++,
    SCRIPT_DATA_ESCAPE_START_STATE = n++,
    SCRIPT_DATA_ESCAPE_START_DASH_STATE = n++,
    SCRIPT_DATA_ESCAPED_STATE = n++,
    SCRIPT_DATA_ESCAPED_DASH_STATE = n++,
    SCRIPT_DATA_ESCAPED_DASH_DASH_STATE = n++,
    SCRIPT_DATA_ESCAPED_LT_SIGN_STATE = n++,
    SCRIPT_DATA_ESCAPED_END_TAG_OPEN_STATE = n++,
    SCRIPT_DATA_ESCAPED_END_TAG_NAME_STATE = n++,
    SCRIPT_DATA_DOUBLE_ESCAPE_START_STATE = n++,
    SCRIPT_DATA_DOUBLE_ESCAPED_STATE = n++,
    SCRIPT_DATA_DOUBLE_ESCAPED_DASH_STATE = n++,
    SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH_STATE = n++,
    SCRIPT_DATA_DOUBLE_ESCAPE_END_STATE = n++,

    BEFORE_DOCTYPE_NAME       = n++,
    DOCTYPE_NAME              = n++,
    AFTER_DOCTYPE_NAME        = n++,
    AFTER_DT_PUBLIC           = n++,
    BOGUS_EVIL_DOCTYPE        = n++,
    BOGUS_DOCTYPE             = n++,
    AFTER_DT_SYSTEM           = n++,
    DT_SYSTEM_DQ              = n++,
    DT_SYSTEM_SQ              = n++,
    DT_PUBLIC_DQ              = n++,
    DT_PUBLIC_SQ              = n++,
    DT_BETWEEN_PUB_SYS        = n++,
    AFTER_DT_SYSTEM_IDENT     = n++,

    SEQUENCE                  = n++,
    SKIP_NEWLINE              = n++,
    XML_DECLARATION           = n++,

    REPLACEMENT_CHARACTER     = "\ufffd";

function whitespace(c){
	return c === " " || c === "\n" || c === "\t" || c === "\f" || c === "\r";
}

function lowerCaseChar(c){
	return String.fromCharCode(c.charCodeAt(0) + 32);
}

function isNumber(c){
	return c >= "0" && c <= "9";
}

function isUpperCaseChar(c){
	return c >= "A" && c <= "Z";
}

function isLowerCaseChar(c){
	return c >= "a" && c <= "z";
}

function isLetter(c){
	return isLowerCaseChar(c) || isUpperCaseChar(c);
}

function isAttributeState(state){
	return state === ATTRIBUTE_VALUE_NQ || state === ATTRIBUTE_VALUE_SQ || state === ATTRIBUTE_VALUE_DQ;
}

function ifElseState(char, SUCCESS, FAILURE){
	return function(c){
		if(c === char){
			this._state = SUCCESS;
		} else {
			 this._state = FAILURE;
			 this._consumeCharacter(c);
		}
	};
}

function Tokenizer(cbs, options){
	this._state = DATA;
	this._buffer = "";
	this._sectionStart = 0;
	this._index = 0;
	this._baseState = DATA;
	this._nextState = DATA;
	this._sequence = "";
	this._sequenceIndex = 0;
	this._cbs = cbs;
	this._running = true;
	this._ended = false;
	this._xmlMode = !!(options && options.xmlMode);
	this._decodeEntities = options && "decodeEntities" in options ? !!options.decodeEntities : true;

	this._lowerCaseTagNames =
		options && "lowerCaseTags" in options ? !!options.lowerCaseTags : !this._xmlMode;
	this._lowerCaseAttributeNames =
		options && "lowerCaseAttributeNames" in options ? !!options.lowerCaseAttributeNames : !this._xmlMode;
	this._recognizeCDATA =
		options && "recognizeCDATA" in options ? !!options.recognizeCDATA : this._xmlMode;

	this._nameBuffer = null;
	this._valueBuffer = null;
	this._systemBuffer = null;
}

Tokenizer.prototype._consumeSequence = function(seq, SUCCESS, FAILURE){
	this._sequence = seq;
	this._nextState = SUCCESS;
	this._baseState = FAILURE;
	this._state = SEQUENCE;
	this._sequenceIndex = 0;
};

Tokenizer.prototype._sequenceState = function(c){
	var comp = this._sequence.charAt(this._sequenceIndex);
	if(c === comp || lowerCaseChar(c) === comp){
		this._sequenceIndex += 1;
		if(this._sequenceIndex === this._sequence.length){
			this._state = this._nextState;
		}
	} else {
		this._state = this._baseState;
		this._consumeCharacter(c);
	}
};

Tokenizer.prototype._skipNewlineState = function(c){
	if(c === "\n"){
		this._sectionStart = this._index + 1;
	}
	this._state = this._baseState;
	this._consumeCharacter(c);
};

Tokenizer.prototype._emitTextSection = function(){
	if(this._index > this._sectionStart){
		this._cbs.ontext(this._getSection());
		this._sectionStart = this._index;
	}
};

// 8.2.4.1 Data state

Tokenizer.prototype._dataState = function(c){
	if(c === "<"){
		this._state = TAG_OPEN;
		this._emitTextSection();
	} else if(c === "\r"){
		this._baseState = this._state;
		this._state = SKIP_NEWLINE;
		this._cbs.ontext(this._getPartialSection() + "\n");
	} else if(this._decodeEntities && c === "&"){
		this._baseState = this._state;
		this._state = BEFORE_ENTITY;
		this._emitTextSection();
	}
};

// 12.2.4.3 RCDATA state

Tokenizer.prototype._rcdataState = function(c){
	if(this._decodeEntities && c === "&"){
		this._baseState = this._state;
		this._state = BEFORE_ENTITY;
		this._emitTextSection();
	} else if(c === "<"){
		this._state = RCDATA_LT_SIGN_STATE;
		this._emitTextSection();
	} else {
		this._plaintextState(c);
	}
};

function textState(LT_SIGN_STATE){
	return function(c){
		if(c === "<"){
			this._state = LT_SIGN_STATE;
			this._emitTextSection();
		} else {
			this._plaintextState(c);
		}
	};
}

// 12.2.4.5 RAWTEXT state

Tokenizer.prototype._rawtextState = textState(RAWTEXT_LT_SIGN_STATE);


// 12.2.4.6 Script data state

Tokenizer.prototype._scriptDataState = textState(SCRIPT_DATA_LT_SIGN_STATE);


// 12.2.4.7 PLAINTEXT state

Tokenizer.prototype._plaintextState = function(c){
	if(c === "\0"){
		// parse error
		this._cbs.ontext(this._getPartialSection() + REPLACEMENT_CHARACTER);
	} else if(c === "\r"){
		this._baseState = this._state;
		this._state = SKIP_NEWLINE;
		this._cbs.ontext(this._getPartialSection() + "\n");
	}
};

// 8.2.4.8 Tag open state

Tokenizer.prototype._tagOpenState = function(c){
	if(c === "!"){
		this._state = MARKUP_DECLARATION_OPEN;
		this._sectionStart = this._index + 1;
	} else if(c === "/"){
		this._state = END_TAG_OPEN;
	} else if(this._lowerCaseTagNames && isUpperCaseChar(c)){
		this._state = TAG_NAME;
		this._nameBuffer = lowerCaseChar(c);
		this._sectionStart = this._index + 1;
	} else if(isLetter(c)){
		this._state = TAG_NAME;
		this._nameBuffer = "";
		this._sectionStart = this._index;
	} else if(c === "?"){
		if(this._xmlMode){
			this._state = XML_DECLARATION;
		} else {
			// parse error
			this._state = BOGUS_COMMENT;
		}
		this._sectionStart = this._index;
	} else {
		// parse error
		this._state = DATA;
		this._dataState(c);
	}
};

Tokenizer.prototype._xmlDeclarationState = function(c){
	//TODO fully support xml declarations
	if(c === ">"){
		this._cbs.onprocessinginstruction(this._getPartialSection());
		this._state = DATA;
	}
};

// 8.2.4.9 End tag open state

Tokenizer.prototype._endTagOpenState = function(c){
	if(this._lowerCaseTagNames && isUpperCaseChar(c)){
		this._state = IN_CLOSING_TAG_NAME;
		this._nameBuffer = lowerCaseChar(c);
		this._sectionStart = this._index + 1;
	} else if(isLetter(c)){
		this._state = IN_CLOSING_TAG_NAME;
		this._nameBuffer = "";
		this._sectionStart = this._index;
	} else if(c === ">"){
		// parse error
		this._state = DATA;
		this._sectionStart = this._index + 1;
	} else {
		// parse error
		this._state = BOGUS_COMMENT;
		this._sectionStart = this._index;
		this._bogusCommentState(c);
	}
};

// 8.2.4.10 Tag name state

Tokenizer.prototype._tagNameState = function(c){
	if(whitespace(c)){
		this._state = BEFORE_ATTRIBUTE_NAME;
		this._cbs.onopentagname(this._nameBuffer + this._getEndingSection());
	} else if(c === "/"){
		this._state = SELF_CLOSING_START_TAG;
		this._cbs.onopentagname(this._nameBuffer + this._getEndingSection());
	} else if(c === ">"){
		this._state = DATA;
		this._cbs.onopentagname(this._nameBuffer + this._getPartialSection());
		this._cbs.onopentagend();
	} else if(c === "\0"){
		this._nameBuffer += this._getPartialSection() + REPLACEMENT_CHARACTER;
	} else if(c === "\r"){
		this._nameBuffer += this._getPartialSection() + "\n";
		this._baseState = this._state;
		this._state = SKIP_NEWLINE;
	} else if(this._lowerCaseTagNames && isUpperCaseChar(c)){
		this._nameBuffer += this._getPartialSection() + lowerCaseChar(c);
	}
	// else add character to section
};

function lessThanSignState(BASE_STATE, NEXT_STATE){
	return function(c){
		if(c === "/"){
			this._state = SEQUENCE;
			this._sequenceIndex = 0;
			this._nextState = NEXT_STATE;
			this._baseState = BASE_STATE;
		} else {
			this._state = BASE_STATE;
			this._consumeCharacter(c);
		}
	};
}

Tokenizer.prototype._endTagNameState = function(c){
	if(whitespace(c) || c === "/"){
		this._state = AFTER_CLOSING_TAG_NAME;
		this._nameBuffer = this._sequence;
	} else if(c === ">"){
		this._state = DATA;
		this._cbs.onclosetag(this._sequence);
		this._sectionStart = this._index + 1;
	} else {
		this._state = this._baseState;
		this._consumeCharacter(c);
	}
};

// 12.2.4.11 RCDATA less-than sign state

Tokenizer.prototype._rcdataLtSignState = lessThanSignState(RCDATA_STATE, END_TAG_NAME_STATE);

//skipped 12.2.4.12 RCDATA end tag open state (using SEQUENCE instead)
//skipped 12.2.4.13 RCDATA end tag name state
//Tokenizer.prototype._rcdataEndTagNameState = endTagNameState rcdataEndTagNameState;

// 12.2.4.14 RAWTEXT less-than sign state

Tokenizer.prototype._rawtextLtSignState = lessThanSignState(RAWTEXT_STATE, END_TAG_NAME_STATE);

//skipped 12.2.4.15 RAWTEXT end tag open state
//skipped 12.2.4.16 RAWTEXT end tag name state
//Tokenizer.prototype._rawtextEndTagNameState = endTagNameState rawtextEndTagNameState;

// 12.2.4.17 Script data less-than sign state

Tokenizer.prototype._scriptDataLtSignState = function(c){
	if(c === "/"){
		this._state = SEQUENCE;
		this._sequenceIndex = 0;
		this._nextState = END_TAG_NAME_STATE;
		this._baseState = SCRIPT_DATA_STATE;
	} else if(c === "!"){
		this._state = SCRIPT_DATA_ESCAPE_START_STATE;
	} else {
		this._state = SCRIPT_DATA_STATE;
		this._scriptDataState(c);
	}
};

//skipped 12.2.4.18 Script data end tag open state
//skipped  12.2.4.19 Script data end tag name state
//Tokenizer.prototype._scriptDataEndTagNameState = endTagNameState scriptDataEndTagNameState;

// 12.2.4.20 Script data escape start state

Tokenizer.prototype._scriptDataEscapeStartState = ifElseState("-", SCRIPT_DATA_ESCAPE_START_DASH_STATE, SCRIPT_DATA_STATE);

// 12.2.4.21 Script data escape start dash state

Tokenizer.prototype._scriptDataEscapeStartDashState = ifElseState("-", SCRIPT_DATA_ESCAPED_DASH_DASH_STATE, SCRIPT_DATA_STATE);

// 8.2.4.22 Script data escaped state

Tokenizer.prototype._scriptDataEscapedState = function(c){
	if(c === "<"){
		this._state = SCRIPT_DATA_ESCAPED_LT_SIGN_STATE;
	} else if(c === "-"){
		this._state = SCRIPT_DATA_ESCAPED_DASH_STATE;
	} else if(c === "\0"){
		// parse error
		this._cbs.ontext(this._getPartialSection() + REPLACEMENT_CHARACTER);
	} else if(c === "\r"){
		this._cbs.ontext(this._getPartialSection() + "\n");
		this._baseState = this._state;
		this._state = SKIP_NEWLINE;
	}
};

// 8.2.4.23 Script data escaped dash state

Tokenizer.prototype._scriptDataEscapedDashState = ifElseState("-", SCRIPT_DATA_ESCAPED_DASH_DASH_STATE, SCRIPT_DATA_ESCAPED_STATE);

// 8.2.4.24 Script data escaped dash dash state

Tokenizer.prototype._scriptDataEscapedDashDashState = function(c){
	if(c === ">"){
		this._state = SCRIPT_DATA_STATE;
	} else if(c !== "-"){
		this._state = SCRIPT_DATA_ESCAPED_STATE;
		this._scriptDataEscapedState(c);
	}
};

// 8.2.4.25 Script data escaped less-than sign state

Tokenizer.prototype._scriptDataEscapedLtSignState = function(c){
	if(c === "s" || c === "S"){
		this._state = SEQUENCE;
		this._sequenceIndex = 1;
		this._baseState = SCRIPT_DATA_ESCAPED_STATE;
		this._nextState = SCRIPT_DATA_DOUBLE_ESCAPE_START_STATE;
	} else if(c === "/"){
		this._cbs.ontext(this._getPartialSection());
		this._state = SEQUENCE;
		this._sequenceIndex = 0;
		this._baseState = SCRIPT_DATA_ESCAPED_END_TAG_OPEN_STATE;
		this._nextState = SCRIPT_DATA_ESCAPED_END_TAG_NAME_STATE;
	}
};

// 8.2.4.26 Script data escaped end tag open state

Tokenizer.prototype._scriptDataEscapedEndTagOpenState = function(c){
	this._state = SCRIPT_DATA_ESCAPED_STATE;
	this._cbs.ontext("<-");
	this._scriptDataEscapedState(c);
};

// 8.2.4.27 Script data escaped end tag name state

Tokenizer.prototype._scriptDataEscapedEndTagNameState = function(c){
	if(c === ">"){
		this._state = DATA;
		this._cbs.onclosetag(this._sequence);
		this._sectionStart = this._index + 1;
	} else if(whitespace(c) || c === "/"){
		this._nameBuffer = this._sequence;
		this._state = AFTER_CLOSING_TAG_NAME;
	} else {
		this._scriptDataEscapedEndTagOpenState(c);
	}
};

// 8.2.4.28 Script data double escape start state

Tokenizer.prototype._scriptDataDoubleEscapeStartState = function(c){
	if(c === ">" || c === "/" || whitespace(c)){
		this._state = SCRIPT_DATA_DOUBLE_ESCAPED_STATE;
	} else {
		this._state = SCRIPT_DATA_ESCAPED_STATE;
		this._scriptDataEscapedState(c);
	}
};

// 8.2.4.29 Script data double escaped state

Tokenizer.prototype._scriptDataDoubleEscapedState = function(c){
	if(c === "<"){
		this._state = SEQUENCE;
		this._sequenceIndex = 0;
		this._baseState = SCRIPT_DATA_DOUBLE_ESCAPED_STATE;
		this._nextState = SCRIPT_DATA_DOUBLE_ESCAPE_END_STATE;
	} else if(c === "-"){
		this._state = SCRIPT_DATA_DOUBLE_ESCAPED_DASH_STATE;
	} else if(c === "\0"){
		// parse error
		this._cbs.ontext(this._getPartialSection() + REPLACEMENT_CHARACTER);
	} else if(c === "\r"){
		this._cbs.ontext(this._getPartialSection() + "\n");
		this._baseState = this._state;
		this._state = SKIP_NEWLINE;
	}
};

// 8.2.4.30 Script data double escaped dash state

Tokenizer.prototype._scriptDataDoubleEscapedDashState = ifElseState("-", SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH_STATE, SCRIPT_DATA_DOUBLE_ESCAPED_STATE);

// 8.2.4.31 Script data double escaped dash dash state

Tokenizer.prototype._scriptDataDoubleEscapedDashDashState = function(c){
	if(c === ">"){
		this._state = SCRIPT_DATA_STATE;
	} else if(c !== "-"){
		this._state = SCRIPT_DATA_DOUBLE_ESCAPED_STATE;
		this._scriptDataDoubleEscapedState(c);
	}
};

//skipped 8.2.4.32 Script data double escaped less-than sign state

Tokenizer.prototype._scriptDataDoubleEscapeEndState = function(c){
	if(c === ">" || c === "/" || whitespace(c)){
		this._state = SCRIPT_DATA_ESCAPED_STATE;
	} else {
		this._state = SCRIPT_DATA_DOUBLE_ESCAPED_STATE;
		this._scriptDataDoubleEscapedState(c);
	}
};

// 8.2.4.34 Before attribute name state

Tokenizer.prototype._beforeAttributeNameState = function(c){
	if(c === ">"){
		this._state = DATA;
		this._cbs.onopentagend();
		this._sectionStart = this._index + 1;
	} else if(c === "/"){
		this._state = SELF_CLOSING_START_TAG;
	} else if(!whitespace(c)){
		// parse error (c === "\"" || c === "'" || c === "<" || c === "=")
		this._state = ATTRIBUTE_NAME;
		if(c === "\0"){
			this._nameBuffer = REPLACEMENT_CHARACTER;
			this._sectionStart = this._index + 1;
		} else if(this._lowerCaseAttributeNames && isUpperCaseChar(c)){
			this._nameBuffer = lowerCaseChar(c);
			this._sectionStart = this._index + 1;
		} else {
			this._nameBuffer = "";
			this._sectionStart = this._index;
		}
	}
};

// 8.2.4.35 Attribute name state
//FIXME simplified

Tokenizer.prototype._attributeNameState = function(c){
	if(c === "=" || c === "/" || c === ">" || whitespace(c)){
		this._state = AFTER_ATTRIBUTE_NAME;
		this._nameBuffer += this._getEndingSection();
		this._afterAttributeNameState(c);
	} else if(c === "\0"){
		this._nameBuffer += this._getPartialSection() + REPLACEMENT_CHARACTER;
	} else if(this._lowerCaseAttributeNames && isUpperCaseChar(c)){
		this._nameBuffer += this._getPartialSection() + lowerCaseChar(c);
	}
};

// 8.2.4.36 After attribute name state

Tokenizer.prototype._afterAttributeNameState = function(c){
	if(c === "="){
		this._state = BEFORE_ATTRIBUTE_VALUE;
	} else if(c === "/"){
		this._state = SELF_CLOSING_START_TAG;
		this._cbs.onattribute(this._nameBuffer, "");
		this._nameBuffer = null;
	} else if(c === ">"){
		this._state = DATA;
		this._cbs.onattribute(this._nameBuffer, "");
		this._nameBuffer = null;
		this._cbs.onopentagend();
		this._sectionStart = this._index + 1;
	} else if(!whitespace(c)){
		// parse error (c === "\"" || c === "'" || c === "<")
		this._state = ATTRIBUTE_NAME;
		this._cbs.onattribute(this._nameBuffer, "");

		if(c === "\0"){
			this._nameBuffer = REPLACEMENT_CHARACTER;
			this._sectionStart = this._index + 1;
		} else if(this._lowerCaseAttributeNames && isUpperCaseChar(c)){
			this._nameBuffer = lowerCaseChar(c);
			this._sectionStart = this._index + 1;
		} else {
			this._nameBuffer = "";
			this._sectionStart = this._index;
		}
	}
};

// 8.2.4.37 Before attribute value state

Tokenizer.prototype._beforeAttributeValueState = function(c){
	if(c === "\""){
		this._state = ATTRIBUTE_VALUE_DQ;
		this._valueBuffer = "";
		this._sectionStart = this._index + 1;
	} else if(c === "'"){
		this._state = ATTRIBUTE_VALUE_SQ;
		this._valueBuffer = "";
		this._sectionStart = this._index + 1;
	} else if(c === ">"){
		// parse error
		this._state = DATA;
		this._cbs.onattribute(this._nameBuffer, "");
		this._nameBuffer = null;
		this._cbs.onopentagend();
		this._sectionStart = this._index + 1;
	} else if(!whitespace(c)){
		// parse error (c === "<" || c === "=")
		this._state = ATTRIBUTE_VALUE_NQ;
		this._valueBuffer = "";
		this._sectionStart = this._index;
		this._attributeValueNqState(c);
	}
};

function attributeValueQuotedState(QUOT){
	return function attrivValQuoted(c){
		if(c === QUOT){
			this._state = BEFORE_ATTRIBUTE_NAME;
			this._cbs.onattribute(this._nameBuffer, this._valueBuffer + this._getEndingSection());
			this._nameBuffer = this._valueBuffer = null;
        }  else if(c === "\r"){
			this._valueBuffer += this._getPartialSection() + "\n";
			this._baseState = this._state;
			this._state = SKIP_NEWLINE;
		} else if(this._decodeEntities && c === "&"){
			this._valueBuffer += this._getSection();
			this._baseState = this._state;
			this._state = BEFORE_ENTITY;
			this._sectionStart = this._index;
		} else if(c === "\0"){
			// parse error
			this._valueBuffer += this._getPartialSection() + REPLACEMENT_CHARACTER;
		}
	};
}

// 8.2.4.38 Attribute value (double-quoted) state
// 8.2.4.39 Attribute value (single-quoted) state

Tokenizer.prototype._attributeValueDqState = attributeValueQuotedState("\"");
Tokenizer.prototype._attributeValueSqState = attributeValueQuotedState("'");

// 8.2.4.40 Attribute value (unquoted) state

Tokenizer.prototype._attributeValueNqState = function(c){
	if(whitespace(c)){
		this._state = BEFORE_ATTRIBUTE_NAME;
		this._cbs.onattribute(this._nameBuffer, this._valueBuffer + this._getEndingSection());
		this._nameBuffer = this._valueBuffer = null;
	} else if(c === ">"){
		this._state = DATA;
		this._cbs.onattribute(this._nameBuffer, this._valueBuffer + this._getPartialSection());
		this._nameBuffer = this._valueBuffer = null;
		this._cbs.onopentagend();
	} else if(this._decodeEntities && c === "&"){
		this._valueBuffer += this._getSection();
		this._baseState = this._state;
		this._state = BEFORE_ENTITY;
		this._sectionStart = this._index;
	} else if(c === "\0"){
		// parse error
		this._valueBuffer += this._getPartialSection() + REPLACEMENT_CHARACTER;
	}
	// parse error (c === "\"" || c === "'" || c === "<" || c === "=" || c === "`")
};

// Ignored 8.2.4.42 After attribute value (quoted) state

// 8.2.4.43 Self-closing start tag state

Tokenizer.prototype._selfClosingStartTagState = function(c){
	if(c === ">"){
		this._state = DATA;
		this._cbs.onselfclosingtag();
		this._sectionStart = this._index + 1;
	} else {
		this._state = BEFORE_ATTRIBUTE_NAME;
		this._beforeAttributeNameState(c);
	}
};

// 8.2.4.44 Bogus comment state

Tokenizer.prototype._bogusCommentState = function(c){
	if(c === ">"){
		this._state = DATA;
		this._cbs.oncomment(this._getPartialSection());
		this._cbs.oncommentend();
	} else if(c === "\0"){
		this._cbs.oncomment(this._getPartialSection() + REPLACEMENT_CHARACTER);
	} else if(c === "\r"){
		this._cbs.oncomment(this._getPartialSection() + "\n");
		this._baseState = this._state;
		this._state = SKIP_NEWLINE;
	}
};

// 8.2.4.45 Markup declaration open state

Tokenizer.prototype._markupDeclarationOpenState = function(c){
	this._sectionStart = this._index;

	if(c === "-"){
		this._state = BEFORE_COMMENT;
	} else if(c === "d" || c === "D"){
		this._consumeSequence("octype", BEFORE_DOCTYPE_NAME, BOGUS_COMMENT);
	} else if(this._recognizeCDATA && c === "["){
		this._consumeSequence("CDATA", BEFORE_CDATA, BOGUS_COMMENT);
	} else if(this._xmlMode){
		this._state = XML_DECLARATION;
	} else {
		this._state = BOGUS_COMMENT;
		this._bogusCommentState(c);
	}
};

Tokenizer.prototype._beforeCommentState = function(c){
	if(c === "-"){
		this._state = COMMENT_START;
		this._sectionStart = this._index + 1;
	} else {
		this._state = BOGUS_COMMENT;
	}
};

// 8.2.4.46 Comment start state

Tokenizer.prototype._commentStartState = function(c){
	if(c === "-"){
		this._state = COMMENT_START_DASH;
	} else if(c === ">"){
		// parse error
		this._state = DATA;
		this._cbs.oncomment("");
		this._sectionStart = this._index + 1;
	} else {
		this._state = COMMENT;
		this._commentState(c);
	}
};

// 8.2.4.47 Comment start dash state

Tokenizer.prototype._commentStartDashState = function(c){
	if(c === "-"){
		this._state = COMMENT_END;
	} else if(c === ">"){
		// parse error
		this._state = DATA;
		this._cbs.oncomment("");
		this._sectionStart = this._index + 1;
	} else {
		this._state = COMMENT;
		this._commentState(c);
	}
};

// 8.2.4.48 Comment state

Tokenizer.prototype._commentState = function(c){
	if(c === "-"){
		this._state = COMMENT_END_DASH;
	} else if(c === "\0"){
		// parse error
		this._cbs.oncomment(this._getPartialSection() + REPLACEMENT_CHARACTER);
	} else if(c === "\r"){
		this._cbs.oncomment(this._getPartialSection() + "\n");
		this._baseState = this._state;
		this._state = SKIP_NEWLINE;
	}
};

// 8.2.4.49 Comment end dash state

Tokenizer.prototype._commentEndDashState = ifElseState("-", COMMENT_END, COMMENT);

// 8.2.4.50 Comment end state

Tokenizer.prototype._commentEndState = function(c){
	if(c === ">"){
		//remove 2 trailing chars
		this._state = DATA;
		this._cbs.oncomment(this._buffer.substring(this._sectionStart, this._index - 2));
		this._cbs.oncommentend();
		this._sectionStart = this._index + 1;
	} else if(c === "!"){
		// parse error
		this._state = COMMENT_END_BANG;
	} else if(c !== "-"){
		this._state = COMMENT;
		this._commentState(c);
	}
	// else: parse error, stay in COMMENT_END (`--->`)
};

// 8.2.4.51 Comment end bang state

Tokenizer.prototype._commentEndBangState = function(c){
	if(c === ">"){
		//remove trailing --!
		this._state = DATA;
		this._cbs.oncomment(this._buffer.substring(this._sectionStart, this._index - 3));
		this._cbs.oncommentend();
		this._sectionStart = this._index + 1;
	} else if(c === "-"){
		this._state = COMMENT_END_DASH;
	} else {
		this._state = COMMENT;
		this._commentState(c);
	}
};

Tokenizer.prototype._inClosingTagNameState = function(c){
	if(whitespace(c) || c === "/"){
		this._state = AFTER_CLOSING_TAG_NAME;
		this._nameBuffer += this._getEndingSection();
	} else if(c === ">"){
		this._state = DATA;
		this._cbs.onclosetag(this._nameBuffer + this._getPartialSection());
	} else if(c === "\0"){
		this._nameBuffer += this._getPartialSection() + REPLACEMENT_CHARACTER;
	} else if(this._lowerCaseTagNames && isUpperCaseChar(c)){
		this._nameBuffer += this._getPartialSection() + lowerCaseChar(c);
	}
};

Tokenizer.prototype._afterClosingTagNameState = function(c){
	//skip everything until ">"
	if(c === ">"){
		this._state = DATA;
		this._cbs.onclosetag(this._nameBuffer);
		this._sectionStart = this._index + 1;
	}
};

// Ignored: 8.2.4.52 DOCTYPE state - parse error when whitespace missing (<!DOCTYPEfoo>)

// 8.2.4.53 Before DOCTYPE name state
Tokenizer.prototype._beforeDoctypeNameState = function(c){
	if(whitespace(c));
	else if(c === ">"){
		this._state = DATA;
		this._cbs.ondoctype(null, null, null, false);
		this._sectionStart = this._index + 1;
	} else {
		this._state = DOCTYPE_NAME;

		if(c === "\0"){
			this._nameBuffer = REPLACEMENT_CHARACTER;
			this._sectionStart = this._index + 1;
		} else if(this._lowerCaseTagNames && isUpperCaseChar(c)){
			this._nameBuffer = lowerCaseChar(c);
			this._sectionStart = this._index + 1;
		} else {
			this._nameBuffer = "";
			this._sectionStart = this._index;
		}
	}
};

// 8.2.4.54 DOCTYPE name state
Tokenizer.prototype._doctypeNameState = function(c){
	if(whitespace(c)){
		this._nameBuffer += this._getEndingSection();
		this._state = AFTER_DOCTYPE_NAME;
	} else if(c === ">"){
		this._state = DATA;
		this._cbs.ondoctype(this._nameBuffer + this._getPartialSection(), null, null, true);
		this._nameBuffer = null;
	} else if(c === "\0"){
		this._nameBuffer += this._getPartialSection() + REPLACEMENT_CHARACTER;
	} else if(this._lowerCaseTagNames && isUpperCaseChar(c)){
		this._nameBuffer += this._getPartialSection() + lowerCaseChar(c);
	}
};

// 8.2.4.55 After DOCTYPE name state
Tokenizer.prototype._afterDoctypeNameState = function(c){
	if(c === ">"){
		this._state = DATA;
		this._cbs.ondoctype(this._nameBuffer, null, null, true);
		this._nameBuffer = null;
		this._sectionStart = this._index + 1;
	} else if(c === "P" || c === "p"){
		this._consumeSequence("ublic", AFTER_DT_PUBLIC, BOGUS_EVIL_DOCTYPE);
	} else if(c === "S" || c === "s"){
		this._consumeSequence("ystem", AFTER_DT_SYSTEM, BOGUS_EVIL_DOCTYPE);
	} else {
		this._state = BOGUS_EVIL_DOCTYPE;
	}
};

// 8.2.4.56 After DOCTYPE public keyword state
// Ignored 8.2.4.57 Before DOCTYPE public identifier state

Tokenizer.prototype._afterDtPublicState = function(c){
	if(whitespace(c));
	else if(c === ">"){
		this._state = DATA;
		this._cbs.ondoctype(this._nameBuffer, null, null, false);
		this._nameBuffer = null;
		this._sectionStart = this._index + 1;
	} else if(c === "\""){
		this._state = DT_PUBLIC_DQ;
		this._valueBuffer = "";
		this._sectionStart = this._index + 1;
	} else if(c === "'"){
		this._state = DT_PUBLIC_SQ;
		this._valueBuffer = "";
		this._sectionStart = this._index + 1;
	} else {
		this._state = BOGUS_EVIL_DOCTYPE;
	}
};

function doctypePublicQuotedState(quot){
	return function(c){
		if(c === quot){
			this._state = DT_BETWEEN_PUB_SYS;
			this._valueBuffer += this._getEndingSection();
		} else if(c === ">"){
			// parse error
			this._state = DATA;
			this._cbs.ondoctype(this._nameBuffer, this._valueBuffer + this._getPartialSection(), null, false);
			this._nameBuffer = this._valueBuffer = null;
		} else if(c === "\0"){
			this._valueBuffer += this._getPartialSection() + REPLACEMENT_CHARACTER;
		} else if(c === "\r"){
			this._valueBuffer += this._getPartialSection() + "\n";
			this._baseState = this._state;
			this._state = SKIP_NEWLINE;
		}
	};
}

// 8.2.4.58 DOCTYPE public identifier (double-quoted) state
// 8.2.4.59 DOCTYPE public identifier (single-quoted) state

Tokenizer.prototype._dtPublicDqState = doctypePublicQuotedState("\"");
Tokenizer.prototype._dtPublicSqState = doctypePublicQuotedState("'");

// Ignored 8.2.4.60 After DOCTYPE public identifier state
// 8.2.4.61 Between DOCTYPE public and system identifiers state

Tokenizer.prototype._dtBetweenPubSysState = function(c){
	if(whitespace(c));
	else if(c === ">"){
		this._state = DATA;
		this._cbs.ondoctype(this._nameBuffer, this._valueBuffer, null, true);
		this._nameBuffer = this._valueBuffer = null;
		this._sectionStart = this._index + 1;
	} else if(c === "\""){
		this._state = DT_SYSTEM_DQ;
		this._systemBuffer = "";
		this._sectionStart = this._index + 1;
	} else if(c === "'"){
		this._state = DT_SYSTEM_SQ;
		this._systemBuffer = "";
		this._sectionStart = this._index + 1;
	} else {
		this._state = BOGUS_EVIL_DOCTYPE;
	}
};

// 8.2.4.62 After DOCTYPE system keyword state
// Ignored 8.2.4.63 Before DOCTYPE system identifier state

Tokenizer.prototype._afterDtSystemState = function(c){
	if(whitespace(c));
	else if(c === ">"){
		this._state = DATA;
		this._cbs.ondoctype(this._nameBuffer, this._valueBuffer, this._systemBuffer, false);
		this._nameBuffer = this._valueBuffer = this._systemBuffer = null;
		this._sectionStart = this._index + 1;
	} else if(c === "\""){
		this._state = DT_SYSTEM_DQ;
		this._systemBuffer = "";
		this._sectionStart = this._index + 1;
	} else if(c === "'"){
		this._state = DT_SYSTEM_SQ;
		this._systemBuffer = "";
		this._sectionStart = this._index + 1;
	} else {
		this._state = BOGUS_EVIL_DOCTYPE;
	}
};

function doctypeSystemQuotedState(quot){
	return function(c){
		if(c === quot){
			this._state = AFTER_DT_SYSTEM_IDENT;
			this._systemBuffer += this._getEndingSection();
		} else if(c === ">"){
			// parse error
			this._state = DATA;
			this._cbs.ondoctype(this._nameBuffer, this._valueBuffer, this._systemBuffer + this._getPartialSection(), false);
			this._nameBuffer = this._valueBuffer = this._systemBuffer = null;
		} else if(c === "\0"){
			this._systemBuffer += this._getPartialSection() + REPLACEMENT_CHARACTER;
		} else if(c === "\r"){
			this._systemBuffer += this._getPartialSection() + "\n";
			this._baseState = this._state;
			this._state = SKIP_NEWLINE;
		}
	};
}

// 8.2.4.64 DOCTYPE system identifier (double-quoted) state
// 8.2.4.65 DOCTYPE system identifier (single-quoted) state

Tokenizer.prototype._dtSystemDqState = doctypeSystemQuotedState("\"");
Tokenizer.prototype._dtSystemSqState = doctypeSystemQuotedState("'");

// 8.2.4.66 After DOCTYPE system identifier state

Tokenizer.prototype._afterDtSystemIdentState = function(c){
	if(!whitespace(c)){
		this._state = BOGUS_DOCTYPE;
		this._cbs.ondoctype(this._nameBuffer, this._valueBuffer, this._systemBuffer, true);
		this._nameBuffer = this._valueBuffer = this._systemBuffer = null;
		this._bogusDoctypeState(c);
	}
};

//helper for sequences
Tokenizer.prototype._bogusEvilDoctypeState = function(c){
	this._state = BOGUS_DOCTYPE;
	this._cbs.ondoctype(this._nameBuffer, this._valueBuffer, this._systemBuffer, false);
	this._nameBuffer = this._valueBuffer = this._systemBuffer = null;
	this._bogusDoctypeState(c);
};

// 8.2.4.67 Bogus DOCTYPE state

Tokenizer.prototype._bogusDoctypeState = function(c){
	if(c === ">"){
		this._state = DATA;
		this._sectionStart = this._index + 1;
	}
};

// 8.2.4.68 CDATA section state

Tokenizer.prototype._beforeCdataState = function(c){
	if(c === "["){
		this._state = IN_CDATA;
		this._sectionStart = this._index + 1;
	} else {
		this._state = BOGUS_COMMENT;
		this._bogusCommentState(c);
	}
};

Tokenizer.prototype._inCdataState = function(c){
    if(c === "]") this._state = AFTER_CDATA_1;
};
Tokenizer.prototype._afterCdata1State = ifElseState("]", AFTER_CDATA_2, IN_CDATA);

Tokenizer.prototype._afterCdata2State = function(c){
	if(c === ">"){
		//remove 2 trailing chars
		this._state = DATA;
		this._cbs.oncdata(this._buffer.substring(this._sectionStart, this._index - 2));
		this._sectionStart = this._index + 1;
	} else if(c !== "]"){
		this._state = IN_CDATA;
	}
	//else: stay in AFTER_CDATA_2 (`]]]>`)
};

Tokenizer.prototype._beforeEntityState = function(c){
	if(c === "#"){
		this._state = BEFORE_NUMERIC_ENTITY;
	} else {
		this._state = IN_NAMED_ENTITY;
		this._inNamedEntityState(c);
	}
};

Tokenizer.prototype._beforeNumericEntityState = function(c){
	if(c === "x" || c === "X"){
		this._state = IN_HEX_ENTITY;
	} else {
		this._state = IN_NUMERIC_ENTITY;
		this._inNumericEntityState(c);
	}
};

Tokenizer.prototype._inNamedEntityState = function(c){
	if(c === ";"){
		if(this._sectionStart + 1 !== this._index){
			this._parseNamedEntityStrict();

			if(this._sectionStart + 1 < this._index){
				if(!isAttributeState(this._baseState) && !this._xmlMode){
					this._parseLegacyEntity();
				}
			} else {
				this._sectionStart++;
			}
		}

		this._state = this._baseState;
	} else if(!(isLetter(c) || isNumber(c))){
		if(this._xmlMode);
		else if(this._sectionStart + 1 === this._index);
		else if(isAttributeState(this._baseState)){
			if(c !== "="){
				this._parseNamedEntityStrict();
			}
		} else {
			this._parseLegacyEntity();
		}

		this._state = this._baseState;
		this._consumeCharacter(c);
	}
};

Tokenizer.prototype._inNumericEntityState = function(c){
	if(c === ";"){
		this._state = this._baseState;

		if(this._sectionStart + 2 !== this._index){
			this._decodeNumericEntity(2, 10);
			this._sectionStart = this._index + 1;
		}

	} else if(!isNumber(c)){
		this._state = this._baseState;

		if(!this._xmlMode && this._sectionStart + 2 !== this._index){
			this._decodeNumericEntity(2, 10);
			this._sectionStart = this._index;
		}

		this._consumeCharacter(c);
	}
};

Tokenizer.prototype._inHexEntityState = function(c){
	if(c === ";"){
		this._state = this._baseState;

		if(this._sectionStart + 3 !== this._index){
			this._decodeNumericEntity(3, 16);
			this._sectionStart = this._index + 1;
		}
	} else if(!isNumber(c) && (c < "a" || c > "f") && (c < "A" || c > "F")){
		this._state = this._baseState;

		if(!this._xmlMode && this._sectionStart + 3 !== this._index){
			this._decodeNumericEntity(3, 16);
			this._sectionStart = this._index;
		}

		this._consumeCharacter(c);
	}
};

//for entities terminated with a semicolon
Tokenizer.prototype._parseNamedEntityStrict = function(){
	var entity = this._buffer.substring(this._sectionStart + 1, this._index),
		map = this._xmlMode ? xmlMap : entityMap;

	if(map.hasOwnProperty(entity)){
		this._emitPartial(map[entity]);
		this._sectionStart = this._index;
	}
};


//parses legacy entities (without trailing semicolon)
Tokenizer.prototype._parseLegacyEntity = function(){
	var start = this._sectionStart + 1,
		limit = this._index - start;

	if(limit > 6) limit = 6; //the max length of legacy entities is 6

	while(limit >= 2){ //the min length of legacy entities is 2
		var entity = this._buffer.substr(start, limit);

		if(legacyMap.hasOwnProperty(entity)){
			this._emitPartial(legacyMap[entity]);
			this._sectionStart += limit + 1;
			return;
		} else {
			limit--;
		}
	}
};

Tokenizer.prototype._decodeNumericEntity = function(offset, base){
	var entity = this._buffer.substring(this._sectionStart + offset, this._index),
	    parsed = parseInt(entity, base);

	this._emitPartial(decodeCodePoint(parsed));
};

Tokenizer.prototype._cleanup = function(){
	if(this._sectionStart < 0){
		this._buffer = "";
		this._index = 0;
	} else if(this._running){
		if(
			this._state === DATA ||
			this._state === RCDATA_STATE ||
			this._state === RAWTEXT_STATE ||
			this._state === PLAINTEXT_STATE ||
			this._state === SCRIPT_DATA_STATE
		){
			if(this._sectionStart !== this._index){
				this._cbs.ontext(this._buffer.substr(this._sectionStart));
			}
			this._buffer = "";
			this._index = 0;
		} else if(this._sectionStart === this._index){
			//the section just started
			this._buffer = "";
			this._index = 0;
		} else {
			//remove everything unnecessary
			this._buffer = this._buffer.substr(this._sectionStart);
			this._index -= this._sectionStart;
		}

		this._sectionStart = 0;
	}
};

Tokenizer.prototype.write = function(chunk){
	if(this._ended) this._cbs.onerror(Error(".write() after done!"));

	this._buffer += chunk;
	this._parse();
};

Tokenizer.prototype._parse = function(){
	while(
		this._index < this._buffer.length && this._running
	){
		var c = this._buffer.charAt(this._index);

        this._consumeCharacter(c);
		this._index++;
	}

	this._cleanup();
};

Tokenizer.prototype._consumeCharacter = function(c){
    var state = this._state;

    if(state === ATTRIBUTE_VALUE_DQ){
        this._attributeValueDqState(c);
    } else if(state === DATA){
        this._dataState(c);
    } else if(state === SCRIPT_DATA_STATE){
        this._scriptDataState(c);
    } else if(state === ATTRIBUTE_NAME){
        this._attributeNameState(c);
    } else if(state === COMMENT){
        this._commentState(c);
    } else if(state === BEFORE_ATTRIBUTE_NAME){
        this._beforeAttributeNameState(c);
    } else if(state === TAG_NAME){
        this._tagNameState(c);
    } else if(state === IN_CLOSING_TAG_NAME){
        this._inClosingTagNameState(c);
    } else if(state === RCDATA_STATE){
        this._rcdataState(c);
    } else if(state === TAG_OPEN){
        this._tagOpenState(c);
    } else if(state === ATTRIBUTE_VALUE_SQ){
        this._attributeValueSqState(c);
    } else if(state === SCRIPT_DATA_ESCAPED_STATE){
        this._scriptDataEscapedState(c);
    } else if(state === BEFORE_ATTRIBUTE_VALUE){
        this._beforeAttributeValueState(c);
    } else if(state === IN_CDATA){
        this._inCdataState(c);
    } else if(state === SKIP_NEWLINE){
        this._skipNewlineState(c);
    } else if(state === END_TAG_OPEN){
        this._endTagOpenState(c);
    } else if(state === IN_NAMED_ENTITY){
        this._inNamedEntityState(c);
    } else if(state === SEQUENCE){
        this._sequenceState(c);
    } else if(state === BEFORE_ENTITY){
        this._beforeEntityState(c);
    } else if(state === ATTRIBUTE_VALUE_NQ){
        this._attributeValueNqState(c);
    } else if(state === COMMENT_END_DASH){
        this._commentEndDashState(c);
    } else if(state === SCRIPT_DATA_LT_SIGN_STATE){
        this._scriptDataLtSignState(c);
    } else if(state === SELF_CLOSING_START_TAG){
        this._selfClosingStartTagState(c);
    } else if(state === SCRIPT_DATA_ESCAPED_LT_SIGN_STATE){
        this._scriptDataEscapedLtSignState(c);
    } else if(state === MARKUP_DECLARATION_OPEN){
        this._markupDeclarationOpenState(c);
    } else if(state === COMMENT_END){
        this._commentEndState(c);
    } else if(state === COMMENT_START){
        this._commentStartState(c);
    } else if(state === BEFORE_COMMENT){
        this._beforeCommentState(c);
    } else if(state === IN_NUMERIC_ENTITY){
        this._inNumericEntityState(c);
    } else if(state === END_TAG_NAME_STATE){
        this._endTagNameState(c);
    } else if(state === DT_SYSTEM_DQ){
        this._dtSystemDqState(c);
    } else if(state === DT_PUBLIC_DQ){
        this._dtPublicDqState(c);
    } else if(state === BEFORE_NUMERIC_ENTITY){
        this._beforeNumericEntityState(c);
    } else if(state === AFTER_ATTRIBUTE_NAME){
        this._afterAttributeNameState(c);
    } else if(state === SCRIPT_DATA_ESCAPED_DASH_STATE){
        this._scriptDataEscapedDashState(c);
    } else if(state === SCRIPT_DATA_ESCAPE_START_STATE){
        this._scriptDataEscapeStartState(c);
    } else if(state === BOGUS_COMMENT){
        this._bogusCommentState(c);
    } else if(state === SCRIPT_DATA_ESCAPED_DASH_DASH_STATE){
        this._scriptDataEscapedDashDashState(c);
    } else if(state === DOCTYPE_NAME){
        this._doctypeNameState(c);
    } else if(state === AFTER_CDATA_1){
        this._afterCdata1State(c);
    } else if(state === IN_HEX_ENTITY){
        this._inHexEntityState(c);
    } else if(state === SCRIPT_DATA_DOUBLE_ESCAPED_STATE){
        this._scriptDataDoubleEscapedState(c);
    } else if(state === SCRIPT_DATA_ESCAPE_START_DASH_STATE){
        this._scriptDataEscapeStartDashState(c);
    } else if(state === BEFORE_DOCTYPE_NAME){
        this._beforeDoctypeNameState(c);
    } else if(state === RCDATA_LT_SIGN_STATE){
        this._rcdataLtSignState(c);
    } else if(state === DT_BETWEEN_PUB_SYS){
        this._dtBetweenPubSysState(c);
    } else if(state === SCRIPT_DATA_ESCAPED_END_TAG_OPEN_STATE){
        this._scriptDataEscapedEndTagOpenState(c);
    } else if(state === AFTER_DT_PUBLIC){
        this._afterDtPublicState(c);
    } else if(state === AFTER_CDATA_2){
        this._afterCdata2State(c);
    } else if(state === BEFORE_CDATA){
        this._beforeCdataState(c);
    } else if(state === COMMENT_START_DASH){
        this._commentStartDashState(c);
    } else if(state === AFTER_DOCTYPE_NAME){
        this._afterDoctypeNameState(c);
    } else if(state === AFTER_DT_SYSTEM_IDENT){
        this._afterDtSystemIdentState(c);
    } else if(state === AFTER_CLOSING_TAG_NAME){
        this._afterClosingTagNameState(c);
    } else if(state === XML_DECLARATION){
        this._xmlDeclarationState(c);
    } else if(state === SCRIPT_DATA_DOUBLE_ESCAPE_START_STATE){
        this._scriptDataDoubleEscapeStartState(c);
    } else if(state === SCRIPT_DATA_ESCAPED_END_TAG_NAME_STATE){
        this._scriptDataEscapedEndTagNameState(c);
    } else if(state === SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH_STATE){
        this._scriptDataDoubleEscapedDashDashState(c);
    } else if(state === SCRIPT_DATA_DOUBLE_ESCAPED_DASH_STATE){
        this._scriptDataDoubleEscapedDashState(c);
    } else if(state === DT_SYSTEM_SQ){
        this._dtSystemSqState(c);
    } else if(state === SCRIPT_DATA_DOUBLE_ESCAPE_END_STATE){
        this._scriptDataDoubleEscapeEndState(c);
    } else if(state === BOGUS_EVIL_DOCTYPE){
        this._bogusEvilDoctypeState(c);
    } else if(state === BOGUS_DOCTYPE){
        this._bogusDoctypeState(c);
    } else if(state === AFTER_DT_SYSTEM){
        this._afterDtSystemState(c);
    } else if(state === COMMENT_END_BANG){
        this._commentEndBangState(c);
    } else if(state === RAWTEXT_STATE){
        this._rawtextState(c);
    } else if(state === SCRIPT_DATA_END_TAG_NAME_STATE){
        this._scriptDataEndTagNameState(c);
    } else if(state === DT_PUBLIC_SQ){
        this._dtPublicSqState(c);
    } else if(state === RAWTEXT_END_TAG_NAME_STATE){
        this._rawtextEndTagNameState(c);
    } else if(state === RAWTEXT_LT_SIGN_STATE){
        this._rawtextLtSignState(c);
    } else if(state === RCDATA_END_TAG_NAME_STATE){
        this._rcdataEndTagNameState(c);
    } else if(state === PLAINTEXT_STATE){
        this._plaintextState(c);
    }
};

Tokenizer.prototype.pause = function(){
	this._running = false;
};

Tokenizer.prototype.resume = function(){
	this._running = true;

	if(this._index < this._buffer.length){
		this._parse();
	}
	if(this._ended){
		this._finish();
	}
};

Tokenizer.prototype.consumePlaintext = function(){
	this._state = PLAINTEXT_STATE;
};

Tokenizer.prototype.consumeScriptData = function(){
	this._state = SCRIPT_DATA_STATE;
	this._sequence = "script";
};

Tokenizer.prototype.consumeRCData = function(endTag){
	this._state = RCDATA_STATE;
	this._sequence = endTag;
};

Tokenizer.prototype.consumeRawtext = function(endTag){
	this._state = RAWTEXT_STATE;
	this._sequence = endTag;
};

Tokenizer.prototype.end = function(chunk){
	if(this._ended) this._cbs.onerror(Error(".end() after done!"));
	if(chunk) this.write(chunk);

	this._ended = true;

	if(this._running) this._finish();
};

Tokenizer.prototype._finish = function(){
	//if there is remaining data, emit it in a reasonable way
	var data = this._buffer.substr(this._sectionStart);

	if(
		this._state === AFTER_DOCTYPE_NAME ||
		this._state === AFTER_DT_PUBLIC ||
		this._state === BOGUS_EVIL_DOCTYPE ||
		this._state === AFTER_DT_SYSTEM ||
		this._state === DT_BETWEEN_PUB_SYS ||
		this._state === AFTER_DT_SYSTEM_IDENT
	){
		this._cbs.ondoctype(this._nameBuffer, this._valueBuffer, this._systemBuffer, false);
	} else if(this._state === DT_PUBLIC_DQ || this._state === DT_PUBLIC_SQ){
		this._cbs.ondoctype(this._nameBuffer, this._valueBuffer + data, this._systemBuffer, false);
	} else if(this._state === DT_SYSTEM_DQ || this._state === DT_SYSTEM_SQ){
		this._cbs.ondoctype(this._nameBuffer, this._valueBuffer, this._systemBuffer + data, false);
	} else if(this._state === BEFORE_DOCTYPE_NAME){
		this._cbs.ondoctype(null, null, null, false);
	} else if(this._state === DOCTYPE_NAME){
		this._cbs.ondoctype(this._nameBuffer + data, null, null, false);
	} else if(this._state === SEQUENCE){
		this._state = this._baseState;
		this._finish();
	} else if(
		this._state === MARKUP_DECLARATION_OPEN ||
		this._state === BEFORE_COMMENT ||
		this._state === COMMENT ||
		this._state === BOGUS_COMMENT ||
		this._state === COMMENT_START
	){
		this._cbs.oncomment(data);
	} else if(this._state === COMMENT_START_DASH || this._state === COMMENT_END_DASH){
		// parse error
		this._cbs.oncomment(data.slice(0, -1));
	} else if(this._state === COMMENT_END){
		// parse error
		this._cbs.oncomment(data.slice(0, -2));
	} else if(this._state === COMMENT_END_BANG){
		// parse error
		this._cbs.oncomment(data.slice(0, -3));
	} else if(data.length === 0){
		//we're done
	} else if(
		(this._xmlMode || isAttributeState(this._baseState)) &&
		(this._state === IN_NAMED_ENTITY || this._state === IN_NUMERIC_ENTITY || this._state === IN_HEX_ENTITY)
	){
		this._state = this._baseState;
		this._finish();
	} else if(this._state === IN_NUMERIC_ENTITY){
		if(data.length > 2){
			this._decodeNumericEntity(2, 10);
		} else {
			this._cbs.ontext(data);
		}
	} else if(this._state === IN_HEX_ENTITY){
		if(data.length > 3){
			this._decodeNumericEntity(3, 16);
		} else {
			this._cbs.ontext(data);
		}
	} else if(this._state === IN_NAMED_ENTITY){
		if(data.length > 1){
			this._parseLegacyEntity();
		}

		if(this._sectionStart < this._index){
			this._state = this._baseState;
			this._finish();
		}
	} else if(this._state === IN_CDATA || this._state === AFTER_CDATA_1 || this._state === AFTER_CDATA_2){
		this._cbs.oncdata(data);
	} else if(
		this._state !== TAG_NAME &&
		this._state !== AFTER_CLOSING_TAG_NAME &&
		this._state !== BEFORE_ATTRIBUTE_NAME &&
		this._state !== BEFORE_ATTRIBUTE_VALUE &&
		this._state !== AFTER_ATTRIBUTE_NAME &&
		this._state !== ATTRIBUTE_NAME &&
		this._state !== ATTRIBUTE_VALUE_SQ &&
		this._state !== ATTRIBUTE_VALUE_DQ &&
		this._state !== ATTRIBUTE_VALUE_NQ &&
		this._state !== IN_CLOSING_TAG_NAME &&
		this._state !== BOGUS_DOCTYPE
	){
		this._cbs.ontext(data);
	}
	//else, ignore remaining data
	//TODO add a way to remove current tag

	this._cbs.onend();
};

Tokenizer.prototype.reset = function(){
	Tokenizer.call(this, this._cbs, {
		xmlMode: this._xmlMode,
		decodeEntities: this._decodeEntities,
		lowerCaseTags: this._lowerCaseTagNames,
		lowerCaseAttributeNames: this._lowerCaseAttributeNames,
		recognizeCDATA: this._recognizeCDATA
	});
};

Tokenizer.prototype._getSection = function(){
	return this._buffer.substring(this._sectionStart, this._index);
};

Tokenizer.prototype._getEndingSection = function(){
	var ret = this._getSection();
	this._sectionStart = -1;
	return ret;
};

Tokenizer.prototype._getPartialSection = function(){
	var ret = this._getSection();
	this._sectionStart = this._index + 1;
	return ret;
};

Tokenizer.prototype._emitPartial = function(value){
	if(isAttributeState(this._baseState)){
		this._valueBuffer += value;
	} else {
		this._cbs.ontext(value);
	}
};
