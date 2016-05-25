var expect = require('expect')
var parser = require('../').parseMethod;

var theContext = null;

var ok = null;

var t = new Promise(function (_ok, _err) {
    ok = _ok;
});

describe('context must be stored', function () {
    it('stores the context', function () {
        theContext = this.ctx;
    });
    
    ok(this.ctx);
});

t.then(function (context) {

    describe('context must be global', function () {
        it('the global variable must be the same reference of ctx', function () {
            if (theContext !== this.ctx)
                throw new Error();
        });
    });
})
