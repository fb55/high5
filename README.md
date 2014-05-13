#high5

(eventually) spec-compliant html5 parser

###Goals

My previous HTML parser, [`htmlparser2`](https://github.com/fb55/htmlparser2), reached a point where a clean cut was needed. _high5_ is this cut, even though it's based on _htmlparser2_ and will try to be backwards compatible (I even tried to preserve the git history, so all previous committers are still credited).

Some of the things that will be supported:

- [x] `doctype`s were treated as processing instructions & not parsed at all.
- [x] Several token types that were previously handled as processing instruction tokens are handled as (bogus) comments in the HTML5 spec.
- [ ] The `xmlMode` option will still be available & conditionally switch these features on.
- [ ] Add a _document mode_. (`htmlparser2` is always in _fragment mode_, meaning that eg. the empty document (`""`) will result in an empty DOM.)
- [ ] Implicit opening & closing tags. (`htmlparser2` only checks the top element of the stack for the latter.)
- [ ] Foster parenting (eg. `<table><a>foo</a>…` should be handled as `<a>foo</a><table>…`).
- [ ] \(Potentially) handle character encodings (?).

###State

- Spec-compliant\* tokenizer
- Rudimentary tag-handling (still a long way to go, only marginally better than htmlparser2).

\* The tokenizer takes several shortcuts, which greatly increase the speed of a JavaScript implementation, but disobay the spec implementation-wise. The output should be spec-compliant, though.
