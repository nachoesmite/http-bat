import {ATL, IATLOptions} from './../lib/ATL';
import ATLHelpers = require('./../lib/ATLHelpers');
import expect = require('expect');

const Pointer = ATLHelpers.pointerLib.Pointer;

describe('Empty Object -> ATL', () => {
  let atl = new ATL();

  it('emptyObject must emit empty ATL', () => {
    expect(() => atl.fromObject({})).toNotThrow();
  });

  it('must contains 0 suites', () => expect(Object.keys(atl.suites).length).toBe(0, "Suites"));
  it('must contains 0 variables', () => expect(Object.keys(atl.options.variables).length).toBe(1, "Variables"));
});

describe('Validations (Object -> ATL)', () => {
  it('Non object variables', () => {
    let atl = new ATL();

    expect(() => atl.fromObject({
      variables: 1
    })).toThrow();

    expect(() => atl.fromObject({
      variables: ""
    })).toThrow();

    expect(() => atl.fromObject({
      variables: false
    })).toThrow();

    expect(() => atl.fromObject({
      variables: {}
    })).toNotThrow();
  });

  it('ENV must be overriden if present on spec only', () => {
    let atl = new ATL();

    atl.fromObject({
      variables: {}
    });

    expect('ENV' in atl.options.variables).toBeTruthy("ENV MUST exists on variables");

    expect(typeof atl.options.variables['ENV']).toBe("object", "ENV MUST be an object 1");

    expect(() => atl.fromObject({
      variables: {
        ENV: {}
      }
    })).toNotThrow();

    expect(atl.options.variables['ENV']).toBeAn(Object, "ENV must be present");

    expect(() => atl.fromObject({
      variables: {
        ENV: null
      }
    })).toNotThrow();

    expect(typeof atl.options.variables['ENV'] == "object").toBeTruthy("ENV MUST be an object 2");

    process.env['tttttt'] = '123';

    expect(() => atl.fromObject({
      variables: {
        ENV: { tteeettaaa: 123 }
      }
    })).toNotThrow();

    expect(atl.options.variables['ENV']['tteeettaaa'] == 123).toBeTruthy("ENV MUST be extended, not overrited");
    expect(atl.options.variables['ENV']['tttttt'] == '123').toBeTruthy("ENV MUST be extended");
  });

  it('Variables must be acumulative', () => {
    let atl = new ATL();

    atl.fromObject({
      variables: {
        a: 1
      }
    });

    expect(atl.options.variables['a']).toBe(1);

    expect(() => atl.fromObject({
      variables: {
        b: 2
      }
    })).toNotThrow();

    expect(atl.options.variables['a']).toBe(1);
    expect(atl.options.variables['b']).toBe(2);
  });

  it('baseUri must be a string', () => {
    let atl = new ATL();

    expect(() => atl.fromObject({
      baseUri: "http://testUri.com"
    })).toNotThrow();

    expect(atl.options.baseUri).toEqual("http://testUri.com");

    expect(() => atl.fromObject({
      baseUri: false
    })).toThrow();

    expect(() => atl.fromObject({
      baseUri: 1
    })).toThrow(undefined, "baseUri is a number");

    expect(() => atl.fromObject({
      baseUri: {}
    })).toThrow();

    expect(atl.options.baseUri).toEqual("http://testUri.com");
  });

  it('baseUriParameters must be a dictionary', () => {
    let atl = new ATL();

    expect(() => atl.fromObject({
      baseUriParameters: {
        env: 'test'
      }
    })).toNotThrow();

    expect(atl.options.baseUriParameters['env']).toEqual("test");

    expect(() => atl.fromObject({
      baseUriParameters: []
    })).toThrow();

    expect(atl.options.baseUriParameters['env']).toEqual("test");

    expect(() => atl.fromObject({
      baseUriParameters: false
    })).toThrow();

    expect(() => atl.fromObject({
      baseUriParameters: null
    })).toThrow();

    expect(() => atl.fromObject({
      baseUriParameters: {
        a: 'test'
      }
    })).toNotThrow();

    expect(atl.options.baseUriParameters['env']).toBe(undefined);
    expect(atl.options.baseUriParameters['a']).toBe("test");
  });

  it('tests must be a dictionary', () => {
    let atl = new ATL();

    expect(() => atl.fromObject({
      tests: {}
    })).toNotThrow();

    expect(() => atl.fromObject({
      tests: []
    })).toThrow();

    expect(() => atl.fromObject({
      tests: false
    })).toThrow();

    expect(() => atl.fromObject({
      tests: null
    })).toThrow();
  });
});

describe('Parse methods', () => {
  it('must parse empty suites', () => {
    let atl = new ATL();

    expect(() => atl.fromObject({
      tests: {
        "EmptySuite": {}
      }
    })).toNotThrow();

    expect(Object.keys(atl.suites).length).toBe(1, "Must be one suite");
    expect(atl.suites["EmptySuite"].suites).toBeA("object", "The first suite must be an object");
    expect(Object.keys(atl.suites["EmptySuite"].suites).length).toBe(0, "The first suite must be an empty object");
  });

  it('must parse several suites', () => {
    let atl = new ATL();

    expect(() => atl.fromObject({
      tests: {
        "EmptySuite": {},
        "EmptySuite1": {}
      }
    })).toNotThrow();

    expect(Object.keys(atl.suites).length).toBe(2, "Must be one suite");
    expect(atl.suites["EmptySuite"].suites).toBeA("object", "The first suite must be an object");
    expect(Object.keys(atl.suites["EmptySuite"].suites).length).toBe(0, "The first suite must be an empty object");

    expect(atl.suites["EmptySuite1"].suites).toBeA("object", "The first suite must be an object");
    expect(Object.keys(atl.suites["EmptySuite1"].suites).length).toBe(0, "The first suite must be an empty object");
  });


  it('must parse all methods', () => {
    let atl = new ATL();

    expect(() => atl.fromObject({
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
    })).toNotThrow();

    expect(Object.keys(atl.suites).length).toBe(1, "Must be one suite");
    expect(atl.suites["EmptySuite"].suites).toBeA("object", "The first suite must be an object");
    expect(Object.keys(atl.suites["EmptySuite"].suites).length).toBe(6, "The first suite must have 6 tests");

    for (let i in atl.suites["EmptySuite"].suites) {
      let suite = atl.suites["EmptySuite"].suites[i];
      expect(suite.test).toBeAn(ATLHelpers.ATLTest, "All tests must be instance of ATLTest");
      expect(suite.test.response.status).toBe(200, "By default response.status must be 200");
    }
  });


  it('must parse only valid methods', () => {
    let atl = new ATL();
    expect(() => atl.fromObject({
      tests: {
        "EmptySuite": {
          "SARASA /": {},
          "TET /": {},
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "Test": {
          "": {}
        }
      }
    })).toNotThrow();

    expect(Object.keys(atl.suites["Test"].suites).length).toBe(0);

    expect(() => atl.fromObject({
      tests: {
        "Test1": {
          "GET my name": {}
        }
      }
    })).toNotThrow();

    expect(Object.keys(atl.suites["Test1"].suites).length).toBe(0);

    expect(() => atl.fromObject({
      tests: {
        "Test2": {
          "get /my": {}
        }
      }
    })).toNotThrow();

    expect(Object.keys(atl.suites["Test2"].suites).length).toBe(0);

  });


  it('must parse only valid method declaration', () => {
    let atl = new ATL();
    expect(() => atl.fromObject({
      tests: {
        "EmptySuite": {
          "GET sarasa": {},
          "POST another/sarasa": {},
        }
      }
    })).toThrow();
  });

  it('must accept empty object on response and request', () => {
    let atl = new ATL();
    expect(() => atl.fromObject({
      tests: {
        "EmptySuite": {
          "GET /sarasa": {
            response: {

            }
          }
        }
      }
    })).toNotThrow();

    expect(() => atl.fromObject({
      tests: {
        "EmptySuite": {
          "GET /sarasa": {
            request: {

            }
          }
        }
      }
    })).toNotThrow();

    expect(() => atl.fromObject({
      tests: {
        "EmptySuite": {
          "GET /sarasa": {
            request: false
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "EmptySuite": {
          "GET /sarasa": {
            request: "false"
          }
        }
      }
    })).toThrow();
    expect(() => atl.fromObject({
      tests: {
        "EmptySuite": {
          "GET /sarasa": {
            request: null
          }
        }
      }
    })).toThrow();
    expect(() => atl.fromObject({
      tests: {
        "EmptySuite": {
          "GET /sarasa": {
            request: 123
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "EmptySuite": {
          "GET /sarasa": {
            response: false
          }
        }
      }
    })).toThrow();
    expect(() => atl.fromObject({
      tests: {
        "EmptySuite": {
          "GET /sarasa": {
            response: "false"
          }
        }
      }
    })).toThrow();
    expect(() => atl.fromObject({
      tests: {
        "EmptySuite": {
          "GET /sarasa": {
            response: null
          }
        }
      }
    })).toThrow();
    expect(() => atl.fromObject({
      tests: {
        "EmptySuite": {
          "GET /sarasa": {
            response: 123
          }
        }
      }
    })).toThrow();
  });


  it('must accept only objects on response.body', () => {
    let atl = new ATL();
    expect(() => atl.fromObject({
      tests: {
        "EmptySuite": {
          "GET /sarasa": {
            response: {
              body: {

              }
            }
          }
        }
      }
    })).toNotThrow();


    expect(() => atl.fromObject({
      tests: {
        "EmptySuite": {
          "GET /sarasa": {
            response: {
              body: false
            }
          }
        }
      }
    })).toThrow();
    expect(() => atl.fromObject({
      tests: {
        "EmptySuite": {
          "GET /sarasa": {
            response: {
              body: "false"
            }
          }
        }
      }
    })).toThrow();
    expect(() => atl.fromObject({
      tests: {
        "EmptySuite": {
          "GET /sarasa": {
            response: {
              body: null
            }
          }
        }
      }
    })).toThrow();
    expect(() => atl.fromObject({
      tests: {
        "EmptySuite": {
          "GET /sarasa": {
            response: {
              body: 123
            }
          }
        }
      }
    })).toThrow();
  });


  it('must parse only valid method declaration (url)', () => {
    let atl = new ATL();
    expect(() => atl.fromObject({
      tests: {
        "EmptySuite": {
          "GET /sarasa": {}
        }
      }
    })).toNotThrow();
    expect(() => atl.fromObject({
      tests: {
        "EmptySuite": {
          "GET /sarasa/": {}
        }
      }
    })).toThrow();
  });

  it('must parse headers', () => {
    let atl = new ATL();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            headers: {}
          }
        }
      }
    })).toNotThrow();

    expect(() => atl.fromObject({
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
    })).toNotThrow();

    for (let i in atl.suites["Suite"].suites) {
      let suite = atl.suites["Suite"].suites[i];
      expect(suite.test.request.headers).toEqual({
        authorization: "A",
        accept: "B"
      });
    }

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            headers: []
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            headers: null
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            headers: false
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            headers: "[string]"
          }
        }
      }
    })).toThrow();
  });



  it('must parse uriParameters', () => {
    let atl = new ATL();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            uriParameters: {}
          }
        }
      }
    })).toNotThrow();

    expect(() => atl.fromObject({
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
    })).toNotThrow();

    for (let i in atl.suites["Suite"].suites) {
      let suite = atl.suites["Suite"].suites[i];
      expect(suite.test.uriParameters).toEqual({
        Authorization: "A",
        Accept: "B"
      });
    }

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            uriParameters: []
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            uriParameters: {
              a: []
            }
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            uriParameters: {
              a: { b: 1 }
            }
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
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
    })).toThrow();



    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            uriParameters: null
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            uriParameters: false
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            uriParameters: "[string]"
          }
        }
      }
    })).toThrow();
  });


  it('must parse description', () => {
    let atl = new ATL();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            description: ""
          }
        }
      }
    })).toNotThrow();

    for (let i in atl.suites["Suite"].suites) {
      let suite = atl.suites["Suite"].suites[i];
      expect(suite.test.description).toBeFalsy();
    }

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            description: "Test"
          }
        }
      }
    })).toNotThrow();


    for (let i in atl.suites["Suite"].suites) {
      let suite = atl.suites["Suite"].suites[i];
      expect(suite.test.description).toEqual("Test");
    }

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            description: null
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            description: {}
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            description: new Date
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            description: 123
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            description: []
          }
        }
      }
    })).toThrow();
  });


  it('must parse id', () => {
    let atl = new ATL();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            id: ""
          }
        }
      }
    })).toNotThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            id: "Test"
          }
        }
      }
    })).toNotThrow();


    for (let i in atl.suites["Suite"].suites) {
      let suite = atl.suites["Suite"].suites[i];
      expect(suite.test.testId).toEqual("Test");
    }

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            id: null
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            id: {}
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            id: new Date
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            id: 123
          }
        }
      }
    })).toNotThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            id: []
          }
        }
      }
    })).toThrow();
  });


  it('must parse timeout', () => {
    let atl = new ATL();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            timeout: 100
          }
        }
      }
    })).toNotThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            timeout: 100000000
          }
        }
      }
    })).toNotThrow();

    for (let i in atl.suites["Suite"].suites) {
      let suite = atl.suites["Suite"].suites[i];
      expect(suite.test.timeout).toEqual(100000000);
    }

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            timeout: null
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            timeout: -10
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            timeout: {}
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            timeout: new Date
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            timeout: "1h"
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            timeout: []
          }
        }
      }
    })).toThrow();
  });

  it('must parse queryParameters', () => {
    let atl = new ATL();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            queryParameters: {}
          }
        }
      }
    })).toNotThrow();

    expect(() => atl.fromObject({
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
    })).toNotThrow();

    for (let i in atl.suites["Suite"].suites) {
      let suite = atl.suites["Suite"].suites[i];
      expect(suite.test.request.queryParameters).toEqual({
        Authorization: "A",
        Accept: "B"
      });
    }

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            queryParameters: []
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            queryParameters: null
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            queryParameters: false
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            queryParameters: "[string]"
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            queryParameters: {
              a: []
            }
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "Suite": {
          "GET /": {
            queryParameters: {
              a: { b: 1 }
            }
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
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
    })).toThrow();

  });
});


it('must parse response.status', () => {
  let atl = new ATL();

  expect(() => atl.fromObject({
    tests: {
      "EmptySuite": {
        "GET /": {
          response: {
            status: 201
          }

        }
      }
    }
  })).toNotThrow();

  for (let i in atl.suites["EmptySuite"].suites) {
    let suite = atl.suites["EmptySuite"].suites[i];
    expect(suite.test.response.status).toBe(201, "By default response.status must be 200");
  }

  expect(() => atl.fromObject({
    tests: {
      "EmptySuite": {
        "GET /": {
          response: {
            status: "201"
          }
        }
      }
    }
  })).toThrow();

  expect(() => atl.fromObject({
    tests: {
      "EmptySuite": {
        "GET /": {
          response: {
            status: false
          }
        }
      }
    }
  })).toThrow();
  expect(() => atl.fromObject({
    tests: {
      "EmptySuite": {
        "GET /": {
          response: {
            status: null
          }
        }
      }
    }
  })).toThrow();




  it('must parse response.body.is', () => {
    let atl = new ATL();

    expect(() => atl.fromObject({
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
    })).toNotThrow();

    expect(() => atl.fromObject({
      tests: {
        "EmptySuite": {
          "GET /": {
            response: {
              body: {
                matches: [
                ]
              }
            }
          }
        }
      }
    })).toNotThrow();

  });


  it('must parse response.print', () => {
    let atl = new ATL();

    expect(() => atl.fromObject({
      tests: {
        "EmptySuite": {
          "GET /": {
            response: {
              print: true
            }

          }
        }
      }
    })).toNotThrow();

    for (let i in atl.suites["EmptySuite"].suites) {
      let suite = atl.suites["EmptySuite"].suites[i];
      expect(suite.test.response.print).toBe(true, "By default response.status must be 200");
    }

    expect(() => atl.fromObject({
      tests: {
        "EmptySuite": {
          "GET /": {
            response: {
              print: false
            }

          }
        }
      }
    })).toNotThrow();

    for (let i in atl.suites["EmptySuite"].suites) {
      let suite = atl.suites["EmptySuite"].suites[i];
      expect(suite.test.response.print).toBe(false, "By default response.status must be 200");
    }

    expect(() => atl.fromObject({
      tests: {
        "EmptySuite": {
          "GET /": {
            response: {
              print: "201"
            }
          }
        }
      }
    })).toThrow();

    expect(() => atl.fromObject({
      tests: {
        "EmptySuite": {
          "GET /": {
            response: {
              print: null
            }
          }
        }
      }
    })).toThrow();

  });

});

describe('cloneObject', () => {
  it('native types must be untouched', () => {
    let store = {};

    let value: any = "asd";

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

  it('objects must be cloned', () => {
    let store = {};

    let value: any = { a: 1, b: "2", c: null, d: undefined, e: false, f: new Date };

    expect(ATLHelpers.cloneObjectUsingPointers(value, store)).toEqual(value, typeof value);
    expect(ATLHelpers.cloneObjectUsingPointers(value, store) !== value).toBe(true, "Got same object reference");
  });

  it('arrays must be cloned', () => {
    let store = {};

    let value: any = ["asd", 123, null, false, new Date];

    expect(ATLHelpers.cloneObjectUsingPointers(value, store)).toEqual(value, typeof value);
    expect(ATLHelpers.cloneObjectUsingPointers(value, store) !== value).toBe(true, "Got same object reference");
    expect(ATLHelpers.cloneObjectUsingPointers(value, store) instanceof Array).toBe(true, "Not instance of an array");
  });

  it('arrays containing objects must be cloned recursively', () => {
    let store = {};

    let value = [[], { a: 2 }, "asd", 123, null, false, new Date, { a: 1, b: "2", c: null, d: undefined, e: false, f: new Date }];

    expect(ATLHelpers.cloneObjectUsingPointers(value, store)).toEqual(value, typeof value);
    expect(ATLHelpers.cloneObjectUsingPointers(value, store) !== value).toBe(true, "Got same object reference");
    expect(ATLHelpers.cloneObjectUsingPointers(value, store)[0] !== value[0]).toBe(true, "Got same object reference internal");
    expect(ATLHelpers.cloneObjectUsingPointers(value, store)[1] !== value[1]).toBe(true, "Got same object reference internal");
  });


  it('objects containing arrays must be cloned recursively', () => {
    let store = {};

    let value = { a: 1, b: "2", c: null, d: undefined, e: false, f: new Date, arr: ["asd", 123, null, false, new Date] };

    expect(ATLHelpers.cloneObjectUsingPointers(value, store)).toEqual(value, typeof value);
    expect(ATLHelpers.cloneObjectUsingPointers(value, store) !== value).toBe(true, "Got same object reference");
    expect(ATLHelpers.cloneObjectUsingPointers(value, store).arr !== value.arr).toBe(true, "Got same object reference internal");
  });


  it('pointers must be readed inside objects', () => {
    let store = { a: 3 };
    let expected = { val: 3 };

    let value = {
      val: new Pointer("a")
    };

    expect(ATLHelpers.cloneObjectUsingPointers(value, store)).toEqual(expected, typeof value);
  });

  it('a single pointer must be readed and return the value', () => {
    let store = { a: 3 };
    let expected = 3;

    let value = new Pointer("a");

    expect(ATLHelpers.cloneObjectUsingPointers(value, store)).toEqual(expected, typeof value);
  });

  it('a single pointer must be readed, if the result is an object, it must be cloned', () => {
    let store = { a: { c: 3 } };
    let expected = { c: 3 };

    let value = new Pointer("a");

    let result = ATLHelpers.cloneObjectUsingPointers(value, store);

    expect(result).toEqual(expected, typeof value);
    expect(result !== store.a).toBe(true, "Reference not copied");
  });

  it('if the pointer is an object or array, the result must be cloned', () => {
    let store = { a: { c: 3 } };
    let expected = { val: { c: 3 } };

    let value = { val: new Pointer("a") };

    let result = ATLHelpers.cloneObjectUsingPointers(value, store);

    expect(result).toEqual(expected, typeof value);
    expect(result.val !== store.a).toBe(true, "Reference not copied");
  });
});