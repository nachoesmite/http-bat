"use strict";
var util = require('util');
var methods = require('methods');
var PointerLib = require('./Pointer');
var ATLAssertion_1 = require('./ATLAssertion');
var ATLRequest_1 = require('./ATLRequest');
exports.pointerLib = PointerLib;
var log = console.log.bind(console);
/// ---
var ATLSuite = (function () {
    function ATLSuite(name) {
        this.name = name;
        this.suites = null;
        this.async = false;
        this.descriptor = null;
        this.test = null;
        this.skip = false;
    }
    return ATLSuite;
}());
exports.ATLSuite = ATLSuite;
var ATLTest = (function () {
    function ATLTest() {
        var _this = this;
        this.timeout = 30000;
        this.response = {};
        this.request = {};
        this.dependsOn = [];
        this.skip = false;
        this.promise = new Promise(function (a, b) {
            _this._resolve = a;
            _this._reject = b;
        });
        this.requester = new ATLRequest_1.ATLRequest(this);
        this.assertions = [];
    }
    ATLTest.prototype.run = function () {
        var _this = this;
        var dependencies = this.dependsOn.length ? Promise.all(this.dependsOn.map(function (x) { return x.test.promise; })) : Promise.resolve();
        dependencies
            .then(function () { return _this.requester.run(); })
            .catch(function () {
            _this.requester.dependencyFailed();
        });
        var assertionResults = Promise.all(this.assertions.map(function (x) { return x.promise; }));
        assertionResults
            .then(function (assertionResults) {
            var errors = assertionResults.filter(function (x) { return !!x; });
            if (errors.length) {
                _this._reject(errors);
            }
            else {
                _this._resolve();
            }
        })
            .catch(function (errors) {
            _this._reject(errors);
        });
        return this.promise;
    };
    return ATLTest;
}());
exports.ATLTest = ATLTest;
/// ---
var KeyValueObject = (function () {
    function KeyValueObject(key, value) {
        this.key = key;
        this.value = value;
    }
    return KeyValueObject;
}());
exports.KeyValueObject = KeyValueObject;
/// ---
function parseSuites(object, instance) {
    var suite = new ATLSuite("");
    suite.ATL = instance;
    var ret = suite.suites = {};
    var prevSuite = null;
    var _loop_1 = function(t) {
        switch (t) {
            case 'skip':
                ensureInstanceOf("skip", object.skip, Number, Boolean);
                suite.skip = !!object.skip;
                break;
            default:
                var method = parseMethodHeader(t);
                if (method) {
                    var methodBody = object[t];
                    var subSuite_1 = new ATLSuite(methodBody.description || (method.method.toUpperCase() + ' ' + method.url));
                    subSuite_1.descriptor = methodBody;
                    var warn = function (msg) {
                        console.warn("Warning:\n\t" + subSuite_1.name + "\n\t\t" + msg);
                    };
                    try {
                        subSuite_1.test = parseTest(subSuite_1.descriptor, warn, suite);
                    }
                    catch (e) {
                        throw new Error((method.method.toUpperCase() + ' ' + method.url) + ", " + e);
                    }
                    subSuite_1.test.method = method.method;
                    subSuite_1.test.uri = method.url;
                    if (prevSuite)
                        subSuite_1.test.dependsOn.push(prevSuite);
                    prevSuite = subSuite_1;
                    ret[subSuite_1.name] = subSuite_1;
                }
        }
    };
    for (var t in object) {
        _loop_1(t);
    }
    return suite;
}
exports.parseSuites = parseSuites;
function parseTest(body, warn, suite) {
    var test = new ATLTest;
    test.suite = suite;
    // parse uriParameters
    if ('uriParameters' in body) {
        if (!body.uriParameters || typeof body.uriParameters != "object" || body.uriParameters instanceof Array)
            throw new TypeError("uriParameters must be an object");
        test.uriParameters = {};
        var keys = Object.keys(body.uriParameters);
        keys.forEach(function (key) {
            var val = body.uriParameters[key];
            ensureInstanceOf("queryParameters." + key, val, Number, String, PointerLib.Pointer);
            test.uriParameters[key] = val;
        });
    }
    // parse method description
    if ('description' in body) {
        ensureInstanceOf("description", body.description, String);
        if (body.description.trim().length > 0) {
            test.description = body.description;
        }
    }
    // parse method id
    if ('id' in body) {
        ensureInstanceOf("id", body.id, Number, String);
        test.testId = body.id.toString();
    }
    // parse timeout
    if ('timeout' in body) {
        ensureInstanceOf("timeout", body.timeout, Number);
        if (body.timeout <= 0)
            throw new TypeError("timeout must be a number > 0");
        test.timeout = body.timeout;
    }
    // parse queryParameters
    if ('queryParameters' in body) {
        if (!body.queryParameters || typeof body.queryParameters != "object" || body.queryParameters instanceof Array)
            throw new TypeError("queryParameters must be an object");
        test.request.queryParameters = test.request.queryParameters || {};
        var keys = Object.keys(body.queryParameters);
        keys.forEach(function (key) {
            var val = body.queryParameters[key];
            ensureInstanceOf("queryParameters." + key, val, Number, String, Boolean, PointerLib.Pointer);
            test.request.queryParameters[key] = val;
        });
    }
    test.request.headers = test.request.headers || {};
    // parse headers
    if ('headers' in body) {
        if (!body.headers || typeof body.headers != "object" || body.headers instanceof Array)
            throw new TypeError("headers must be an object");
        test.request.headers = test.request.headers || {};
        var keys = Object.keys(body.headers);
        keys.forEach(function (key) {
            var val = body.headers[key];
            ensureInstanceOf("headers." + key, val, String, PointerLib.Pointer);
            test.request.headers[key.toLowerCase()] = val;
        });
    }
    if ('request' in body) {
        parseRequest(test, body.request, warn);
    }
    if ('skip' in body) {
        ensureInstanceOf("skip", body.skip, Number, Boolean);
        test.skip = !!body.skip;
    }
    if ('response' in body) {
        parseResponse(test, body.response, warn);
    }
    else {
        test.response.status = 200;
    }
    generateTestAssertions(test);
    return test;
}
exports.parseTest = parseTest;
function parseRequest(test, request, warn) {
    ensureInstanceOf("body.request", request, Object);
    Object.keys(request).forEach(function (bodyKey) {
        var value = request[bodyKey];
        switch (bodyKey) {
            case 'content-type':
                ensureInstanceOf("request.content-type", value, String, PointerLib.Pointer);
                test.request.headers = test.request.headers || {};
                test.request.headers['content-type'] = value;
                break;
            case 'json':
                test.request.json = value;
                break;
            case 'attach':
                ensureInstanceOf("request.attach", value, Array);
                test.request.attach = [];
                for (var i in value) {
                    var currentAttachment = value[i];
                    for (var key in currentAttachment) {
                        test.request.attach.push(new KeyValueObject(key, currentAttachment[key]));
                        break;
                    }
                }
                break;
            case 'form':
                if (!('content-type' in test.request.headers))
                    test.request.headers['content-type'] = "multipart/form-data";
                else
                    throw new TypeError("you CAN'T use content-type AND form fields");
                ensureInstanceOf("request.form", value, Array);
                test.request.form = [];
                for (var i in value) {
                    var currentAttachment = value[i];
                    for (var key in currentAttachment) {
                        test.request.form.push(new KeyValueObject(key, currentAttachment[key]));
                        break;
                    }
                }
                break;
            case 'urlencoded':
                if (!('content-type' in test.request.headers))
                    test.request.headers['content-type'] = "application/x-www-form-urlencoded";
                else
                    throw new TypeError("you CAN'T use content-type AND urlencoded form");
                ensureInstanceOf("request.urlencoded", value, Array);
                test.request.urlencoded = value;
                break;
            default:
                warn("Unknown identifier request." + bodyKey);
        }
    });
}
function parseResponse(test, response, warn) {
    ensureInstanceOf("response", response, Object);
    Object.keys(response).forEach(function (bodyKey) {
        var value = response[bodyKey];
        switch (bodyKey) {
            case 'headers':
                ensureInstanceOf("response.headers", value, Object);
                test.response.headers = {};
                var keys = Object.keys(value);
                keys.forEach(function (key) {
                    var val = value[key];
                    ensureInstanceOf("response.headers." + key, val, String, PointerLib.Pointer);
                    test.response.headers[key.toLowerCase()] = val;
                });
                if (keys.length == 0) {
                    warn("response.headers: empty parameters");
                }
                break;
            case 'contentType': // ################################################################
            case 'content-type':
                ensureInstanceOf("response.content-type", value, String, PointerLib.Pointer);
                test.response.headers = test.response.headers || {};
                if ('content-type' in test.response.headers)
                    throw new TypeError("response.content-type alredy registered as request.header.content-type You can not use BOTH");
                test.response.headers['content-type'] = value;
                break;
            case 'status':
                ensureInstanceOf("response.status", value, Number);
                test.response.status = value | 0;
                break;
            case 'print':
                ensureInstanceOf("response.print", value, Boolean);
                test.response.print = value;
                break;
            case 'body':
                parseResponseBody(test, value, warn);
                break;
            default:
                warn("Unknown identifier response." + bodyKey);
        }
    });
}
function parseResponseBody(test, responseBody, warn) {
    ensureInstanceOf("response.body", responseBody, Object);
    test.response.body = {};
    Object.keys(responseBody).forEach(function (bodyKey) {
        var value = responseBody[bodyKey];
        switch (bodyKey) {
            case 'is':
                test.response.body.is = value;
                break;
            case 'matches':
                ensureInstanceOf("response.body.matches", value, Array);
                test.response.body.matches = [];
                for (var i in value) {
                    var kv = value[i];
                    for (var i_1 in kv) {
                        test.response.body.matches.push(new KeyValueObject(i_1, kv[i_1]));
                    }
                }
                break;
            case 'schema':
                ensureInstanceOf("response.body.schema", value, String, Object);
                test.response.body.schema = value;
                break;
            case 'take':
                ensureInstanceOf("response.body.take", value, Array, PointerLib.Pointer);
                if (value instanceof Array) {
                    test.response.body.take = [];
                    value.forEach(function (takenElement) {
                        for (var i in takenElement) {
                            if (!(takenElement[i] instanceof PointerLib.Pointer))
                                throw new Error("response.body.take.* must be a pointer ex: !!variable myValue");
                            test.response.body.take.push(new KeyValueObject(i, takenElement[i]));
                        }
                    });
                }
                else {
                    /* istanbul ignore else */
                    if (value instanceof PointerLib.Pointer) {
                        test.response.body.copyTo = value;
                    }
                    else {
                        throw new Error("response.body.take must be a sequence of pointers or a !!variable");
                    }
                }
                break;
            case 'print':
                ensureInstanceOf("response.body.print", value, Boolean);
                test.response.body.print = value;
                break;
            default:
                warn("Unknown identifier body.response." + bodyKey);
        }
    });
}
function ensureInstanceOf(name, value) {
    var types = [];
    for (var _i = 2; _i < arguments.length; _i++) {
        types[_i - 2] = arguments[_i];
    }
    for (var i = 0; i < types.length; i++) {
        if (typeof types[i] == "function") {
            if (types[i] === Object && typeof value != "object")
                continue;
            if (typeof value != "undefined") {
                if (types[i] === Number && typeof value == "number")
                    if (isNaN(value))
                        continue;
                    else
                        return;
                if (types[i] === String && typeof value === 'string')
                    return;
                if (types[i] === Boolean && typeof value === 'boolean')
                    return;
                if (value instanceof types[i])
                    return;
            }
        }
    }
    throw new TypeError(name + " must be instance of " + types.map(function (x) { return x && x.displayName || x && x.name || x.toString(); }).join(" | "));
}
exports.ensureInstanceOf = ensureInstanceOf;
function parseMethodHeader(name) {
    var parts = name.split(/\s+/g);
    var method = null;
    method = parts[0].trim().toLowerCase();
    if (method.length == 0)
        return null;
    // methods should have 2 parts
    if (parts.length != 2)
        return null;
    if (parts[0] != parts[0].toUpperCase())
        return null;
    if (methods.indexOf(method) == -1)
        throw new TypeError("ERROR: unknown method " + method + " on " + name);
    // if the URL doesn't starts with "/"
    if (parts[1].substr(0, 1) != '/' && parts[1].substr(0, 1) != '?')
        throw new Error("ERROR: the url must starts with '/' or '?': " + name);
    // if the URL ends with "/"
    if (parts[1].substr(-1) == '/' && parts[1].length > 1)
        throw new Error("ERROR: the url must not ends with '/': " + name);
    return {
        method: method,
        url: parts[1]
    };
}
exports.parseMethodHeader = parseMethodHeader;
function cloneObjectUsingPointers(baseObject, store) {
    if (typeof baseObject !== "object") {
        return baseObject;
    }
    return cloneObject(baseObject, store);
}
exports.cloneObjectUsingPointers = cloneObjectUsingPointers;
function cloneObject(obj, store) {
    if (obj === null || obj === undefined)
        return obj;
    if (typeof obj == "string" || typeof obj == "number" || typeof obj == "boolean")
        return obj;
    // Handle Date (return new Date object with old value)
    if (obj instanceof Date) {
        return new Date(obj);
    }
    if (obj instanceof String || obj instanceof Number || obj instanceof Boolean) {
        return obj;
    }
    // Handle Array (return a full slice of the array)
    if (obj instanceof Array) {
        var newArray = obj.slice();
        return newArray.map(function (x) { return cloneObject(x, store); });
    }
    if (obj instanceof PointerLib.Pointer) {
        var result = void 0;
        try {
            result = cloneObject(obj.get(store), store);
        }
        catch (e) {
            console.error("cloneObject::Error", e);
        }
        return result;
    }
    if (obj instanceof RegExp) {
        return obj;
    }
    // Handle Object
    if (obj instanceof Object) {
        var copy = new obj.constructor();
        for (var attr in obj) {
            if (obj.hasOwnProperty(attr)) {
                copy[attr] = cloneObject(obj[attr], store);
            }
        }
        return copy;
    }
    throw new Error("Unable to copy obj! Its type isn't supported. " + util.inspect(obj));
}
function matchUrl(url) {
    // remove hash & queryString
    url = url.split(/[?#]/)[0];
    // normalize uriParameters to ?
    url = url.replace(/\{([a-zA-Z0-9_]+)\}/g, function () {
        return '?';
    });
    return url;
}
exports.matchUrl = matchUrl;
function flatPromise() {
    var result = {
        resolver: null,
        rejecter: null,
        promise: null
    };
    result.promise = new Promise(function (a, b) {
        result.resolver = a;
        result.rejecter = b;
    });
    return result;
}
exports.flatPromise = flatPromise;
function errorDiff(msg, expected, actual, ctx) {
    var err = new Error(msg);
    if (ctx) {
        err.message = null;
        err.inspect = function () {
            err.message = msg;
            return msg + "\n" + JSON.stringify(ctx, null, 2);
        };
    }
    err.expected = expected;
    err.actual = actual;
    err.showDiff = true;
    return err;
}
exports.errorDiff = errorDiff;
function error(msg, ctx) {
    var err = new Error(msg);
    if (ctx) {
        err.message = null;
        err.inspect = function () {
            err.message = msg;
            return msg + "\n" + JSON.stringify(ctx, null, 2);
        };
    }
    return err;
}
exports.error = error;
if (!(error('test', {}) instanceof Error))
    process.exit(1);
if (!(errorDiff('test', 1, 2, {}) instanceof Error))
    process.exit(1);
function generateTestAssertions(test) {
    if (test.skip)
        return;
    if (test.response) {
        if (test.response.status) {
            test.assertions.push(new ATLAssertion_1.CommonAssertions.StatusCodeAssertion(test, test.response.status));
        }
        if (test.response.body) {
            if ('is' in test.response.body) {
                test.assertions.push(new ATLAssertion_1.CommonAssertions.BodyEqualsAssertion(test, test.response.body.is));
            }
            if (test.response.body.schema) {
                test.assertions.push(new ATLAssertion_1.CommonAssertions.ValidateSchemaOperation(test, test.response.body.schema));
            }
            if (test.response.body.matches) {
                test.response.body.matches.forEach(function (kvo) {
                    test.assertions.push(new ATLAssertion_1.CommonAssertions.BodyMatchesAssertion(test, kvo.key, kvo.value));
                });
            }
            if (test.response.headers) {
                for (var h in test.response.headers) {
                    test.assertions.push(new ATLAssertion_1.CommonAssertions.HeaderMatchesAssertion(test, h, test.response.headers[h]));
                }
            }
            if (test.response.body.take) {
                var take = test.response.body.take;
                take.forEach(function (takenElement) {
                    test.assertions.push(new ATLAssertion_1.CommonAssertions.CopyBodyValueOperation(test, takenElement.key, takenElement.value));
                });
            }
            if (test.response.body.copyTo && test.response.body.copyTo instanceof exports.pointerLib.Pointer) {
                test.assertions.push(new ATLAssertion_1.CommonAssertions.CopyBodyValueOperation(test, '*', test.response.body.copyTo));
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQVRMSGVscGVycy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIkFUTEhlbHBlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUNBLElBQU8sSUFBSSxXQUFXLE1BQU0sQ0FBQyxDQUFDO0FBRTlCLElBQU8sT0FBTyxXQUFXLFNBQVMsQ0FBQyxDQUFDO0FBRXBDLElBQU8sVUFBVSxXQUFXLFdBQVcsQ0FBQyxDQUFDO0FBRXpDLDZCQUFpRSxnQkFBZ0IsQ0FBQyxDQUFBO0FBQ2xGLDJCQUEyQixjQUFjLENBQUMsQ0FBQTtBQUM3QixrQkFBVSxHQUFHLFVBQVUsQ0FBQztBQU1yQyxJQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUV0QyxPQUFPO0FBRVA7SUFDRSxrQkFBbUIsSUFBWTtRQUFaLFNBQUksR0FBSixJQUFJLENBQVE7UUFHL0IsV0FBTSxHQUEwQixJQUFJLENBQUM7UUFDckMsVUFBSyxHQUFZLEtBQUssQ0FBQztRQUN2QixlQUFVLEdBQVEsSUFBSSxDQUFDO1FBQ3ZCLFNBQUksR0FBWSxJQUFJLENBQUM7UUFDckIsU0FBSSxHQUFZLEtBQUssQ0FBQztJQUx0QixDQUFDO0lBT0gsZUFBQztBQUFELENBQUMsQUFWRCxJQVVDO0FBVlksZ0JBQVEsV0FVcEIsQ0FBQTtBQTJCRDtJQUFBO1FBQUEsaUJBNkRDO1FBbERDLFlBQU8sR0FBRyxLQUFLLENBQUM7UUFFaEIsYUFBUSxHQUFnQixFQUFFLENBQUM7UUFDM0IsWUFBTyxHQUFnQixFQUFFLENBQUM7UUFFMUIsY0FBUyxHQUFlLEVBQUUsQ0FBQztRQUUzQixTQUFJLEdBQVksS0FBSyxDQUFDO1FBT3RCLFlBQU8sR0FBaUIsSUFBSSxPQUFPLENBQUMsVUFBQyxDQUFDLEVBQUUsQ0FBQztZQUN2QyxLQUFJLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQztZQUNsQixLQUFJLENBQUMsT0FBTyxHQUFHLENBQUMsQ0FBQztRQUNuQixD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Q0FBQyxNQUFNLENBQUMsQ0FDbEYsQ0FBQztZQUNKLENBQUM7UUFDSCxDQUFDO0lBQ0gsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJcbmltcG9ydCB1dGlsID0gcmVxdWlyZSgndXRpbCcpO1xuXG5pbXBvcnQgbWV0aG9kcyA9IHJlcXVpcmUoJ21ldGhvZHMnKTtcbmltcG9ydCB7IEFUTCB9IGZyb20gJy4vQVRMJztcbmltcG9ydCBQb2ludGVyTGliID0gcmVxdWlyZSgnLi9Qb2ludGVyJyk7XG5cbmltcG9ydCB7IEFUTEVycm9yLCBBVExSZXNwb25zZUFzc2VydGlvbiwgQ29tbW9uQXNzZXJ0aW9ucyB9IGZyb20gJy4vQVRMQXNzZXJ0aW9uJztcbmltcG9ydCB7IEFUTFJlcXVlc3QgfSBmcm9tICcuL0FUTFJlcXVlc3QnO1xuZXhwb3J0IGNvbnN0IHBvaW50ZXJMaWIgPSBQb2ludGVyTGliO1xuXG5leHBvcnQgaW50ZXJmYWNlIElEaWN0aW9uYXJ5PFQ+IHtcbiAgW2tleTogc3RyaW5nXTogVDtcbn1cblxuY29uc3QgbG9nID0gY29uc29sZS5sb2cuYmluZChjb25zb2xlKTtcblxuLy8vIC0tLVxuXG5leHBvcnQgY2xhc3MgQVRMU3VpdGUge1xuICBjb25zdHJ1Y3RvcihwdWJsaWMgbmFtZTogc3RyaW5nKSB7XG5cbiAgfVxuICBzdWl0ZXM6IElEaWN0aW9uYXJ5PEFUTFN1aXRlPiA9IG51bGw7XG4gIGFzeW5jOiBib29sZWFuID0gZmFsc2U7XG4gIGRlc2NyaXB0b3I6IGFueSA9IG51bGw7XG4gIHRlc3Q6IEFUTFRlc3QgPSBudWxsO1xuICBza2lwOiBib29sZWFuID0gZmFsc2U7XG4gIEFUTDogQVRMO1xufVxuXG4vLy8gLS0tXG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFUTFRlc3RSZXMge1xuICBzdGF0dXM/OiBudW1iZXI7XG4gIGJvZHk/OiB7XG4gICAgaXM/OiBhbnk7XG4gICAgbWF0Y2hlcz86IEtleVZhbHVlT2JqZWN0PEtleVZhbHVlT2JqZWN0PGFueT4+W107XG4gICAgdGFrZT86IEtleVZhbHVlT2JqZWN0PFBvaW50ZXJMaWIuUG9pbnRlcj5bXTtcbiAgICBjb3B5VG8/OiBQb2ludGVyTGliLlBvaW50ZXI7XG4gICAgc2NoZW1hPzogYW55O1xuICAgIHByaW50PzogYm9vbGVhbjtcbiAgfTtcbiAgaGVhZGVycz86IElEaWN0aW9uYXJ5PHN0cmluZz47XG4gIHByaW50PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQVRMVGVzdFJlcSB7XG4gIGF0dGFjaD86IEtleVZhbHVlT2JqZWN0PHN0cmluZz5bXTtcbiAgZm9ybT86IEtleVZhbHVlT2JqZWN0PGFueT5bXTtcbiAganNvbj86IGFueTtcbiAgdXJsZW5jb2RlZD86IEtleVZhbHVlT2JqZWN0PGFueT5bXTtcbiAgcXVlcnlQYXJhbWV0ZXJzPzogSURpY3Rpb25hcnk8YW55PjtcbiAgaGVhZGVycz86IElEaWN0aW9uYXJ5PGFueT47XG59XG5cbmV4cG9ydCBjbGFzcyBBVExUZXN0IHtcbiAgc3VpdGU6IEFUTFN1aXRlO1xuXG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIHRlc3RJZDogc3RyaW5nO1xuXG4gIG1ldGhvZDogc3RyaW5nO1xuXG4gIHVyaTogc3RyaW5nO1xuICB1cmlQYXJhbWV0ZXJzOiBJRGljdGlvbmFyeTxhbnk+O1xuXG4gIHRpbWVvdXQgPSAzMDAwMDtcblxuICByZXNwb25zZTogSUFUTFRlc3RSZXMgPSB7fTtcbiAgcmVxdWVzdDogSUFUTFRlc3RSZXEgPSB7fTtcblxuICBkZXBlbmRzT246IEFUTFN1aXRlW10gPSBbXTtcblxuICBza2lwOiBib29sZWFuID0gZmFsc2U7XG5cbiAgcmVzdWx0OiBhbnk7XG5cbiAgcHJpdmF0ZSBfcmVzb2x2ZTogKGVycm9yPykgPT4gdm9pZDtcbiAgcHJpdmF0ZSBfcmVqZWN0OiAoZXJyb3I/KSA9PiB2b2lkO1xuXG4gIHByb21pc2U6IFByb21pc2U8YW55PiA9IG5ldyBQcm9taXNlKChhLCBiKSA9PiB7XG4gICAgdGhpcy5fcmVzb2x2ZSA9IGE7XG4gICAgdGhpcy5fcmVqZWN0ID0gYjtcbiAgfSk7XG5cbiAgcmVxdWVzdGVyOiBBVExSZXF1ZXN0ID0gbmV3IEFUTFJlcXVlc3QodGhpcyk7XG4gIGFzc2VydGlvbnM6IEFUTFJlc3BvbnNlQXNzZXJ0aW9uW10gPSBbXTtcblxuICBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cbiAgICBsZXQgZGVwZW5kZW5jaWVzID0gdGhpcy5kZXBlbmRzT24ubGVuZ3RoID8gUHJvbWlzZS5hbGwodGhpcy5kZXBlbmRzT24ubWFwKHggPT4geC50ZXN0LnByb21pc2UpKSA6IFByb21pc2UucmVzb2x2ZSgpO1xuXG4gICAgZGVwZW5kZW5jaWVzXG4gICAgICAudGhlbigoKSA9PiB0aGlzLnJlcXVlc3Rlci5ydW4oKSlcbiAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgIHRoaXMucmVxdWVzdGVyLmRlcGVuZGVuY3lGYWlsZWQoKTtcbiAgICAgIH0pO1xuXG4gICAgbGV0IGFzc2VydGlvblJlc3VsdHMgPSBQcm9taXNlLmFsbCh0aGlzLmFzc2VydGlvbnMubWFwKHggPT4geC5wcm9taXNlKSk7XG5cbiAgICBhc3NlcnRpb25SZXN1bHRzXG4gICAgICAudGhlbihhc3NlcnRpb25SZXN1bHRzID0+IHtcbiAgICAgICAgbGV0IGVycm9ycyA9IGFzc2VydGlvblJlc3VsdHMuZmlsdGVyKHggPT4gISF4KTtcblxuICAgICAgICBpZiAoZXJyb3JzLmxlbmd0aCkge1xuICAgICAgICAgIHRoaXMuX3JlamVjdChlcnJvcnMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuX3Jlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvcnMgPT4ge1xuICAgICAgICB0aGlzLl9yZWplY3QoZXJyb3JzKTtcbiAgICAgIH0pO1xuXG4gICAgcmV0dXJuIHRoaXMucHJvbWlzZTtcbiAgfVxufVxuXG4vLy8gLS0tXG5cbmV4cG9ydCBjbGFzcyBLZXlWYWx1ZU9iamVjdDxUPiB7XG4gIGNvbnN0cnVjdG9yKHB1YmxpYyBrZXk6IHN0cmluZywgcHVibGljIHZhbHVlOiBUKSB7XG5cbiAgfVxufVxuXG4vLy8gLS0tXG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVN1aXRlcyhvYmplY3QsIGluc3RhbmNlOiBBVEwpOiBBVExTdWl0ZSB7XG5cbiAgbGV0IHN1aXRlID0gbmV3IEFUTFN1aXRlKFwiXCIpO1xuXG4gIHN1aXRlLkFUTCA9IGluc3RhbmNlO1xuXG4gIGxldCByZXQ6IElEaWN0aW9uYXJ5PEFUTFN1aXRlPiA9IHN1aXRlLnN1aXRlcyA9IHt9O1xuXG4gIGxldCBwcmV2U3VpdGUgPSBudWxsO1xuXG4gIGZvciAobGV0IHQgaW4gb2JqZWN0KSB7XG4gICAgc3dpdGNoICh0KSB7XG4gICAgICBjYXNlICdza2lwJzpcbiAgICAgICAgZW5zdXJlSW5zdGFuY2VPZihcInNraXBcIiwgb2JqZWN0LnNraXAsIE51bWJlciwgQm9vbGVhbik7XG4gICAgICAgIHN1aXRlLnNraXAgPSAhIW9iamVjdC5za2lwO1xuICAgICAgICBicmVhaztcblxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgbGV0IG1ldGhvZCA9IHBhcnNlTWV0aG9kSGVhZGVyKHQpO1xuXG4gICAgICAgIGlmIChtZXRob2QpIHtcbiAgICAgICAgICBsZXQgbWV0aG9kQm9keSA9IG9iamVjdFt0XTtcbiAgICAgICAgICBsZXQgc3ViU3VpdGUgPSBuZXcgQVRMU3VpdGUobWV0aG9kQm9keS5kZXNjcmlwdGlvbiB8fCAobWV0aG9kLm1ldGhvZC50b1VwcGVyQ2FzZSgpICsgJyAnICsgbWV0aG9kLnVybCkpO1xuXG4gICAgICAgICAgc3ViU3VpdGUuZGVzY3JpcHRvciA9IG1ldGhvZEJvZHk7XG5cbiAgICAgICAgICBsZXQgd2FybiA9IGZ1bmN0aW9uIChtc2cpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcIldhcm5pbmc6XFxuXFx0XCIgKyBzdWJTdWl0ZS5uYW1lICsgXCJcXG5cXHRcXHRcIiArIG1zZyk7XG4gICAgICAgICAgfTtcblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBzdWJTdWl0ZS50ZXN0ID0gcGFyc2VUZXN0KHN1YlN1aXRlLmRlc2NyaXB0b3IsIHdhcm4sIHN1aXRlKTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoKG1ldGhvZC5tZXRob2QudG9VcHBlckNhc2UoKSArICcgJyArIG1ldGhvZC51cmwpICsgXCIsIFwiICsgZSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgc3ViU3VpdGUudGVzdC5tZXRob2QgPSBtZXRob2QubWV0aG9kO1xuICAgICAgICAgIHN1YlN1aXRlLnRlc3QudXJpID0gbWV0aG9kLnVybDtcblxuICAgICAgICAgIGlmIChwcmV2U3VpdGUpXG4gICAgICAgICAgICBzdWJTdWl0ZS50ZXN0LmRlcGVuZHNPbi5wdXNoKHByZXZTdWl0ZSk7XG5cbiAgICAgICAgICBwcmV2U3VpdGUgPSBzdWJTdWl0ZTtcblxuICAgICAgICAgIHJldFtzdWJTdWl0ZS5uYW1lXSA9IHN1YlN1aXRlO1xuICAgICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHN1aXRlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VUZXN0KGJvZHksIHdhcm46ICh3YXJuKSA9PiB2b2lkLCBzdWl0ZTogQVRMU3VpdGUpOiBBVExUZXN0IHtcbiAgbGV0IHRlc3QgPSBuZXcgQVRMVGVzdDtcbiAgdGVzdC5zdWl0ZSA9IHN1aXRlO1xuXG4gIC8vIHBhcnNlIHVyaVBhcmFtZXRlcnNcbiAgaWYgKCd1cmlQYXJhbWV0ZXJzJyBpbiBib2R5KSB7XG4gICAgaWYgKCFib2R5LnVyaVBhcmFtZXRlcnMgfHwgdHlwZW9mIGJvZHkudXJpUGFyYW1ldGVycyAhPSBcIm9iamVjdFwiIHx8IGJvZHkudXJpUGFyYW1ldGVycyBpbnN0YW5jZW9mIEFycmF5KVxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcInVyaVBhcmFtZXRlcnMgbXVzdCBiZSBhbiBvYmplY3RcIik7XG5cbiAgICB0ZXN0LnVyaVBhcmFtZXRlcnMgPSB7fTtcblxuICAgIGxldCBrZXlzID0gT2JqZWN0LmtleXMoYm9keS51cmlQYXJhbWV0ZXJzKTtcblxuICAgIGtleXMuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgbGV0IHZhbCA9IGJvZHkudXJpUGFyYW1ldGVyc1trZXldO1xuICAgICAgZW5zdXJlSW5zdGFuY2VPZihcInF1ZXJ5UGFyYW1ldGVycy5cIiArIGtleSwgdmFsLCBOdW1iZXIsIFN0cmluZywgUG9pbnRlckxpYi5Qb2ludGVyKTtcbiAgICAgIHRlc3QudXJpUGFyYW1ldGVyc1trZXldID0gdmFsO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gcGFyc2UgbWV0aG9kIGRlc2NyaXB0aW9uXG4gIGlmICgnZGVzY3JpcHRpb24nIGluIGJvZHkpIHtcbiAgICBlbnN1cmVJbnN0YW5jZU9mKFwiZGVzY3JpcHRpb25cIiwgYm9keS5kZXNjcmlwdGlvbiwgU3RyaW5nKTtcblxuICAgIGlmIChib2R5LmRlc2NyaXB0aW9uLnRyaW0oKS5sZW5ndGggPiAwKSB7XG4gICAgICB0ZXN0LmRlc2NyaXB0aW9uID0gYm9keS5kZXNjcmlwdGlvbjtcbiAgICB9XG4gIH1cblxuICAvLyBwYXJzZSBtZXRob2QgaWRcbiAgaWYgKCdpZCcgaW4gYm9keSkge1xuICAgIGVuc3VyZUluc3RhbmNlT2YoXCJpZFwiLCBib2R5LmlkLCBOdW1iZXIsIFN0cmluZyk7XG5cbiAgICB0ZXN0LnRlc3RJZCA9IGJvZHkuaWQudG9TdHJpbmcoKTtcbiAgfVxuXG4gIC8vIHBhcnNlIHRpbWVvdXRcbiAgaWYgKCd0aW1lb3V0JyBpbiBib2R5KSB7XG4gICAgZW5zdXJlSW5zdGFuY2VPZihcInRpbWVvdXRcIiwgYm9keS50aW1lb3V0LCBOdW1iZXIpO1xuXG4gICAgaWYgKGJvZHkudGltZW91dCA8PSAwKVxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcInRpbWVvdXQgbXVzdCBiZSBhIG51bWJlciA+IDBcIik7XG5cbiAgICB0ZXN0LnRpbWVvdXQgPSBib2R5LnRpbWVvdXQ7XG4gIH1cblxuXG4gIC8vIHBhcnNlIHF1ZXJ5UGFyYW1ldGVyc1xuICBpZiAoJ3F1ZXJ5UGFyYW1ldGVycycgaW4gYm9keSkge1xuICAgIGlmICghYm9keS5xdWVyeVBhcmFtZXRlcnMgfHwgdHlwZW9mIGJvZHkucXVlcnlQYXJhbWV0ZXJzICE9IFwib2JqZWN0XCIgfHwgYm9keS5xdWVyeVBhcmFtZXRlcnMgaW5zdGFuY2VvZiBBcnJheSlcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJxdWVyeVBhcmFtZXRlcnMgbXVzdCBiZSBhbiBvYmplY3RcIik7XG5cbiAgICB0ZXN0LnJlcXVlc3QucXVlcnlQYXJhbWV0ZXJzID0gdGVzdC5yZXF1ZXN0LnF1ZXJ5UGFyYW1ldGVycyB8fCB7fTtcblxuICAgIGxldCBrZXlzID0gT2JqZWN0LmtleXMoYm9keS5xdWVyeVBhcmFtZXRlcnMpO1xuXG4gICAga2V5cy5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBsZXQgdmFsID0gYm9keS5xdWVyeVBhcmFtZXRlcnNba2V5XTtcbiAgICAgIGVuc3VyZUluc3RhbmNlT2YoXCJxdWVyeVBhcmFtZXRlcnMuXCIgKyBrZXksIHZhbCwgTnVtYmVyLCBTdHJpbmcsIEJvb2xlYW4sIFBvaW50ZXJMaWIuUG9pbnRlcik7XG4gICAgICB0ZXN0LnJlcXVlc3QucXVlcnlQYXJhbWV0ZXJzW2tleV0gPSB2YWw7XG4gICAgfSk7XG4gIH1cblxuICB0ZXN0LnJlcXVlc3QuaGVhZGVycyA9IHRlc3QucmVxdWVzdC5oZWFkZXJzIHx8IHt9O1xuXG4gIC8vIHBhcnNlIGhlYWRlcnNcbiAgaWYgKCdoZWFkZXJzJyBpbiBib2R5KSB7XG4gICAgaWYgKCFib2R5LmhlYWRlcnMgfHwgdHlwZW9mIGJvZHkuaGVhZGVycyAhPSBcIm9iamVjdFwiIHx8IGJvZHkuaGVhZGVycyBpbnN0YW5jZW9mIEFycmF5KVxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcImhlYWRlcnMgbXVzdCBiZSBhbiBvYmplY3RcIik7XG5cbiAgICB0ZXN0LnJlcXVlc3QuaGVhZGVycyA9IHRlc3QucmVxdWVzdC5oZWFkZXJzIHx8IHt9O1xuXG4gICAgbGV0IGtleXMgPSBPYmplY3Qua2V5cyhib2R5LmhlYWRlcnMpO1xuXG4gICAga2V5cy5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBsZXQgdmFsID0gYm9keS5oZWFkZXJzW2tleV07XG4gICAgICBlbnN1cmVJbnN0YW5jZU9mKFwiaGVhZGVycy5cIiArIGtleSwgdmFsLCBTdHJpbmcsIFBvaW50ZXJMaWIuUG9pbnRlcik7XG4gICAgICB0ZXN0LnJlcXVlc3QuaGVhZGVyc1trZXkudG9Mb3dlckNhc2UoKV0gPSB2YWw7XG4gICAgfSk7XG4gIH1cblxuICBpZiAoJ3JlcXVlc3QnIGluIGJvZHkpIHtcbiAgICBwYXJzZVJlcXVlc3QodGVzdCwgYm9keS5yZXF1ZXN0LCB3YXJuKTtcbiAgfVxuXG4gIGlmICgnc2tpcCcgaW4gYm9keSkge1xuICAgIGVuc3VyZUluc3RhbmNlT2YoXCJza2lwXCIsIGJvZHkuc2tpcCwgTnVtYmVyLCBCb29sZWFuKTtcbiAgICB0ZXN0LnNraXAgPSAhIWJvZHkuc2tpcDtcbiAgfVxuXG4gIGlmICgncmVzcG9uc2UnIGluIGJvZHkpIHtcbiAgICBwYXJzZVJlc3BvbnNlKHRlc3QsIGJvZHkucmVzcG9uc2UsIHdhcm4pO1xuICB9IGVsc2Uge1xuICAgIHRlc3QucmVzcG9uc2Uuc3RhdHVzID0gMjAwO1xuICB9XG5cbiAgZ2VuZXJhdGVUZXN0QXNzZXJ0aW9ucyh0ZXN0KTtcblxuICByZXR1cm4gdGVzdDtcbn1cblxuZnVuY3Rpb24gcGFyc2VSZXF1ZXN0KHRlc3Q6IEFUTFRlc3QsIHJlcXVlc3QsIHdhcm4pIHtcbiAgZW5zdXJlSW5zdGFuY2VPZihcImJvZHkucmVxdWVzdFwiLCByZXF1ZXN0LCBPYmplY3QpO1xuICBPYmplY3Qua2V5cyhyZXF1ZXN0KS5mb3JFYWNoKGJvZHlLZXkgPT4ge1xuICAgIGxldCB2YWx1ZSA9IHJlcXVlc3RbYm9keUtleV07XG4gICAgc3dpdGNoIChib2R5S2V5KSB7XG4gICAgICBjYXNlICdjb250ZW50LXR5cGUnOiAvLyAjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcbiAgICAgICAgZW5zdXJlSW5zdGFuY2VPZihcInJlcXVlc3QuY29udGVudC10eXBlXCIsIHZhbHVlLCBTdHJpbmcsIFBvaW50ZXJMaWIuUG9pbnRlcik7XG5cbiAgICAgICAgdGVzdC5yZXF1ZXN0LmhlYWRlcnMgPSB0ZXN0LnJlcXVlc3QuaGVhZGVycyB8fCB7fTtcbiAgICAgICAgdGVzdC5yZXF1ZXN0LmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID0gdmFsdWU7XG5cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdqc29uJzogLy8gIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcbiAgICAgICAgdGVzdC5yZXF1ZXN0Lmpzb24gPSB2YWx1ZTtcblxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2F0dGFjaCc6IC8vICMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI1xuICAgICAgICBlbnN1cmVJbnN0YW5jZU9mKFwicmVxdWVzdC5hdHRhY2hcIiwgdmFsdWUsIEFycmF5KTtcblxuICAgICAgICB0ZXN0LnJlcXVlc3QuYXR0YWNoID0gW107XG4gICAgICAgIGZvciAobGV0IGkgaW4gdmFsdWUpIHtcbiAgICAgICAgICBsZXQgY3VycmVudEF0dGFjaG1lbnQgPSB2YWx1ZVtpXTtcbiAgICAgICAgICBmb3IgKGxldCBrZXkgaW4gY3VycmVudEF0dGFjaG1lbnQpIHtcbiAgICAgICAgICAgIHRlc3QucmVxdWVzdC5hdHRhY2gucHVzaChuZXcgS2V5VmFsdWVPYmplY3Qoa2V5LCBjdXJyZW50QXR0YWNobWVudFtrZXldKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2Zvcm0nOiAvLyAjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI1xuICAgICAgICBpZiAoISgnY29udGVudC10eXBlJyBpbiB0ZXN0LnJlcXVlc3QuaGVhZGVycykpXG4gICAgICAgICAgdGVzdC5yZXF1ZXN0LmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID0gXCJtdWx0aXBhcnQvZm9ybS1kYXRhXCI7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwieW91IENBTidUIHVzZSBjb250ZW50LXR5cGUgQU5EIGZvcm0gZmllbGRzXCIpO1xuXG4gICAgICAgIGVuc3VyZUluc3RhbmNlT2YoXCJyZXF1ZXN0LmZvcm1cIiwgdmFsdWUsIEFycmF5KTtcblxuICAgICAgICB0ZXN0LnJlcXVlc3QuZm9ybSA9IFtdO1xuICAgICAgICBmb3IgKGxldCBpIGluIHZhbHVlKSB7XG4gICAgICAgICAgbGV0IGN1cnJlbnRBdHRhY2htZW50ID0gdmFsdWVbaV07XG4gICAgICAgICAgZm9yIChsZXQga2V5IGluIGN1cnJlbnRBdHRhY2htZW50KSB7XG4gICAgICAgICAgICB0ZXN0LnJlcXVlc3QuZm9ybS5wdXNoKG5ldyBLZXlWYWx1ZU9iamVjdChrZXksIGN1cnJlbnRBdHRhY2htZW50W2tleV0pKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAndXJsZW5jb2RlZCc6IC8vICMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjXG4gICAgICAgIGlmICghKCdjb250ZW50LXR5cGUnIGluIHRlc3QucmVxdWVzdC5oZWFkZXJzKSlcbiAgICAgICAgICB0ZXN0LnJlcXVlc3QuaGVhZGVyc1snY29udGVudC10eXBlJ10gPSBcImFwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZFwiO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcInlvdSBDQU4nVCB1c2UgY29udGVudC10eXBlIEFORCB1cmxlbmNvZGVkIGZvcm1cIik7XG5cbiAgICAgICAgZW5zdXJlSW5zdGFuY2VPZihcInJlcXVlc3QudXJsZW5jb2RlZFwiLCB2YWx1ZSwgQXJyYXkpO1xuXG4gICAgICAgIHRlc3QucmVxdWVzdC51cmxlbmNvZGVkID0gdmFsdWU7XG5cbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB3YXJuKFwiVW5rbm93biBpZGVudGlmaWVyIHJlcXVlc3QuXCIgKyBib2R5S2V5KTtcbiAgICB9XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBwYXJzZVJlc3BvbnNlKHRlc3Q6IEFUTFRlc3QsIHJlc3BvbnNlLCB3YXJuKSB7XG4gIGVuc3VyZUluc3RhbmNlT2YoXCJyZXNwb25zZVwiLCByZXNwb25zZSwgT2JqZWN0KTtcbiAgT2JqZWN0LmtleXMocmVzcG9uc2UpLmZvckVhY2goYm9keUtleSA9PiB7XG4gICAgbGV0IHZhbHVlID0gcmVzcG9uc2VbYm9keUtleV07XG4gICAgc3dpdGNoIChib2R5S2V5KSB7XG4gICAgICBjYXNlICdoZWFkZXJzJzogLy8gIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcbiAgICAgICAgZW5zdXJlSW5zdGFuY2VPZihcInJlc3BvbnNlLmhlYWRlcnNcIiwgdmFsdWUsIE9iamVjdCk7XG5cbiAgICAgICAgdGVzdC5yZXNwb25zZS5oZWFkZXJzID0ge307XG5cbiAgICAgICAgbGV0IGtleXMgPSBPYmplY3Qua2V5cyh2YWx1ZSk7XG5cbiAgICAgICAga2V5cy5mb3JFYWNoKGtleSA9PiB7XG4gICAgICAgICAgbGV0IHZhbCA9IHZhbHVlW2tleV07XG4gICAgICAgICAgZW5zdXJlSW5zdGFuY2VPZihcInJlc3BvbnNlLmhlYWRlcnMuXCIgKyBrZXksIHZhbCwgU3RyaW5nLCBQb2ludGVyTGliLlBvaW50ZXIpO1xuICAgICAgICAgIHRlc3QucmVzcG9uc2UuaGVhZGVyc1trZXkudG9Mb3dlckNhc2UoKV0gPSB2YWw7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChrZXlzLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgd2FybihcInJlc3BvbnNlLmhlYWRlcnM6IGVtcHR5IHBhcmFtZXRlcnNcIik7XG4gICAgICAgIH1cblxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2NvbnRlbnRUeXBlJzogLy8gIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI1xuICAgICAgY2FzZSAnY29udGVudC10eXBlJzpcbiAgICAgICAgZW5zdXJlSW5zdGFuY2VPZihcInJlc3BvbnNlLmNvbnRlbnQtdHlwZVwiLCB2YWx1ZSwgU3RyaW5nLCBQb2ludGVyTGliLlBvaW50ZXIpO1xuXG4gICAgICAgIHRlc3QucmVzcG9uc2UuaGVhZGVycyA9IHRlc3QucmVzcG9uc2UuaGVhZGVycyB8fCB7fTtcblxuICAgICAgICBpZiAoJ2NvbnRlbnQtdHlwZScgaW4gdGVzdC5yZXNwb25zZS5oZWFkZXJzKVxuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJyZXNwb25zZS5jb250ZW50LXR5cGUgYWxyZWR5IHJlZ2lzdGVyZWQgYXMgcmVxdWVzdC5oZWFkZXIuY29udGVudC10eXBlIFlvdSBjYW4gbm90IHVzZSBCT1RIXCIpO1xuXG4gICAgICAgIHRlc3QucmVzcG9uc2UuaGVhZGVyc1snY29udGVudC10eXBlJ10gPSB2YWx1ZTtcblxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ3N0YXR1cyc6IC8vICMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI1xuICAgICAgICBlbnN1cmVJbnN0YW5jZU9mKFwicmVzcG9uc2Uuc3RhdHVzXCIsIHZhbHVlLCBOdW1iZXIpO1xuXG4gICAgICAgIHRlc3QucmVzcG9uc2Uuc3RhdHVzID0gdmFsdWUgfCAwO1xuXG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAncHJpbnQnOiAvLyAjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjXG4gICAgICAgIGVuc3VyZUluc3RhbmNlT2YoXCJyZXNwb25zZS5wcmludFwiLCB2YWx1ZSwgQm9vbGVhbik7XG5cbiAgICAgICAgdGVzdC5yZXNwb25zZS5wcmludCA9IHZhbHVlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2JvZHknOlxuICAgICAgICBwYXJzZVJlc3BvbnNlQm9keSh0ZXN0LCB2YWx1ZSwgd2Fybik7XG5cbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB3YXJuKFwiVW5rbm93biBpZGVudGlmaWVyIHJlc3BvbnNlLlwiICsgYm9keUtleSk7XG4gICAgfVxuICB9KTtcbn1cblxuXG5mdW5jdGlvbiBwYXJzZVJlc3BvbnNlQm9keSh0ZXN0OiBBVExUZXN0LCByZXNwb25zZUJvZHksIHdhcm4pIHtcbiAgZW5zdXJlSW5zdGFuY2VPZihcInJlc3BvbnNlLmJvZHlcIiwgcmVzcG9uc2VCb2R5LCBPYmplY3QpO1xuXG4gIHRlc3QucmVzcG9uc2UuYm9keSA9IHt9O1xuXG4gIE9iamVjdC5rZXlzKHJlc3BvbnNlQm9keSkuZm9yRWFjaChib2R5S2V5ID0+IHtcbiAgICBsZXQgdmFsdWUgPSByZXNwb25zZUJvZHlbYm9keUtleV07XG4gICAgc3dpdGNoIChib2R5S2V5KSB7XG4gICAgICBjYXNlICdpcyc6IC8vICMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjXG4gICAgICAgIHRlc3QucmVzcG9uc2UuYm9keS5pcyA9IHZhbHVlO1xuXG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnbWF0Y2hlcyc6IC8vICMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcbiAgICAgICAgZW5zdXJlSW5zdGFuY2VPZihcInJlc3BvbnNlLmJvZHkubWF0Y2hlc1wiLCB2YWx1ZSwgQXJyYXkpO1xuXG4gICAgICAgIHRlc3QucmVzcG9uc2UuYm9keS5tYXRjaGVzID0gW107XG5cbiAgICAgICAgZm9yIChsZXQgaSBpbiB2YWx1ZSkge1xuICAgICAgICAgIGxldCBrdiA9IHZhbHVlW2ldO1xuICAgICAgICAgIGZvciAobGV0IGkgaW4ga3YpIHtcbiAgICAgICAgICAgIHRlc3QucmVzcG9uc2UuYm9keS5tYXRjaGVzLnB1c2gobmV3IEtleVZhbHVlT2JqZWN0KGksIGt2W2ldKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdzY2hlbWEnOiAvLyAjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI1xuICAgICAgICBlbnN1cmVJbnN0YW5jZU9mKFwicmVzcG9uc2UuYm9keS5zY2hlbWFcIiwgdmFsdWUsIFN0cmluZywgT2JqZWN0KTtcblxuICAgICAgICB0ZXN0LnJlc3BvbnNlLmJvZHkuc2NoZW1hID0gdmFsdWU7XG5cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICd0YWtlJzogLy8gIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjXG4gICAgICAgIGVuc3VyZUluc3RhbmNlT2YoXCJyZXNwb25zZS5ib2R5LnRha2VcIiwgdmFsdWUsIEFycmF5LCBQb2ludGVyTGliLlBvaW50ZXIpO1xuXG4gICAgICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgICAgdGVzdC5yZXNwb25zZS5ib2R5LnRha2UgPSBbXTtcbiAgICAgICAgICB2YWx1ZS5mb3JFYWNoKGZ1bmN0aW9uICh0YWtlbkVsZW1lbnQpIHtcbiAgICAgICAgICAgIGZvciAobGV0IGkgaW4gdGFrZW5FbGVtZW50KSB7XG5cbiAgICAgICAgICAgICAgaWYgKCEodGFrZW5FbGVtZW50W2ldIGluc3RhbmNlb2YgUG9pbnRlckxpYi5Qb2ludGVyKSlcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJyZXNwb25zZS5ib2R5LnRha2UuKiBtdXN0IGJlIGEgcG9pbnRlciBleDogISF2YXJpYWJsZSBteVZhbHVlXCIpO1xuXG4gICAgICAgICAgICAgIHRlc3QucmVzcG9uc2UuYm9keS50YWtlLnB1c2gobmV3IEtleVZhbHVlT2JqZWN0KGksIHRha2VuRWxlbWVudFtpXSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLyogaXN0YW5idWwgaWdub3JlIGVsc2UgKi9cbiAgICAgICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBQb2ludGVyTGliLlBvaW50ZXIpIHtcbiAgICAgICAgICAgIHRlc3QucmVzcG9uc2UuYm9keS5jb3B5VG8gPSB2YWx1ZTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwicmVzcG9uc2UuYm9keS50YWtlIG11c3QgYmUgYSBzZXF1ZW5jZSBvZiBwb2ludGVycyBvciBhICEhdmFyaWFibGVcIik7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdwcmludCc6XG4gICAgICAgIGVuc3VyZUluc3RhbmNlT2YoXCJyZXNwb25zZS5ib2R5LnByaW50XCIsIHZhbHVlLCBCb29sZWFuKTtcblxuICAgICAgICB0ZXN0LnJlc3BvbnNlLmJvZHkucHJpbnQgPSB2YWx1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB3YXJuKFwiVW5rbm93biBpZGVudGlmaWVyIGJvZHkucmVzcG9uc2UuXCIgKyBib2R5S2V5KTtcbiAgICB9XG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZW5zdXJlSW5zdGFuY2VPZihuYW1lOiBzdHJpbmcsIHZhbHVlOiBhbnksIC4uLnR5cGVzOiBGdW5jdGlvbltdKTogdm9pZCB7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgdHlwZXMubGVuZ3RoOyBpKyspIHtcblxuICAgIGlmICh0eXBlb2YgdHlwZXNbaV0gPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICBpZiAodHlwZXNbaV0gPT09IE9iamVjdCAmJiB0eXBlb2YgdmFsdWUgIT0gXCJvYmplY3RcIilcbiAgICAgICAgY29udGludWU7XG5cbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgIT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICBpZiAodHlwZXNbaV0gPT09IE51bWJlciAmJiB0eXBlb2YgdmFsdWUgPT0gXCJudW1iZXJcIilcbiAgICAgICAgICBpZiAoaXNOYU4odmFsdWUpKVxuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGlmICh0eXBlc1tpXSA9PT0gU3RyaW5nICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpXG4gICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGlmICh0eXBlc1tpXSA9PT0gQm9vbGVhbiAmJiB0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJylcbiAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgaWYgKHZhbHVlIGluc3RhbmNlb2YgdHlwZXNbaV0pXG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlRXJyb3IobmFtZSArIFwiIG11c3QgYmUgaW5zdGFuY2Ugb2YgXCIgKyB0eXBlcy5tYXAoKHg6IGFueSkgPT4geCAmJiB4LmRpc3BsYXlOYW1lIHx8IHggJiYgeC5uYW1lIHx8IHgudG9TdHJpbmcoKSkuam9pbihcIiB8IFwiKSk7XG59XG5cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlTWV0aG9kSGVhZGVyKG5hbWUpIHtcbiAgbGV0IHBhcnRzOiBzdHJpbmdbXSA9IG5hbWUuc3BsaXQoL1xccysvZyk7XG4gIGxldCBtZXRob2Q6IHN0cmluZyA9IG51bGw7XG5cbiAgbWV0aG9kID0gcGFydHNbMF0udHJpbSgpLnRvTG93ZXJDYXNlKCk7XG5cbiAgaWYgKG1ldGhvZC5sZW5ndGggPT0gMClcbiAgICByZXR1cm4gbnVsbDtcblxuICAvLyBtZXRob2RzIHNob3VsZCBoYXZlIDIgcGFydHNcbiAgaWYgKHBhcnRzLmxlbmd0aCAhPSAyKVxuICAgIHJldHVybiBudWxsO1xuXG4gIGlmIChwYXJ0c1swXSAhPSBwYXJ0c1swXS50b1VwcGVyQ2FzZSgpKVxuICAgIHJldHVybiBudWxsO1xuXG4gIGlmIChtZXRob2RzLmluZGV4T2YobWV0aG9kKSA9PSAtMSlcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiRVJST1I6IHVua25vd24gbWV0aG9kIFwiICsgbWV0aG9kICsgXCIgb24gXCIgKyBuYW1lKTtcblxuICAvLyBpZiB0aGUgVVJMIGRvZXNuJ3Qgc3RhcnRzIHdpdGggXCIvXCJcbiAgaWYgKHBhcnRzWzFdLnN1YnN0cigwLCAxKSAhPSAnLycgJiYgcGFydHNbMV0uc3Vic3RyKDAsIDEpICE9ICc/JylcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJFUlJPUjogdGhlIHVybCBtdXN0IHN0YXJ0cyB3aXRoICcvJyBvciAnPyc6IFwiICsgbmFtZSk7XG5cbiAgLy8gaWYgdGhlIFVSTCBlbmRzIHdpdGggXCIvXCJcbiAgaWYgKHBhcnRzWzFdLnN1YnN0cigtMSkgPT0gJy8nICYmIHBhcnRzWzFdLmxlbmd0aCA+IDEpXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiRVJST1I6IHRoZSB1cmwgbXVzdCBub3QgZW5kcyB3aXRoICcvJzogXCIgKyBuYW1lKTtcblxuICByZXR1cm4ge1xuICAgIG1ldGhvZDogbWV0aG9kLFxuICAgIHVybDogcGFydHNbMV1cbiAgfTtcbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gY2xvbmVPYmplY3RVc2luZ1BvaW50ZXJzPFQ+KGJhc2VPYmplY3Q6IFQsIHN0b3JlKTogYW55IHtcbiAgaWYgKHR5cGVvZiBiYXNlT2JqZWN0ICE9PSBcIm9iamVjdFwiKSB7XG4gICAgcmV0dXJuIGJhc2VPYmplY3Q7XG4gIH1cblxuICByZXR1cm4gY2xvbmVPYmplY3QoYmFzZU9iamVjdCwgc3RvcmUpO1xufVxuXG5cbmZ1bmN0aW9uIGNsb25lT2JqZWN0KG9iaiwgc3RvcmUpIHtcblxuICBpZiAob2JqID09PSBudWxsIHx8IG9iaiA9PT0gdW5kZWZpbmVkKVxuICAgIHJldHVybiBvYmo7XG5cbiAgaWYgKHR5cGVvZiBvYmogPT0gXCJzdHJpbmdcIiB8fCB0eXBlb2Ygb2JqID09IFwibnVtYmVyXCIgfHwgdHlwZW9mIG9iaiA9PSBcImJvb2xlYW5cIilcbiAgICByZXR1cm4gb2JqO1xuXG4gIC8vIEhhbmRsZSBEYXRlIChyZXR1cm4gbmV3IERhdGUgb2JqZWN0IHdpdGggb2xkIHZhbHVlKVxuICBpZiAob2JqIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgIHJldHVybiBuZXcgRGF0ZShvYmopO1xuICB9XG5cbiAgaWYgKG9iaiBpbnN0YW5jZW9mIFN0cmluZyB8fCBvYmogaW5zdGFuY2VvZiBOdW1iZXIgfHwgb2JqIGluc3RhbmNlb2YgQm9vbGVhbikge1xuICAgIHJldHVybiBvYmo7XG4gIH1cblxuICAvLyBIYW5kbGUgQXJyYXkgKHJldHVybiBhIGZ1bGwgc2xpY2Ugb2YgdGhlIGFycmF5KVxuICBpZiAob2JqIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICBsZXQgbmV3QXJyYXkgPSBvYmouc2xpY2UoKTtcbiAgICByZXR1cm4gbmV3QXJyYXkubWFwKHggPT4gY2xvbmVPYmplY3QoeCwgc3RvcmUpKTtcbiAgfVxuXG4gIGlmIChvYmogaW5zdGFuY2VvZiBQb2ludGVyTGliLlBvaW50ZXIpIHtcbiAgICBsZXQgcmVzdWx0OiBhbnk7XG4gICAgdHJ5IHtcbiAgICAgIHJlc3VsdCA9IGNsb25lT2JqZWN0KG9iai5nZXQoc3RvcmUpLCBzdG9yZSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc29sZS5lcnJvcihcImNsb25lT2JqZWN0OjpFcnJvclwiLCBlKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgaWYgKG9iaiBpbnN0YW5jZW9mIFJlZ0V4cCkge1xuICAgIHJldHVybiBvYmo7XG4gIH1cblxuICAvLyBIYW5kbGUgT2JqZWN0XG4gIGlmIChvYmogaW5zdGFuY2VvZiBPYmplY3QpIHtcbiAgICBsZXQgY29weSA9IG5ldyBvYmouY29uc3RydWN0b3IoKTtcbiAgICBmb3IgKGxldCBhdHRyIGluIG9iaikge1xuICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShhdHRyKSkge1xuICAgICAgICBjb3B5W2F0dHJdID0gY2xvbmVPYmplY3Qob2JqW2F0dHJdLCBzdG9yZSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBjb3B5O1xuICB9XG5cbiAgdGhyb3cgbmV3IEVycm9yKFwiVW5hYmxlIHRvIGNvcHkgb2JqISBJdHMgdHlwZSBpc24ndCBzdXBwb3J0ZWQuIFwiICsgdXRpbC5pbnNwZWN0KG9iaikpO1xufVxuXG5cbmV4cG9ydCBmdW5jdGlvbiBtYXRjaFVybCh1cmw6IHN0cmluZykge1xuICAvLyByZW1vdmUgaGFzaCAmIHF1ZXJ5U3RyaW5nXG4gIHVybCA9IHVybC5zcGxpdCgvWz8jXS8pWzBdO1xuXG4gIC8vIG5vcm1hbGl6ZSB1cmlQYXJhbWV0ZXJzIHRvID9cbiAgdXJsID0gdXJsLnJlcGxhY2UoL1xceyhbYS16QS1aMC05X10rKVxcfS9nLCBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuICc/JztcbiAgfSBhcyBhbnkpO1xuXG4gIHJldHVybiB1cmw7XG59XG5cblxuZXhwb3J0IGZ1bmN0aW9uIGZsYXRQcm9taXNlKCkge1xuICBsZXQgcmVzdWx0ID0ge1xuICAgIHJlc29sdmVyOiBudWxsIGFzIChhPzogYW55KSA9PiBhbnksXG4gICAgcmVqZWN0ZXI6IG51bGwgYXMgKGE6IGFueSkgPT4gYW55LFxuICAgIHByb21pc2U6IG51bGwgYXMgUHJvbWlzZTxhbnk+XG4gIH07XG5cbiAgcmVzdWx0LnByb21pc2UgPSBuZXcgUHJvbWlzZSgoYSwgYikgPT4ge1xuICAgIHJlc3VsdC5yZXNvbHZlciA9IGE7XG4gICAgcmVzdWx0LnJlamVjdGVyID0gYjtcbiAgfSk7XG5cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gZXJyb3JEaWZmKG1zZywgZXhwZWN0ZWQsIGFjdHVhbCwgY3R4KSB7XG4gIGxldCBlcnIgPSBuZXcgRXJyb3IobXNnKSBhcyBhbnk7XG4gIGlmIChjdHgpIHtcbiAgICBlcnIubWVzc2FnZSA9IG51bGw7XG4gICAgZXJyLmluc3BlY3QgPSBmdW5jdGlvbiAoKSB7XG4gICAgICBlcnIubWVzc2FnZSA9IG1zZztcbiAgICAgIHJldHVybiBtc2cgKyBcIlxcblwiICsgSlNPTi5zdHJpbmdpZnkoY3R4LCBudWxsLCAyKTtcbiAgICB9O1xuICB9XG4gIGVyci5leHBlY3RlZCA9IGV4cGVjdGVkO1xuICBlcnIuYWN0dWFsID0gYWN0dWFsO1xuICBlcnIuc2hvd0RpZmYgPSB0cnVlO1xuICByZXR1cm4gZXJyO1xufVxuXG5cbmV4cG9ydCBmdW5jdGlvbiBlcnJvcihtc2csIGN0eCkge1xuICBsZXQgZXJyID0gbmV3IEVycm9yKG1zZykgYXMgYW55O1xuICBpZiAoY3R4KSB7XG4gICAgZXJyLm1lc3NhZ2UgPSBudWxsO1xuICAgIGVyci5pbnNwZWN0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgZXJyLm1lc3NhZ2UgPSBtc2c7XG4gICAgICByZXR1cm4gbXNnICsgXCJcXG5cIiArIEpTT04uc3RyaW5naWZ5KGN0eCwgbnVsbCwgMik7XG4gICAgfTtcbiAgfVxuICByZXR1cm4gZXJyO1xufVxuXG5cbmlmICghKGVycm9yKCd0ZXN0Jywge30pIGluc3RhbmNlb2YgRXJyb3IpKSBwcm9jZXNzLmV4aXQoMSk7XG5pZiAoIShlcnJvckRpZmYoJ3Rlc3QnLCAxLCAyLCB7fSkgaW5zdGFuY2VvZiBFcnJvcikpIHByb2Nlc3MuZXhpdCgxKTtcblxuXG5mdW5jdGlvbiBnZW5lcmF0ZVRlc3RBc3NlcnRpb25zKHRlc3Q6IEFUTFRlc3QpIHtcbiAgaWYgKHRlc3Quc2tpcCkgcmV0dXJuO1xuXG4gIGlmICh0ZXN0LnJlc3BvbnNlKSB7XG4gICAgaWYgKHRlc3QucmVzcG9uc2Uuc3RhdHVzKSB7XG4gICAgICB0ZXN0LmFzc2VydGlvbnMucHVzaChcbiAgICAgICAgbmV3IENvbW1vbkFzc2VydGlvbnMuU3RhdHVzQ29kZUFzc2VydGlvbih0ZXN0LCB0ZXN0LnJlc3BvbnNlLnN0YXR1cylcbiAgICAgICk7XG4gICAgfVxuXG4gICAgaWYgKHRlc3QucmVzcG9uc2UuYm9keSkge1xuICAgICAgaWYgKCdpcycgaW4gdGVzdC5yZXNwb25zZS5ib2R5KSB7XG4gICAgICAgIHRlc3QuYXNzZXJ0aW9ucy5wdXNoKFxuICAgICAgICAgIG5ldyBDb21tb25Bc3NlcnRpb25zLkJvZHlFcXVhbHNBc3NlcnRpb24odGVzdCwgdGVzdC5yZXNwb25zZS5ib2R5LmlzKVxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBpZiAodGVzdC5yZXNwb25zZS5ib2R5LnNjaGVtYSkge1xuICAgICAgICB0ZXN0LmFzc2VydGlvbnMucHVzaChcbiAgICAgICAgICBuZXcgQ29tbW9uQXNzZXJ0aW9ucy5WYWxpZGF0ZVNjaGVtYU9wZXJhdGlvbih0ZXN0LCB0ZXN0LnJlc3BvbnNlLmJvZHkuc2NoZW1hKVxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBpZiAodGVzdC5yZXNwb25zZS5ib2R5Lm1hdGNoZXMpIHtcbiAgICAgICAgdGVzdC5yZXNwb25zZS5ib2R5Lm1hdGNoZXMuZm9yRWFjaChrdm8gPT4ge1xuICAgICAgICAgIHRlc3QuYXNzZXJ0aW9ucy5wdXNoKFxuICAgICAgICAgICAgbmV3IENvbW1vbkFzc2VydGlvbnMuQm9keU1hdGNoZXNBc3NlcnRpb24odGVzdCwga3ZvLmtleSwga3ZvLnZhbHVlKVxuICAgICAgICAgICk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBpZiAodGVzdC5yZXNwb25zZS5oZWFkZXJzKSB7XG4gICAgICAgIGZvciAobGV0IGggaW4gdGVzdC5yZXNwb25zZS5oZWFkZXJzKSB7XG4gICAgICAgICAgdGVzdC5hc3NlcnRpb25zLnB1c2goXG4gICAgICAgICAgICBuZXcgQ29tbW9uQXNzZXJ0aW9ucy5IZWFkZXJNYXRjaGVzQXNzZXJ0aW9uKHRlc3QsIGgsIHRlc3QucmVzcG9uc2UuaGVhZGVyc1toXSlcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICh0ZXN0LnJlc3BvbnNlLmJvZHkudGFrZSkge1xuICAgICAgICBsZXQgdGFrZSA9IHRlc3QucmVzcG9uc2UuYm9keS50YWtlO1xuXG4gICAgICAgIHRha2UuZm9yRWFjaChmdW5jdGlvbiAodGFrZW5FbGVtZW50KSB7XG4gICAgICAgICAgdGVzdC5hc3NlcnRpb25zLnB1c2goXG4gICAgICAgICAgICBuZXcgQ29tbW9uQXNzZXJ0aW9ucy5Db3B5Qm9keVZhbHVlT3BlcmF0aW9uKHRlc3QsIHRha2VuRWxlbWVudC5rZXksIHRha2VuRWxlbWVudC52YWx1ZSlcbiAgICAgICAgICApO1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRlc3QucmVzcG9uc2UuYm9keS5jb3B5VG8gJiYgdGVzdC5yZXNwb25zZS5ib2R5LmNvcHlUbyBpbnN0YW5jZW9mIHBvaW50ZXJMaWIuUG9pbnRlcikge1xuICAgICAgICB0ZXN0LmFzc2VydGlvbnMucHVzaChcbiAgICAgICAgICBuZXcgQ29tbW9uQXNzZXJ0aW9ucy5Db3B5Qm9keVZhbHVlT3BlcmF0aW9uKHRlc3QsICcqJywgdGVzdC5yZXNwb25zZS5ib2R5LmNvcHlUbylcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn0iXX0=