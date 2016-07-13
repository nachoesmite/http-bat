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
        this.timeout = 3000;
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
    ATLTest.prototype.resolve = function (result, error) {
        this.result = result;
        if (error) {
            this._reject(error);
        }
        else {
            this._resolve(result);
        }
    };
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQVRMSGVscGVycy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIkFUTEhlbHBlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUNBLElBQU8sSUFBSSxXQUFXLE1BQU0sQ0FBQyxDQUFDO0FBRTlCLElBQU8sT0FBTyxXQUFXLFNBQVMsQ0FBQyxDQUFDO0FBRXBDLElBQU8sVUFBVSxXQUFXLFdBQVcsQ0FBQyxDQUFDO0FBRXpDLDZCQUFpRSxnQkFBZ0IsQ0FBQyxDQUFBO0FBQ2xGLDJCQUEyQixjQUFjLENBQUMsQ0FBQTtBQUM3QixrQkFBVSxHQUFHLFVBQVUsQ0FBQztBQU1yQyxJQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUV0QyxPQUFPO0FBRVA7SUFDRSxrQkFBbUIsSUFBWTtRQUFaLFNBQUksR0FBSixJQUFJLENBQVE7UUFHL0IsV0FBTSxHQUEwQixJQUFJLENBQUM7UUFDckMsVUFBSyxHQUFZLEtBQUssQ0FBQztRQUN2QixlQUFVLEdBQVEsSUFBSSxDQUFDO1FBQ3ZCLFNBQUksR0FBWSxJQUFJLENBQUM7UUFDckIsU0FBSSxHQUFZLEtBQUssQ0FBQztJQUx0QixDQUFDO0lBT0gsZUFBQztBQUFELENBQUMsQUFWRCxJQVVDO0FBVlksZ0JBQVEsV0FVcEIsQ0FBQTtBQTJCRDtJQUFBO1FBQUEsaUJBc0VDO1FBM0RDLFlBQU8sR0FBRyxJQUFJLENBQUM7UUFFZixhQUFRLEdBQWdCLEVBQUUsQ0FBQztRQUMzQixZQUFPLEdBQWdCLEVBQUUsQ0FBQztRQUUxQixjQUFTLEdBQWUsRUFBRSxDQUFDO1FBRTNCLFNBQUksR0FBWSxLQUFLLENBQUM7UUFPdEIsWUFBTyxHQUFpQixJQUFJLE9BQU8sQ0FBQyxVQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3ZDLEtBQUksQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDO1lBQ2xCLEtBQUksQ0FBQyxPQUFPLEdBQUcsQ0FBQyxDQUFDO1FBQ25CLENB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LENBQUM7Z0JBQ3pGLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUNsQixJQUFJLCtCQUFnQixDQUFDLHNCQUFzQixDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQ2xGLENBQUM7WUFDSixDQUFDO1FBQ0gsQ0FBQztJQUNILENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiXG5pbXBvcnQgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKTtcblxuaW1wb3J0IG1ldGhvZHMgPSByZXF1aXJlKCdtZXRob2RzJyk7XG5pbXBvcnQgeyBBVEwgfSBmcm9tICcuL0FUTCc7XG5pbXBvcnQgUG9pbnRlckxpYiA9IHJlcXVpcmUoJy4vUG9pbnRlcicpO1xuXG5pbXBvcnQgeyBBVExFcnJvciwgQVRMUmVzcG9uc2VBc3NlcnRpb24sIENvbW1vbkFzc2VydGlvbnMgfSBmcm9tICcuL0FUTEFzc2VydGlvbic7XG5pbXBvcnQgeyBBVExSZXF1ZXN0IH0gZnJvbSAnLi9BVExSZXF1ZXN0JztcbmV4cG9ydCBjb25zdCBwb2ludGVyTGliID0gUG9pbnRlckxpYjtcblxuZXhwb3J0IGludGVyZmFjZSBJRGljdGlvbmFyeTxUPiB7XG4gIFtrZXk6IHN0cmluZ106IFQ7XG59XG5cbmNvbnN0IGxvZyA9IGNvbnNvbGUubG9nLmJpbmQoY29uc29sZSk7XG5cbi8vLyAtLS1cblxuZXhwb3J0IGNsYXNzIEFUTFN1aXRlIHtcbiAgY29uc3RydWN0b3IocHVibGljIG5hbWU6IHN0cmluZykge1xuXG4gIH1cbiAgc3VpdGVzOiBJRGljdGlvbmFyeTxBVExTdWl0ZT4gPSBudWxsO1xuICBhc3luYzogYm9vbGVhbiA9IGZhbHNlO1xuICBkZXNjcmlwdG9yOiBhbnkgPSBudWxsO1xuICB0ZXN0OiBBVExUZXN0ID0gbnVsbDtcbiAgc2tpcDogYm9vbGVhbiA9IGZhbHNlO1xuICBBVEw6IEFUTDtcbn1cblxuLy8vIC0tLVxuXG5leHBvcnQgaW50ZXJmYWNlIElBVExUZXN0UmVzIHtcbiAgc3RhdHVzPzogbnVtYmVyO1xuICBib2R5Pzoge1xuICAgIGlzPzogYW55O1xuICAgIG1hdGNoZXM/OiBLZXlWYWx1ZU9iamVjdDxLZXlWYWx1ZU9iamVjdDxhbnk+PltdO1xuICAgIHRha2U/OiBLZXlWYWx1ZU9iamVjdDxQb2ludGVyTGliLlBvaW50ZXI+W107XG4gICAgY29weVRvPzogUG9pbnRlckxpYi5Qb2ludGVyO1xuICAgIHNjaGVtYT86IGFueTtcbiAgICBwcmludD86IGJvb2xlYW47XG4gIH07XG4gIGhlYWRlcnM/OiBJRGljdGlvbmFyeTxzdHJpbmc+O1xuICBwcmludD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFUTFRlc3RSZXEge1xuICBhdHRhY2g/OiBLZXlWYWx1ZU9iamVjdDxzdHJpbmc+W107XG4gIGZvcm0/OiBLZXlWYWx1ZU9iamVjdDxhbnk+W107XG4gIGpzb24/OiBhbnk7XG4gIHVybGVuY29kZWQ/OiBLZXlWYWx1ZU9iamVjdDxhbnk+W107XG4gIHF1ZXJ5UGFyYW1ldGVycz86IElEaWN0aW9uYXJ5PGFueT47XG4gIGhlYWRlcnM/OiBJRGljdGlvbmFyeTxhbnk+O1xufVxuXG5leHBvcnQgY2xhc3MgQVRMVGVzdCB7XG4gIHN1aXRlOiBBVExTdWl0ZTtcblxuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICB0ZXN0SWQ6IHN0cmluZztcblxuICBtZXRob2Q6IHN0cmluZztcblxuICB1cmk6IHN0cmluZztcbiAgdXJpUGFyYW1ldGVyczogSURpY3Rpb25hcnk8YW55PjtcblxuICB0aW1lb3V0ID0gMzAwMDtcblxuICByZXNwb25zZTogSUFUTFRlc3RSZXMgPSB7fTtcbiAgcmVxdWVzdDogSUFUTFRlc3RSZXEgPSB7fTtcblxuICBkZXBlbmRzT246IEFUTFN1aXRlW10gPSBbXTtcblxuICBza2lwOiBib29sZWFuID0gZmFsc2U7XG5cbiAgcmVzdWx0OiBhbnk7XG5cbiAgcHJpdmF0ZSBfcmVzb2x2ZTogKGVycm9yPykgPT4gdm9pZDtcbiAgcHJpdmF0ZSBfcmVqZWN0OiAoZXJyb3I/KSA9PiB2b2lkO1xuXG4gIHByb21pc2U6IFByb21pc2U8YW55PiA9IG5ldyBQcm9taXNlKChhLCBiKSA9PiB7XG4gICAgdGhpcy5fcmVzb2x2ZSA9IGE7XG4gICAgdGhpcy5fcmVqZWN0ID0gYjtcbiAgfSk7XG5cbiAgcmVzb2x2ZShyZXN1bHQsIGVycm9yPzogRXJyb3IpIHtcbiAgICB0aGlzLnJlc3VsdCA9IHJlc3VsdDtcbiAgICBpZiAoZXJyb3IpIHtcbiAgICAgIHRoaXMuX3JlamVjdChlcnJvcik7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX3Jlc29sdmUocmVzdWx0KTtcbiAgICB9XG4gIH1cblxuICByZXF1ZXN0ZXI6IEFUTFJlcXVlc3QgPSBuZXcgQVRMUmVxdWVzdCh0aGlzKTtcbiAgYXNzZXJ0aW9uczogQVRMUmVzcG9uc2VBc3NlcnRpb25bXSA9IFtdO1xuXG4gIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblxuICAgIGxldCBkZXBlbmRlbmNpZXMgPSB0aGlzLmRlcGVuZHNPbi5sZW5ndGggPyBQcm9taXNlLmFsbCh0aGlzLmRlcGVuZHNPbi5tYXAoeCA9PiB4LnRlc3QucHJvbWlzZSkpIDogUHJvbWlzZS5yZXNvbHZlKCk7XG5cbiAgICBkZXBlbmRlbmNpZXNcbiAgICAgIC50aGVuKCgpID0+IHRoaXMucmVxdWVzdGVyLnJ1bigpKVxuICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgdGhpcy5yZXF1ZXN0ZXIuZGVwZW5kZW5jeUZhaWxlZCgpO1xuICAgICAgfSk7XG5cbiAgICBsZXQgYXNzZXJ0aW9uUmVzdWx0cyA9IFByb21pc2UuYWxsKHRoaXMuYXNzZXJ0aW9ucy5tYXAoeCA9PiB4LnByb21pc2UpKTtcblxuICAgIGFzc2VydGlvblJlc3VsdHNcbiAgICAgIC50aGVuKGFzc2VydGlvblJlc3VsdHMgPT4ge1xuICAgICAgICBsZXQgZXJyb3JzID0gYXNzZXJ0aW9uUmVzdWx0cy5maWx0ZXIoeCA9PiAhIXgpO1xuXG4gICAgICAgIGlmIChlcnJvcnMubGVuZ3RoKSB7XG4gICAgICAgICAgdGhpcy5fcmVqZWN0KGVycm9ycyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5fcmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9ycyA9PiB7XG4gICAgICAgIHRoaXMuX3JlamVjdChlcnJvcnMpO1xuICAgICAgfSk7XG5cbiAgICByZXR1cm4gdGhpcy5wcm9taXNlO1xuICB9XG59XG5cbi8vLyAtLS1cblxuZXhwb3J0IGNsYXNzIEtleVZhbHVlT2JqZWN0PFQ+IHtcbiAgY29uc3RydWN0b3IocHVibGljIGtleTogc3RyaW5nLCBwdWJsaWMgdmFsdWU6IFQpIHtcblxuICB9XG59XG5cbi8vLyAtLS1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlU3VpdGVzKG9iamVjdCwgaW5zdGFuY2U6IEFUTCk6IEFUTFN1aXRlIHtcblxuICBsZXQgc3VpdGUgPSBuZXcgQVRMU3VpdGUoXCJcIik7XG5cbiAgc3VpdGUuQVRMID0gaW5zdGFuY2U7XG5cbiAgbGV0IHJldDogSURpY3Rpb25hcnk8QVRMU3VpdGU+ID0gc3VpdGUuc3VpdGVzID0ge307XG5cbiAgbGV0IHByZXZTdWl0ZSA9IG51bGw7XG5cbiAgZm9yIChsZXQgdCBpbiBvYmplY3QpIHtcbiAgICBzd2l0Y2ggKHQpIHtcbiAgICAgIGNhc2UgJ3NraXAnOlxuICAgICAgICBlbnN1cmVJbnN0YW5jZU9mKFwic2tpcFwiLCBvYmplY3Quc2tpcCwgTnVtYmVyLCBCb29sZWFuKTtcbiAgICAgICAgc3VpdGUuc2tpcCA9ICEhb2JqZWN0LnNraXA7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBsZXQgbWV0aG9kID0gcGFyc2VNZXRob2RIZWFkZXIodCk7XG5cbiAgICAgICAgaWYgKG1ldGhvZCkge1xuICAgICAgICAgIGxldCBtZXRob2RCb2R5ID0gb2JqZWN0W3RdO1xuICAgICAgICAgIGxldCBzdWJTdWl0ZSA9IG5ldyBBVExTdWl0ZShtZXRob2RCb2R5LmRlc2NyaXB0aW9uIHx8IChtZXRob2QubWV0aG9kLnRvVXBwZXJDYXNlKCkgKyAnICcgKyBtZXRob2QudXJsKSk7XG5cbiAgICAgICAgICBzdWJTdWl0ZS5kZXNjcmlwdG9yID0gbWV0aG9kQm9keTtcblxuICAgICAgICAgIGxldCB3YXJuID0gZnVuY3Rpb24gKG1zZykge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiV2FybmluZzpcXG5cXHRcIiArIHN1YlN1aXRlLm5hbWUgKyBcIlxcblxcdFxcdFwiICsgbXNnKTtcbiAgICAgICAgICB9O1xuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHN1YlN1aXRlLnRlc3QgPSBwYXJzZVRlc3Qoc3ViU3VpdGUuZGVzY3JpcHRvciwgd2Fybiwgc3VpdGUpO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcigobWV0aG9kLm1ldGhvZC50b1VwcGVyQ2FzZSgpICsgJyAnICsgbWV0aG9kLnVybCkgKyBcIiwgXCIgKyBlKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBzdWJTdWl0ZS50ZXN0Lm1ldGhvZCA9IG1ldGhvZC5tZXRob2Q7XG4gICAgICAgICAgc3ViU3VpdGUudGVzdC51cmkgPSBtZXRob2QudXJsO1xuXG4gICAgICAgICAgaWYgKHByZXZTdWl0ZSlcbiAgICAgICAgICAgIHN1YlN1aXRlLnRlc3QuZGVwZW5kc09uLnB1c2gocHJldlN1aXRlKTtcblxuICAgICAgICAgIHByZXZTdWl0ZSA9IHN1YlN1aXRlO1xuXG4gICAgICAgICAgcmV0W3N1YlN1aXRlLm5hbWVdID0gc3ViU3VpdGU7XG4gICAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gc3VpdGU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVRlc3QoYm9keSwgd2FybjogKHdhcm4pID0+IHZvaWQsIHN1aXRlOiBBVExTdWl0ZSk6IEFUTFRlc3Qge1xuICBsZXQgdGVzdCA9IG5ldyBBVExUZXN0O1xuICB0ZXN0LnN1aXRlID0gc3VpdGU7XG5cbiAgLy8gcGFyc2UgdXJpUGFyYW1ldGVyc1xuICBpZiAoJ3VyaVBhcmFtZXRlcnMnIGluIGJvZHkpIHtcbiAgICBpZiAoIWJvZHkudXJpUGFyYW1ldGVycyB8fCB0eXBlb2YgYm9keS51cmlQYXJhbWV0ZXJzICE9IFwib2JqZWN0XCIgfHwgYm9keS51cmlQYXJhbWV0ZXJzIGluc3RhbmNlb2YgQXJyYXkpXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwidXJpUGFyYW1ldGVycyBtdXN0IGJlIGFuIG9iamVjdFwiKTtcblxuICAgIHRlc3QudXJpUGFyYW1ldGVycyA9IHt9O1xuXG4gICAgbGV0IGtleXMgPSBPYmplY3Qua2V5cyhib2R5LnVyaVBhcmFtZXRlcnMpO1xuXG4gICAga2V5cy5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBsZXQgdmFsID0gYm9keS51cmlQYXJhbWV0ZXJzW2tleV07XG4gICAgICBlbnN1cmVJbnN0YW5jZU9mKFwicXVlcnlQYXJhbWV0ZXJzLlwiICsga2V5LCB2YWwsIE51bWJlciwgU3RyaW5nLCBQb2ludGVyTGliLlBvaW50ZXIpO1xuICAgICAgdGVzdC51cmlQYXJhbWV0ZXJzW2tleV0gPSB2YWw7XG4gICAgfSk7XG4gIH1cblxuICAvLyBwYXJzZSBtZXRob2QgZGVzY3JpcHRpb25cbiAgaWYgKCdkZXNjcmlwdGlvbicgaW4gYm9keSkge1xuICAgIGVuc3VyZUluc3RhbmNlT2YoXCJkZXNjcmlwdGlvblwiLCBib2R5LmRlc2NyaXB0aW9uLCBTdHJpbmcpO1xuXG4gICAgaWYgKGJvZHkuZGVzY3JpcHRpb24udHJpbSgpLmxlbmd0aCA+IDApIHtcbiAgICAgIHRlc3QuZGVzY3JpcHRpb24gPSBib2R5LmRlc2NyaXB0aW9uO1xuICAgIH1cbiAgfVxuXG4gIC8vIHBhcnNlIG1ldGhvZCBpZFxuICBpZiAoJ2lkJyBpbiBib2R5KSB7XG4gICAgZW5zdXJlSW5zdGFuY2VPZihcImlkXCIsIGJvZHkuaWQsIE51bWJlciwgU3RyaW5nKTtcblxuICAgIHRlc3QudGVzdElkID0gYm9keS5pZC50b1N0cmluZygpO1xuICB9XG5cbiAgLy8gcGFyc2UgdGltZW91dFxuICBpZiAoJ3RpbWVvdXQnIGluIGJvZHkpIHtcbiAgICBlbnN1cmVJbnN0YW5jZU9mKFwidGltZW91dFwiLCBib2R5LnRpbWVvdXQsIE51bWJlcik7XG5cbiAgICBpZiAoYm9keS50aW1lb3V0IDw9IDApXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwidGltZW91dCBtdXN0IGJlIGEgbnVtYmVyID4gMFwiKTtcblxuICAgIHRlc3QudGltZW91dCA9IGJvZHkudGltZW91dDtcbiAgfVxuXG5cbiAgLy8gcGFyc2UgcXVlcnlQYXJhbWV0ZXJzXG4gIGlmICgncXVlcnlQYXJhbWV0ZXJzJyBpbiBib2R5KSB7XG4gICAgaWYgKCFib2R5LnF1ZXJ5UGFyYW1ldGVycyB8fCB0eXBlb2YgYm9keS5xdWVyeVBhcmFtZXRlcnMgIT0gXCJvYmplY3RcIiB8fCBib2R5LnF1ZXJ5UGFyYW1ldGVycyBpbnN0YW5jZW9mIEFycmF5KVxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcInF1ZXJ5UGFyYW1ldGVycyBtdXN0IGJlIGFuIG9iamVjdFwiKTtcblxuICAgIHRlc3QucmVxdWVzdC5xdWVyeVBhcmFtZXRlcnMgPSB0ZXN0LnJlcXVlc3QucXVlcnlQYXJhbWV0ZXJzIHx8IHt9O1xuXG4gICAgbGV0IGtleXMgPSBPYmplY3Qua2V5cyhib2R5LnF1ZXJ5UGFyYW1ldGVycyk7XG5cbiAgICBrZXlzLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGxldCB2YWwgPSBib2R5LnF1ZXJ5UGFyYW1ldGVyc1trZXldO1xuICAgICAgZW5zdXJlSW5zdGFuY2VPZihcInF1ZXJ5UGFyYW1ldGVycy5cIiArIGtleSwgdmFsLCBOdW1iZXIsIFN0cmluZywgQm9vbGVhbiwgUG9pbnRlckxpYi5Qb2ludGVyKTtcbiAgICAgIHRlc3QucmVxdWVzdC5xdWVyeVBhcmFtZXRlcnNba2V5XSA9IHZhbDtcbiAgICB9KTtcbiAgfVxuXG4gIHRlc3QucmVxdWVzdC5oZWFkZXJzID0gdGVzdC5yZXF1ZXN0LmhlYWRlcnMgfHwge307XG5cbiAgLy8gcGFyc2UgaGVhZGVyc1xuICBpZiAoJ2hlYWRlcnMnIGluIGJvZHkpIHtcbiAgICBpZiAoIWJvZHkuaGVhZGVycyB8fCB0eXBlb2YgYm9keS5oZWFkZXJzICE9IFwib2JqZWN0XCIgfHwgYm9keS5oZWFkZXJzIGluc3RhbmNlb2YgQXJyYXkpXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiaGVhZGVycyBtdXN0IGJlIGFuIG9iamVjdFwiKTtcblxuICAgIHRlc3QucmVxdWVzdC5oZWFkZXJzID0gdGVzdC5yZXF1ZXN0LmhlYWRlcnMgfHwge307XG5cbiAgICBsZXQga2V5cyA9IE9iamVjdC5rZXlzKGJvZHkuaGVhZGVycyk7XG5cbiAgICBrZXlzLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGxldCB2YWwgPSBib2R5LmhlYWRlcnNba2V5XTtcbiAgICAgIGVuc3VyZUluc3RhbmNlT2YoXCJoZWFkZXJzLlwiICsga2V5LCB2YWwsIFN0cmluZywgUG9pbnRlckxpYi5Qb2ludGVyKTtcbiAgICAgIHRlc3QucmVxdWVzdC5oZWFkZXJzW2tleS50b0xvd2VyQ2FzZSgpXSA9IHZhbDtcbiAgICB9KTtcbiAgfVxuXG4gIGlmICgncmVxdWVzdCcgaW4gYm9keSkge1xuICAgIHBhcnNlUmVxdWVzdCh0ZXN0LCBib2R5LnJlcXVlc3QsIHdhcm4pO1xuICB9XG5cbiAgaWYgKCdza2lwJyBpbiBib2R5KSB7XG4gICAgZW5zdXJlSW5zdGFuY2VPZihcInNraXBcIiwgYm9keS5za2lwLCBOdW1iZXIsIEJvb2xlYW4pO1xuICAgIHRlc3Quc2tpcCA9ICEhYm9keS5za2lwO1xuICB9XG5cbiAgaWYgKCdyZXNwb25zZScgaW4gYm9keSkge1xuICAgIHBhcnNlUmVzcG9uc2UodGVzdCwgYm9keS5yZXNwb25zZSwgd2Fybik7XG4gIH0gZWxzZSB7XG4gICAgdGVzdC5yZXNwb25zZS5zdGF0dXMgPSAyMDA7XG4gIH1cblxuICBnZW5lcmF0ZVRlc3RBc3NlcnRpb25zKHRlc3QpO1xuXG4gIHJldHVybiB0ZXN0O1xufVxuXG5mdW5jdGlvbiBwYXJzZVJlcXVlc3QodGVzdDogQVRMVGVzdCwgcmVxdWVzdCwgd2Fybikge1xuICBlbnN1cmVJbnN0YW5jZU9mKFwiYm9keS5yZXF1ZXN0XCIsIHJlcXVlc3QsIE9iamVjdCk7XG4gIE9iamVjdC5rZXlzKHJlcXVlc3QpLmZvckVhY2goYm9keUtleSA9PiB7XG4gICAgbGV0IHZhbHVlID0gcmVxdWVzdFtib2R5S2V5XTtcbiAgICBzd2l0Y2ggKGJvZHlLZXkpIHtcbiAgICAgIGNhc2UgJ2NvbnRlbnQtdHlwZSc6IC8vICMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI1xuICAgICAgICBlbnN1cmVJbnN0YW5jZU9mKFwicmVxdWVzdC5jb250ZW50LXR5cGVcIiwgdmFsdWUsIFN0cmluZywgUG9pbnRlckxpYi5Qb2ludGVyKTtcblxuICAgICAgICB0ZXN0LnJlcXVlc3QuaGVhZGVycyA9IHRlc3QucmVxdWVzdC5oZWFkZXJzIHx8IHt9O1xuICAgICAgICB0ZXN0LnJlcXVlc3QuaGVhZGVyc1snY29udGVudC10eXBlJ10gPSB2YWx1ZTtcblxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2pzb24nOiAvLyAjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI1xuICAgICAgICB0ZXN0LnJlcXVlc3QuanNvbiA9IHZhbHVlO1xuXG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnYXR0YWNoJzogLy8gIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjXG4gICAgICAgIGVuc3VyZUluc3RhbmNlT2YoXCJyZXF1ZXN0LmF0dGFjaFwiLCB2YWx1ZSwgQXJyYXkpO1xuXG4gICAgICAgIHRlc3QucmVxdWVzdC5hdHRhY2ggPSBbXTtcbiAgICAgICAgZm9yIChsZXQgaSBpbiB2YWx1ZSkge1xuICAgICAgICAgIGxldCBjdXJyZW50QXR0YWNobWVudCA9IHZhbHVlW2ldO1xuICAgICAgICAgIGZvciAobGV0IGtleSBpbiBjdXJyZW50QXR0YWNobWVudCkge1xuICAgICAgICAgICAgdGVzdC5yZXF1ZXN0LmF0dGFjaC5wdXNoKG5ldyBLZXlWYWx1ZU9iamVjdChrZXksIGN1cnJlbnRBdHRhY2htZW50W2tleV0pKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnZm9ybSc6IC8vICMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjXG4gICAgICAgIGlmICghKCdjb250ZW50LXR5cGUnIGluIHRlc3QucmVxdWVzdC5oZWFkZXJzKSlcbiAgICAgICAgICB0ZXN0LnJlcXVlc3QuaGVhZGVyc1snY29udGVudC10eXBlJ10gPSBcIm11bHRpcGFydC9mb3JtLWRhdGFcIjtcbiAgICAgICAgZWxzZVxuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJ5b3UgQ0FOJ1QgdXNlIGNvbnRlbnQtdHlwZSBBTkQgZm9ybSBmaWVsZHNcIik7XG5cbiAgICAgICAgZW5zdXJlSW5zdGFuY2VPZihcInJlcXVlc3QuZm9ybVwiLCB2YWx1ZSwgQXJyYXkpO1xuXG4gICAgICAgIHRlc3QucmVxdWVzdC5mb3JtID0gW107XG4gICAgICAgIGZvciAobGV0IGkgaW4gdmFsdWUpIHtcbiAgICAgICAgICBsZXQgY3VycmVudEF0dGFjaG1lbnQgPSB2YWx1ZVtpXTtcbiAgICAgICAgICBmb3IgKGxldCBrZXkgaW4gY3VycmVudEF0dGFjaG1lbnQpIHtcbiAgICAgICAgICAgIHRlc3QucmVxdWVzdC5mb3JtLnB1c2gobmV3IEtleVZhbHVlT2JqZWN0KGtleSwgY3VycmVudEF0dGFjaG1lbnRba2V5XSkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICd1cmxlbmNvZGVkJzogLy8gIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcbiAgICAgICAgaWYgKCEoJ2NvbnRlbnQtdHlwZScgaW4gdGVzdC5yZXF1ZXN0LmhlYWRlcnMpKVxuICAgICAgICAgIHRlc3QucmVxdWVzdC5oZWFkZXJzWydjb250ZW50LXR5cGUnXSA9IFwiYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkXCI7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwieW91IENBTidUIHVzZSBjb250ZW50LXR5cGUgQU5EIHVybGVuY29kZWQgZm9ybVwiKTtcblxuICAgICAgICBlbnN1cmVJbnN0YW5jZU9mKFwicmVxdWVzdC51cmxlbmNvZGVkXCIsIHZhbHVlLCBBcnJheSk7XG5cbiAgICAgICAgdGVzdC5yZXF1ZXN0LnVybGVuY29kZWQgPSB2YWx1ZTtcblxuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHdhcm4oXCJVbmtub3duIGlkZW50aWZpZXIgcmVxdWVzdC5cIiArIGJvZHlLZXkpO1xuICAgIH1cbiAgfSk7XG59XG5cbmZ1bmN0aW9uIHBhcnNlUmVzcG9uc2UodGVzdDogQVRMVGVzdCwgcmVzcG9uc2UsIHdhcm4pIHtcbiAgZW5zdXJlSW5zdGFuY2VPZihcInJlc3BvbnNlXCIsIHJlc3BvbnNlLCBPYmplY3QpO1xuICBPYmplY3Qua2V5cyhyZXNwb25zZSkuZm9yRWFjaChib2R5S2V5ID0+IHtcbiAgICBsZXQgdmFsdWUgPSByZXNwb25zZVtib2R5S2V5XTtcbiAgICBzd2l0Y2ggKGJvZHlLZXkpIHtcbiAgICAgIGNhc2UgJ2hlYWRlcnMnOiAvLyAjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI1xuICAgICAgICBlbnN1cmVJbnN0YW5jZU9mKFwicmVzcG9uc2UuaGVhZGVyc1wiLCB2YWx1ZSwgT2JqZWN0KTtcblxuICAgICAgICB0ZXN0LnJlc3BvbnNlLmhlYWRlcnMgPSB7fTtcblxuICAgICAgICBsZXQga2V5cyA9IE9iamVjdC5rZXlzKHZhbHVlKTtcblxuICAgICAgICBrZXlzLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICBsZXQgdmFsID0gdmFsdWVba2V5XTtcbiAgICAgICAgICBlbnN1cmVJbnN0YW5jZU9mKFwicmVzcG9uc2UuaGVhZGVycy5cIiArIGtleSwgdmFsLCBTdHJpbmcsIFBvaW50ZXJMaWIuUG9pbnRlcik7XG4gICAgICAgICAgdGVzdC5yZXNwb25zZS5oZWFkZXJzW2tleS50b0xvd2VyQ2FzZSgpXSA9IHZhbDtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKGtleXMubGVuZ3RoID09IDApIHtcbiAgICAgICAgICB3YXJuKFwicmVzcG9uc2UuaGVhZGVyczogZW1wdHkgcGFyYW1ldGVyc1wiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnY29udGVudFR5cGUnOiAvLyAjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjXG4gICAgICBjYXNlICdjb250ZW50LXR5cGUnOlxuICAgICAgICBlbnN1cmVJbnN0YW5jZU9mKFwicmVzcG9uc2UuY29udGVudC10eXBlXCIsIHZhbHVlLCBTdHJpbmcsIFBvaW50ZXJMaWIuUG9pbnRlcik7XG5cbiAgICAgICAgdGVzdC5yZXNwb25zZS5oZWFkZXJzID0gdGVzdC5yZXNwb25zZS5oZWFkZXJzIHx8IHt9O1xuXG4gICAgICAgIGlmICgnY29udGVudC10eXBlJyBpbiB0ZXN0LnJlc3BvbnNlLmhlYWRlcnMpXG4gICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcInJlc3BvbnNlLmNvbnRlbnQtdHlwZSBhbHJlZHkgcmVnaXN0ZXJlZCBhcyByZXF1ZXN0LmhlYWRlci5jb250ZW50LXR5cGUgWW91IGNhbiBub3QgdXNlIEJPVEhcIik7XG5cbiAgICAgICAgdGVzdC5yZXNwb25zZS5oZWFkZXJzWydjb250ZW50LXR5cGUnXSA9IHZhbHVlO1xuXG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnc3RhdHVzJzogLy8gIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjXG4gICAgICAgIGVuc3VyZUluc3RhbmNlT2YoXCJyZXNwb25zZS5zdGF0dXNcIiwgdmFsdWUsIE51bWJlcik7XG5cbiAgICAgICAgdGVzdC5yZXNwb25zZS5zdGF0dXMgPSB2YWx1ZSB8IDA7XG5cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdwcmludCc6IC8vICMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcbiAgICAgICAgZW5zdXJlSW5zdGFuY2VPZihcInJlc3BvbnNlLnByaW50XCIsIHZhbHVlLCBCb29sZWFuKTtcblxuICAgICAgICB0ZXN0LnJlc3BvbnNlLnByaW50ID0gdmFsdWU7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnYm9keSc6XG4gICAgICAgIHBhcnNlUmVzcG9uc2VCb2R5KHRlc3QsIHZhbHVlLCB3YXJuKTtcblxuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHdhcm4oXCJVbmtub3duIGlkZW50aWZpZXIgcmVzcG9uc2UuXCIgKyBib2R5S2V5KTtcbiAgICB9XG4gIH0pO1xufVxuXG5cbmZ1bmN0aW9uIHBhcnNlUmVzcG9uc2VCb2R5KHRlc3Q6IEFUTFRlc3QsIHJlc3BvbnNlQm9keSwgd2Fybikge1xuICBlbnN1cmVJbnN0YW5jZU9mKFwicmVzcG9uc2UuYm9keVwiLCByZXNwb25zZUJvZHksIE9iamVjdCk7XG5cbiAgdGVzdC5yZXNwb25zZS5ib2R5ID0ge307XG5cbiAgT2JqZWN0LmtleXMocmVzcG9uc2VCb2R5KS5mb3JFYWNoKGJvZHlLZXkgPT4ge1xuICAgIGxldCB2YWx1ZSA9IHJlc3BvbnNlQm9keVtib2R5S2V5XTtcbiAgICBzd2l0Y2ggKGJvZHlLZXkpIHtcbiAgICAgIGNhc2UgJ2lzJzogLy8gIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcbiAgICAgICAgdGVzdC5yZXNwb25zZS5ib2R5LmlzID0gdmFsdWU7XG5cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdtYXRjaGVzJzogLy8gIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI1xuICAgICAgICBlbnN1cmVJbnN0YW5jZU9mKFwicmVzcG9uc2UuYm9keS5tYXRjaGVzXCIsIHZhbHVlLCBBcnJheSk7XG5cbiAgICAgICAgdGVzdC5yZXNwb25zZS5ib2R5Lm1hdGNoZXMgPSBbXTtcblxuICAgICAgICBmb3IgKGxldCBpIGluIHZhbHVlKSB7XG4gICAgICAgICAgbGV0IGt2ID0gdmFsdWVbaV07XG4gICAgICAgICAgZm9yIChsZXQgaSBpbiBrdikge1xuICAgICAgICAgICAgdGVzdC5yZXNwb25zZS5ib2R5Lm1hdGNoZXMucHVzaChuZXcgS2V5VmFsdWVPYmplY3QoaSwga3ZbaV0pKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ3NjaGVtYSc6IC8vICMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjXG4gICAgICAgIGVuc3VyZUluc3RhbmNlT2YoXCJyZXNwb25zZS5ib2R5LnNjaGVtYVwiLCB2YWx1ZSwgU3RyaW5nLCBPYmplY3QpO1xuXG4gICAgICAgIHRlc3QucmVzcG9uc2UuYm9keS5zY2hlbWEgPSB2YWx1ZTtcblxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ3Rha2UnOiAvLyAjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcbiAgICAgICAgZW5zdXJlSW5zdGFuY2VPZihcInJlc3BvbnNlLmJvZHkudGFrZVwiLCB2YWx1ZSwgQXJyYXksIFBvaW50ZXJMaWIuUG9pbnRlcik7XG5cbiAgICAgICAgaWYgKHZhbHVlIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgICB0ZXN0LnJlc3BvbnNlLmJvZHkudGFrZSA9IFtdO1xuICAgICAgICAgIHZhbHVlLmZvckVhY2goZnVuY3Rpb24gKHRha2VuRWxlbWVudCkge1xuICAgICAgICAgICAgZm9yIChsZXQgaSBpbiB0YWtlbkVsZW1lbnQpIHtcblxuICAgICAgICAgICAgICBpZiAoISh0YWtlbkVsZW1lbnRbaV0gaW5zdGFuY2VvZiBQb2ludGVyTGliLlBvaW50ZXIpKVxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcInJlc3BvbnNlLmJvZHkudGFrZS4qIG11c3QgYmUgYSBwb2ludGVyIGV4OiAhIXZhcmlhYmxlIG15VmFsdWVcIik7XG5cbiAgICAgICAgICAgICAgdGVzdC5yZXNwb25zZS5ib2R5LnRha2UucHVzaChuZXcgS2V5VmFsdWVPYmplY3QoaSwgdGFrZW5FbGVtZW50W2ldKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgZWxzZSAqL1xuICAgICAgICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIFBvaW50ZXJMaWIuUG9pbnRlcikge1xuICAgICAgICAgICAgdGVzdC5yZXNwb25zZS5ib2R5LmNvcHlUbyA9IHZhbHVlO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJyZXNwb25zZS5ib2R5LnRha2UgbXVzdCBiZSBhIHNlcXVlbmNlIG9mIHBvaW50ZXJzIG9yIGEgISF2YXJpYWJsZVwiKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ3ByaW50JzpcbiAgICAgICAgZW5zdXJlSW5zdGFuY2VPZihcInJlc3BvbnNlLmJvZHkucHJpbnRcIiwgdmFsdWUsIEJvb2xlYW4pO1xuXG4gICAgICAgIHRlc3QucmVzcG9uc2UuYm9keS5wcmludCA9IHZhbHVlO1xuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHdhcm4oXCJVbmtub3duIGlkZW50aWZpZXIgYm9keS5yZXNwb25zZS5cIiArIGJvZHlLZXkpO1xuICAgIH1cbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlbnN1cmVJbnN0YW5jZU9mKG5hbWU6IHN0cmluZywgdmFsdWU6IGFueSwgLi4udHlwZXM6IEZ1bmN0aW9uW10pOiB2b2lkIHtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB0eXBlcy5sZW5ndGg7IGkrKykge1xuXG4gICAgaWYgKHR5cGVvZiB0eXBlc1tpXSA9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgIGlmICh0eXBlc1tpXSA9PT0gT2JqZWN0ICYmIHR5cGVvZiB2YWx1ZSAhPSBcIm9iamVjdFwiKVxuICAgICAgICBjb250aW51ZTtcblxuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSAhPSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgIGlmICh0eXBlc1tpXSA9PT0gTnVtYmVyICYmIHR5cGVvZiB2YWx1ZSA9PSBcIm51bWJlclwiKVxuICAgICAgICAgIGlmIChpc05hTih2YWx1ZSkpXG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICBlbHNlXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgaWYgKHR5cGVzW2ldID09PSBTdHJpbmcgJiYgdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJylcbiAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgaWYgKHR5cGVzW2ldID09PSBCb29sZWFuICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKVxuICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiB0eXBlc1tpXSlcbiAgICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVFcnJvcihuYW1lICsgXCIgbXVzdCBiZSBpbnN0YW5jZSBvZiBcIiArIHR5cGVzLm1hcCgoeDogYW55KSA9PiB4ICYmIHguZGlzcGxheU5hbWUgfHwgeCAmJiB4Lm5hbWUgfHwgeC50b1N0cmluZygpKS5qb2luKFwiIHwgXCIpKTtcbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VNZXRob2RIZWFkZXIobmFtZSkge1xuICBsZXQgcGFydHM6IHN0cmluZ1tdID0gbmFtZS5zcGxpdCgvXFxzKy9nKTtcbiAgbGV0IG1ldGhvZDogc3RyaW5nID0gbnVsbDtcblxuICBtZXRob2QgPSBwYXJ0c1swXS50cmltKCkudG9Mb3dlckNhc2UoKTtcblxuICBpZiAobWV0aG9kLmxlbmd0aCA9PSAwKVxuICAgIHJldHVybiBudWxsO1xuXG4gIC8vIG1ldGhvZHMgc2hvdWxkIGhhdmUgMiBwYXJ0c1xuICBpZiAocGFydHMubGVuZ3RoICE9IDIpXG4gICAgcmV0dXJuIG51bGw7XG5cbiAgaWYgKHBhcnRzWzBdICE9IHBhcnRzWzBdLnRvVXBwZXJDYXNlKCkpXG4gICAgcmV0dXJuIG51bGw7XG5cbiAgaWYgKG1ldGhvZHMuaW5kZXhPZihtZXRob2QpID09IC0xKVxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJFUlJPUjogdW5rbm93biBtZXRob2QgXCIgKyBtZXRob2QgKyBcIiBvbiBcIiArIG5hbWUpO1xuXG4gIC8vIGlmIHRoZSBVUkwgZG9lc24ndCBzdGFydHMgd2l0aCBcIi9cIlxuICBpZiAocGFydHNbMV0uc3Vic3RyKDAsIDEpICE9ICcvJyAmJiBwYXJ0c1sxXS5zdWJzdHIoMCwgMSkgIT0gJz8nKVxuICAgIHRocm93IG5ldyBFcnJvcihcIkVSUk9SOiB0aGUgdXJsIG11c3Qgc3RhcnRzIHdpdGggJy8nIG9yICc/JzogXCIgKyBuYW1lKTtcblxuICAvLyBpZiB0aGUgVVJMIGVuZHMgd2l0aCBcIi9cIlxuICBpZiAocGFydHNbMV0uc3Vic3RyKC0xKSA9PSAnLycgJiYgcGFydHNbMV0ubGVuZ3RoID4gMSlcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJFUlJPUjogdGhlIHVybCBtdXN0IG5vdCBlbmRzIHdpdGggJy8nOiBcIiArIG5hbWUpO1xuXG4gIHJldHVybiB7XG4gICAgbWV0aG9kOiBtZXRob2QsXG4gICAgdXJsOiBwYXJ0c1sxXVxuICB9O1xufVxuXG5cbmV4cG9ydCBmdW5jdGlvbiBjbG9uZU9iamVjdFVzaW5nUG9pbnRlcnM8VD4oYmFzZU9iamVjdDogVCwgc3RvcmUpOiBhbnkge1xuICBpZiAodHlwZW9mIGJhc2VPYmplY3QgIT09IFwib2JqZWN0XCIpIHtcbiAgICByZXR1cm4gYmFzZU9iamVjdDtcbiAgfVxuXG4gIHJldHVybiBjbG9uZU9iamVjdChiYXNlT2JqZWN0LCBzdG9yZSk7XG59XG5cblxuZnVuY3Rpb24gY2xvbmVPYmplY3Qob2JqLCBzdG9yZSkge1xuXG4gIGlmIChvYmogPT09IG51bGwgfHwgb2JqID09PSB1bmRlZmluZWQpXG4gICAgcmV0dXJuIG9iajtcblxuICBpZiAodHlwZW9mIG9iaiA9PSBcInN0cmluZ1wiIHx8IHR5cGVvZiBvYmogPT0gXCJudW1iZXJcIiB8fCB0eXBlb2Ygb2JqID09IFwiYm9vbGVhblwiKVxuICAgIHJldHVybiBvYmo7XG5cbiAgLy8gSGFuZGxlIERhdGUgKHJldHVybiBuZXcgRGF0ZSBvYmplY3Qgd2l0aCBvbGQgdmFsdWUpXG4gIGlmIChvYmogaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgcmV0dXJuIG5ldyBEYXRlKG9iaik7XG4gIH1cblxuICBpZiAob2JqIGluc3RhbmNlb2YgU3RyaW5nIHx8IG9iaiBpbnN0YW5jZW9mIE51bWJlciB8fCBvYmogaW5zdGFuY2VvZiBCb29sZWFuKSB7XG4gICAgcmV0dXJuIG9iajtcbiAgfVxuXG4gIC8vIEhhbmRsZSBBcnJheSAocmV0dXJuIGEgZnVsbCBzbGljZSBvZiB0aGUgYXJyYXkpXG4gIGlmIChvYmogaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIGxldCBuZXdBcnJheSA9IG9iai5zbGljZSgpO1xuICAgIHJldHVybiBuZXdBcnJheS5tYXAoeCA9PiBjbG9uZU9iamVjdCh4LCBzdG9yZSkpO1xuICB9XG5cbiAgaWYgKG9iaiBpbnN0YW5jZW9mIFBvaW50ZXJMaWIuUG9pbnRlcikge1xuICAgIGxldCByZXN1bHQ6IGFueTtcbiAgICB0cnkge1xuICAgICAgcmVzdWx0ID0gY2xvbmVPYmplY3Qob2JqLmdldChzdG9yZSksIHN0b3JlKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiY2xvbmVPYmplY3Q6OkVycm9yXCIsIGUpO1xuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBpZiAob2JqIGluc3RhbmNlb2YgUmVnRXhwKSB7XG4gICAgcmV0dXJuIG9iajtcbiAgfVxuXG4gIC8vIEhhbmRsZSBPYmplY3RcbiAgaWYgKG9iaiBpbnN0YW5jZW9mIE9iamVjdCkge1xuICAgIGxldCBjb3B5ID0gbmV3IG9iai5jb25zdHJ1Y3RvcigpO1xuICAgIGZvciAobGV0IGF0dHIgaW4gb2JqKSB7XG4gICAgICBpZiAob2JqLmhhc093blByb3BlcnR5KGF0dHIpKSB7XG4gICAgICAgIGNvcHlbYXR0cl0gPSBjbG9uZU9iamVjdChvYmpbYXR0cl0sIHN0b3JlKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGNvcHk7XG4gIH1cblxuICB0aHJvdyBuZXcgRXJyb3IoXCJVbmFibGUgdG8gY29weSBvYmohIEl0cyB0eXBlIGlzbid0IHN1cHBvcnRlZC4gXCIgKyB1dGlsLmluc3BlY3Qob2JqKSk7XG59XG5cblxuZXhwb3J0IGZ1bmN0aW9uIG1hdGNoVXJsKHVybDogc3RyaW5nKSB7XG4gIC8vIHJlbW92ZSBoYXNoICYgcXVlcnlTdHJpbmdcbiAgdXJsID0gdXJsLnNwbGl0KC9bPyNdLylbMF07XG5cbiAgLy8gbm9ybWFsaXplIHVyaVBhcmFtZXRlcnMgdG8gP1xuICB1cmwgPSB1cmwucmVwbGFjZSgvXFx7KFthLXpBLVowLTlfXSspXFx9L2csIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gJz8nO1xuICB9IGFzIGFueSk7XG5cbiAgcmV0dXJuIHVybDtcbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gZmxhdFByb21pc2UoKSB7XG4gIGxldCByZXN1bHQgPSB7XG4gICAgcmVzb2x2ZXI6IG51bGwgYXMgKGE/OiBhbnkpID0+IGFueSxcbiAgICByZWplY3RlcjogbnVsbCBhcyAoYTogYW55KSA9PiBhbnksXG4gICAgcHJvbWlzZTogbnVsbCBhcyBQcm9taXNlPGFueT5cbiAgfTtcblxuICByZXN1bHQucHJvbWlzZSA9IG5ldyBQcm9taXNlKChhLCBiKSA9PiB7XG4gICAgcmVzdWx0LnJlc29sdmVyID0gYTtcbiAgICByZXN1bHQucmVqZWN0ZXIgPSBiO1xuICB9KTtcblxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5cbmV4cG9ydCBmdW5jdGlvbiBlcnJvckRpZmYobXNnLCBleHBlY3RlZCwgYWN0dWFsLCBjdHgpIHtcbiAgbGV0IGVyciA9IG5ldyBFcnJvcihtc2cpIGFzIGFueTtcbiAgaWYgKGN0eCkge1xuICAgIGVyci5tZXNzYWdlID0gbnVsbDtcbiAgICBlcnIuaW5zcGVjdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIGVyci5tZXNzYWdlID0gbXNnO1xuICAgICAgcmV0dXJuIG1zZyArIFwiXFxuXCIgKyBKU09OLnN0cmluZ2lmeShjdHgsIG51bGwsIDIpO1xuICAgIH07XG4gIH1cbiAgZXJyLmV4cGVjdGVkID0gZXhwZWN0ZWQ7XG4gIGVyci5hY3R1YWwgPSBhY3R1YWw7XG4gIGVyci5zaG93RGlmZiA9IHRydWU7XG4gIHJldHVybiBlcnI7XG59XG5cblxuZXhwb3J0IGZ1bmN0aW9uIGVycm9yKG1zZywgY3R4KSB7XG4gIGxldCBlcnIgPSBuZXcgRXJyb3IobXNnKSBhcyBhbnk7XG4gIGlmIChjdHgpIHtcbiAgICBlcnIubWVzc2FnZSA9IG51bGw7XG4gICAgZXJyLmluc3BlY3QgPSBmdW5jdGlvbiAoKSB7XG4gICAgICBlcnIubWVzc2FnZSA9IG1zZztcbiAgICAgIHJldHVybiBtc2cgKyBcIlxcblwiICsgSlNPTi5zdHJpbmdpZnkoY3R4LCBudWxsLCAyKTtcbiAgICB9O1xuICB9XG4gIHJldHVybiBlcnI7XG59XG5cblxuaWYgKCEoZXJyb3IoJ3Rlc3QnLCB7fSkgaW5zdGFuY2VvZiBFcnJvcikpIHByb2Nlc3MuZXhpdCgxKTtcbmlmICghKGVycm9yRGlmZigndGVzdCcsIDEsIDIsIHt9KSBpbnN0YW5jZW9mIEVycm9yKSkgcHJvY2Vzcy5leGl0KDEpO1xuXG5cbmZ1bmN0aW9uIGdlbmVyYXRlVGVzdEFzc2VydGlvbnModGVzdDogQVRMVGVzdCkge1xuICBpZiAodGVzdC5za2lwKSByZXR1cm47XG5cbiAgaWYgKHRlc3QucmVzcG9uc2UpIHtcbiAgICBpZiAodGVzdC5yZXNwb25zZS5zdGF0dXMpIHtcbiAgICAgIHRlc3QuYXNzZXJ0aW9ucy5wdXNoKFxuICAgICAgICBuZXcgQ29tbW9uQXNzZXJ0aW9ucy5TdGF0dXNDb2RlQXNzZXJ0aW9uKHRlc3QsIHRlc3QucmVzcG9uc2Uuc3RhdHVzKVxuICAgICAgKTtcbiAgICB9XG5cbiAgICBpZiAodGVzdC5yZXNwb25zZS5ib2R5KSB7XG4gICAgICBpZiAoJ2lzJyBpbiB0ZXN0LnJlc3BvbnNlLmJvZHkpIHtcbiAgICAgICAgdGVzdC5hc3NlcnRpb25zLnB1c2goXG4gICAgICAgICAgbmV3IENvbW1vbkFzc2VydGlvbnMuQm9keUVxdWFsc0Fzc2VydGlvbih0ZXN0LCB0ZXN0LnJlc3BvbnNlLmJvZHkuaXMpXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGlmICh0ZXN0LnJlc3BvbnNlLmJvZHkuc2NoZW1hKSB7XG4gICAgICAgIC8qbGV0IHYgPSB0aGF0Lm9idGFpblNjaGVtYVZhbGlkYXRvcih0ZXN0LnJlc3BvbnNlLmJvZHkuc2NoZW1hKTtcblxuICAgICAgICB0aGF0LmRlZmVyZWRJdChcInJlc3BvbnNlLmJvZHkgc2NoZW1hXCIsIHRlc3QudGltZW91dCkudGhlbihyZXNvbHZlciA9PiB7XG4gICAgICAgICAgbGV0IHZhbGlkYXRpb25SZXN1bHQgPSB2KHJlcXVlc3RIb2xkZXIucmVzLmJvZHkpO1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZiAodmFsaWRhdGlvblJlc3VsdC52YWxpZCkge1xuICAgICAgICAgICAgICByZXNvbHZlcigpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgbGV0IGVycm9ycyA9IFtcIlNjaGVtYSBlcnJvcjpcIl07XG4gICAgICAgICAgICAgIHZhbGlkYXRpb25SZXN1bHQuZXJyb3JzICYmIHZhbGlkYXRpb25SZXN1bHQuZXJyb3JzLmZvckVhY2goeCA9PiBlcnJvcnMucHVzaChcIiAgXCIgKyB4LnN0YWNrKSk7XG5cbiAgICAgICAgICAgICAgcmVzb2x2ZXIoQVRMSGVscGVycy5lcnJvcihlcnJvcnMuam9pbignXFxuJykgfHwgXCJJbnZhbGlkIHNjaGVtYVwiLCByZXF1ZXN0SG9sZGVyLmN0eCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHJlc29sdmVyKGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7Ki9cbiAgICAgIH1cblxuICAgICAgaWYgKHRlc3QucmVzcG9uc2UuYm9keS5tYXRjaGVzKSB7XG4gICAgICAgIHRlc3QucmVzcG9uc2UuYm9keS5tYXRjaGVzLmZvckVhY2goa3ZvID0+IHtcbiAgICAgICAgICB0ZXN0LmFzc2VydGlvbnMucHVzaChcbiAgICAgICAgICAgIG5ldyBDb21tb25Bc3NlcnRpb25zLkJvZHlNYXRjaGVzQXNzZXJ0aW9uKHRlc3QsIGt2by5rZXksIGt2by52YWx1ZSlcbiAgICAgICAgICApO1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRlc3QucmVzcG9uc2UuaGVhZGVycykge1xuICAgICAgICBmb3IgKGxldCBoIGluIHRlc3QucmVzcG9uc2UuaGVhZGVycykge1xuICAgICAgICAgIHRlc3QuYXNzZXJ0aW9ucy5wdXNoKFxuICAgICAgICAgICAgbmV3IENvbW1vbkFzc2VydGlvbnMuSGVhZGVyTWF0Y2hlc0Fzc2VydGlvbih0ZXN0LCBoLCB0ZXN0LnJlc3BvbnNlLmhlYWRlcnNbaF0pXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAodGVzdC5yZXNwb25zZS5ib2R5LnRha2UpIHtcbiAgICAgICAgbGV0IHRha2UgPSB0ZXN0LnJlc3BvbnNlLmJvZHkudGFrZTtcblxuICAgICAgICB0YWtlLmZvckVhY2goZnVuY3Rpb24gKHRha2VuRWxlbWVudCkge1xuICAgICAgICAgIHRlc3QuYXNzZXJ0aW9ucy5wdXNoKFxuICAgICAgICAgICAgbmV3IENvbW1vbkFzc2VydGlvbnMuQ29weUJvZHlWYWx1ZU9wZXJhdGlvbih0ZXN0LCB0YWtlbkVsZW1lbnQua2V5LCB0YWtlbkVsZW1lbnQudmFsdWUpXG4gICAgICAgICAgKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIGlmICh0ZXN0LnJlc3BvbnNlLmJvZHkuY29weVRvICYmIHRlc3QucmVzcG9uc2UuYm9keS5jb3B5VG8gaW5zdGFuY2VvZiBwb2ludGVyTGliLlBvaW50ZXIpIHtcbiAgICAgICAgdGVzdC5hc3NlcnRpb25zLnB1c2goXG4gICAgICAgICAgbmV3IENvbW1vbkFzc2VydGlvbnMuQ29weUJvZHlWYWx1ZU9wZXJhdGlvbih0ZXN0LCAnKicsIHRlc3QucmVzcG9uc2UuYm9keS5jb3B5VG8pXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9XG59Il19