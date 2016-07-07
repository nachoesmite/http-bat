"use strict";
var ATL_1 = require('./../lib/ATL');
var ATLHelpers = require('./../lib/ATLHelpers');
var expect = require('expect');
var Pointer = ATLHelpers.pointerLib.Pointer;
describe('Empty Object -> ATL', function () {
    var atl = new ATL_1.ATL();
    it('emptyObject must emit empty ATL', function () {
        expect(function () { return atl.fromObject({}); }).toNotThrow();
    });
    it('must contains 0 suites', function () { return expect(Object.keys(atl.suites).length).toBe(0, "Suites"); });
    it('must contains 0 variables', function () { return expect(Object.keys(atl.options.variables).length).toBe(1, "Variables"); });
});
describe('Validations (Object -> ATL)', function () {
    it('Non object variables', function () {
        var atl = new ATL_1.ATL();
        expect(function () { return atl.fromObject({
            variables: 1
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            variables: ""
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            variables: false
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            variables: {}
        }); }).toNotThrow();
    });
    it('ENV must be overriden if present on spec only', function () {
        var atl = new ATL_1.ATL();
        atl.fromObject({
            variables: {}
        });
        expect('ENV' in atl.options.variables).toBeTruthy("ENV MUST exists on variables");
        expect(typeof atl.options.variables['ENV']).toBe("object", "ENV MUST be an object 1");
        expect(function () { return atl.fromObject({
            variables: {
                ENV: {}
            }
        }); }).toNotThrow();
        expect(atl.options.variables['ENV']).toBeAn(Object, "ENV must be present");
        expect(function () { return atl.fromObject({
            variables: {
                ENV: null
            }
        }); }).toNotThrow();
        expect(typeof atl.options.variables['ENV'] == "object").toBeTruthy("ENV MUST be an object 2");
        process.env['tttttt'] = '123';
        expect(function () { return atl.fromObject({
            variables: {
                ENV: { tteeettaaa: 123 }
            }
        }); }).toNotThrow();
        expect(atl.options.variables['ENV']['tteeettaaa'] == 123).toBeTruthy("ENV MUST be extended, not overrited");
        expect(atl.options.variables['ENV']['tttttt'] == '123').toBeTruthy("ENV MUST be extended");
    });
    it('Variables must be acumulative', function () {
        var atl = new ATL_1.ATL();
        atl.fromObject({
            variables: {
                a: 1
            }
        });
        expect(atl.options.variables['a']).toBe(1);
        expect(function () { return atl.fromObject({
            variables: {
                b: 2
            }
        }); }).toNotThrow();
        expect(atl.options.variables['a']).toBe(1);
        expect(atl.options.variables['b']).toBe(2);
    });
    it('baseUri must be a string', function () {
        var atl = new ATL_1.ATL();
        expect(function () { return atl.fromObject({
            baseUri: "http://testUri.com"
        }); }).toNotThrow();
        expect(atl.options.baseUri).toEqual("http://testUri.com");
        expect(function () { return atl.fromObject({
            baseUri: false
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            baseUri: 1
        }); }).toThrow(undefined, "baseUri is a number");
        expect(function () { return atl.fromObject({
            baseUri: {}
        }); }).toThrow();
        expect(atl.options.baseUri).toEqual("http://testUri.com");
    });
    it('baseUriParameters must be a dictionary', function () {
        var atl = new ATL_1.ATL();
        expect(function () { return atl.fromObject({
            baseUriParameters: {
                env: 'test'
            }
        }); }).toNotThrow();
        expect(atl.options.baseUriParameters['env']).toEqual("test");
        expect(function () { return atl.fromObject({
            baseUriParameters: []
        }); }).toThrow();
        expect(atl.options.baseUriParameters['env']).toEqual("test");
        expect(function () { return atl.fromObject({
            baseUriParameters: false
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            baseUriParameters: null
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            baseUriParameters: {
                a: 'test'
            }
        }); }).toNotThrow();
        expect(atl.options.baseUriParameters['env']).toBe(undefined);
        expect(atl.options.baseUriParameters['a']).toBe("test");
    });
    it('tests must be a dictionary', function () {
        var atl = new ATL_1.ATL();
        expect(function () { return atl.fromObject({
            tests: {}
        }); }).toNotThrow();
        expect(function () { return atl.fromObject({
            tests: []
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: false
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: null
        }); }).toThrow();
    });
});
describe('Parse methods', function () {
    it('must parse empty suites', function () {
        var atl = new ATL_1.ATL();
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {}
            }
        }); }).toNotThrow();
        expect(Object.keys(atl.suites).length).toBe(1, "Must be one suite");
        expect(atl.suites["EmptySuite"].suites).toBeA("object", "The first suite must be an object");
        expect(Object.keys(atl.suites["EmptySuite"].suites).length).toBe(0, "The first suite must be an empty object");
    });
    it('must parse several suites', function () {
        var atl = new ATL_1.ATL();
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {},
                "EmptySuite1": {}
            }
        }); }).toNotThrow();
        expect(Object.keys(atl.suites).length).toBe(2, "Must be one suite");
        expect(atl.suites["EmptySuite"].suites).toBeA("object", "The first suite must be an object");
        expect(Object.keys(atl.suites["EmptySuite"].suites).length).toBe(0, "The first suite must be an empty object");
        expect(atl.suites["EmptySuite1"].suites).toBeA("object", "The first suite must be an object");
        expect(Object.keys(atl.suites["EmptySuite1"].suites).length).toBe(0, "The first suite must be an empty object");
    });
    it('must parse all methods', function () {
        var atl = new ATL_1.ATL();
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {
                    "GET /": {},
                    "PUT /": {},
                    "POST /": {},
                    "PATCH /": {},
                    "DELETE /": {},
                    "OPTIONS /": {},
                }
            }
        }); }).toNotThrow();
        expect(Object.keys(atl.suites).length).toBe(1, "Must be one suite");
        expect(atl.suites["EmptySuite"].suites).toBeA("object", "The first suite must be an object");
        expect(Object.keys(atl.suites["EmptySuite"].suites).length).toBe(6, "The first suite must have 6 tests");
        for (var i in atl.suites["EmptySuite"].suites) {
            var suite_1 = atl.suites["EmptySuite"].suites[i];
            expect(suite_1.test).toBeAn(ATLHelpers.ATLTest, "All tests must be instance of ATLTest");
            expect(suite_1.test.response.status).toBe(200, "By default response.status must be 200");
        }
    });
    it('must parse only valid methods', function () {
        var atl = new ATL_1.ATL();
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {
                    "SARASA /": {},
                    "TET /": {},
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Test": {
                    "": {}
                }
            }
        }); }).toNotThrow();
        expect(Object.keys(atl.suites["Test"].suites).length).toBe(0);
        expect(function () { return atl.fromObject({
            tests: {
                "Test1": {
                    "GET my name": {}
                }
            }
        }); }).toNotThrow();
        expect(Object.keys(atl.suites["Test1"].suites).length).toBe(0);
        expect(function () { return atl.fromObject({
            tests: {
                "Test2": {
                    "get /my": {}
                }
            }
        }); }).toNotThrow();
        expect(Object.keys(atl.suites["Test2"].suites).length).toBe(0);
    });
    it('must parse only valid method declaration', function () {
        var atl = new ATL_1.ATL();
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {
                    "GET sarasa": {},
                    "POST another/sarasa": {},
                }
            }
        }); }).toThrow();
    });
    it('must accept empty object on response and request', function () {
        var atl = new ATL_1.ATL();
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {
                    "GET /sarasa": {
                        response: {}
                    }
                }
            }
        }); }).toNotThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {
                    "GET /sarasa": {
                        request: {}
                    }
                }
            }
        }); }).toNotThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {
                    "GET /sarasa": {
                        request: false
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {
                    "GET /sarasa": {
                        request: "false"
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {
                    "GET /sarasa": {
                        request: null
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {
                    "GET /sarasa": {
                        request: 123
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {
                    "GET /sarasa": {
                        response: false
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {
                    "GET /sarasa": {
                        response: "false"
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {
                    "GET /sarasa": {
                        response: null
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {
                    "GET /sarasa": {
                        response: 123
                    }
                }
            }
        }); }).toThrow();
    });
    it('must accept only objects on response.body', function () {
        var atl = new ATL_1.ATL();
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {
                    "GET /sarasa": {
                        response: {
                            body: {}
                        }
                    }
                }
            }
        }); }).toNotThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {
                    "GET /sarasa": {
                        response: {
                            body: false
                        }
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {
                    "GET /sarasa": {
                        response: {
                            body: "false"
                        }
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {
                    "GET /sarasa": {
                        response: {
                            body: null
                        }
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {
                    "GET /sarasa": {
                        response: {
                            body: 123
                        }
                    }
                }
            }
        }); }).toThrow();
    });
    it('must parse only valid method declaration (url)', function () {
        var atl = new ATL_1.ATL();
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {
                    "GET /sarasa": {}
                }
            }
        }); }).toNotThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {
                    "GET /sarasa/": {}
                }
            }
        }); }).toThrow();
    });
    it('must parse headers', function () {
        var atl = new ATL_1.ATL();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        headers: {}
                    }
                }
            }
        }); }).toNotThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        headers: {
                            Authorization: "A",
                            Accept: "B"
                        }
                    }
                }
            }
        }); }).toNotThrow();
        for (var i in atl.suites["Suite"].suites) {
            var suite_2 = atl.suites["Suite"].suites[i];
            expect(suite_2.test.request.headers).toEqual({
                authorization: "A",
                accept: "B"
            });
        }
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        headers: []
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        headers: null
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        headers: false
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        headers: "[string]"
                    }
                }
            }
        }); }).toThrow();
    });
    it('must parse uriParameters', function () {
        var atl = new ATL_1.ATL();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        uriParameters: {}
                    }
                }
            }
        }); }).toNotThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        uriParameters: {
                            Authorization: "A",
                            Accept: "B"
                        }
                    }
                }
            }
        }); }).toNotThrow();
        for (var i in atl.suites["Suite"].suites) {
            var suite_3 = atl.suites["Suite"].suites[i];
            expect(suite_3.test.uriParameters).toEqual({
                Authorization: "A",
                Accept: "B"
            });
        }
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        uriParameters: []
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        uriParameters: {
                            a: []
                        }
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        uriParameters: {
                            a: { b: 1 }
                        }
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        uriParameters: {
                            a: function () {
                            }
                        }
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        uriParameters: null
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        uriParameters: false
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        uriParameters: "[string]"
                    }
                }
            }
        }); }).toThrow();
    });
    it('must parse description', function () {
        var atl = new ATL_1.ATL();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        description: ""
                    }
                }
            }
        }); }).toNotThrow();
        for (var i in atl.suites["Suite"].suites) {
            var suite_4 = atl.suites["Suite"].suites[i];
            expect(suite_4.test.description).toBeFalsy();
        }
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        description: "Test"
                    }
                }
            }
        }); }).toNotThrow();
        for (var i in atl.suites["Suite"].suites) {
            var suite_5 = atl.suites["Suite"].suites[i];
            expect(suite_5.test.description).toEqual("Test");
        }
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        description: null
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        description: {}
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        description: new Date
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        description: 123
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        description: []
                    }
                }
            }
        }); }).toThrow();
    });
    it('must parse id', function () {
        var atl = new ATL_1.ATL();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        id: ""
                    }
                }
            }
        }); }).toNotThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        id: "Test"
                    }
                }
            }
        }); }).toNotThrow();
        for (var i in atl.suites["Suite"].suites) {
            var suite_6 = atl.suites["Suite"].suites[i];
            expect(suite_6.test.testId).toEqual("Test");
        }
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        id: null
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        id: {}
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        id: new Date
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        id: 123
                    }
                }
            }
        }); }).toNotThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        id: []
                    }
                }
            }
        }); }).toThrow();
    });
    it('must parse timeout', function () {
        var atl = new ATL_1.ATL();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        timeout: 100
                    }
                }
            }
        }); }).toNotThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        timeout: 100000000
                    }
                }
            }
        }); }).toNotThrow();
        for (var i in atl.suites["Suite"].suites) {
            var suite_7 = atl.suites["Suite"].suites[i];
            expect(suite_7.test.timeout).toEqual(100000000);
        }
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        timeout: null
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        timeout: -10
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        timeout: {}
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        timeout: new Date
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        timeout: "1h"
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        timeout: []
                    }
                }
            }
        }); }).toThrow();
    });
    it('must parse queryParameters', function () {
        var atl = new ATL_1.ATL();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        queryParameters: {}
                    }
                }
            }
        }); }).toNotThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        queryParameters: {
                            Authorization: "A",
                            Accept: "B"
                        }
                    }
                }
            }
        }); }).toNotThrow();
        for (var i in atl.suites["Suite"].suites) {
            var suite_8 = atl.suites["Suite"].suites[i];
            expect(suite_8.test.request.queryParameters).toEqual({
                Authorization: "A",
                Accept: "B"
            });
        }
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        queryParameters: []
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        queryParameters: null
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        queryParameters: false
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        queryParameters: "[string]"
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        queryParameters: {
                            a: []
                        }
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        queryParameters: {
                            a: { b: 1 }
                        }
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "Suite": {
                    "GET /": {
                        queryParameters: {
                            a: function () {
                            }
                        }
                    }
                }
            }
        }); }).toThrow();
    });
});
it('must parse response.status', function () {
    var atl = new ATL_1.ATL();
    expect(function () { return atl.fromObject({
        tests: {
            "EmptySuite": {
                "GET /": {
                    response: {
                        status: 201
                    }
                }
            }
        }
    }); }).toNotThrow();
    for (var i in atl.suites["EmptySuite"].suites) {
        var suite_9 = atl.suites["EmptySuite"].suites[i];
        expect(suite_9.test.response.status).toBe(201, "By default response.status must be 200");
    }
    expect(function () { return atl.fromObject({
        tests: {
            "EmptySuite": {
                "GET /": {
                    response: {
                        status: "201"
                    }
                }
            }
        }
    }); }).toThrow();
    expect(function () { return atl.fromObject({
        tests: {
            "EmptySuite": {
                "GET /": {
                    response: {
                        status: false
                    }
                }
            }
        }
    }); }).toThrow();
    expect(function () { return atl.fromObject({
        tests: {
            "EmptySuite": {
                "GET /": {
                    response: {
                        status: null
                    }
                }
            }
        }
    }); }).toThrow();
    it('must parse response.body.is', function () {
        var atl = new ATL_1.ATL();
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {
                    "GET /": {
                        response: {
                            body: {
                                is: "test"
                            }
                        }
                    }
                }
            }
        }); }).toNotThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {
                    "GET /": {
                        response: {
                            body: {
                                matches: []
                            }
                        }
                    }
                }
            }
        }); }).toNotThrow();
    });
    it('must parse response.print', function () {
        var atl = new ATL_1.ATL();
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {
                    "GET /": {
                        response: {
                            print: true
                        }
                    }
                }
            }
        }); }).toNotThrow();
        for (var i in atl.suites["EmptySuite"].suites) {
            var suite_10 = atl.suites["EmptySuite"].suites[i];
            expect(suite_10.test.response.print).toBe(true, "By default response.status must be 200");
        }
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {
                    "GET /": {
                        response: {
                            print: false
                        }
                    }
                }
            }
        }); }).toNotThrow();
        for (var i in atl.suites["EmptySuite"].suites) {
            var suite_11 = atl.suites["EmptySuite"].suites[i];
            expect(suite_11.test.response.print).toBe(false, "By default response.status must be 200");
        }
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {
                    "GET /": {
                        response: {
                            print: "201"
                        }
                    }
                }
            }
        }); }).toThrow();
        expect(function () { return atl.fromObject({
            tests: {
                "EmptySuite": {
                    "GET /": {
                        response: {
                            print: null
                        }
                    }
                }
            }
        }); }).toThrow();
    });
});
describe('cloneObject', function () {
    it('native types must be untouched', function () {
        var store = {};
        var value = "asd";
        expect(ATLHelpers.cloneObjectUsingPointers(value, store)).toEqual(value, typeof value);
        value = 123;
        expect(ATLHelpers.cloneObjectUsingPointers(value, store)).toEqual(value, typeof value);
        value = false;
        expect(ATLHelpers.cloneObjectUsingPointers(value, store)).toEqual(value, typeof value);
        value = null;
        expect(ATLHelpers.cloneObjectUsingPointers(value, store)).toEqual(value, typeof value);
        value = new Date;
        expect(ATLHelpers.cloneObjectUsingPointers(value, store)).toEqual(value, typeof value);
    });
    it('objects must be cloned', function () {
        var store = {};
        var value = { a: 1, b: "2", c: null, d: undefined, e: false, f: new Date };
        expect(ATLHelpers.cloneObjectUsingPointers(value, store)).toEqual(value, typeof value);
        expect(ATLHelpers.cloneObjectUsingPointers(value, store) !== value).toBe(true, "Got same object reference");
    });
    it('arrays must be cloned', function () {
        var store = {};
        var value = ["asd", 123, null, false, new Date];
        expect(ATLHelpers.cloneObjectUsingPointers(value, store)).toEqual(value, typeof value);
        expect(ATLHelpers.cloneObjectUsingPointers(value, store) !== value).toBe(true, "Got same object reference");
        expect(ATLHelpers.cloneObjectUsingPointers(value, store) instanceof Array).toBe(true, "Not instance of an array");
    });
    it('arrays containing objects must be cloned recursively', function () {
        var store = {};
        var value = [[], { a: 2 }, "asd", 123, null, false, new Date, { a: 1, b: "2", c: null, d: undefined, e: false, f: new Date }];
        expect(ATLHelpers.cloneObjectUsingPointers(value, store)).toEqual(value, typeof value);
        expect(ATLHelpers.cloneObjectUsingPointers(value, store) !== value).toBe(true, "Got same object reference");
        expect(ATLHelpers.cloneObjectUsingPointers(value, store)[0] !== value[0]).toBe(true, "Got same object reference internal");
        expect(ATLHelpers.cloneObjectUsingPointers(value, store)[1] !== value[1]).toBe(true, "Got same object reference internal");
    });
    it('objects containing arrays must be cloned recursively', function () {
        var store = {};
        var value = { a: 1, b: "2", c: null, d: undefined, e: false, f: new Date, arr: ["asd", 123, null, false, new Date] };
        expect(ATLHelpers.cloneObjectUsingPointers(value, store)).toEqual(value, typeof value);
        expect(ATLHelpers.cloneObjectUsingPointers(value, store) !== value).toBe(true, "Got same object reference");
        expect(ATLHelpers.cloneObjectUsingPointers(value, store).arr !== value.arr).toBe(true, "Got same object reference internal");
    });
    it('pointers must be readed inside objects', function () {
        var store = { a: 3 };
        var expected = { val: 3 };
        var value = {
            val: new Pointer("a")
        };
        expect(ATLHelpers.cloneObjectUsingPointers(value, store)).toEqual(expected, typeof value);
    });
    it('a single pointer must be readed and return the value', function () {
        var store = { a: 3 };
        var expected = 3;
        var value = new Pointer("a");
        expect(ATLHelpers.cloneObjectUsingPointers(value, store)).toEqual(expected, typeof value);
    });
    it('a single pointer must be readed, if the result is an object, it must be cloned', function () {
        var store = { a: { c: 3 } };
        var expected = { c: 3 };
        var value = new Pointer("a");
        var result = ATLHelpers.cloneObjectUsingPointers(value, store);
        expect(result).toEqual(expected, typeof value);
        expect(result !== store.a).toBe(true, "Reference not copied");
    });
    it('if the pointer is an object or array, the result must be cloned', function () {
        var store = { a: { c: 3 } };
        var expected = { val: { c: 3 } };
        var value = { val: new Pointer("a") };
        var result = ATLHelpers.cloneObjectUsingPointers(value, store);
        expect(result).toEqual(expected, typeof value);
        expect(result.val !== store.a).toBe(true, "Reference not copied");
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQVRMLnNwZWMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJBVEwuc3BlYy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsb0JBQStCLGNBQWMsQ0FBQyxDQUFBO0FBQzlDLElBQU8sVUFBVSxXQUFXLHFCQUFxQixDQUFDLENBQUM7QUFDbkQsSUFBTyxNQUFNLFdBQVcsUUFBUSxDQUFDLENBQUM7QUFFbEMsSUFBTSxPQUFPLEdBQUcsVUFBVSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUM7QUFFOUMsUUFBUSxDQUFDLHFCQUFxQixFQUFFO0lBQzlCLElBQUksR0FBRyxHQUFHLElBQUksU0FBRyxFQUFFLENBQUM7SUFFcEIsRUFBRSxDQUFDLGlDQUFpQyxFQUFFO1FBQ3BDLE1BQU0sQ0FBQyxjQUFNLE9BQUEsR0FBRyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsRUFBbEIsQ0FBa0IsQ0FBQyxDQUFDLFVBQVUsRUFBRSxDQUFDO0lBQ2hELENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLHdCQUF3QixFQUFFLGNBQU0sT0FBQSxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsRUFBeEQsQ0FBd0QsQ0FBQyxDQUFDO0lBQzdGLEVBQUUsQ0FBQywyQkFBMkIsRUFBRSxjQUFNLE9BQUEsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxFQUF0RSxDQUFzRSxDQUFDLENBQUM7QUFDaEgsQ0FBQyxDQUFDLENBQUM7QUFFSCxRQUFRLENBQUMsNkJBQTZCLEVBQUU7SUFDdEMsRUFBRSxDQUFDLHNCQUFzQixFQUFFO1FBQ3pCLElBQUksR0FBRyxHQUFHLElBQUksU0FBRyxF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RUFBRSxLQUFLLENBQUMsQ0FBQztRQUUvRCxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxPQUFPLEtBQUssQ0FBQyxDQUFDO1FBQy9DLE1BQU0sQ0FBQyxNQUFNLENBQUMsR0FBRyxLQUFLLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLHNCQUFzQixDQUFDLENBQUM7SUFDcEUsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7QVRMLCBJQVRMT3B0aW9uc30gZnJvbSAnLi8uLi9saWIvQVRMJztcbmltcG9ydCBBVExIZWxwZXJzID0gcmVxdWlyZSgnLi8uLi9saWIvQVRMSGVscGVycycpO1xuaW1wb3J0IGV4cGVjdCA9IHJlcXVpcmUoJ2V4cGVjdCcpO1xuXG5jb25zdCBQb2ludGVyID0gQVRMSGVscGVycy5wb2ludGVyTGliLlBvaW50ZXI7XG5cbmRlc2NyaWJlKCdFbXB0eSBPYmplY3QgLT4gQVRMJywgKCkgPT4ge1xuICBsZXQgYXRsID0gbmV3IEFUTCgpO1xuXG4gIGl0KCdlbXB0eU9iamVjdCBtdXN0IGVtaXQgZW1wdHkgQVRMJywgKCkgPT4ge1xuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7fSkpLnRvTm90VGhyb3coKTtcbiAgfSk7XG5cbiAgaXQoJ211c3QgY29udGFpbnMgMCBzdWl0ZXMnLCAoKSA9PiBleHBlY3QoT2JqZWN0LmtleXMoYXRsLnN1aXRlcykubGVuZ3RoKS50b0JlKDAsIFwiU3VpdGVzXCIpKTtcbiAgaXQoJ211c3QgY29udGFpbnMgMCB2YXJpYWJsZXMnLCAoKSA9PiBleHBlY3QoT2JqZWN0LmtleXMoYXRsLm9wdGlvbnMudmFyaWFibGVzKS5sZW5ndGgpLnRvQmUoMSwgXCJWYXJpYWJsZXNcIikpO1xufSk7XG5cbmRlc2NyaWJlKCdWYWxpZGF0aW9ucyAoT2JqZWN0IC0+IEFUTCknLCAoKSA9PiB7XG4gIGl0KCdOb24gb2JqZWN0IHZhcmlhYmxlcycsICgpID0+IHtcbiAgICBsZXQgYXRsID0gbmV3IEFUTCgpO1xuXG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIHZhcmlhYmxlczogMVxuICAgIH0pKS50b1Rocm93KCk7XG5cbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdmFyaWFibGVzOiBcIlwiXG4gICAgfSkpLnRvVGhyb3coKTtcblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB2YXJpYWJsZXM6IGZhbHNlXG4gICAgfSkpLnRvVGhyb3coKTtcblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB2YXJpYWJsZXM6IHt9XG4gICAgfSkpLnRvTm90VGhyb3coKTtcbiAgfSk7XG5cbiAgaXQoJ0VOViBtdXN0IGJlIG92ZXJyaWRlbiBpZiBwcmVzZW50IG9uIHNwZWMgb25seScsICgpID0+IHtcbiAgICBsZXQgYXRsID0gbmV3IEFUTCgpO1xuXG4gICAgYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdmFyaWFibGVzOiB7fVxuICAgIH0pO1xuXG4gICAgZXhwZWN0KCdFTlYnIGluIGF0bC5vcHRpb25zLnZhcmlhYmxlcykudG9CZVRydXRoeShcIkVOViBNVVNUIGV4aXN0cyBvbiB2YXJpYWJsZXNcIik7XG5cbiAgICBleHBlY3QodHlwZW9mIGF0bC5vcHRpb25zLnZhcmlhYmxlc1snRU5WJ10pLnRvQmUoXCJvYmplY3RcIiwgXCJFTlYgTVVTVCBiZSBhbiBvYmplY3QgMVwiKTtcblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB2YXJpYWJsZXM6IHtcbiAgICAgICAgRU5WOiB7fVxuICAgICAgfVxuICAgIH0pKS50b05vdFRocm93KCk7XG5cbiAgICBleHBlY3QoYXRsLm9wdGlvbnMudmFyaWFibGVzWydFTlYnXSkudG9CZUFuKE9iamVjdCwgXCJFTlYgbXVzdCBiZSBwcmVzZW50XCIpO1xuXG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBFTlY6IG51bGxcbiAgICAgIH1cbiAgICB9KSkudG9Ob3RUaHJvdygpO1xuXG4gICAgZXhwZWN0KHR5cGVvZiBhdGwub3B0aW9ucy52YXJpYWJsZXNbJ0VOViddID09IFwib2JqZWN0XCIpLnRvQmVUcnV0aHkoXCJFTlYgTVVTVCBiZSBhbiBvYmplY3QgMlwiKTtcblxuICAgIHByb2Nlc3MuZW52Wyd0dHR0dHQnXSA9ICcxMjMnO1xuXG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBFTlY6IHsgdHRlZWV0dGFhYTogMTIzIH1cbiAgICAgIH1cbiAgICB9KSkudG9Ob3RUaHJvdygpO1xuXG4gICAgZXhwZWN0KGF0bC5vcHRpb25zLnZhcmlhYmxlc1snRU5WJ11bJ3R0ZWVldHRhYWEnXSA9PSAxMjMpLnRvQmVUcnV0aHkoXCJFTlYgTVVTVCBiZSBleHRlbmRlZCwgbm90IG92ZXJyaXRlZFwiKTtcbiAgICBleHBlY3QoYXRsLm9wdGlvbnMudmFyaWFibGVzWydFTlYnXVsndHR0dHR0J10gPT0gJzEyMycpLnRvQmVUcnV0aHkoXCJFTlYgTVVTVCBiZSBleHRlbmRlZFwiKTtcbiAgfSk7XG5cbiAgaXQoJ1ZhcmlhYmxlcyBtdXN0IGJlIGFjdW11bGF0aXZlJywgKCkgPT4ge1xuICAgIGxldCBhdGwgPSBuZXcgQVRMKCk7XG5cbiAgICBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB2YXJpYWJsZXM6IHtcbiAgICAgICAgYTogMVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgZXhwZWN0KGF0bC5vcHRpb25zLnZhcmlhYmxlc1snYSddKS50b0JlKDEpO1xuXG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICBiOiAyXG4gICAgICB9XG4gICAgfSkpLnRvTm90VGhyb3coKTtcblxuICAgIGV4cGVjdChhdGwub3B0aW9ucy52YXJpYWJsZXNbJ2EnXSkudG9CZSgxKTtcbiAgICBleHBlY3QoYXRsLm9wdGlvbnMudmFyaWFibGVzWydiJ10pLnRvQmUoMik7XG4gIH0pO1xuXG4gIGl0KCdiYXNlVXJpIG11c3QgYmUgYSBzdHJpbmcnLCAoKSA9PiB7XG4gICAgbGV0IGF0bCA9IG5ldyBBVEwoKTtcblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICBiYXNlVXJpOiBcImh0dHA6Ly90ZXN0VXJpLmNvbVwiXG4gICAgfSkpLnRvTm90VGhyb3coKTtcblxuICAgIGV4cGVjdChhdGwub3B0aW9ucy5iYXNlVXJpKS50b0VxdWFsKFwiaHR0cDovL3Rlc3RVcmkuY29tXCIpO1xuXG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIGJhc2VVcmk6IGZhbHNlXG4gICAgfSkpLnRvVGhyb3coKTtcblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICBiYXNlVXJpOiAxXG4gICAgfSkpLnRvVGhyb3codW5kZWZpbmVkLCBcImJhc2VVcmkgaXMgYSBudW1iZXJcIik7XG5cbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgYmFzZVVyaToge31cbiAgICB9KSkudG9UaHJvdygpO1xuXG4gICAgZXhwZWN0KGF0bC5vcHRpb25zLmJhc2VVcmkpLnRvRXF1YWwoXCJodHRwOi8vdGVzdFVyaS5jb21cIik7XG4gIH0pO1xuXG4gIGl0KCdiYXNlVXJpUGFyYW1ldGVycyBtdXN0IGJlIGEgZGljdGlvbmFyeScsICgpID0+IHtcbiAgICBsZXQgYXRsID0gbmV3IEFUTCgpO1xuXG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIGJhc2VVcmlQYXJhbWV0ZXJzOiB7XG4gICAgICAgIGVudjogJ3Rlc3QnXG4gICAgICB9XG4gICAgfSkpLnRvTm90VGhyb3coKTtcblxuICAgIGV4cGVjdChhdGwub3B0aW9ucy5iYXNlVXJpUGFyYW1ldGVyc1snZW52J10pLnRvRXF1YWwoXCJ0ZXN0XCIpO1xuXG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIGJhc2VVcmlQYXJhbWV0ZXJzOiBbXVxuICAgIH0pKS50b1Rocm93KCk7XG5cbiAgICBleHBlY3QoYXRsLm9wdGlvbnMuYmFzZVVyaVBhcmFtZXRlcnNbJ2VudiddKS50b0VxdWFsKFwidGVzdFwiKTtcblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICBiYXNlVXJpUGFyYW1ldGVyczogZmFsc2VcbiAgICB9KSkudG9UaHJvdygpO1xuXG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIGJhc2VVcmlQYXJhbWV0ZXJzOiBudWxsXG4gICAgfSkpLnRvVGhyb3coKTtcblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICBiYXNlVXJpUGFyYW1ldGVyczoge1xuICAgICAgICBhOiAndGVzdCdcbiAgICAgIH1cbiAgICB9KSkudG9Ob3RUaHJvdygpO1xuXG4gICAgZXhwZWN0KGF0bC5vcHRpb25zLmJhc2VVcmlQYXJhbWV0ZXJzWydlbnYnXSkudG9CZSh1bmRlZmluZWQpO1xuICAgIGV4cGVjdChhdGwub3B0aW9ucy5iYXNlVXJpUGFyYW1ldGVyc1snYSddKS50b0JlKFwidGVzdFwiKTtcbiAgfSk7XG5cbiAgaXQoJ3Rlc3RzIG11c3QgYmUgYSBkaWN0aW9uYXJ5JywgKCkgPT4ge1xuICAgIGxldCBhdGwgPSBuZXcgQVRMKCk7XG5cbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHt9XG4gICAgfSkpLnRvTm90VGhyb3coKTtcblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czogW11cbiAgICB9KSkudG9UaHJvdygpO1xuXG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIHRlc3RzOiBmYWxzZVxuICAgIH0pKS50b1Rocm93KCk7XG5cbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IG51bGxcbiAgICB9KSkudG9UaHJvdygpO1xuICB9KTtcbn0pO1xuXG5kZXNjcmliZSgnUGFyc2UgbWV0aG9kcycsICgpID0+IHtcbiAgaXQoJ211c3QgcGFyc2UgZW1wdHkgc3VpdGVzJywgKCkgPT4ge1xuICAgIGxldCBhdGwgPSBuZXcgQVRMKCk7XG5cbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHtcbiAgICAgICAgXCJFbXB0eVN1aXRlXCI6IHt9XG4gICAgICB9XG4gICAgfSkpLnRvTm90VGhyb3coKTtcblxuICAgIGV4cGVjdChPYmplY3Qua2V5cyhhdGwuc3VpdGVzKS5sZW5ndGgpLnRvQmUoMSwgXCJNdXN0IGJlIG9uZSBzdWl0ZVwiKTtcbiAgICBleHBlY3QoYXRsLnN1aXRlc1tcIkVtcHR5U3VpdGVcIl0uc3VpdGVzKS50b0JlQShcIm9iamVjdFwiLCBcIlRoZSBmaXJzdCBzdWl0ZSBtdXN0IGJlIGFuIG9iamVjdFwiKTtcbiAgICBleHBlY3QoT2JqZWN0LmtleXMoYXRsLnN1aXRlc1tcIkVtcHR5U3VpdGVcIl0uc3VpdGVzKS5sZW5ndGgpLnRvQmUoMCwgXCJUaGUgZmlyc3Qgc3VpdGUgbXVzdCBiZSBhbiBlbXB0eSBvYmplY3RcIik7XG4gIH0pO1xuXG4gIGl0KCdtdXN0IHBhcnNlIHNldmVyYWwgc3VpdGVzJywgKCkgPT4ge1xuICAgIGxldCBhdGwgPSBuZXcgQVRMKCk7XG5cbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHtcbiAgICAgICAgXCJFbXB0eVN1aXRlXCI6IHt9LFxuICAgICAgICBcIkVtcHR5U3VpdGUxXCI6IHt9XG4gICAgICB9XG4gICAgfSkpLnRvTm90VGhyb3coKTtcblxuICAgIGV4cGVjdChPYmplY3Qua2V5cyhhdGwuc3VpdGVzKS5sZW5ndGgpLnRvQmUoMiwgXCJNdXN0IGJlIG9uZSBzdWl0ZVwiKTtcbiAgICBleHBlY3QoYXRsLnN1aXRlc1tcIkVtcHR5U3VpdGVcIl0uc3VpdGVzKS50b0JlQShcIm9iamVjdFwiLCBcIlRoZSBmaXJzdCBzdWl0ZSBtdXN0IGJlIGFuIG9iamVjdFwiKTtcbiAgICBleHBlY3QoT2JqZWN0LmtleXMoYXRsLnN1aXRlc1tcIkVtcHR5U3VpdGVcIl0uc3VpdGVzKS5sZW5ndGgpLnRvQmUoMCwgXCJUaGUgZmlyc3Qgc3VpdGUgbXVzdCBiZSBhbiBlbXB0eSBvYmplY3RcIik7XG5cbiAgICBleHBlY3QoYXRsLnN1aXRlc1tcIkVtcHR5U3VpdGUxXCJdLnN1aXRlcykudG9CZUEoXCJvYmplY3RcIiwgXCJUaGUgZmlyc3Qgc3VpdGUgbXVzdCBiZSBhbiBvYmplY3RcIik7XG4gICAgZXhwZWN0KE9iamVjdC5rZXlzKGF0bC5zdWl0ZXNbXCJFbXB0eVN1aXRlMVwiXS5zdWl0ZXMpLmxlbmd0aCkudG9CZSgwLCBcIlRoZSBmaXJzdCBzdWl0ZSBtdXN0IGJlIGFuIGVtcHR5IG9iamVjdFwiKTtcbiAgfSk7XG5cblxuICBpdCgnbXVzdCBwYXJzZSBhbGwgbWV0aG9kcycsICgpID0+IHtcbiAgICBsZXQgYXRsID0gbmV3IEFUTCgpO1xuXG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIHRlc3RzOiB7XG4gICAgICAgIFwiRW1wdHlTdWl0ZVwiOiB7XG4gICAgICAgICAgXCJHRVQgL1wiOiB7fSxcbiAgICAgICAgICBcIlBVVCAvXCI6IHt9LFxuICAgICAgICAgIFwiUE9TVCAvXCI6IHt9LFxuICAgICAgICAgIFwiUEFUQ0ggL1wiOiB7fSxcbiAgICAgICAgICBcIkRFTEVURSAvXCI6IHt9LFxuICAgICAgICAgIFwiT1BUSU9OUyAvXCI6IHt9LFxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSkpLnRvTm90VGhyb3coKTtcblxuICAgIGV4cGVjdChPYmplY3Qua2V5cyhhdGwuc3VpdGVzKS5sZW5ndGgpLnRvQmUoMSwgXCJNdXN0IGJlIG9uZSBzdWl0ZVwiKTtcbiAgICBleHBlY3QoYXRsLnN1aXRlc1tcIkVtcHR5U3VpdGVcIl0uc3VpdGVzKS50b0JlQShcIm9iamVjdFwiLCBcIlRoZSBmaXJzdCBzdWl0ZSBtdXN0IGJlIGFuIG9iamVjdFwiKTtcbiAgICBleHBlY3QoT2JqZWN0LmtleXMoYXRsLnN1aXRlc1tcIkVtcHR5U3VpdGVcIl0uc3VpdGVzKS5sZW5ndGgpLnRvQmUoNiwgXCJUaGUgZmlyc3Qgc3VpdGUgbXVzdCBoYXZlIDYgdGVzdHNcIik7XG5cbiAgICBmb3IgKGxldCBpIGluIGF0bC5zdWl0ZXNbXCJFbXB0eVN1aXRlXCJdLnN1aXRlcykge1xuICAgICAgbGV0IHN1aXRlID0gYXRsLnN1aXRlc1tcIkVtcHR5U3VpdGVcIl0uc3VpdGVzW2ldO1xuICAgICAgZXhwZWN0KHN1aXRlLnRlc3QpLnRvQmVBbihBVExIZWxwZXJzLkFUTFRlc3QsIFwiQWxsIHRlc3RzIG11c3QgYmUgaW5zdGFuY2Ugb2YgQVRMVGVzdFwiKTtcbiAgICAgIGV4cGVjdChzdWl0ZS50ZXN0LnJlc3BvbnNlLnN0YXR1cykudG9CZSgyMDAsIFwiQnkgZGVmYXVsdCByZXNwb25zZS5zdGF0dXMgbXVzdCBiZSAyMDBcIik7XG4gICAgfVxuICB9KTtcblxuXG4gIGl0KCdtdXN0IHBhcnNlIG9ubHkgdmFsaWQgbWV0aG9kcycsICgpID0+IHtcbiAgICBsZXQgYXRsID0gbmV3IEFUTCgpO1xuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIkVtcHR5U3VpdGVcIjoge1xuICAgICAgICAgIFwiU0FSQVNBIC9cIjoge30sXG4gICAgICAgICAgXCJURVQgL1wiOiB7fSxcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b1Rocm93KCk7XG5cbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHtcbiAgICAgICAgXCJUZXN0XCI6IHtcbiAgICAgICAgICBcIlwiOiB7fVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSkpLnRvTm90VGhyb3coKTtcblxuICAgIGV4cGVjdChPYmplY3Qua2V5cyhhdGwuc3VpdGVzW1wiVGVzdFwiXS5zdWl0ZXMpLmxlbmd0aCkudG9CZSgwKTtcblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIlRlc3QxXCI6IHtcbiAgICAgICAgICBcIkdFVCBteSBuYW1lXCI6IHt9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSkudG9Ob3RUaHJvdygpO1xuXG4gICAgZXhwZWN0KE9iamVjdC5rZXlzKGF0bC5zdWl0ZXNbXCJUZXN0MVwiXS5zdWl0ZXMpLmxlbmd0aCkudG9CZSgwKTtcblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIlRlc3QyXCI6IHtcbiAgICAgICAgICBcImdldCAvbXlcIjoge31cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b05vdFRocm93KCk7XG5cbiAgICBleHBlY3QoT2JqZWN0LmtleXMoYXRsLnN1aXRlc1tcIlRlc3QyXCJdLnN1aXRlcykubGVuZ3RoKS50b0JlKDApO1xuXG4gIH0pO1xuXG5cbiAgaXQoJ211c3QgcGFyc2Ugb25seSB2YWxpZCBtZXRob2QgZGVjbGFyYXRpb24nLCAoKSA9PiB7XG4gICAgbGV0IGF0bCA9IG5ldyBBVEwoKTtcbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHtcbiAgICAgICAgXCJFbXB0eVN1aXRlXCI6IHtcbiAgICAgICAgICBcIkdFVCBzYXJhc2FcIjoge30sXG4gICAgICAgICAgXCJQT1NUIGFub3RoZXIvc2FyYXNhXCI6IHt9LFxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSkpLnRvVGhyb3coKTtcbiAgfSk7XG5cbiAgaXQoJ211c3QgYWNjZXB0IGVtcHR5IG9iamVjdCBvbiByZXNwb25zZSBhbmQgcmVxdWVzdCcsICgpID0+IHtcbiAgICBsZXQgYXRsID0gbmV3IEFUTCgpO1xuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIkVtcHR5U3VpdGVcIjoge1xuICAgICAgICAgIFwiR0VUIC9zYXJhc2FcIjoge1xuICAgICAgICAgICAgcmVzcG9uc2U6IHtcblxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b05vdFRocm93KCk7XG5cbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHtcbiAgICAgICAgXCJFbXB0eVN1aXRlXCI6IHtcbiAgICAgICAgICBcIkdFVCAvc2FyYXNhXCI6IHtcbiAgICAgICAgICAgIHJlcXVlc3Q6IHtcblxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b05vdFRocm93KCk7XG5cbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHtcbiAgICAgICAgXCJFbXB0eVN1aXRlXCI6IHtcbiAgICAgICAgICBcIkdFVCAvc2FyYXNhXCI6IHtcbiAgICAgICAgICAgIHJlcXVlc3Q6IGZhbHNlXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSkpLnRvVGhyb3coKTtcblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIkVtcHR5U3VpdGVcIjoge1xuICAgICAgICAgIFwiR0VUIC9zYXJhc2FcIjoge1xuICAgICAgICAgICAgcmVxdWVzdDogXCJmYWxzZVwiXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSkpLnRvVGhyb3coKTtcbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHtcbiAgICAgICAgXCJFbXB0eVN1aXRlXCI6IHtcbiAgICAgICAgICBcIkdFVCAvc2FyYXNhXCI6IHtcbiAgICAgICAgICAgIHJlcXVlc3Q6IG51bGxcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSkudG9UaHJvdygpO1xuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIkVtcHR5U3VpdGVcIjoge1xuICAgICAgICAgIFwiR0VUIC9zYXJhc2FcIjoge1xuICAgICAgICAgICAgcmVxdWVzdDogMTIzXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSkpLnRvVGhyb3coKTtcblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIkVtcHR5U3VpdGVcIjoge1xuICAgICAgICAgIFwiR0VUIC9zYXJhc2FcIjoge1xuICAgICAgICAgICAgcmVzcG9uc2U6IGZhbHNlXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSkpLnRvVGhyb3coKTtcbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHtcbiAgICAgICAgXCJFbXB0eVN1aXRlXCI6IHtcbiAgICAgICAgICBcIkdFVCAvc2FyYXNhXCI6IHtcbiAgICAgICAgICAgIHJlc3BvbnNlOiBcImZhbHNlXCJcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSkudG9UaHJvdygpO1xuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIkVtcHR5U3VpdGVcIjoge1xuICAgICAgICAgIFwiR0VUIC9zYXJhc2FcIjoge1xuICAgICAgICAgICAgcmVzcG9uc2U6IG51bGxcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSkudG9UaHJvdygpO1xuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIkVtcHR5U3VpdGVcIjoge1xuICAgICAgICAgIFwiR0VUIC9zYXJhc2FcIjoge1xuICAgICAgICAgICAgcmVzcG9uc2U6IDEyM1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b1Rocm93KCk7XG4gIH0pO1xuXG5cbiAgaXQoJ211c3QgYWNjZXB0IG9ubHkgb2JqZWN0cyBvbiByZXNwb25zZS5ib2R5JywgKCkgPT4ge1xuICAgIGxldCBhdGwgPSBuZXcgQVRMKCk7XG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIHRlc3RzOiB7XG4gICAgICAgIFwiRW1wdHlTdWl0ZVwiOiB7XG4gICAgICAgICAgXCJHRVQgL3NhcmFzYVwiOiB7XG4gICAgICAgICAgICByZXNwb25zZToge1xuICAgICAgICAgICAgICBib2R5OiB7XG5cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b05vdFRocm93KCk7XG5cblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIkVtcHR5U3VpdGVcIjoge1xuICAgICAgICAgIFwiR0VUIC9zYXJhc2FcIjoge1xuICAgICAgICAgICAgcmVzcG9uc2U6IHtcbiAgICAgICAgICAgICAgYm9keTogZmFsc2VcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSkudG9UaHJvdygpO1xuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIkVtcHR5U3VpdGVcIjoge1xuICAgICAgICAgIFwiR0VUIC9zYXJhc2FcIjoge1xuICAgICAgICAgICAgcmVzcG9uc2U6IHtcbiAgICAgICAgICAgICAgYm9keTogXCJmYWxzZVwiXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSkpLnRvVGhyb3coKTtcbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHtcbiAgICAgICAgXCJFbXB0eVN1aXRlXCI6IHtcbiAgICAgICAgICBcIkdFVCAvc2FyYXNhXCI6IHtcbiAgICAgICAgICAgIHJlc3BvbnNlOiB7XG4gICAgICAgICAgICAgIGJvZHk6IG51bGxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSkudG9UaHJvdygpO1xuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIkVtcHR5U3VpdGVcIjoge1xuICAgICAgICAgIFwiR0VUIC9zYXJhc2FcIjoge1xuICAgICAgICAgICAgcmVzcG9uc2U6IHtcbiAgICAgICAgICAgICAgYm9keTogMTIzXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSkpLnRvVGhyb3coKTtcbiAgfSk7XG5cblxuICBpdCgnbXVzdCBwYXJzZSBvbmx5IHZhbGlkIG1ldGhvZCBkZWNsYXJhdGlvbiAodXJsKScsICgpID0+IHtcbiAgICBsZXQgYXRsID0gbmV3IEFUTCgpO1xuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIkVtcHR5U3VpdGVcIjoge1xuICAgICAgICAgIFwiR0VUIC9zYXJhc2FcIjoge31cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b05vdFRocm93KCk7XG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIHRlc3RzOiB7XG4gICAgICAgIFwiRW1wdHlTdWl0ZVwiOiB7XG4gICAgICAgICAgXCJHRVQgL3NhcmFzYS9cIjoge31cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b1Rocm93KCk7XG4gIH0pO1xuXG4gIGl0KCdtdXN0IHBhcnNlIGhlYWRlcnMnLCAoKSA9PiB7XG4gICAgbGV0IGF0bCA9IG5ldyBBVEwoKTtcblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIlN1aXRlXCI6IHtcbiAgICAgICAgICBcIkdFVCAvXCI6IHtcbiAgICAgICAgICAgIGhlYWRlcnM6IHt9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSkpLnRvTm90VGhyb3coKTtcblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIlN1aXRlXCI6IHtcbiAgICAgICAgICBcIkdFVCAvXCI6IHtcbiAgICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICAgQXV0aG9yaXphdGlvbjogXCJBXCIsXG4gICAgICAgICAgICAgIEFjY2VwdDogXCJCXCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSkudG9Ob3RUaHJvdygpO1xuXG4gICAgZm9yIChsZXQgaSBpbiBhdGwuc3VpdGVzW1wiU3VpdGVcIl0uc3VpdGVzKSB7XG4gICAgICBsZXQgc3VpdGUgPSBhdGwuc3VpdGVzW1wiU3VpdGVcIl0uc3VpdGVzW2ldO1xuICAgICAgZXhwZWN0KHN1aXRlLnRlc3QucmVxdWVzdC5oZWFkZXJzKS50b0VxdWFsKHtcbiAgICAgICAgYXV0aG9yaXphdGlvbjogXCJBXCIsXG4gICAgICAgIGFjY2VwdDogXCJCXCJcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIlN1aXRlXCI6IHtcbiAgICAgICAgICBcIkdFVCAvXCI6IHtcbiAgICAgICAgICAgIGhlYWRlcnM6IFtdXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSkpLnRvVGhyb3coKTtcblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIlN1aXRlXCI6IHtcbiAgICAgICAgICBcIkdFVCAvXCI6IHtcbiAgICAgICAgICAgIGhlYWRlcnM6IG51bGxcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSkudG9UaHJvdygpO1xuXG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIHRlc3RzOiB7XG4gICAgICAgIFwiU3VpdGVcIjoge1xuICAgICAgICAgIFwiR0VUIC9cIjoge1xuICAgICAgICAgICAgaGVhZGVyczogZmFsc2VcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSkudG9UaHJvdygpO1xuXG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIHRlc3RzOiB7XG4gICAgICAgIFwiU3VpdGVcIjoge1xuICAgICAgICAgIFwiR0VUIC9cIjoge1xuICAgICAgICAgICAgaGVhZGVyczogXCJbc3RyaW5nXVwiXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSkpLnRvVGhyb3coKTtcbiAgfSk7XG5cblxuXG4gIGl0KCdtdXN0IHBhcnNlIHVyaVBhcmFtZXRlcnMnLCAoKSA9PiB7XG4gICAgbGV0IGF0bCA9IG5ldyBBVEwoKTtcblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIlN1aXRlXCI6IHtcbiAgICAgICAgICBcIkdFVCAvXCI6IHtcbiAgICAgICAgICAgIHVyaVBhcmFtZXRlcnM6IHt9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSkpLnRvTm90VGhyb3coKTtcblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIlN1aXRlXCI6IHtcbiAgICAgICAgICBcIkdFVCAvXCI6IHtcbiAgICAgICAgICAgIHVyaVBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICAgQXV0aG9yaXphdGlvbjogXCJBXCIsXG4gICAgICAgICAgICAgIEFjY2VwdDogXCJCXCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSkudG9Ob3RUaHJvdygpO1xuXG4gICAgZm9yIChsZXQgaSBpbiBhdGwuc3VpdGVzW1wiU3VpdGVcIl0uc3VpdGVzKSB7XG4gICAgICBsZXQgc3VpdGUgPSBhdGwuc3VpdGVzW1wiU3VpdGVcIl0uc3VpdGVzW2ldO1xuICAgICAgZXhwZWN0KHN1aXRlLnRlc3QudXJpUGFyYW1ldGVycykudG9FcXVhbCh7XG4gICAgICAgIEF1dGhvcml6YXRpb246IFwiQVwiLFxuICAgICAgICBBY2NlcHQ6IFwiQlwiXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHtcbiAgICAgICAgXCJTdWl0ZVwiOiB7XG4gICAgICAgICAgXCJHRVQgL1wiOiB7XG4gICAgICAgICAgICB1cmlQYXJhbWV0ZXJzOiBbXVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b1Rocm93KCk7XG5cbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHtcbiAgICAgICAgXCJTdWl0ZVwiOiB7XG4gICAgICAgICAgXCJHRVQgL1wiOiB7XG4gICAgICAgICAgICB1cmlQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAgIGE6IFtdXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSkpLnRvVGhyb3coKTtcblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIlN1aXRlXCI6IHtcbiAgICAgICAgICBcIkdFVCAvXCI6IHtcbiAgICAgICAgICAgIHVyaVBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICAgYTogeyBiOiAxIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSkudG9UaHJvdygpO1xuXG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIHRlc3RzOiB7XG4gICAgICAgIFwiU3VpdGVcIjoge1xuICAgICAgICAgIFwiR0VUIC9cIjoge1xuICAgICAgICAgICAgdXJpUGFyYW1ldGVyczoge1xuICAgICAgICAgICAgICBhOiBmdW5jdGlvbiAoKSB7XG5cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b1Rocm93KCk7XG5cblxuXG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIHRlc3RzOiB7XG4gICAgICAgIFwiU3VpdGVcIjoge1xuICAgICAgICAgIFwiR0VUIC9cIjoge1xuICAgICAgICAgICAgdXJpUGFyYW1ldGVyczogbnVsbFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b1Rocm93KCk7XG5cbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHtcbiAgICAgICAgXCJTdWl0ZVwiOiB7XG4gICAgICAgICAgXCJHRVQgL1wiOiB7XG4gICAgICAgICAgICB1cmlQYXJhbWV0ZXJzOiBmYWxzZVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b1Rocm93KCk7XG5cbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHtcbiAgICAgICAgXCJTdWl0ZVwiOiB7XG4gICAgICAgICAgXCJHRVQgL1wiOiB7XG4gICAgICAgICAgICB1cmlQYXJhbWV0ZXJzOiBcIltzdHJpbmddXCJcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSkudG9UaHJvdygpO1xuICB9KTtcblxuXG4gIGl0KCdtdXN0IHBhcnNlIGRlc2NyaXB0aW9uJywgKCkgPT4ge1xuICAgIGxldCBhdGwgPSBuZXcgQVRMKCk7XG5cbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHtcbiAgICAgICAgXCJTdWl0ZVwiOiB7XG4gICAgICAgICAgXCJHRVQgL1wiOiB7XG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogXCJcIlxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b05vdFRocm93KCk7XG5cbiAgICBmb3IgKGxldCBpIGluIGF0bC5zdWl0ZXNbXCJTdWl0ZVwiXS5zdWl0ZXMpIHtcbiAgICAgIGxldCBzdWl0ZSA9IGF0bC5zdWl0ZXNbXCJTdWl0ZVwiXS5zdWl0ZXNbaV07XG4gICAgICBleHBlY3Qoc3VpdGUudGVzdC5kZXNjcmlwdGlvbikudG9CZUZhbHN5KCk7XG4gICAgfVxuXG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIHRlc3RzOiB7XG4gICAgICAgIFwiU3VpdGVcIjoge1xuICAgICAgICAgIFwiR0VUIC9cIjoge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IFwiVGVzdFwiXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSkpLnRvTm90VGhyb3coKTtcblxuXG4gICAgZm9yIChsZXQgaSBpbiBhdGwuc3VpdGVzW1wiU3VpdGVcIl0uc3VpdGVzKSB7XG4gICAgICBsZXQgc3VpdGUgPSBhdGwuc3VpdGVzW1wiU3VpdGVcIl0uc3VpdGVzW2ldO1xuICAgICAgZXhwZWN0KHN1aXRlLnRlc3QuZGVzY3JpcHRpb24pLnRvRXF1YWwoXCJUZXN0XCIpO1xuICAgIH1cblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIlN1aXRlXCI6IHtcbiAgICAgICAgICBcIkdFVCAvXCI6IHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBudWxsXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSkpLnRvVGhyb3coKTtcblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIlN1aXRlXCI6IHtcbiAgICAgICAgICBcIkdFVCAvXCI6IHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiB7fVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b1Rocm93KCk7XG5cbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHtcbiAgICAgICAgXCJTdWl0ZVwiOiB7XG4gICAgICAgICAgXCJHRVQgL1wiOiB7XG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogbmV3IERhdGVcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSkudG9UaHJvdygpO1xuXG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIHRlc3RzOiB7XG4gICAgICAgIFwiU3VpdGVcIjoge1xuICAgICAgICAgIFwiR0VUIC9cIjoge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IDEyM1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b1Rocm93KCk7XG5cbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHtcbiAgICAgICAgXCJTdWl0ZVwiOiB7XG4gICAgICAgICAgXCJHRVQgL1wiOiB7XG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogW11cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSkudG9UaHJvdygpO1xuICB9KTtcblxuXG4gIGl0KCdtdXN0IHBhcnNlIGlkJywgKCkgPT4ge1xuICAgIGxldCBhdGwgPSBuZXcgQVRMKCk7XG5cbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHtcbiAgICAgICAgXCJTdWl0ZVwiOiB7XG4gICAgICAgICAgXCJHRVQgL1wiOiB7XG4gICAgICAgICAgICBpZDogXCJcIlxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b05vdFRocm93KCk7XG5cbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHtcbiAgICAgICAgXCJTdWl0ZVwiOiB7XG4gICAgICAgICAgXCJHRVQgL1wiOiB7XG4gICAgICAgICAgICBpZDogXCJUZXN0XCJcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSkudG9Ob3RUaHJvdygpO1xuXG5cbiAgICBmb3IgKGxldCBpIGluIGF0bC5zdWl0ZXNbXCJTdWl0ZVwiXS5zdWl0ZXMpIHtcbiAgICAgIGxldCBzdWl0ZSA9IGF0bC5zdWl0ZXNbXCJTdWl0ZVwiXS5zdWl0ZXNbaV07XG4gICAgICBleHBlY3Qoc3VpdGUudGVzdC50ZXN0SWQpLnRvRXF1YWwoXCJUZXN0XCIpO1xuICAgIH1cblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIlN1aXRlXCI6IHtcbiAgICAgICAgICBcIkdFVCAvXCI6IHtcbiAgICAgICAgICAgIGlkOiBudWxsXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSkpLnRvVGhyb3coKTtcblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIlN1aXRlXCI6IHtcbiAgICAgICAgICBcIkdFVCAvXCI6IHtcbiAgICAgICAgICAgIGlkOiB7fVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b1Rocm93KCk7XG5cbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHtcbiAgICAgICAgXCJTdWl0ZVwiOiB7XG4gICAgICAgICAgXCJHRVQgL1wiOiB7XG4gICAgICAgICAgICBpZDogbmV3IERhdGVcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSkudG9UaHJvdygpO1xuXG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIHRlc3RzOiB7XG4gICAgICAgIFwiU3VpdGVcIjoge1xuICAgICAgICAgIFwiR0VUIC9cIjoge1xuICAgICAgICAgICAgaWQ6IDEyM1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b05vdFRocm93KCk7XG5cbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHtcbiAgICAgICAgXCJTdWl0ZVwiOiB7XG4gICAgICAgICAgXCJHRVQgL1wiOiB7XG4gICAgICAgICAgICBpZDogW11cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSkudG9UaHJvdygpO1xuICB9KTtcblxuXG4gIGl0KCdtdXN0IHBhcnNlIHRpbWVvdXQnLCAoKSA9PiB7XG4gICAgbGV0IGF0bCA9IG5ldyBBVEwoKTtcblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIlN1aXRlXCI6IHtcbiAgICAgICAgICBcIkdFVCAvXCI6IHtcbiAgICAgICAgICAgIHRpbWVvdXQ6IDEwMFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b05vdFRocm93KCk7XG5cbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHtcbiAgICAgICAgXCJTdWl0ZVwiOiB7XG4gICAgICAgICAgXCJHRVQgL1wiOiB7XG4gICAgICAgICAgICB0aW1lb3V0OiAxMDAwMDAwMDBcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSkudG9Ob3RUaHJvdygpO1xuXG4gICAgZm9yIChsZXQgaSBpbiBhdGwuc3VpdGVzW1wiU3VpdGVcIl0uc3VpdGVzKSB7XG4gICAgICBsZXQgc3VpdGUgPSBhdGwuc3VpdGVzW1wiU3VpdGVcIl0uc3VpdGVzW2ldO1xuICAgICAgZXhwZWN0KHN1aXRlLnRlc3QudGltZW91dCkudG9FcXVhbCgxMDAwMDAwMDApO1xuICAgIH1cblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIlN1aXRlXCI6IHtcbiAgICAgICAgICBcIkdFVCAvXCI6IHtcbiAgICAgICAgICAgIHRpbWVvdXQ6IG51bGxcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSkudG9UaHJvdygpO1xuXG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIHRlc3RzOiB7XG4gICAgICAgIFwiU3VpdGVcIjoge1xuICAgICAgICAgIFwiR0VUIC9cIjoge1xuICAgICAgICAgICAgdGltZW91dDogLTEwXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSkpLnRvVGhyb3coKTtcblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIlN1aXRlXCI6IHtcbiAgICAgICAgICBcIkdFVCAvXCI6IHtcbiAgICAgICAgICAgIHRpbWVvdXQ6IHt9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSkpLnRvVGhyb3coKTtcblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIlN1aXRlXCI6IHtcbiAgICAgICAgICBcIkdFVCAvXCI6IHtcbiAgICAgICAgICAgIHRpbWVvdXQ6IG5ldyBEYXRlXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSkpLnRvVGhyb3coKTtcblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIlN1aXRlXCI6IHtcbiAgICAgICAgICBcIkdFVCAvXCI6IHtcbiAgICAgICAgICAgIHRpbWVvdXQ6IFwiMWhcIlxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b1Rocm93KCk7XG5cbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHtcbiAgICAgICAgXCJTdWl0ZVwiOiB7XG4gICAgICAgICAgXCJHRVQgL1wiOiB7XG4gICAgICAgICAgICB0aW1lb3V0OiBbXVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b1Rocm93KCk7XG4gIH0pO1xuXG4gIGl0KCdtdXN0IHBhcnNlIHF1ZXJ5UGFyYW1ldGVycycsICgpID0+IHtcbiAgICBsZXQgYXRsID0gbmV3IEFUTCgpO1xuXG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIHRlc3RzOiB7XG4gICAgICAgIFwiU3VpdGVcIjoge1xuICAgICAgICAgIFwiR0VUIC9cIjoge1xuICAgICAgICAgICAgcXVlcnlQYXJhbWV0ZXJzOiB7fVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b05vdFRocm93KCk7XG5cbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHtcbiAgICAgICAgXCJTdWl0ZVwiOiB7XG4gICAgICAgICAgXCJHRVQgL1wiOiB7XG4gICAgICAgICAgICBxdWVyeVBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICAgQXV0aG9yaXphdGlvbjogXCJBXCIsXG4gICAgICAgICAgICAgIEFjY2VwdDogXCJCXCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSkudG9Ob3RUaHJvdygpO1xuXG4gICAgZm9yIChsZXQgaSBpbiBhdGwuc3VpdGVzW1wiU3VpdGVcIl0uc3VpdGVzKSB7XG4gICAgICBsZXQgc3VpdGUgPSBhdGwuc3VpdGVzW1wiU3VpdGVcIl0uc3VpdGVzW2ldO1xuICAgICAgZXhwZWN0KHN1aXRlLnRlc3QucmVxdWVzdC5xdWVyeVBhcmFtZXRlcnMpLnRvRXF1YWwoe1xuICAgICAgICBBdXRob3JpemF0aW9uOiBcIkFcIixcbiAgICAgICAgQWNjZXB0OiBcIkJcIlxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIHRlc3RzOiB7XG4gICAgICAgIFwiU3VpdGVcIjoge1xuICAgICAgICAgIFwiR0VUIC9cIjoge1xuICAgICAgICAgICAgcXVlcnlQYXJhbWV0ZXJzOiBbXVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b1Rocm93KCk7XG5cbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHtcbiAgICAgICAgXCJTdWl0ZVwiOiB7XG4gICAgICAgICAgXCJHRVQgL1wiOiB7XG4gICAgICAgICAgICBxdWVyeVBhcmFtZXRlcnM6IG51bGxcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSkudG9UaHJvdygpO1xuXG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIHRlc3RzOiB7XG4gICAgICAgIFwiU3VpdGVcIjoge1xuICAgICAgICAgIFwiR0VUIC9cIjoge1xuICAgICAgICAgICAgcXVlcnlQYXJhbWV0ZXJzOiBmYWxzZVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b1Rocm93KCk7XG5cbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHtcbiAgICAgICAgXCJTdWl0ZVwiOiB7XG4gICAgICAgICAgXCJHRVQgL1wiOiB7XG4gICAgICAgICAgICBxdWVyeVBhcmFtZXRlcnM6IFwiW3N0cmluZ11cIlxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b1Rocm93KCk7XG5cbiAgICBleHBlY3QoKCkgPT4gYXRsLmZyb21PYmplY3Qoe1xuICAgICAgdGVzdHM6IHtcbiAgICAgICAgXCJTdWl0ZVwiOiB7XG4gICAgICAgICAgXCJHRVQgL1wiOiB7XG4gICAgICAgICAgICBxdWVyeVBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICAgYTogW11cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSkudG9UaHJvdygpO1xuXG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIHRlc3RzOiB7XG4gICAgICAgIFwiU3VpdGVcIjoge1xuICAgICAgICAgIFwiR0VUIC9cIjoge1xuICAgICAgICAgICAgcXVlcnlQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAgIGE6IHsgYjogMSB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSkpLnRvVGhyb3coKTtcblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIlN1aXRlXCI6IHtcbiAgICAgICAgICBcIkdFVCAvXCI6IHtcbiAgICAgICAgICAgIHF1ZXJ5UGFyYW1ldGVyczoge1xuICAgICAgICAgICAgICBhOiBmdW5jdGlvbiAoKSB7XG5cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b1Rocm93KCk7XG5cbiAgfSk7XG59KTtcblxuXG5pdCgnbXVzdCBwYXJzZSByZXNwb25zZS5zdGF0dXMnLCAoKSA9PiB7XG4gIGxldCBhdGwgPSBuZXcgQVRMKCk7XG5cbiAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICB0ZXN0czoge1xuICAgICAgXCJFbXB0eVN1aXRlXCI6IHtcbiAgICAgICAgXCJHRVQgL1wiOiB7XG4gICAgICAgICAgcmVzcG9uc2U6IHtcbiAgICAgICAgICAgIHN0YXR1czogMjAxXG4gICAgICAgICAgfVxuXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH0pKS50b05vdFRocm93KCk7XG5cbiAgZm9yIChsZXQgaSBpbiBhdGwuc3VpdGVzW1wiRW1wdHlTdWl0ZVwiXS5zdWl0ZXMpIHtcbiAgICBsZXQgc3VpdGUgPSBhdGwuc3VpdGVzW1wiRW1wdHlTdWl0ZVwiXS5zdWl0ZXNbaV07XG4gICAgZXhwZWN0KHN1aXRlLnRlc3QucmVzcG9uc2Uuc3RhdHVzKS50b0JlKDIwMSwgXCJCeSBkZWZhdWx0IHJlc3BvbnNlLnN0YXR1cyBtdXN0IGJlIDIwMFwiKTtcbiAgfVxuXG4gIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgdGVzdHM6IHtcbiAgICAgIFwiRW1wdHlTdWl0ZVwiOiB7XG4gICAgICAgIFwiR0VUIC9cIjoge1xuICAgICAgICAgIHJlc3BvbnNlOiB7XG4gICAgICAgICAgICBzdGF0dXM6IFwiMjAxXCJcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH0pKS50b1Rocm93KCk7XG5cbiAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICB0ZXN0czoge1xuICAgICAgXCJFbXB0eVN1aXRlXCI6IHtcbiAgICAgICAgXCJHRVQgL1wiOiB7XG4gICAgICAgICAgcmVzcG9uc2U6IHtcbiAgICAgICAgICAgIHN0YXR1czogZmFsc2VcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH0pKS50b1Rocm93KCk7XG4gIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgdGVzdHM6IHtcbiAgICAgIFwiRW1wdHlTdWl0ZVwiOiB7XG4gICAgICAgIFwiR0VUIC9cIjoge1xuICAgICAgICAgIHJlc3BvbnNlOiB7XG4gICAgICAgICAgICBzdGF0dXM6IG51bGxcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH0pKS50b1Rocm93KCk7XG5cblxuXG5cbiAgaXQoJ211c3QgcGFyc2UgcmVzcG9uc2UuYm9keS5pcycsICgpID0+IHtcbiAgICBsZXQgYXRsID0gbmV3IEFUTCgpO1xuXG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIHRlc3RzOiB7XG4gICAgICAgIFwiRW1wdHlTdWl0ZVwiOiB7XG4gICAgICAgICAgXCJHRVQgL1wiOiB7XG4gICAgICAgICAgICByZXNwb25zZToge1xuICAgICAgICAgICAgICBib2R5OiB7XG4gICAgICAgICAgICAgICAgaXM6IFwidGVzdFwiXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSkudG9Ob3RUaHJvdygpO1xuXG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIHRlc3RzOiB7XG4gICAgICAgIFwiRW1wdHlTdWl0ZVwiOiB7XG4gICAgICAgICAgXCJHRVQgL1wiOiB7XG4gICAgICAgICAgICByZXNwb25zZToge1xuICAgICAgICAgICAgICBib2R5OiB7XG4gICAgICAgICAgICAgICAgbWF0Y2hlczogW1xuICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b05vdFRocm93KCk7XG5cbiAgfSk7XG5cblxuICBpdCgnbXVzdCBwYXJzZSByZXNwb25zZS5wcmludCcsICgpID0+IHtcbiAgICBsZXQgYXRsID0gbmV3IEFUTCgpO1xuXG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIHRlc3RzOiB7XG4gICAgICAgIFwiRW1wdHlTdWl0ZVwiOiB7XG4gICAgICAgICAgXCJHRVQgL1wiOiB7XG4gICAgICAgICAgICByZXNwb25zZToge1xuICAgICAgICAgICAgICBwcmludDogdHJ1ZVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSkpLnRvTm90VGhyb3coKTtcblxuICAgIGZvciAobGV0IGkgaW4gYXRsLnN1aXRlc1tcIkVtcHR5U3VpdGVcIl0uc3VpdGVzKSB7XG4gICAgICBsZXQgc3VpdGUgPSBhdGwuc3VpdGVzW1wiRW1wdHlTdWl0ZVwiXS5zdWl0ZXNbaV07XG4gICAgICBleHBlY3Qoc3VpdGUudGVzdC5yZXNwb25zZS5wcmludCkudG9CZSh0cnVlLCBcIkJ5IGRlZmF1bHQgcmVzcG9uc2Uuc3RhdHVzIG11c3QgYmUgMjAwXCIpO1xuICAgIH1cblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIkVtcHR5U3VpdGVcIjoge1xuICAgICAgICAgIFwiR0VUIC9cIjoge1xuICAgICAgICAgICAgcmVzcG9uc2U6IHtcbiAgICAgICAgICAgICAgcHJpbnQ6IGZhbHNlXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSkudG9Ob3RUaHJvdygpO1xuXG4gICAgZm9yIChsZXQgaSBpbiBhdGwuc3VpdGVzW1wiRW1wdHlTdWl0ZVwiXS5zdWl0ZXMpIHtcbiAgICAgIGxldCBzdWl0ZSA9IGF0bC5zdWl0ZXNbXCJFbXB0eVN1aXRlXCJdLnN1aXRlc1tpXTtcbiAgICAgIGV4cGVjdChzdWl0ZS50ZXN0LnJlc3BvbnNlLnByaW50KS50b0JlKGZhbHNlLCBcIkJ5IGRlZmF1bHQgcmVzcG9uc2Uuc3RhdHVzIG11c3QgYmUgMjAwXCIpO1xuICAgIH1cblxuICAgIGV4cGVjdCgoKSA9PiBhdGwuZnJvbU9iamVjdCh7XG4gICAgICB0ZXN0czoge1xuICAgICAgICBcIkVtcHR5U3VpdGVcIjoge1xuICAgICAgICAgIFwiR0VUIC9cIjoge1xuICAgICAgICAgICAgcmVzcG9uc2U6IHtcbiAgICAgICAgICAgICAgcHJpbnQ6IFwiMjAxXCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSkudG9UaHJvdygpO1xuXG4gICAgZXhwZWN0KCgpID0+IGF0bC5mcm9tT2JqZWN0KHtcbiAgICAgIHRlc3RzOiB7XG4gICAgICAgIFwiRW1wdHlTdWl0ZVwiOiB7XG4gICAgICAgICAgXCJHRVQgL1wiOiB7XG4gICAgICAgICAgICByZXNwb25zZToge1xuICAgICAgICAgICAgICBwcmludDogbnVsbFxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKS50b1Rocm93KCk7XG5cbiAgfSk7XG5cbn0pO1xuXG5kZXNjcmliZSgnY2xvbmVPYmplY3QnLCAoKSA9PiB7XG4gIGl0KCduYXRpdmUgdHlwZXMgbXVzdCBiZSB1bnRvdWNoZWQnLCAoKSA9PiB7XG4gICAgbGV0IHN0b3JlID0ge307XG5cbiAgICBsZXQgdmFsdWU6IGFueSA9IFwiYXNkXCI7XG5cbiAgICBleHBlY3QoQVRMSGVscGVycy5jbG9uZU9iamVjdFVzaW5nUG9pbnRlcnModmFsdWUsIHN0b3JlKSkudG9FcXVhbCh2YWx1ZSwgdHlwZW9mIHZhbHVlKTtcblxuICAgIHZhbHVlID0gMTIzO1xuICAgIGV4cGVjdChBVExIZWxwZXJzLmNsb25lT2JqZWN0VXNpbmdQb2ludGVycyh2YWx1ZSwgc3RvcmUpKS50b0VxdWFsKHZhbHVlLCB0eXBlb2YgdmFsdWUpO1xuXG4gICAgdmFsdWUgPSBmYWxzZTtcbiAgICBleHBlY3QoQVRMSGVscGVycy5jbG9uZU9iamVjdFVzaW5nUG9pbnRlcnModmFsdWUsIHN0b3JlKSkudG9FcXVhbCh2YWx1ZSwgdHlwZW9mIHZhbHVlKTtcblxuICAgIHZhbHVlID0gbnVsbDtcbiAgICBleHBlY3QoQVRMSGVscGVycy5jbG9uZU9iamVjdFVzaW5nUG9pbnRlcnModmFsdWUsIHN0b3JlKSkudG9FcXVhbCh2YWx1ZSwgdHlwZW9mIHZhbHVlKTtcblxuICAgIHZhbHVlID0gbmV3IERhdGU7XG4gICAgZXhwZWN0KEFUTEhlbHBlcnMuY2xvbmVPYmplY3RVc2luZ1BvaW50ZXJzKHZhbHVlLCBzdG9yZSkpLnRvRXF1YWwodmFsdWUsIHR5cGVvZiB2YWx1ZSk7XG4gIH0pO1xuXG4gIGl0KCdvYmplY3RzIG11c3QgYmUgY2xvbmVkJywgKCkgPT4ge1xuICAgIGxldCBzdG9yZSA9IHt9O1xuXG4gICAgbGV0IHZhbHVlOiBhbnkgPSB7IGE6IDEsIGI6IFwiMlwiLCBjOiBudWxsLCBkOiB1bmRlZmluZWQsIGU6IGZhbHNlLCBmOiBuZXcgRGF0ZSB9O1xuXG4gICAgZXhwZWN0KEFUTEhlbHBlcnMuY2xvbmVPYmplY3RVc2luZ1BvaW50ZXJzKHZhbHVlLCBzdG9yZSkpLnRvRXF1YWwodmFsdWUsIHR5cGVvZiB2YWx1ZSk7XG4gICAgZXhwZWN0KEFUTEhlbHBlcnMuY2xvbmVPYmplY3RVc2luZ1BvaW50ZXJzKHZhbHVlLCBzdG9yZSkgIT09IHZhbHVlKS50b0JlKHRydWUsIFwiR290IHNhbWUgb2JqZWN0IHJlZmVyZW5jZVwiKTtcbiAgfSk7XG5cbiAgaXQoJ2FycmF5cyBtdXN0IGJlIGNsb25lZCcsICgpID0+IHtcbiAgICBsZXQgc3RvcmUgPSB7fTtcblxuICAgIGxldCB2YWx1ZTogYW55ID0gW1wiYXNkXCIsIDEyMywgbnVsbCwgZmFsc2UsIG5ldyBEYXRlXTtcblxuICAgIGV4cGVjdChBVExIZWxwZXJzLmNsb25lT2JqZWN0VXNpbmdQb2ludGVycyh2YWx1ZSwgc3RvcmUpKS50b0VxdWFsKHZhbHVlLCB0eXBlb2YgdmFsdWUpO1xuICAgIGV4cGVjdChBVExIZWxwZXJzLmNsb25lT2JqZWN0VXNpbmdQb2ludGVycyh2YWx1ZSwgc3RvcmUpICE9PSB2YWx1ZSkudG9CZSh0cnVlLCBcIkdvdCBzYW1lIG9iamVjdCByZWZlcmVuY2VcIik7XG4gICAgZXhwZWN0KEFUTEhlbHBlcnMuY2xvbmVPYmplY3RVc2luZ1BvaW50ZXJzKHZhbHVlLCBzdG9yZSkgaW5zdGFuY2VvZiBBcnJheSkudG9CZSh0cnVlLCBcIk5vdCBpbnN0YW5jZSBvZiBhbiBhcnJheVwiKTtcbiAgfSk7XG5cbiAgaXQoJ2FycmF5cyBjb250YWluaW5nIG9iamVjdHMgbXVzdCBiZSBjbG9uZWQgcmVjdXJzaXZlbHknLCAoKSA9PiB7XG4gICAgbGV0IHN0b3JlID0ge307XG5cbiAgICBsZXQgdmFsdWUgPSBbW10sIHsgYTogMiB9LCBcImFzZFwiLCAxMjMsIG51bGwsIGZhbHNlLCBuZXcgRGF0ZSwgeyBhOiAxLCBiOiBcIjJcIiwgYzogbnVsbCwgZDogdW5kZWZpbmVkLCBlOiBmYWxzZSwgZjogbmV3IERhdGUgfV07XG5cbiAgICBleHBlY3QoQVRMSGVscGVycy5jbG9uZU9iamVjdFVzaW5nUG9pbnRlcnModmFsdWUsIHN0b3JlKSkudG9FcXVhbCh2YWx1ZSwgdHlwZW9mIHZhbHVlKTtcbiAgICBleHBlY3QoQVRMSGVscGVycy5jbG9uZU9iamVjdFVzaW5nUG9pbnRlcnModmFsdWUsIHN0b3JlKSAhPT0gdmFsdWUpLnRvQmUodHJ1ZSwgXCJHb3Qgc2FtZSBvYmplY3QgcmVmZXJlbmNlXCIpO1xuICAgIGV4cGVjdChBVExIZWxwZXJzLmNsb25lT2JqZWN0VXNpbmdQb2ludGVycyh2YWx1ZSwgc3RvcmUpWzBdICE9PSB2YWx1ZVswXSkudG9CZSh0cnVlLCBcIkdvdCBzYW1lIG9iamVjdCByZWZlcmVuY2UgaW50ZXJuYWxcIik7XG4gICAgZXhwZWN0KEFUTEhlbHBlcnMuY2xvbmVPYmplY3RVc2luZ1BvaW50ZXJzKHZhbHVlLCBzdG9yZSlbMV0gIT09IHZhbHVlWzFdKS50b0JlKHRydWUsIFwiR290IHNhbWUgb2JqZWN0IHJlZmVyZW5jZSBpbnRlcm5hbFwiKTtcbiAgfSk7XG5cblxuICBpdCgnb2JqZWN0cyBjb250YWluaW5nIGFycmF5cyBtdXN0IGJlIGNsb25lZCByZWN1cnNpdmVseScsICgpID0+IHtcbiAgICBsZXQgc3RvcmUgPSB7fTtcblxuICAgIGxldCB2YWx1ZSA9IHsgYTogMSwgYjogXCIyXCIsIGM6IG51bGwsIGQ6IHVuZGVmaW5lZCwgZTogZmFsc2UsIGY6IG5ldyBEYXRlLCBhcnI6IFtcImFzZFwiLCAxMjMsIG51bGwsIGZhbHNlLCBuZXcgRGF0ZV0gfTtcblxuICAgIGV4cGVjdChBVExIZWxwZXJzLmNsb25lT2JqZWN0VXNpbmdQb2ludGVycyh2YWx1ZSwgc3RvcmUpKS50b0VxdWFsKHZhbHVlLCB0eXBlb2YgdmFsdWUpO1xuICAgIGV4cGVjdChBVExIZWxwZXJzLmNsb25lT2JqZWN0VXNpbmdQb2ludGVycyh2YWx1ZSwgc3RvcmUpICE9PSB2YWx1ZSkudG9CZSh0cnVlLCBcIkdvdCBzYW1lIG9iamVjdCByZWZlcmVuY2VcIik7XG4gICAgZXhwZWN0KEFUTEhlbHBlcnMuY2xvbmVPYmplY3RVc2luZ1BvaW50ZXJzKHZhbHVlLCBzdG9yZSkuYXJyICE9PSB2YWx1ZS5hcnIpLnRvQmUodHJ1ZSwgXCJHb3Qgc2FtZSBvYmplY3QgcmVmZXJlbmNlIGludGVybmFsXCIpO1xuICB9KTtcblxuXG4gIGl0KCdwb2ludGVycyBtdXN0IGJlIHJlYWRlZCBpbnNpZGUgb2JqZWN0cycsICgpID0+IHtcbiAgICBsZXQgc3RvcmUgPSB7IGE6IDMgfTtcbiAgICBsZXQgZXhwZWN0ZWQgPSB7IHZhbDogMyB9O1xuXG4gICAgbGV0IHZhbHVlID0ge1xuICAgICAgdmFsOiBuZXcgUG9pbnRlcihcImFcIilcbiAgICB9O1xuXG4gICAgZXhwZWN0KEFUTEhlbHBlcnMuY2xvbmVPYmplY3RVc2luZ1BvaW50ZXJzKHZhbHVlLCBzdG9yZSkpLnRvRXF1YWwoZXhwZWN0ZWQsIHR5cGVvZiB2YWx1ZSk7XG4gIH0pO1xuXG4gIGl0KCdhIHNpbmdsZSBwb2ludGVyIG11c3QgYmUgcmVhZGVkIGFuZCByZXR1cm4gdGhlIHZhbHVlJywgKCkgPT4ge1xuICAgIGxldCBzdG9yZSA9IHsgYTogMyB9O1xuICAgIGxldCBleHBlY3RlZCA9IDM7XG5cbiAgICBsZXQgdmFsdWUgPSBuZXcgUG9pbnRlcihcImFcIik7XG5cbiAgICBleHBlY3QoQVRMSGVscGVycy5jbG9uZU9iamVjdFVzaW5nUG9pbnRlcnModmFsdWUsIHN0b3JlKSkudG9FcXVhbChleHBlY3RlZCwgdHlwZW9mIHZhbHVlKTtcbiAgfSk7XG5cbiAgaXQoJ2Egc2luZ2xlIHBvaW50ZXIgbXVzdCBiZSByZWFkZWQsIGlmIHRoZSByZXN1bHQgaXMgYW4gb2JqZWN0LCBpdCBtdXN0IGJlIGNsb25lZCcsICgpID0+IHtcbiAgICBsZXQgc3RvcmUgPSB7IGE6IHsgYzogMyB9IH07XG4gICAgbGV0IGV4cGVjdGVkID0geyBjOiAzIH07XG5cbiAgICBsZXQgdmFsdWUgPSBuZXcgUG9pbnRlcihcImFcIik7XG5cbiAgICBsZXQgcmVzdWx0ID0gQVRMSGVscGVycy5jbG9uZU9iamVjdFVzaW5nUG9pbnRlcnModmFsdWUsIHN0b3JlKTtcblxuICAgIGV4cGVjdChyZXN1bHQpLnRvRXF1YWwoZXhwZWN0ZWQsIHR5cGVvZiB2YWx1ZSk7XG4gICAgZXhwZWN0KHJlc3VsdCAhPT0gc3RvcmUuYSkudG9CZSh0cnVlLCBcIlJlZmVyZW5jZSBub3QgY29waWVkXCIpO1xuICB9KTtcblxuICBpdCgnaWYgdGhlIHBvaW50ZXIgaXMgYW4gb2JqZWN0IG9yIGFycmF5LCB0aGUgcmVzdWx0IG11c3QgYmUgY2xvbmVkJywgKCkgPT4ge1xuICAgIGxldCBzdG9yZSA9IHsgYTogeyBjOiAzIH0gfTtcbiAgICBsZXQgZXhwZWN0ZWQgPSB7IHZhbDogeyBjOiAzIH0gfTtcblxuICAgIGxldCB2YWx1ZSA9IHsgdmFsOiBuZXcgUG9pbnRlcihcImFcIikgfTtcblxuICAgIGxldCByZXN1bHQgPSBBVExIZWxwZXJzLmNsb25lT2JqZWN0VXNpbmdQb2ludGVycyh2YWx1ZSwgc3RvcmUpO1xuXG4gICAgZXhwZWN0KHJlc3VsdCkudG9FcXVhbChleHBlY3RlZCwgdHlwZW9mIHZhbHVlKTtcbiAgICBleHBlY3QocmVzdWx0LnZhbCAhPT0gc3RvcmUuYSkudG9CZSh0cnVlLCBcIlJlZmVyZW5jZSBub3QgY29waWVkXCIpO1xuICB9KTtcbn0pOyJdfQ==