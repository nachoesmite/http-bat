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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQVRMSGVscGVycy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIkFUTEhlbHBlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUNBLElBQU8sSUFBSSxXQUFXLE1BQU0sQ0FBQyxDQUFDO0FBRTlCLElBQU8sT0FBTyxXQUFXLFNBQVMsQ0FBQyxDQUFDO0FBRXBDLElBQU8sVUFBVSxXQUFXLFdBQVcsQ0FBQyxDQUFDO0FBRXpDLDZCQUFpRSxnQkFBZ0IsQ0FBQyxDQUFBO0FBQ2xGLDJCQUEyQixjQUFjLENBQUMsQ0FBQTtBQUM3QixrQkFBVSxHQUFHLFVBQVUsQ0FBQztBQU1yQyxJQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUV0QyxPQUFPO0FBRVA7SUFDRSxrQkFBbUIsSUFBWTtRQUFaLFNBQUksR0FBSixJQUFJLENBQVE7UUFHL0IsV0FBTSxHQUEwQixJQUFJLENBQUM7UUFDckMsVUFBSyxHQUFZLEtBQUssQ0FBQztRQUN2QixlQUFVLEdBQVEsSUFBSSxDQUFDO1FBQ3ZCLFNBQUksR0FBWSxJQUFJLENBQUM7UUFDckIsU0FBSSxHQUFZLEtBQUssQ0FBQztJQUx0QixDQUFDO0lBT0gsZUFBQztBQUFELENBQUMsQUFWRCxJQVVDO0FBVlksZ0JBQVEsV0FVcEIsQ0FBQTtBQTJCRDtJQUFBO1FBQUEsaUJBNkRDO1FBbERDLFlBQU8sR0FBRyxJQUFJLENBQUM7UUFFZixhQUFRLEdBQWdCLEVBQUUsQ0FBQztRQUMzQixZQUFPLEdBQWdCLEVBQUUsQ0FBQztRQUUxQixjQUFTLEdBQWUsRUFBRSxDQUFDO1FBRTNCLFNBQUksR0FBWSxLQUFLLENBQUM7UUFPdEIsWUFBTyxHQUFpQixJQUFJLE9BQU8sQ0FBQyxVQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3ZDLEtBQUksQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDO1lBQ2xCLEtBQUksQ0FBQyxPQUFPLEdBQUcsQ0FBQyxDQUFDO1FBQ25CLENB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dCBtZXRob2RzID0gcmVxdWlyZSgnbWV0aG9kcycpO1xuaW1wb3J0IHsgQVRMIH0gZnJvbSAnLi9BVEwnO1xuaW1wb3J0IFBvaW50ZXJMaWIgPSByZXF1aXJlKCcuL1BvaW50ZXInKTtcblxuaW1wb3J0IHsgQVRMRXJyb3IsIEFUTFJlc3BvbnNlQXNzZXJ0aW9uLCBDb21tb25Bc3NlcnRpb25zIH0gZnJvbSAnLi9BVExBc3NlcnRpb24nO1xuaW1wb3J0IHsgQVRMUmVxdWVzdCB9IGZyb20gJy4vQVRMUmVxdWVzdCc7XG5leHBvcnQgY29uc3QgcG9pbnRlckxpYiA9IFBvaW50ZXJMaWI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURpY3Rpb25hcnk8VD4ge1xuICBba2V5OiBzdHJpbmddOiBUO1xufVxuXG5jb25zdCBsb2cgPSBjb25zb2xlLmxvZy5iaW5kKGNvbnNvbGUpO1xuXG4vLy8gLS0tXG5cbmV4cG9ydCBjbGFzcyBBVExTdWl0ZSB7XG4gIGNvbnN0cnVjdG9yKHB1YmxpYyBuYW1lOiBzdHJpbmcpIHtcblxuICB9XG4gIHN1aXRlczogSURpY3Rpb25hcnk8QVRMU3VpdGU+ID0gbnVsbDtcbiAgYXN5bmM6IGJvb2xlYW4gPSBmYWxzZTtcbiAgZGVzY3JpcHRvcjogYW55ID0gbnVsbDtcbiAgdGVzdDogQVRMVGVzdCA9IG51bGw7XG4gIHNraXA6IGJvb2xlYW4gPSBmYWxzZTtcbiAgQVRMOiBBVEw7XG59XG5cbi8vLyAtLS1cblxuZXhwb3J0IGludGVyZmFjZSBJQVRMVGVzdFJlcyB7XG4gIHN0YXR1cz86IG51bWJlcjtcbiAgYm9keT86IHtcbiAgICBpcz86IGFueTtcbiAgICBtYXRjaGVzPzogS2V5VmFsdWVPYmplY3Q8S2V5VmFsdWVPYmplY3Q8YW55Pj5bXTtcbiAgICB0YWtlPzogS2V5VmFsdWVPYmplY3Q8UG9pbnRlckxpYi5Qb2ludGVyPltdO1xuICAgIGNvcHlUbz86IFBvaW50ZXJMaWIuUG9pbnRlcjtcbiAgICBzY2hlbWE/OiBhbnk7XG4gICAgcHJpbnQ/OiBib29sZWFuO1xuICB9O1xuICBoZWFkZXJzPzogSURpY3Rpb25hcnk8c3RyaW5nPjtcbiAgcHJpbnQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBVExUZXN0UmVxIHtcbiAgYXR0YWNoPzogS2V5VmFsdWVPYmplY3Q8c3RyaW5nPltdO1xuICBmb3JtPzogS2V5VmFsdWVPYmplY3Q8YW55PltdO1xuICBqc29uPzogYW55O1xuICB1cmxlbmNvZGVkPzogS2V5VmFsdWVPYmplY3Q8YW55PltdO1xuICBxdWVyeVBhcmFtZXRlcnM/OiBJRGljdGlvbmFyeTxhbnk+O1xuICBoZWFkZXJzPzogSURpY3Rpb25hcnk8YW55Pjtcbn1cblxuZXhwb3J0IGNsYXNzIEFUTFRlc3Qge1xuICBzdWl0ZTogQVRMU3VpdGU7XG5cbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgdGVzdElkOiBzdHJpbmc7XG5cbiAgbWV0aG9kOiBzdHJpbmc7XG5cbiAgdXJpOiBzdHJpbmc7XG4gIHVyaVBhcmFtZXRlcnM6IElEaWN0aW9uYXJ5PGFueT47XG5cbiAgdGltZW91dCA9IDMwMDA7XG5cbiAgcmVzcG9uc2U6IElBVExUZXN0UmVzID0ge307XG4gIHJlcXVlc3Q6IElBVExUZXN0UmVxID0ge307XG5cbiAgZGVwZW5kc09uOiBBVExTdWl0ZVtdID0gW107XG5cbiAgc2tpcDogYm9vbGVhbiA9IGZhbHNlO1xuXG4gIHJlc3VsdDogYW55O1xuXG4gIHByaXZhdGUgX3Jlc29sdmU6IChlcnJvcj8pID0+IHZvaWQ7XG4gIHByaXZhdGUgX3JlamVjdDogKGVycm9yPykgPT4gdm9pZDtcblxuICBwcm9taXNlOiBQcm9taXNlPGFueT4gPSBuZXcgUHJvbWlzZSgoYSwgYikgPT4ge1xuICAgIHRoaXMuX3Jlc29sdmUgPSBhO1xuICAgIHRoaXMuX3JlamVjdCA9IGI7XG4gIH0pO1xuXG4gIHJlcXVlc3RlcjogQVRMUmVxdWVzdCA9IG5ldyBBVExSZXF1ZXN0KHRoaXMpO1xuICBhc3NlcnRpb25zOiBBVExSZXNwb25zZUFzc2VydGlvbltdID0gW107XG5cbiAgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXG4gICAgbGV0IGRlcGVuZGVuY2llcyA9IHRoaXMuZGVwZW5kc09uLmxlbmd0aCA/IFByb21pc2UuYWxsKHRoaXMuZGVwZW5kc09uLm1hcCh4ID0+IHgudGVzdC5wcm9taXNlKSkgOiBQcm9taXNlLnJlc29sdmUoKTtcblxuICAgIGRlcGVuZGVuY2llc1xuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5yZXF1ZXN0ZXIucnVuKCkpXG4gICAgICAuY2F0Y2goKCkgPT4ge1xuICAgICAgICB0aGlzLnJlcXVlc3Rlci5kZXBlbmRlbmN5RmFpbGVkKCk7XG4gICAgICB9KTtcblxuICAgIGxldCBhc3NlcnRpb25SZXN1bHRzID0gUHJvbWlzZS5hbGwodGhpcy5hc3NlcnRpb25zLm1hcCh4ID0+IHgucHJvbWlzZSkpO1xuXG4gICAgYXNzZXJ0aW9uUmVzdWx0c1xuICAgICAgLnRoZW4oYXNzZXJ0aW9uUmVzdWx0cyA9PiB7XG4gICAgICAgIGxldCBlcnJvcnMgPSBhc3NlcnRpb25SZXN1bHRzLmZpbHRlcih4ID0+ICEheCk7XG5cbiAgICAgICAgaWYgKGVycm9ycy5sZW5ndGgpIHtcbiAgICAgICAgICB0aGlzLl9yZWplY3QoZXJyb3JzKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLl9yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3JzID0+IHtcbiAgICAgICAgdGhpcy5fcmVqZWN0KGVycm9ycyk7XG4gICAgICB9KTtcblxuICAgIHJldHVybiB0aGlzLnByb21pc2U7XG4gIH1cbn1cblxuLy8vIC0tLVxuXG5leHBvcnQgY2xhc3MgS2V5VmFsdWVPYmplY3Q8VD4ge1xuICBjb25zdHJ1Y3RvcihwdWJsaWMga2V5OiBzdHJpbmcsIHB1YmxpYyB2YWx1ZTogVCkge1xuXG4gIH1cbn1cblxuLy8vIC0tLVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VTdWl0ZXMob2JqZWN0LCBpbnN0YW5jZTogQVRMKTogQVRMU3VpdGUge1xuXG4gIGxldCBzdWl0ZSA9IG5ldyBBVExTdWl0ZShcIlwiKTtcblxuICBzdWl0ZS5BVEwgPSBpbnN0YW5jZTtcblxuICBsZXQgcmV0OiBJRGljdGlvbmFyeTxBVExTdWl0ZT4gPSBzdWl0ZS5zdWl0ZXMgPSB7fTtcblxuICBsZXQgcHJldlN1aXRlID0gbnVsbDtcblxuICBmb3IgKGxldCB0IGluIG9iamVjdCkge1xuICAgIHN3aXRjaCAodCkge1xuICAgICAgY2FzZSAnc2tpcCc6XG4gICAgICAgIGVuc3VyZUluc3RhbmNlT2YoXCJza2lwXCIsIG9iamVjdC5za2lwLCBOdW1iZXIsIEJvb2xlYW4pO1xuICAgICAgICBzdWl0ZS5za2lwID0gISFvYmplY3Quc2tpcDtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGxldCBtZXRob2QgPSBwYXJzZU1ldGhvZEhlYWRlcih0KTtcblxuICAgICAgICBpZiAobWV0aG9kKSB7XG4gICAgICAgICAgbGV0IG1ldGhvZEJvZHkgPSBvYmplY3RbdF07XG4gICAgICAgICAgbGV0IHN1YlN1aXRlID0gbmV3IEFUTFN1aXRlKG1ldGhvZEJvZHkuZGVzY3JpcHRpb24gfHwgKG1ldGhvZC5tZXRob2QudG9VcHBlckNhc2UoKSArICcgJyArIG1ldGhvZC51cmwpKTtcblxuICAgICAgICAgIHN1YlN1aXRlLmRlc2NyaXB0b3IgPSBtZXRob2RCb2R5O1xuXG4gICAgICAgICAgbGV0IHdhcm4gPSBmdW5jdGlvbiAobXNnKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJXYXJuaW5nOlxcblxcdFwiICsgc3ViU3VpdGUubmFtZSArIFwiXFxuXFx0XFx0XCIgKyBtc2cpO1xuICAgICAgICAgIH07XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgc3ViU3VpdGUudGVzdCA9IHBhcnNlVGVzdChzdWJTdWl0ZS5kZXNjcmlwdG9yLCB3YXJuLCBzdWl0ZSk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKChtZXRob2QubWV0aG9kLnRvVXBwZXJDYXNlKCkgKyAnICcgKyBtZXRob2QudXJsKSArIFwiLCBcIiArIGUpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHN1YlN1aXRlLnRlc3QubWV0aG9kID0gbWV0aG9kLm1ldGhvZDtcbiAgICAgICAgICBzdWJTdWl0ZS50ZXN0LnVyaSA9IG1ldGhvZC51cmw7XG5cbiAgICAgICAgICBpZiAocHJldlN1aXRlKVxuICAgICAgICAgICAgc3ViU3VpdGUudGVzdC5kZXBlbmRzT24ucHVzaChwcmV2U3VpdGUpO1xuXG4gICAgICAgICAgcHJldlN1aXRlID0gc3ViU3VpdGU7XG5cbiAgICAgICAgICByZXRbc3ViU3VpdGUubmFtZV0gPSBzdWJTdWl0ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBzdWl0ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlVGVzdChib2R5LCB3YXJuOiAod2FybikgPT4gdm9pZCwgc3VpdGU6IEFUTFN1aXRlKTogQVRMVGVzdCB7XG4gIGxldCB0ZXN0ID0gbmV3IEFUTFRlc3Q7XG4gIHRlc3Quc3VpdGUgPSBzdWl0ZTtcblxuICAvLyBwYXJzZSB1cmlQYXJhbWV0ZXJzXG4gIGlmICgndXJpUGFyYW1ldGVycycgaW4gYm9keSkge1xuICAgIGlmICghYm9keS51cmlQYXJhbWV0ZXJzIHx8IHR5cGVvZiBib2R5LnVyaVBhcmFtZXRlcnMgIT0gXCJvYmplY3RcIiB8fCBib2R5LnVyaVBhcmFtZXRlcnMgaW5zdGFuY2VvZiBBcnJheSlcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJ1cmlQYXJhbWV0ZXJzIG11c3QgYmUgYW4gb2JqZWN0XCIpO1xuXG4gICAgdGVzdC51cmlQYXJhbWV0ZXJzID0ge307XG5cbiAgICBsZXQga2V5cyA9IE9iamVjdC5rZXlzKGJvZHkudXJpUGFyYW1ldGVycyk7XG5cbiAgICBrZXlzLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGxldCB2YWwgPSBib2R5LnVyaVBhcmFtZXRlcnNba2V5XTtcbiAgICAgIGVuc3VyZUluc3RhbmNlT2YoXCJxdWVyeVBhcmFtZXRlcnMuXCIgKyBrZXksIHZhbCwgTnVtYmVyLCBTdHJpbmcsIFBvaW50ZXJMaWIuUG9pbnRlcik7XG4gICAgICB0ZXN0LnVyaVBhcmFtZXRlcnNba2V5XSA9IHZhbDtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIHBhcnNlIG1ldGhvZCBkZXNjcmlwdGlvblxuICBpZiAoJ2Rlc2NyaXB0aW9uJyBpbiBib2R5KSB7XG4gICAgZW5zdXJlSW5zdGFuY2VPZihcImRlc2NyaXB0aW9uXCIsIGJvZHkuZGVzY3JpcHRpb24sIFN0cmluZyk7XG5cbiAgICBpZiAoYm9keS5kZXNjcmlwdGlvbi50cmltKCkubGVuZ3RoID4gMCkge1xuICAgICAgdGVzdC5kZXNjcmlwdGlvbiA9IGJvZHkuZGVzY3JpcHRpb247XG4gICAgfVxuICB9XG5cbiAgLy8gcGFyc2UgbWV0aG9kIGlkXG4gIGlmICgnaWQnIGluIGJvZHkpIHtcbiAgICBlbnN1cmVJbnN0YW5jZU9mKFwiaWRcIiwgYm9keS5pZCwgTnVtYmVyLCBTdHJpbmcpO1xuXG4gICAgdGVzdC50ZXN0SWQgPSBib2R5LmlkLnRvU3RyaW5nKCk7XG4gIH1cblxuICAvLyBwYXJzZSB0aW1lb3V0XG4gIGlmICgndGltZW91dCcgaW4gYm9keSkge1xuICAgIGVuc3VyZUluc3RhbmNlT2YoXCJ0aW1lb3V0XCIsIGJvZHkudGltZW91dCwgTnVtYmVyKTtcblxuICAgIGlmIChib2R5LnRpbWVvdXQgPD0gMClcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJ0aW1lb3V0IG11c3QgYmUgYSBudW1iZXIgPiAwXCIpO1xuXG4gICAgdGVzdC50aW1lb3V0ID0gYm9keS50aW1lb3V0O1xuICB9XG5cblxuICAvLyBwYXJzZSBxdWVyeVBhcmFtZXRlcnNcbiAgaWYgKCdxdWVyeVBhcmFtZXRlcnMnIGluIGJvZHkpIHtcbiAgICBpZiAoIWJvZHkucXVlcnlQYXJhbWV0ZXJzIHx8IHR5cGVvZiBib2R5LnF1ZXJ5UGFyYW1ldGVycyAhPSBcIm9iamVjdFwiIHx8IGJvZHkucXVlcnlQYXJhbWV0ZXJzIGluc3RhbmNlb2YgQXJyYXkpXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwicXVlcnlQYXJhbWV0ZXJzIG11c3QgYmUgYW4gb2JqZWN0XCIpO1xuXG4gICAgdGVzdC5yZXF1ZXN0LnF1ZXJ5UGFyYW1ldGVycyA9IHRlc3QucmVxdWVzdC5xdWVyeVBhcmFtZXRlcnMgfHwge307XG5cbiAgICBsZXQga2V5cyA9IE9iamVjdC5rZXlzKGJvZHkucXVlcnlQYXJhbWV0ZXJzKTtcblxuICAgIGtleXMuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgbGV0IHZhbCA9IGJvZHkucXVlcnlQYXJhbWV0ZXJzW2tleV07XG4gICAgICBlbnN1cmVJbnN0YW5jZU9mKFwicXVlcnlQYXJhbWV0ZXJzLlwiICsga2V5LCB2YWwsIE51bWJlciwgU3RyaW5nLCBCb29sZWFuLCBQb2ludGVyTGliLlBvaW50ZXIpO1xuICAgICAgdGVzdC5yZXF1ZXN0LnF1ZXJ5UGFyYW1ldGVyc1trZXldID0gdmFsO1xuICAgIH0pO1xuICB9XG5cbiAgdGVzdC5yZXF1ZXN0LmhlYWRlcnMgPSB0ZXN0LnJlcXVlc3QuaGVhZGVycyB8fCB7fTtcblxuICAvLyBwYXJzZSBoZWFkZXJzXG4gIGlmICgnaGVhZGVycycgaW4gYm9keSkge1xuICAgIGlmICghYm9keS5oZWFkZXJzIHx8IHR5cGVvZiBib2R5LmhlYWRlcnMgIT0gXCJvYmplY3RcIiB8fCBib2R5LmhlYWRlcnMgaW5zdGFuY2VvZiBBcnJheSlcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJoZWFkZXJzIG11c3QgYmUgYW4gb2JqZWN0XCIpO1xuXG4gICAgdGVzdC5yZXF1ZXN0LmhlYWRlcnMgPSB0ZXN0LnJlcXVlc3QuaGVhZGVycyB8fCB7fTtcblxuICAgIGxldCBrZXlzID0gT2JqZWN0LmtleXMoYm9keS5oZWFkZXJzKTtcblxuICAgIGtleXMuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgbGV0IHZhbCA9IGJvZHkuaGVhZGVyc1trZXldO1xuICAgICAgZW5zdXJlSW5zdGFuY2VPZihcImhlYWRlcnMuXCIgKyBrZXksIHZhbCwgU3RyaW5nLCBQb2ludGVyTGliLlBvaW50ZXIpO1xuICAgICAgdGVzdC5yZXF1ZXN0LmhlYWRlcnNba2V5LnRvTG93ZXJDYXNlKCldID0gdmFsO1xuICAgIH0pO1xuICB9XG5cbiAgaWYgKCdyZXF1ZXN0JyBpbiBib2R5KSB7XG4gICAgcGFyc2VSZXF1ZXN0KHRlc3QsIGJvZHkucmVxdWVzdCwgd2Fybik7XG4gIH1cblxuICBpZiAoJ3NraXAnIGluIGJvZHkpIHtcbiAgICBlbnN1cmVJbnN0YW5jZU9mKFwic2tpcFwiLCBib2R5LnNraXAsIE51bWJlciwgQm9vbGVhbik7XG4gICAgdGVzdC5za2lwID0gISFib2R5LnNraXA7XG4gIH1cblxuICBpZiAoJ3Jlc3BvbnNlJyBpbiBib2R5KSB7XG4gICAgcGFyc2VSZXNwb25zZSh0ZXN0LCBib2R5LnJlc3BvbnNlLCB3YXJuKTtcbiAgfSBlbHNlIHtcbiAgICB0ZXN0LnJlc3BvbnNlLnN0YXR1cyA9IDIwMDtcbiAgfVxuXG4gIGdlbmVyYXRlVGVzdEFzc2VydGlvbnModGVzdCk7XG5cbiAgcmV0dXJuIHRlc3Q7XG59XG5cbmZ1bmN0aW9uIHBhcnNlUmVxdWVzdCh0ZXN0OiBBVExUZXN0LCByZXF1ZXN0LCB3YXJuKSB7XG4gIGVuc3VyZUluc3RhbmNlT2YoXCJib2R5LnJlcXVlc3RcIiwgcmVxdWVzdCwgT2JqZWN0KTtcbiAgT2JqZWN0LmtleXMocmVxdWVzdCkuZm9yRWFjaChib2R5S2V5ID0+IHtcbiAgICBsZXQgdmFsdWUgPSByZXF1ZXN0W2JvZHlLZXldO1xuICAgIHN3aXRjaCAoYm9keUtleSkge1xuICAgICAgY2FzZSAnY29udGVudC10eXBlJzogLy8gIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjXG4gICAgICAgIGVuc3VyZUluc3RhbmNlT2YoXCJyZXF1ZXN0LmNvbnRlbnQtdHlwZVwiLCB2YWx1ZSwgU3RyaW5nLCBQb2ludGVyTGliLlBvaW50ZXIpO1xuXG4gICAgICAgIHRlc3QucmVxdWVzdC5oZWFkZXJzID0gdGVzdC5yZXF1ZXN0LmhlYWRlcnMgfHwge307XG4gICAgICAgIHRlc3QucmVxdWVzdC5oZWFkZXJzWydjb250ZW50LXR5cGUnXSA9IHZhbHVlO1xuXG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnanNvbic6IC8vICMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjXG4gICAgICAgIHRlc3QucmVxdWVzdC5qc29uID0gdmFsdWU7XG5cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdhdHRhY2gnOiAvLyAjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcbiAgICAgICAgZW5zdXJlSW5zdGFuY2VPZihcInJlcXVlc3QuYXR0YWNoXCIsIHZhbHVlLCBBcnJheSk7XG5cbiAgICAgICAgdGVzdC5yZXF1ZXN0LmF0dGFjaCA9IFtdO1xuICAgICAgICBmb3IgKGxldCBpIGluIHZhbHVlKSB7XG4gICAgICAgICAgbGV0IGN1cnJlbnRBdHRhY2htZW50ID0gdmFsdWVbaV07XG4gICAgICAgICAgZm9yIChsZXQga2V5IGluIGN1cnJlbnRBdHRhY2htZW50KSB7XG4gICAgICAgICAgICB0ZXN0LnJlcXVlc3QuYXR0YWNoLnB1c2gobmV3IEtleVZhbHVlT2JqZWN0KGtleSwgY3VycmVudEF0dGFjaG1lbnRba2V5XSkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdmb3JtJzogLy8gIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcbiAgICAgICAgaWYgKCEoJ2NvbnRlbnQtdHlwZScgaW4gdGVzdC5yZXF1ZXN0LmhlYWRlcnMpKVxuICAgICAgICAgIHRlc3QucmVxdWVzdC5oZWFkZXJzWydjb250ZW50LXR5cGUnXSA9IFwibXVsdGlwYXJ0L2Zvcm0tZGF0YVwiO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcInlvdSBDQU4nVCB1c2UgY29udGVudC10eXBlIEFORCBmb3JtIGZpZWxkc1wiKTtcblxuICAgICAgICBlbnN1cmVJbnN0YW5jZU9mKFwicmVxdWVzdC5mb3JtXCIsIHZhbHVlLCBBcnJheSk7XG5cbiAgICAgICAgdGVzdC5yZXF1ZXN0LmZvcm0gPSBbXTtcbiAgICAgICAgZm9yIChsZXQgaSBpbiB2YWx1ZSkge1xuICAgICAgICAgIGxldCBjdXJyZW50QXR0YWNobWVudCA9IHZhbHVlW2ldO1xuICAgICAgICAgIGZvciAobGV0IGtleSBpbiBjdXJyZW50QXR0YWNobWVudCkge1xuICAgICAgICAgICAgdGVzdC5yZXF1ZXN0LmZvcm0ucHVzaChuZXcgS2V5VmFsdWVPYmplY3Qoa2V5LCBjdXJyZW50QXR0YWNobWVudFtrZXldKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ3VybGVuY29kZWQnOiAvLyAjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI1xuICAgICAgICBpZiAoISgnY29udGVudC10eXBlJyBpbiB0ZXN0LnJlcXVlc3QuaGVhZGVycykpXG4gICAgICAgICAgdGVzdC5yZXF1ZXN0LmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID0gXCJhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWRcIjtcbiAgICAgICAgZWxzZVxuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJ5b3UgQ0FOJ1QgdXNlIGNvbnRlbnQtdHlwZSBBTkQgdXJsZW5jb2RlZCBmb3JtXCIpO1xuXG4gICAgICAgIGVuc3VyZUluc3RhbmNlT2YoXCJyZXF1ZXN0LnVybGVuY29kZWRcIiwgdmFsdWUsIEFycmF5KTtcblxuICAgICAgICB0ZXN0LnJlcXVlc3QudXJsZW5jb2RlZCA9IHZhbHVlO1xuXG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgd2FybihcIlVua25vd24gaWRlbnRpZmllciByZXF1ZXN0LlwiICsgYm9keUtleSk7XG4gICAgfVxuICB9KTtcbn1cblxuZnVuY3Rpb24gcGFyc2VSZXNwb25zZSh0ZXN0OiBBVExUZXN0LCByZXNwb25zZSwgd2Fybikge1xuICBlbnN1cmVJbnN0YW5jZU9mKFwicmVzcG9uc2VcIiwgcmVzcG9uc2UsIE9iamVjdCk7XG4gIE9iamVjdC5rZXlzKHJlc3BvbnNlKS5mb3JFYWNoKGJvZHlLZXkgPT4ge1xuICAgIGxldCB2YWx1ZSA9IHJlc3BvbnNlW2JvZHlLZXldO1xuICAgIHN3aXRjaCAoYm9keUtleSkge1xuICAgICAgY2FzZSAnaGVhZGVycyc6IC8vICMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjXG4gICAgICAgIGVuc3VyZUluc3RhbmNlT2YoXCJyZXNwb25zZS5oZWFkZXJzXCIsIHZhbHVlLCBPYmplY3QpO1xuXG4gICAgICAgIHRlc3QucmVzcG9uc2UuaGVhZGVycyA9IHt9O1xuXG4gICAgICAgIGxldCBrZXlzID0gT2JqZWN0LmtleXModmFsdWUpO1xuXG4gICAgICAgIGtleXMuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgIGxldCB2YWwgPSB2YWx1ZVtrZXldO1xuICAgICAgICAgIGVuc3VyZUluc3RhbmNlT2YoXCJyZXNwb25zZS5oZWFkZXJzLlwiICsga2V5LCB2YWwsIFN0cmluZywgUG9pbnRlckxpYi5Qb2ludGVyKTtcbiAgICAgICAgICB0ZXN0LnJlc3BvbnNlLmhlYWRlcnNba2V5LnRvTG93ZXJDYXNlKCldID0gdmFsO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoa2V5cy5sZW5ndGggPT0gMCkge1xuICAgICAgICAgIHdhcm4oXCJyZXNwb25zZS5oZWFkZXJzOiBlbXB0eSBwYXJhbWV0ZXJzXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdjb250ZW50VHlwZSc6IC8vICMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcbiAgICAgIGNhc2UgJ2NvbnRlbnQtdHlwZSc6XG4gICAgICAgIGVuc3VyZUluc3RhbmNlT2YoXCJyZXNwb25zZS5jb250ZW50LXR5cGVcIiwgdmFsdWUsIFN0cmluZywgUG9pbnRlckxpYi5Qb2ludGVyKTtcblxuICAgICAgICB0ZXN0LnJlc3BvbnNlLmhlYWRlcnMgPSB0ZXN0LnJlc3BvbnNlLmhlYWRlcnMgfHwge307XG5cbiAgICAgICAgaWYgKCdjb250ZW50LXR5cGUnIGluIHRlc3QucmVzcG9uc2UuaGVhZGVycylcbiAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwicmVzcG9uc2UuY29udGVudC10eXBlIGFscmVkeSByZWdpc3RlcmVkIGFzIHJlcXVlc3QuaGVhZGVyLmNvbnRlbnQtdHlwZSBZb3UgY2FuIG5vdCB1c2UgQk9USFwiKTtcblxuICAgICAgICB0ZXN0LnJlc3BvbnNlLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID0gdmFsdWU7XG5cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdzdGF0dXMnOiAvLyAjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcbiAgICAgICAgZW5zdXJlSW5zdGFuY2VPZihcInJlc3BvbnNlLnN0YXR1c1wiLCB2YWx1ZSwgTnVtYmVyKTtcblxuICAgICAgICB0ZXN0LnJlc3BvbnNlLnN0YXR1cyA9IHZhbHVlIHwgMDtcblxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ3ByaW50JzogLy8gIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI1xuICAgICAgICBlbnN1cmVJbnN0YW5jZU9mKFwicmVzcG9uc2UucHJpbnRcIiwgdmFsdWUsIEJvb2xlYW4pO1xuXG4gICAgICAgIHRlc3QucmVzcG9uc2UucHJpbnQgPSB2YWx1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdib2R5JzpcbiAgICAgICAgcGFyc2VSZXNwb25zZUJvZHkodGVzdCwgdmFsdWUsIHdhcm4pO1xuXG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgd2FybihcIlVua25vd24gaWRlbnRpZmllciByZXNwb25zZS5cIiArIGJvZHlLZXkpO1xuICAgIH1cbiAgfSk7XG59XG5cblxuZnVuY3Rpb24gcGFyc2VSZXNwb25zZUJvZHkodGVzdDogQVRMVGVzdCwgcmVzcG9uc2VCb2R5LCB3YXJuKSB7XG4gIGVuc3VyZUluc3RhbmNlT2YoXCJyZXNwb25zZS5ib2R5XCIsIHJlc3BvbnNlQm9keSwgT2JqZWN0KTtcblxuICB0ZXN0LnJlc3BvbnNlLmJvZHkgPSB7fTtcblxuICBPYmplY3Qua2V5cyhyZXNwb25zZUJvZHkpLmZvckVhY2goYm9keUtleSA9PiB7XG4gICAgbGV0IHZhbHVlID0gcmVzcG9uc2VCb2R5W2JvZHlLZXldO1xuICAgIHN3aXRjaCAoYm9keUtleSkge1xuICAgICAgY2FzZSAnaXMnOiAvLyAjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI1xuICAgICAgICB0ZXN0LnJlc3BvbnNlLmJvZHkuaXMgPSB2YWx1ZTtcblxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ21hdGNoZXMnOiAvLyAjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjXG4gICAgICAgIGVuc3VyZUluc3RhbmNlT2YoXCJyZXNwb25zZS5ib2R5Lm1hdGNoZXNcIiwgdmFsdWUsIEFycmF5KTtcblxuICAgICAgICB0ZXN0LnJlc3BvbnNlLmJvZHkubWF0Y2hlcyA9IFtdO1xuXG4gICAgICAgIGZvciAobGV0IGkgaW4gdmFsdWUpIHtcbiAgICAgICAgICBsZXQga3YgPSB2YWx1ZVtpXTtcbiAgICAgICAgICBmb3IgKGxldCBpIGluIGt2KSB7XG4gICAgICAgICAgICB0ZXN0LnJlc3BvbnNlLmJvZHkubWF0Y2hlcy5wdXNoKG5ldyBLZXlWYWx1ZU9iamVjdChpLCBrdltpXSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnc2NoZW1hJzogLy8gIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcbiAgICAgICAgZW5zdXJlSW5zdGFuY2VPZihcInJlc3BvbnNlLmJvZHkuc2NoZW1hXCIsIHZhbHVlLCBTdHJpbmcsIE9iamVjdCk7XG5cbiAgICAgICAgdGVzdC5yZXNwb25zZS5ib2R5LnNjaGVtYSA9IHZhbHVlO1xuXG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAndGFrZSc6IC8vICMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI1xuICAgICAgICBlbnN1cmVJbnN0YW5jZU9mKFwicmVzcG9uc2UuYm9keS50YWtlXCIsIHZhbHVlLCBBcnJheSwgUG9pbnRlckxpYi5Qb2ludGVyKTtcblxuICAgICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICAgIHRlc3QucmVzcG9uc2UuYm9keS50YWtlID0gW107XG4gICAgICAgICAgdmFsdWUuZm9yRWFjaChmdW5jdGlvbiAodGFrZW5FbGVtZW50KSB7XG4gICAgICAgICAgICBmb3IgKGxldCBpIGluIHRha2VuRWxlbWVudCkge1xuXG4gICAgICAgICAgICAgIGlmICghKHRha2VuRWxlbWVudFtpXSBpbnN0YW5jZW9mIFBvaW50ZXJMaWIuUG9pbnRlcikpXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwicmVzcG9uc2UuYm9keS50YWtlLiogbXVzdCBiZSBhIHBvaW50ZXIgZXg6ICEhdmFyaWFibGUgbXlWYWx1ZVwiKTtcblxuICAgICAgICAgICAgICB0ZXN0LnJlc3BvbnNlLmJvZHkudGFrZS5wdXNoKG5ldyBLZXlWYWx1ZU9iamVjdChpLCB0YWtlbkVsZW1lbnRbaV0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcblxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBlbHNlICovXG4gICAgICAgICAgaWYgKHZhbHVlIGluc3RhbmNlb2YgUG9pbnRlckxpYi5Qb2ludGVyKSB7XG4gICAgICAgICAgICB0ZXN0LnJlc3BvbnNlLmJvZHkuY29weVRvID0gdmFsdWU7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcInJlc3BvbnNlLmJvZHkudGFrZSBtdXN0IGJlIGEgc2VxdWVuY2Ugb2YgcG9pbnRlcnMgb3IgYSAhIXZhcmlhYmxlXCIpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAncHJpbnQnOlxuICAgICAgICBlbnN1cmVJbnN0YW5jZU9mKFwicmVzcG9uc2UuYm9keS5wcmludFwiLCB2YWx1ZSwgQm9vbGVhbik7XG5cbiAgICAgICAgdGVzdC5yZXNwb25zZS5ib2R5LnByaW50ID0gdmFsdWU7XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgd2FybihcIlVua25vd24gaWRlbnRpZmllciBib2R5LnJlc3BvbnNlLlwiICsgYm9keUtleSk7XG4gICAgfVxuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVuc3VyZUluc3RhbmNlT2YobmFtZTogc3RyaW5nLCB2YWx1ZTogYW55LCAuLi50eXBlczogRnVuY3Rpb25bXSk6IHZvaWQge1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHR5cGVzLmxlbmd0aDsgaSsrKSB7XG5cbiAgICBpZiAodHlwZW9mIHR5cGVzW2ldID09IFwiZnVuY3Rpb25cIikge1xuICAgICAgaWYgKHR5cGVzW2ldID09PSBPYmplY3QgJiYgdHlwZW9mIHZhbHVlICE9IFwib2JqZWN0XCIpXG4gICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICBpZiAodHlwZW9mIHZhbHVlICE9IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgaWYgKHR5cGVzW2ldID09PSBOdW1iZXIgJiYgdHlwZW9mIHZhbHVlID09IFwibnVtYmVyXCIpXG4gICAgICAgICAgaWYgKGlzTmFOKHZhbHVlKSlcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBpZiAodHlwZXNbaV0gPT09IFN0cmluZyAmJiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKVxuICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBpZiAodHlwZXNbaV0gPT09IEJvb2xlYW4gJiYgdHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpXG4gICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIHR5cGVzW2ldKVxuICAgICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZUVycm9yKG5hbWUgKyBcIiBtdXN0IGJlIGluc3RhbmNlIG9mIFwiICsgdHlwZXMubWFwKCh4OiBhbnkpID0+IHggJiYgeC5kaXNwbGF5TmFtZSB8fCB4ICYmIHgubmFtZSB8fCB4LnRvU3RyaW5nKCkpLmpvaW4oXCIgfCBcIikpO1xufVxuXG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZU1ldGhvZEhlYWRlcihuYW1lKSB7XG4gIGxldCBwYXJ0czogc3RyaW5nW10gPSBuYW1lLnNwbGl0KC9cXHMrL2cpO1xuICBsZXQgbWV0aG9kOiBzdHJpbmcgPSBudWxsO1xuXG4gIG1ldGhvZCA9IHBhcnRzWzBdLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuXG4gIGlmIChtZXRob2QubGVuZ3RoID09IDApXG4gICAgcmV0dXJuIG51bGw7XG5cbiAgLy8gbWV0aG9kcyBzaG91bGQgaGF2ZSAyIHBhcnRzXG4gIGlmIChwYXJ0cy5sZW5ndGggIT0gMilcbiAgICByZXR1cm4gbnVsbDtcblxuICBpZiAocGFydHNbMF0gIT0gcGFydHNbMF0udG9VcHBlckNhc2UoKSlcbiAgICByZXR1cm4gbnVsbDtcblxuICBpZiAobWV0aG9kcy5pbmRleE9mKG1ldGhvZCkgPT0gLTEpXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkVSUk9SOiB1bmtub3duIG1ldGhvZCBcIiArIG1ldGhvZCArIFwiIG9uIFwiICsgbmFtZSk7XG5cbiAgLy8gaWYgdGhlIFVSTCBkb2Vzbid0IHN0YXJ0cyB3aXRoIFwiL1wiXG4gIGlmIChwYXJ0c1sxXS5zdWJzdHIoMCwgMSkgIT0gJy8nICYmIHBhcnRzWzFdLnN1YnN0cigwLCAxKSAhPSAnPycpXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiRVJST1I6IHRoZSB1cmwgbXVzdCBzdGFydHMgd2l0aCAnLycgb3IgJz8nOiBcIiArIG5hbWUpO1xuXG4gIC8vIGlmIHRoZSBVUkwgZW5kcyB3aXRoIFwiL1wiXG4gIGlmIChwYXJ0c1sxXS5zdWJzdHIoLTEpID09ICcvJyAmJiBwYXJ0c1sxXS5sZW5ndGggPiAxKVxuICAgIHRocm93IG5ldyBFcnJvcihcIkVSUk9SOiB0aGUgdXJsIG11c3Qgbm90IGVuZHMgd2l0aCAnLyc6IFwiICsgbmFtZSk7XG5cbiAgcmV0dXJuIHtcbiAgICBtZXRob2Q6IG1ldGhvZCxcbiAgICB1cmw6IHBhcnRzWzFdXG4gIH07XG59XG5cblxuZXhwb3J0IGZ1bmN0aW9uIGNsb25lT2JqZWN0VXNpbmdQb2ludGVyczxUPihiYXNlT2JqZWN0OiBULCBzdG9yZSk6IGFueSB7XG4gIGlmICh0eXBlb2YgYmFzZU9iamVjdCAhPT0gXCJvYmplY3RcIikge1xuICAgIHJldHVybiBiYXNlT2JqZWN0O1xuICB9XG5cbiAgcmV0dXJuIGNsb25lT2JqZWN0KGJhc2VPYmplY3QsIHN0b3JlKTtcbn1cblxuXG5mdW5jdGlvbiBjbG9uZU9iamVjdChvYmosIHN0b3JlKSB7XG5cbiAgaWYgKG9iaiA9PT0gbnVsbCB8fCBvYmogPT09IHVuZGVmaW5lZClcbiAgICByZXR1cm4gb2JqO1xuXG4gIGlmICh0eXBlb2Ygb2JqID09IFwic3RyaW5nXCIgfHwgdHlwZW9mIG9iaiA9PSBcIm51bWJlclwiIHx8IHR5cGVvZiBvYmogPT0gXCJib29sZWFuXCIpXG4gICAgcmV0dXJuIG9iajtcblxuICAvLyBIYW5kbGUgRGF0ZSAocmV0dXJuIG5ldyBEYXRlIG9iamVjdCB3aXRoIG9sZCB2YWx1ZSlcbiAgaWYgKG9iaiBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICByZXR1cm4gbmV3IERhdGUob2JqKTtcbiAgfVxuXG4gIGlmIChvYmogaW5zdGFuY2VvZiBTdHJpbmcgfHwgb2JqIGluc3RhbmNlb2YgTnVtYmVyIHx8IG9iaiBpbnN0YW5jZW9mIEJvb2xlYW4pIHtcbiAgICByZXR1cm4gb2JqO1xuICB9XG5cbiAgLy8gSGFuZGxlIEFycmF5IChyZXR1cm4gYSBmdWxsIHNsaWNlIG9mIHRoZSBhcnJheSlcbiAgaWYgKG9iaiBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgbGV0IG5ld0FycmF5ID0gb2JqLnNsaWNlKCk7XG4gICAgcmV0dXJuIG5ld0FycmF5Lm1hcCh4ID0+IGNsb25lT2JqZWN0KHgsIHN0b3JlKSk7XG4gIH1cblxuICBpZiAob2JqIGluc3RhbmNlb2YgUG9pbnRlckxpYi5Qb2ludGVyKSB7XG4gICAgbGV0IHJlc3VsdDogYW55O1xuICAgIHRyeSB7XG4gICAgICByZXN1bHQgPSBjbG9uZU9iamVjdChvYmouZ2V0KHN0b3JlKSwgc3RvcmUpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJjbG9uZU9iamVjdDo6RXJyb3JcIiwgZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGlmIChvYmogaW5zdGFuY2VvZiBSZWdFeHApIHtcbiAgICByZXR1cm4gb2JqO1xuICB9XG5cbiAgLy8gSGFuZGxlIE9iamVjdFxuICBpZiAob2JqIGluc3RhbmNlb2YgT2JqZWN0KSB7XG4gICAgbGV0IGNvcHkgPSBuZXcgb2JqLmNvbnN0cnVjdG9yKCk7XG4gICAgZm9yIChsZXQgYXR0ciBpbiBvYmopIHtcbiAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkoYXR0cikpIHtcbiAgICAgICAgY29weVthdHRyXSA9IGNsb25lT2JqZWN0KG9ialthdHRyXSwgc3RvcmUpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gY29weTtcbiAgfVxuXG4gIHRocm93IG5ldyBFcnJvcihcIlVuYWJsZSB0byBjb3B5IG9iaiEgSXRzIHR5cGUgaXNuJ3Qgc3VwcG9ydGVkLiBcIiArIHV0aWwuaW5zcGVjdChvYmopKTtcbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gbWF0Y2hVcmwodXJsOiBzdHJpbmcpIHtcbiAgLy8gcmVtb3ZlIGhhc2ggJiBxdWVyeVN0cmluZ1xuICB1cmwgPSB1cmwuc3BsaXQoL1s/I10vKVswXTtcblxuICAvLyBub3JtYWxpemUgdXJpUGFyYW1ldGVycyB0byA/XG4gIHVybCA9IHVybC5yZXBsYWNlKC9cXHsoW2EtekEtWjAtOV9dKylcXH0vZywgZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiAnPyc7XG4gIH0gYXMgYW55KTtcblxuICByZXR1cm4gdXJsO1xufVxuXG5cbmV4cG9ydCBmdW5jdGlvbiBmbGF0UHJvbWlzZSgpIHtcbiAgbGV0IHJlc3VsdCA9IHtcbiAgICByZXNvbHZlcjogbnVsbCBhcyAoYT86IGFueSkgPT4gYW55LFxuICAgIHJlamVjdGVyOiBudWxsIGFzIChhOiBhbnkpID0+IGFueSxcbiAgICBwcm9taXNlOiBudWxsIGFzIFByb21pc2U8YW55PlxuICB9O1xuXG4gIHJlc3VsdC5wcm9taXNlID0gbmV3IFByb21pc2UoKGEsIGIpID0+IHtcbiAgICByZXN1bHQucmVzb2x2ZXIgPSBhO1xuICAgIHJlc3VsdC5yZWplY3RlciA9IGI7XG4gIH0pO1xuXG4gIHJldHVybiByZXN1bHQ7XG59XG5cblxuZXhwb3J0IGZ1bmN0aW9uIGVycm9yRGlmZihtc2csIGV4cGVjdGVkLCBhY3R1YWwsIGN0eCkge1xuICBsZXQgZXJyID0gbmV3IEVycm9yKG1zZykgYXMgYW55O1xuICBpZiAoY3R4KSB7XG4gICAgZXJyLm1lc3NhZ2UgPSBudWxsO1xuICAgIGVyci5pbnNwZWN0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgZXJyLm1lc3NhZ2UgPSBtc2c7XG4gICAgICByZXR1cm4gbXNnICsgXCJcXG5cIiArIEpTT04uc3RyaW5naWZ5KGN0eCwgbnVsbCwgMik7XG4gICAgfTtcbiAgfVxuICBlcnIuZXhwZWN0ZWQgPSBleHBlY3RlZDtcbiAgZXJyLmFjdHVhbCA9IGFjdHVhbDtcbiAgZXJyLnNob3dEaWZmID0gdHJ1ZTtcbiAgcmV0dXJuIGVycjtcbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gZXJyb3IobXNnLCBjdHgpIHtcbiAgbGV0IGVyciA9IG5ldyBFcnJvcihtc2cpIGFzIGFueTtcbiAgaWYgKGN0eCkge1xuICAgIGVyci5tZXNzYWdlID0gbnVsbDtcbiAgICBlcnIuaW5zcGVjdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIGVyci5tZXNzYWdlID0gbXNnO1xuICAgICAgcmV0dXJuIG1zZyArIFwiXFxuXCIgKyBKU09OLnN0cmluZ2lmeShjdHgsIG51bGwsIDIpO1xuICAgIH07XG4gIH1cbiAgcmV0dXJuIGVycjtcbn1cblxuXG5pZiAoIShlcnJvcigndGVzdCcsIHt9KSBpbnN0YW5jZW9mIEVycm9yKSkgcHJvY2Vzcy5leGl0KDEpO1xuaWYgKCEoZXJyb3JEaWZmKCd0ZXN0JywgMSwgMiwge30pIGluc3RhbmNlb2YgRXJyb3IpKSBwcm9jZXNzLmV4aXQoMSk7XG5cblxuZnVuY3Rpb24gZ2VuZXJhdGVUZXN0QXNzZXJ0aW9ucyh0ZXN0OiBBVExUZXN0KSB7XG4gIGlmICh0ZXN0LnNraXApIHJldHVybjtcblxuICBpZiAodGVzdC5yZXNwb25zZSkge1xuICAgIGlmICh0ZXN0LnJlc3BvbnNlLnN0YXR1cykge1xuICAgICAgdGVzdC5hc3NlcnRpb25zLnB1c2goXG4gICAgICAgIG5ldyBDb21tb25Bc3NlcnRpb25zLlN0YXR1c0NvZGVBc3NlcnRpb24odGVzdCwgdGVzdC5yZXNwb25zZS5zdGF0dXMpXG4gICAgICApO1xuICAgIH1cblxuICAgIGlmICh0ZXN0LnJlc3BvbnNlLmJvZHkpIHtcbiAgICAgIGlmICgnaXMnIGluIHRlc3QucmVzcG9uc2UuYm9keSkge1xuICAgICAgICB0ZXN0LmFzc2VydGlvbnMucHVzaChcbiAgICAgICAgICBuZXcgQ29tbW9uQXNzZXJ0aW9ucy5Cb2R5RXF1YWxzQXNzZXJ0aW9uKHRlc3QsIHRlc3QucmVzcG9uc2UuYm9keS5pcylcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRlc3QucmVzcG9uc2UuYm9keS5zY2hlbWEpIHtcbiAgICAgICAgLypsZXQgdiA9IHRoYXQub2J0YWluU2NoZW1hVmFsaWRhdG9yKHRlc3QucmVzcG9uc2UuYm9keS5zY2hlbWEpO1xuXG4gICAgICAgIHRoYXQuZGVmZXJlZEl0KFwicmVzcG9uc2UuYm9keSBzY2hlbWFcIiwgdGVzdC50aW1lb3V0KS50aGVuKHJlc29sdmVyID0+IHtcbiAgICAgICAgICBsZXQgdmFsaWRhdGlvblJlc3VsdCA9IHYocmVxdWVzdEhvbGRlci5yZXMuYm9keSk7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmICh2YWxpZGF0aW9uUmVzdWx0LnZhbGlkKSB7XG4gICAgICAgICAgICAgIHJlc29sdmVyKCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBsZXQgZXJyb3JzID0gW1wiU2NoZW1hIGVycm9yOlwiXTtcbiAgICAgICAgICAgICAgdmFsaWRhdGlvblJlc3VsdC5lcnJvcnMgJiYgdmFsaWRhdGlvblJlc3VsdC5lcnJvcnMuZm9yRWFjaCh4ID0+IGVycm9ycy5wdXNoKFwiICBcIiArIHguc3RhY2spKTtcblxuICAgICAgICAgICAgICByZXNvbHZlcihBVExIZWxwZXJzLmVycm9yKGVycm9ycy5qb2luKCdcXG4nKSB8fCBcIkludmFsaWQgc2NoZW1hXCIsIHJlcXVlc3RIb2xkZXIuY3R4KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgcmVzb2x2ZXIoZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTsqL1xuICAgICAgfVxuXG4gICAgICBpZiAodGVzdC5yZXNwb25zZS5ib2R5Lm1hdGNoZXMpIHtcbiAgICAgICAgdGVzdC5yZXNwb25zZS5ib2R5Lm1hdGNoZXMuZm9yRWFjaChrdm8gPT4ge1xuICAgICAgICAgIHRlc3QuYXNzZXJ0aW9ucy5wdXNoKFxuICAgICAgICAgICAgbmV3IENvbW1vbkFzc2VydGlvbnMuQm9keU1hdGNoZXNBc3NlcnRpb24odGVzdCwga3ZvLmtleSwga3ZvLnZhbHVlKVxuICAgICAgICAgICk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBpZiAodGVzdC5yZXNwb25zZS5oZWFkZXJzKSB7XG4gICAgICAgIGZvciAobGV0IGggaW4gdGVzdC5yZXNwb25zZS5oZWFkZXJzKSB7XG4gICAgICAgICAgdGVzdC5hc3NlcnRpb25zLnB1c2goXG4gICAgICAgICAgICBuZXcgQ29tbW9uQXNzZXJ0aW9ucy5IZWFkZXJNYXRjaGVzQXNzZXJ0aW9uKHRlc3QsIGgsIHRlc3QucmVzcG9uc2UuaGVhZGVyc1toXSlcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICh0ZXN0LnJlc3BvbnNlLmJvZHkudGFrZSkge1xuICAgICAgICBsZXQgdGFrZSA9IHRlc3QucmVzcG9uc2UuYm9keS50YWtlO1xuXG4gICAgICAgIHRha2UuZm9yRWFjaChmdW5jdGlvbiAodGFrZW5FbGVtZW50KSB7XG4gICAgICAgICAgdGVzdC5hc3NlcnRpb25zLnB1c2goXG4gICAgICAgICAgICBuZXcgQ29tbW9uQXNzZXJ0aW9ucy5Db3B5Qm9keVZhbHVlT3BlcmF0aW9uKHRlc3QsIHRha2VuRWxlbWVudC5rZXksIHRha2VuRWxlbWVudC52YWx1ZSlcbiAgICAgICAgICApO1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRlc3QucmVzcG9uc2UuYm9keS5jb3B5VG8gJiYgdGVzdC5yZXNwb25zZS5ib2R5LmNvcHlUbyBpbnN0YW5jZW9mIHBvaW50ZXJMaWIuUG9pbnRlcikge1xuICAgICAgICB0ZXN0LmFzc2VydGlvbnMucHVzaChcbiAgICAgICAgICBuZXcgQ29tbW9uQXNzZXJ0aW9ucy5Db3B5Qm9keVZhbHVlT3BlcmF0aW9uKHRlc3QsICcqJywgdGVzdC5yZXNwb25zZS5ib2R5LmNvcHlUbylcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn0iXX0=