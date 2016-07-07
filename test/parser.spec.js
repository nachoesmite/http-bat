/*var expect = require('expect')
var parser = require('../').parseMethod;

describe('correct parsing', function () {
    it('parses a simple GET', function () {
        expect(parser('GET /')).toEqual({
            method: 'get',
            url: '/'
        });
        expect(parser('GET ?')).toEqual({
            method: 'get',
            url: '?'
        });
    })

    it('parses a simple POST', function () {
        expect(parser('POST /uri')).toEqual({
            method: 'post',
            url: '/uri'
        });
        expect(parser('POST /uri?qs=1')).toEqual({
            method: 'post',
            url: '/uri?qs=1'
        });
    })

    it('fail on unknown method', function () {
        expect(function () {
            parser('SARASA /uri');
        }).toThrow();
    });

    it('fail on lower case method', function () {
        expect(function () {
            parser('get /uri');
        }).toThrow();
    });

    it('the url must start with / or ?', function () {
        expect(function () {
            parser('GET uri');
        }).toThrow();
    });

    it('the url cannot end with "/" if length > 1', function () {
        expect(function () {
            parser('GET /uri/');
        }).toThrow();
    });

    it('do nothing', function () {
        expect(parser('get/uri')).toEqual(null);

        expect(parser('')).toEqual(null);
    });
})*/