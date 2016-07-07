"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var util = require('util');
var _ = require('lodash');
var jsonschema = require('jsonschema');
var pathMatch = require('raml-path-match');
var ATLHelpers = require('./ATLHelpers');
var CoverageAssertion = (function () {
    function CoverageAssertion(name, validationFn, lowLevelAST) {
        var _this = this;
        this.name = name;
        this.validationFn = validationFn;
        this.lowLevelAST = lowLevelAST;
        this.valid = null;
        this.innerAssertions = [];
        this.promise = ATLHelpers.flatPromise();
        this.promise.promise
            .then(function (x) {
            if (x) {
                _this.error = x;
                _this.valid = false;
                return Promise.reject(x);
            }
            else {
                delete _this.error;
                _this.valid = true;
                return Promise.resolve();
            }
        })
            .catch(function (x) {
            _this.error = x;
            _this.valid = false;
            return Promise.reject(x);
        });
        if (lowLevelAST) {
            this.src_file = lowLevelAST.unit().absolutePath();
            if (this.src_file) {
                this.src_line = lowLevelAST.unit().lineMapper().position(lowLevelAST.start()).line;
                this.src_line_end = lowLevelAST.unit().lineMapper().position(lowLevelAST.end()).line;
                this.src_start = lowLevelAST.start();
                this.src_end = lowLevelAST.end();
            }
        }
    }
    CoverageAssertion.prototype.getCoverage = function () {
        if (this.src_file) {
            return {
                file: this.src_file,
                line: this.src_line,
                lineEnd: this.src_line_end,
                start: this.src_start,
                end: this.src_end,
                covered: this.valid
            };
        }
    };
    CoverageAssertion.prototype.validate = function (res) {
        var _this = this;
        var waitForInner = Promise.resolve();
        try {
            if (!res || !res.length) {
                throw new NotImplementedError("No matching results");
            }
            if (this.validationFn) {
                var actualResult = this.validationFn(res);
                if (actualResult) {
                    if (!(actualResult instanceof Promise)) {
                        this.promise.rejecter(new Error(this.name + " does not return a Promise, got " + util.inspect(actualResult)));
                    }
                    else {
                        actualResult
                            .then(function (result) {
                            if (result) {
                                _this.promise.rejecter(result);
                            }
                            else {
                                _this.promise.resolver();
                            }
                        })
                            .catch(function (err) {
                            _this.promise.rejecter(err);
                        });
                    }
                }
                else {
                    this.promise.resolver();
                }
            }
            else {
                this.promise.resolver();
            }
        }
        catch (e) {
            this.promise.rejecter(e);
        }
        if (this.innerAssertions.length) {
            waitForInner = Promise.all(this.innerAssertions.map(function (x) { return x.validate(res); }));
        }
        // THIS METOD MUST RESOLVE EVERY TIME
        return this.promise.promise
            .then(function (error) { return waitForInner.then(function () { return error; }); })
            .catch(function (error) { return waitForInner.then(function () { return Promise.resolve(error); }); });
    };
    return CoverageAssertion;
}());
exports.CoverageAssertion = CoverageAssertion;
var CoverageResource = (function () {
    function CoverageResource(resource, bat) {
        this.resource = resource;
        this.bat = bat;
        this.results = [];
        this.coverageTree = {};
        this.resourceJSON = null;
        this.uriParameters = [];
        this.relativeUrl = resource.completeRelativeUri();
        this.uriParameters = resource.absoluteUriParameters().map(function (x) { return x.toJSON(); });
        this.matches = pathMatch(this.relativeUrl, this.uriParameters);
        this.generateAssertions();
    }
    CoverageResource.prototype.generateAssertions = function () {
        var _this = this;
        this.resourceAssertion = new CoverageAssertion(this.resource.completeRelativeUri());
        var methods = [];
        var type = this.resource.type();
        methods = methods.concat(this.resource.methods());
        if (methods.length == 0) {
            if (type) {
                var resourceType = type.resourceType();
                if (resourceType) {
                    methods = methods.concat(resourceType.methods());
                }
            }
        }
        // console.log(util.inspect(this.resource.toJSON(), false, 10, true));
        methods.forEach(function (method) {
            var methodName = method.method().toUpperCase();
            var methodJson = method.toJSON();
            var methodAssetions = new CoverageAssertion(methodName, null, method.highLevel().lowLevel());
            _this.resourceAssertion.innerAssertions.push(methodAssetions);
            var responses = [];
            var flatQueryParameters = {};
            if (_this.bat.ast.options.raml.traits) {
                var traits = method.is();
                for (var traitIndex = 0; traitIndex < traits.length; traitIndex++) {
                    var trait = traits[traitIndex];
                    var traitJSON = trait.trait().toJSON();
                    var traitName = trait.name();
                    if (traitJSON[traitName].queryParameters) {
                        for (var name_1 in traitJSON[traitName].queryParameters) {
                            var param = traitJSON[traitName].queryParameters[name_1];
                            flatQueryParameters[param.name] = flatQueryParameters[param.name] || {};
                            _.merge(flatQueryParameters[param.name], param);
                        }
                    }
                    responses = responses.concat(trait.trait().responses());
                }
            }
            if (_this.bat.ast.options.raml.resourceTypes) {
                if (type) {
                    var typeMethods = type.resourceType().methods();
                    typeMethods = typeMethods.filter(function (x) { return x.method().toUpperCase() == method.method().toUpperCase(); });
                    typeMethods.forEach(function (m) {
                        var typeMethodJson = m.toJSON()[m.method().toLowerCase()];
                        if (typeMethodJson.queryParameters) {
                            for (var name_2 in typeMethodJson.queryParameters) {
                                var param = typeMethodJson.queryParameters[name_2];
                                flatQueryParameters[param.name] = flatQueryParameters[param.name] || {};
                                _.merge(flatQueryParameters[param.name], param);
                            }
                        }
                        responses = responses.concat(m.responses());
                    });
                }
            }
            responses = responses.concat(method.responses());
            var flatResponses = {};
            responses.forEach(function (x) {
                var key = x.code().value();
                var flatResponse = flatResponses[key] = flatResponses[key] || {};
                flatResponse.status = key;
                flatResponse.statusAST = x.code().highLevel().lowLevel();
                x.headers().forEach(function (h) {
                    flatResponse.headers = flatResponse.headers || {};
                    flatResponse.headers[h.name()] = h || flatResponse.headers[h.name()];
                });
                flatResponse.bodies = {};
                x.body().forEach(function (h) {
                    var contentType = h.name();
                    var body = flatResponse.bodies[contentType] = flatResponse.bodies[contentType] || {
                        contentType: contentType
                    };
                    body.contentTypeAST = h.highLevel().lowLevel();
                    if (h.schemaContent()) {
                        body.schema = h.schema();
                        body.schemaString = h.schemaContent();
                    }
                });
            });
            if (Object.keys(flatQueryParameters).length) {
                Object.keys(flatQueryParameters)
                    .map(function (key) { return flatQueryParameters[key]; })
                    .forEach(function (qp) {
                    methodAssetions.innerAssertions.push(new CoverageAssertion('request.queryParameter::' + qp.name + ' must be present on some call', function (results) {
                        if (!results.some(function (x) {
                            return x.test.method.toUpperCase() == methodName
                                &&
                                    x.test.request.queryParameters
                                &&
                                    (qp.name in x.test.request.queryParameters);
                        }))
                            throw new (qp.required ? Error : NotImplementedError)("Query parameter not present");
                    }));
                    methodAssetions.innerAssertions.push(new CoverageAssertion('request.queryParameter::' + qp.name + ' must not be present', function (results) {
                        if (!results.some(function (x) {
                            return x.test.method.toUpperCase() == methodName
                                &&
                                    x.test.request.queryParameters
                                &&
                                    (qp.name in x.test.request.queryParameters);
                        }))
                            throw new NotImplementedError("Query parameter not present");
                    }));
                });
            }
            if (responses.length == 0) {
                methodAssetions.innerAssertions.push(new CoverageAssertion('should have been called', function (results) {
                    if (!results.some(function (x) { return x.test.method.toUpperCase() == methodName; }))
                        throw new NotImplementedError("no matching requests found");
                }));
            }
            else {
                Object.keys(flatResponses).forEach(function (statusCode) {
                    var response = flatResponses[statusCode];
                    methodAssetions.innerAssertions.push(new CoverageAssertion('check ' + statusCode + ' response', function (results) {
                        var responses = results.filter(function (x) {
                            return x.test.response.status == statusCode
                                &&
                                    x.test.method.toUpperCase() == methodName;
                        });
                        if (!responses.length) {
                            throw new Error("status code " + statusCode + " not covered");
                        }
                        else {
                            return Promise.race(responses.map(function (x) { return x.test.promise; }))
                                .then(function (x) {
                                if (x.status != parseInt(statusCode))
                                    throw ATLHelpers.errorDiff('unexpected response.status', statusCode, x.status, x);
                            });
                        }
                    }, response.statusAST));
                    var allBodies = Object.keys(response.bodies);
                    var responseAssertion = new CoverageAssertion(statusCode);
                    methodAssetions.innerAssertions.push(responseAssertion);
                    allBodies.forEach(function (contentType) {
                        var bodyAsserion = new CoverageAssertion(contentType);
                        var actualBody = response.bodies[contentType];
                        responseAssertion.innerAssertions.push(bodyAsserion);
                        bodyAsserion.innerAssertions.push(new CoverageAssertion('response.headers::content-type', function (results) {
                            var responses = results.filter(function (x) {
                                return x.test.response.status == statusCode
                                    &&
                                        x.test.method.toUpperCase() == methodName
                                    &&
                                        (x.response.get('content-type') || '').toLowerCase().indexOf(contentType.toLowerCase()) == 0;
                            });
                            if (!responses.length) {
                                throw ATLHelpers.error("Content-Type not covered (" + contentType + ")", responses.map(function (x) { return x.response.get('content-type'); }));
                            }
                        }, actualBody.contentTypeAST));
                        if (actualBody.schemaString) {
                            var v_1 = _this.bat.obtainSchemaValidator(actualBody.schemaString);
                            bodyAsserion.innerAssertions.push(new CoverageAssertion('response.body schema', function (results) {
                                var responses = results.filter(function (x) {
                                    return x.test.response.status == statusCode
                                        &&
                                            x.test.method.toUpperCase() == methodName
                                        &&
                                            (x.response.get('content-type') || '').toLowerCase().indexOf(contentType.toLowerCase()) == 0;
                                });
                                return Promise.race(responses.map(function (x) { return x.test.promise; }))
                                    .then(function (response) {
                                    var validationResult = v_1(response.body);
                                    if (!validationResult.valid) {
                                        throw ATLHelpers.error((validationResult.errors && validationResult.errors.map(function (x) { return "  " + x.stack; })).join('\n') || "Invalid schema", response);
                                    }
                                });
                            }, actualBody.schema.highLevel().lowLevel()));
                        }
                    });
                    if (response.headers) {
                        var headers = Object.keys(response.headers);
                        headers.forEach(function (headerKey) {
                            var headerObject = response.headers[headerKey];
                            headerKey = headerKey.toLowerCase();
                            methodAssetions.innerAssertions.push(new CoverageAssertion('response.headers::' + headerKey, function (results) {
                                var responses = results.filter(function (x) {
                                    return x.test.response.status == statusCode
                                        &&
                                            x.test.method.toUpperCase() == methodName;
                                });
                                return Promise.race(responses.map(function (x) { return x.test.promise; }))
                                    .then(function (response) {
                                    var receivedHeaders = Object.keys(response.header).map(function (x) { return x.toLowerCase(); });
                                    if (receivedHeaders.indexOf(headerKey) == -1)
                                        if (headerObject.optional())
                                            throw new OptionalError(headerKey + " header not received (Optional)");
                                        else
                                            throw ATLHelpers.error(headerKey + " header not received", receivedHeaders);
                                });
                            }, headerObject.highLevel().lowLevel()));
                        });
                    }
                });
            }
        });
    };
    CoverageResource.prototype.resolve = function (test, response) {
        this.results.push({
            test: test,
            response: response
        });
    };
    CoverageResource.prototype.registerCoverageLine = function (lineData) {
        var cov = this.bat.coverageData;
        var data = (cov[lineData.file] = cov[lineData.file] || { source: [] });
        if (lineData.line >= 0) {
            while ((lineData.line + 1) > data.source.length) {
                data.source.push(undefined);
            }
        }
        if (lineData.covered) {
            data.source[lineData.line] = (data.source[lineData.line] || 0) + 1;
        }
        else {
            data.source[lineData.line] = data.source[lineData.line] || 0;
        }
    };
    CoverageResource.prototype.getCoverage = function () {
        var _this = this;
        var prom = ATLHelpers.flatPromise();
        var total = 0;
        var notCovered = 0;
        var errored = 0;
        var lines = 0;
        var walk = function (assertion) {
            if (assertion.validationFn) {
                total++;
                if (!assertion.valid) {
                    if (assertion.error && (assertion.error instanceof NotImplementedError)) {
                        notCovered++;
                    }
                    else {
                        errored++;
                    }
                }
            }
            var coverageResult = assertion.getCoverage();
            if (coverageResult) {
                _this.registerCoverageLine(coverageResult);
                lines += coverageResult.lineEnd - coverageResult.line + 1;
            }
            if (assertion.innerAssertions.length) {
                assertion.innerAssertions.forEach(function (x) { return walk(x); });
            }
        };
        var calculateCoverage = function () {
            walk(_this.resourceAssertion);
            prom.resolver({
                total: total,
                errored: errored,
                notCovered: notCovered
            });
        };
        this.resourceAssertion.promise.promise.then(calculateCoverage).catch(calculateCoverage);
        return prom.promise;
    };
    CoverageResource.prototype.injectMochaTests = function () {
        var walk = function (assertion, level) {
            if (assertion.validationFn) {
                it(assertion.name, function (done) {
                    var that = this;
                    assertion.promise.promise
                        .then(function () { return done(); })
                        .catch(done);
                });
            }
            if (assertion.innerAssertions.length) {
                describe(assertion.name, function () {
                    this.bail(false);
                    assertion.innerAssertions.forEach(function (x) { return walk(x, level + 1); });
                });
            }
        };
        walk(this.resourceAssertion, 0);
    };
    CoverageResource.prototype.run = function () {
        return this.resourceAssertion.validate(this.results);
    };
    return CoverageResource;
}());
exports.CoverageResource = CoverageResource;
var NotImplementedError = (function (_super) {
    __extends(NotImplementedError, _super);
    function NotImplementedError(message) {
        _super.call(this, message);
        this.message = message;
        this.name = "Method not implemented";
    }
    return NotImplementedError;
}(Error));
exports.NotImplementedError = NotImplementedError;
var OptionalError = (function (_super) {
    __extends(OptionalError, _super);
    function OptionalError(message) {
        _super.call(this, message);
        this.message = message;
        this.name = "Optional Error";
    }
    return OptionalError;
}(Error));
exports.OptionalError = OptionalError;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ292ZXJhZ2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJDb3ZlcmFnZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFJQSxJQUFPLElBQUksV0FBVyxNQUFNLENBQUMsQ0FBQztBQUs5QixJQUFPLENBQUMsV0FBVyxRQUFRLENBQUMsQ0FBQztBQUk3QixJQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDekMsSUFBTSxTQUFTLEdBQUcsT0FBTyxDQUFDLGlCQUFpQixDQUFDLENBQUM7QUFJN0MsSUFBTyxVQUFVLFdBQVcsY0FBYyxDQUFDLENBQUM7QUFXNUM7SUFhRSwyQkFBbUIsSUFBWSxFQUFTLFlBQTBELEVBQVUsV0FBc0M7UUFicEosaUJBeUdDO1FBNUZvQixTQUFJLEdBQUosSUFBSSxDQUFRO1FBQVMsaUJBQVksR0FBWixZQUFZLENBQThDO1FBQVUsZ0JBQVcsR0FBWCxXQUFXLENBQTJCO1FBVmxKLFVBQUssR0FBWSxJQUFJLENBQUM7UUFDdEIsb0JBQWUsR0FBd0IsRUFBRSxDQUFDO1FBQzFDLFlBQU8sR0FBRyxVQUFVLENBQUMsV0FBVyxFQUFFLENBQUM7UUFTakMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPO2FBQ2pCLElBQUksQ0FBQyxVQUFBLENBQUM7WUFDTCxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNOLEtBQUksQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDO2dCQUNmLEtBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO2dCQUNuQixNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMzQixDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ04sT0FBTyxLQUFJLENBQUMsS0FBSyxDQUFDO2dCQUNsQixLQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztnQkFDbEIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FB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QUFPLENBQUMsQ0FBQztJQUN2RCxDQUFDO0lBQ0gsdUJBQUM7QUFBRCxDQUFDLEFBalpELElBaVpDO0FBalpZLHdCQUFnQixtQkFpWjVCLENBQUE7QUFFRDtJQUF5Qyx1Q0FBSztJQUM1Qyw2QkFBWSxPQUFlO1FBQ3pCLGtCQUFNLE9BQU8sQ0FBQyxDQUFDO1FBQ2YsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7UUFDdkIsSUFBSSxDQUFDLElBQUksR0FBRyx3QkFBd0IsQ0FBQztJQUN2QyxDQUFDO0lBQ0gsMEJBQUM7QUFBRCxDQUFDLEFBTkQsQ0FBeUMsS0FBSyxHQU03QztBQU5ZLDJCQUFtQixzQkFNL0IsQ0FBQTtBQUVEO0lBQW1DLGlDQUFLO0lBQ3RDLHVCQUFZLE9BQWU7UUFDekIsa0JBQU0sT0FBTyxDQUFDLENBQUM7UUFDZixJQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztRQUN2QixJQUFJLENBQUMsSUFBSSxHQUFHLGdCQUFnQixDQUFDO0lBQy9CLENBQUM7SUFDSCxvQkFBQztBQUFELENBQUMsQUFORCxDQUFtQyxLQUFLLEdBTXZDO0FBTlkscUJBQWEsZ0JBTXpCLENBQUEiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBOb2RlXG5pbXBvcnQgZnMgPSByZXF1aXJlKCdmcycpO1xuaW1wb3J0IHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XG5pbXBvcnQgdXJsID0gcmVxdWlyZSgndXJsJyk7XG5pbXBvcnQgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKTtcblxuXG4vLyBOUE1cbmltcG9ydCBqc1lhbWwgPSByZXF1aXJlKCdqcy15YW1sJyk7XG5pbXBvcnQgXyA9IHJlcXVpcmUoJ2xvZGFzaCcpO1xuaW1wb3J0IHJlcXVlc3QgPSByZXF1aXJlKCdzdXBlcnRlc3QnKTtcbmltcG9ydCBleHBlY3QgPSByZXF1aXJlKCdleHBlY3QnKTtcbmltcG9ydCBSQU1MID0gcmVxdWlyZSgncmFtbC0xLXBhcnNlcicpO1xuY29uc3QganNvbnNjaGVtYSA9IHJlcXVpcmUoJ2pzb25zY2hlbWEnKTtcbmNvbnN0IHBhdGhNYXRjaCA9IHJlcXVpcmUoJ3JhbWwtcGF0aC1tYXRjaCcpO1xuXG4vLyBMb2NhbHNcbmltcG9ydCBBVEwgPSByZXF1aXJlKCcuL0FUTCcpO1xuaW1wb3J0IEFUTEhlbHBlcnMgPSByZXF1aXJlKCcuL0FUTEhlbHBlcnMnKTtcblxuaW1wb3J0IHtCYXR9IGZyb20gJy4vYmF0JztcblxuZXhwb3J0IGludGVyZmFjZSBJVGVzdFJlc3VsdCB7XG4gIHRlc3Q6IEFUTEhlbHBlcnMuQVRMVGVzdDtcbiAgcmVzcG9uc2U6IHJlcXVlc3QuUmVzcG9uc2U7XG59XG5cblxuXG5leHBvcnQgY2xhc3MgQ292ZXJhZ2VBc3NlcnRpb24ge1xuXG4gIGVycm9yOiBFcnJvcjtcbiAgdmFsaWQ6IGJvb2xlYW4gPSBudWxsO1xuICBpbm5lckFzc2VydGlvbnM6IENvdmVyYWdlQXNzZXJ0aW9uW10gPSBbXTtcbiAgcHJvbWlzZSA9IEFUTEhlbHBlcnMuZmxhdFByb21pc2UoKTtcblxuICBzcmNfZmlsZTogc3RyaW5nO1xuICBzcmNfbGluZTogbnVtYmVyO1xuICBzcmNfbGluZV9lbmQ6IG51bWJlcjtcbiAgc3JjX3N0YXJ0OiBudW1iZXI7XG4gIHNyY19lbmQ6IG51bWJlcjtcblxuICBjb25zdHJ1Y3RvcihwdWJsaWMgbmFtZTogc3RyaW5nLCBwdWJsaWMgdmFsaWRhdGlvbkZuPzogKHJlczogSVRlc3RSZXN1bHRbXSkgPT4gUHJvbWlzZTxhbnk+IHwgdm9pZCwgcHJpdmF0ZSBsb3dMZXZlbEFTVD86IFJBTUwubGwuSUxvd0xldmVsQVNUTm9kZSkge1xuICAgIHRoaXMucHJvbWlzZS5wcm9taXNlXG4gICAgICAudGhlbih4ID0+IHtcbiAgICAgICAgaWYgKHgpIHtcbiAgICAgICAgICB0aGlzLmVycm9yID0geDtcbiAgICAgICAgICB0aGlzLnZhbGlkID0gZmFsc2U7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KHgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmVycm9yO1xuICAgICAgICAgIHRoaXMudmFsaWQgPSB0cnVlO1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5jYXRjaCh4ID0+IHtcbiAgICAgICAgdGhpcy5lcnJvciA9IHg7XG4gICAgICAgIHRoaXMudmFsaWQgPSBmYWxzZTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KHgpO1xuICAgICAgfSk7XG5cbiAgICBpZiAobG93TGV2ZWxBU1QpIHtcbiAgICAgIHRoaXMuc3JjX2ZpbGUgPSBsb3dMZXZlbEFTVC51bml0KCkuYWJzb2x1dGVQYXRoKCk7XG4gICAgICBpZiAodGhpcy5zcmNfZmlsZSkge1xuICAgICAgICB0aGlzLnNyY19saW5lID0gbG93TGV2ZWxBU1QudW5pdCgpLmxpbmVNYXBwZXIoKS5wb3NpdGlvbihsb3dMZXZlbEFTVC5zdGFydCgpKS5saW5lO1xuICAgICAgICB0aGlzLnNyY19saW5lX2VuZCA9IGxvd0xldmVsQVNULnVuaXQoKS5saW5lTWFwcGVyKCkucG9zaXRpb24obG93TGV2ZWxBU1QuZW5kKCkpLmxpbmU7XG4gICAgICAgIHRoaXMuc3JjX3N0YXJ0ID0gbG93TGV2ZWxBU1Quc3RhcnQoKTtcbiAgICAgICAgdGhpcy5zcmNfZW5kID0gbG93TGV2ZWxBU1QuZW5kKCk7XG4gICAgICB9XG4gICAgICAvLyBjb25zb2xlLmxvZyhuYW1lLCB0aGlzLnNyY19maWxlICsgJyMnICsgKHRoaXMuc3JjX2xpbmUgKyAxKSArICcgdG8gJyArICh0aGlzLnNyY19saW5lX2VuZCArIDEpKTtcbiAgICB9XG4gIH1cblxuICBnZXRDb3ZlcmFnZSgpIHtcbiAgICBpZiAodGhpcy5zcmNfZmlsZSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZmlsZTogdGhpcy5zcmNfZmlsZSxcbiAgICAgICAgbGluZTogdGhpcy5zcmNfbGluZSxcbiAgICAgICAgbGluZUVuZDogdGhpcy5zcmNfbGluZV9lbmQsXG4gICAgICAgIHN0YXJ0OiB0aGlzLnNyY19zdGFydCxcbiAgICAgICAgZW5kOiB0aGlzLnNyY19lbmQsXG4gICAgICAgIGNvdmVyZWQ6IHRoaXMudmFsaWRcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgdmFsaWRhdGUocmVzOiBJVGVzdFJlc3VsdFtdKTogUHJvbWlzZTxhbnk+IHtcblxuICAgIGxldCB3YWl0Rm9ySW5uZXI6IFByb21pc2U8YW55PiA9IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cbiAgICB0cnkge1xuICAgICAgaWYgKCFyZXMgfHwgIXJlcy5sZW5ndGgpIHtcbiAgICAgICAgdGhyb3cgbmV3IE5vdEltcGxlbWVudGVkRXJyb3IoXCJObyBtYXRjaGluZyByZXN1bHRzXCIpO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy52YWxpZGF0aW9uRm4pIHtcbiAgICAgICAgbGV0IGFjdHVhbFJlc3VsdCA9IHRoaXMudmFsaWRhdGlvbkZuKHJlcykgYXMgYW55O1xuXG4gICAgICAgIGlmIChhY3R1YWxSZXN1bHQpIHtcbiAgICAgICAgICBpZiAoIShhY3R1YWxSZXN1bHQgaW5zdGFuY2VvZiBQcm9taXNlKSkge1xuICAgICAgICAgICAgdGhpcy5wcm9taXNlLnJlamVjdGVyKG5ldyBFcnJvcih0aGlzLm5hbWUgKyBcIiBkb2VzIG5vdCByZXR1cm4gYSBQcm9taXNlLCBnb3QgXCIgKyB1dGlsLmluc3BlY3QoYWN0dWFsUmVzdWx0KSkpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBhY3R1YWxSZXN1bHRcbiAgICAgICAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICB0aGlzLnByb21pc2UucmVqZWN0ZXIocmVzdWx0KTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgdGhpcy5wcm9taXNlLnJlc29sdmVyKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLnByb21pc2UucmVqZWN0ZXIoZXJyKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMucHJvbWlzZS5yZXNvbHZlcigpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnByb21pc2UucmVzb2x2ZXIoKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICB0aGlzLnByb21pc2UucmVqZWN0ZXIoZSk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuaW5uZXJBc3NlcnRpb25zLmxlbmd0aCkge1xuICAgICAgd2FpdEZvcklubmVyID0gUHJvbWlzZS5hbGwodGhpcy5pbm5lckFzc2VydGlvbnMubWFwKHggPT4geC52YWxpZGF0ZShyZXMpKSk7XG4gICAgfVxuXG4gICAgLy8gVEhJUyBNRVRPRCBNVVNUIFJFU09MVkUgRVZFUlkgVElNRVxuICAgIHJldHVybiB0aGlzLnByb21pc2UucHJvbWlzZVxuICAgICAgLnRoZW4oZXJyb3IgPT4gd2FpdEZvcklubmVyLnRoZW4oKCkgPT4gZXJyb3IpKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHdhaXRGb3JJbm5lci50aGVuKCgpID0+IFByb21pc2UucmVzb2x2ZShlcnJvcikpKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgQ292ZXJhZ2VSZXNvdXJjZSB7XG4gIHJlbGF0aXZlVXJsOiBzdHJpbmc7XG4gIG1hdGNoZXM6IChzdHI6IHN0cmluZykgPT4gYm9vbGVhbiB8IGFueTtcblxuICByZXN1bHRzOiBJVGVzdFJlc3VsdFtdID0gW107XG5cbiAgY292ZXJhZ2VUcmVlOiBBVExIZWxwZXJzLklEaWN0aW9uYXJ5PGFueT4gPSB7fTtcblxuICByZXNvdXJjZUpTT04gPSBudWxsO1xuXG4gIHVyaVBhcmFtZXRlcnM6IGFueVtdID0gW107XG5cbiAgY29uc3RydWN0b3IocHVibGljIHJlc291cmNlOiBSQU1MLmFwaTA4LlJlc291cmNlLCBwdWJsaWMgYmF0OiBCYXQpIHtcbiAgICB0aGlzLnJlbGF0aXZlVXJsID0gcmVzb3VyY2UuY29tcGxldGVSZWxhdGl2ZVVyaSgpO1xuXG4gICAgdGhpcy51cmlQYXJhbWV0ZXJzID0gcmVzb3VyY2UuYWJzb2x1dGVVcmlQYXJhbWV0ZXJzKCkubWFwKHggPT4geC50b0pTT04oKSk7XG5cbiAgICB0aGlzLm1hdGNoZXMgPSBwYXRoTWF0Y2godGhpcy5yZWxhdGl2ZVVybCwgdGhpcy51cmlQYXJhbWV0ZXJzKTtcbiAgICB0aGlzLmdlbmVyYXRlQXNzZXJ0aW9ucygpO1xuICB9XG5cbiAgcmVzb3VyY2VBc3NlcnRpb246IENvdmVyYWdlQXNzZXJ0aW9uO1xuXG4gIHByaXZhdGUgZ2VuZXJhdGVBc3NlcnRpb25zKCkge1xuXG4gICAgdGhpcy5yZXNvdXJjZUFzc2VydGlvbiA9IG5ldyBDb3ZlcmFnZUFzc2VydGlvbih0aGlzLnJlc291cmNlLmNvbXBsZXRlUmVsYXRpdmVVcmkoKSk7XG5cblxuICAgIGxldCBtZXRob2RzID0gW107XG5cbiAgICBsZXQgdHlwZSA9IHRoaXMucmVzb3VyY2UudHlwZSgpO1xuXG4gICAgbWV0aG9kcyA9IG1ldGhvZHMuY29uY2F0KHRoaXMucmVzb3VyY2UubWV0aG9kcygpKTtcblxuICAgIGlmIChtZXRob2RzLmxlbmd0aCA9PSAwKSB7XG4gICAgICBpZiAodHlwZSkge1xuICAgICAgICBsZXQgcmVzb3VyY2VUeXBlID0gdHlwZS5yZXNvdXJjZVR5cGUoKTtcblxuICAgICAgICBpZiAocmVzb3VyY2VUeXBlKSB7XG4gICAgICAgICAgbWV0aG9kcyA9IG1ldGhvZHMuY29uY2F0KHJlc291cmNlVHlwZS5tZXRob2RzKCkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gY29uc29sZS5sb2codXRpbC5pbnNwZWN0KHRoaXMucmVzb3VyY2UudG9KU09OKCksIGZhbHNlLCAxMCwgdHJ1ZSkpO1xuXG4gICAgbWV0aG9kcy5mb3JFYWNoKG1ldGhvZCA9PiB7XG4gICAgICBsZXQgbWV0aG9kTmFtZSA9IG1ldGhvZC5tZXRob2QoKS50b1VwcGVyQ2FzZSgpO1xuICAgICAgbGV0IG1ldGhvZEpzb24gPSBtZXRob2QudG9KU09OKCk7XG4gICAgICBsZXQgbWV0aG9kQXNzZXRpb25zID0gbmV3IENvdmVyYWdlQXNzZXJ0aW9uKG1ldGhvZE5hbWUsIG51bGwsIG1ldGhvZC5oaWdoTGV2ZWwoKS5sb3dMZXZlbCgpKTtcblxuICAgICAgdGhpcy5yZXNvdXJjZUFzc2VydGlvbi5pbm5lckFzc2VydGlvbnMucHVzaChtZXRob2RBc3NldGlvbnMpO1xuXG4gICAgICBsZXQgcmVzcG9uc2VzOiBSQU1MLmFwaTA4LlJlc3BvbnNlW10gPSBbXTtcbiAgICAgIGxldCBmbGF0UXVlcnlQYXJhbWV0ZXJzOiBBVExIZWxwZXJzLklEaWN0aW9uYXJ5PGFueT4gPSB7fTtcblxuICAgICAgaWYgKHRoaXMuYmF0LmFzdC5vcHRpb25zLnJhbWwudHJhaXRzKSB7XG4gICAgICAgIGxldCB0cmFpdHMgPSBtZXRob2QuaXMoKTtcbiAgICAgICAgZm9yIChsZXQgdHJhaXRJbmRleCA9IDA7IHRyYWl0SW5kZXggPCB0cmFpdHMubGVuZ3RoOyB0cmFpdEluZGV4KyspIHtcbiAgICAgICAgICBsZXQgdHJhaXQgPSB0cmFpdHNbdHJhaXRJbmRleF07XG5cbiAgICAgICAgICBsZXQgdHJhaXRKU09OID0gdHJhaXQudHJhaXQoKS50b0pTT04oKTtcbiAgICAgICAgICBsZXQgdHJhaXROYW1lID0gdHJhaXQubmFtZSgpO1xuXG4gICAgICAgICAgaWYgKHRyYWl0SlNPTlt0cmFpdE5hbWVdLnF1ZXJ5UGFyYW1ldGVycykge1xuICAgICAgICAgICAgZm9yIChsZXQgbmFtZSBpbiB0cmFpdEpTT05bdHJhaXROYW1lXS5xdWVyeVBhcmFtZXRlcnMpIHtcbiAgICAgICAgICAgICAgbGV0IHBhcmFtID0gdHJhaXRKU09OW3RyYWl0TmFtZV0ucXVlcnlQYXJhbWV0ZXJzW25hbWVdO1xuICAgICAgICAgICAgICBmbGF0UXVlcnlQYXJhbWV0ZXJzW3BhcmFtLm5hbWVdID0gZmxhdFF1ZXJ5UGFyYW1ldGVyc1twYXJhbS5uYW1lXSB8fCB7fTtcbiAgICAgICAgICAgICAgXy5tZXJnZShmbGF0UXVlcnlQYXJhbWV0ZXJzW3BhcmFtLm5hbWVdLCBwYXJhbSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXNwb25zZXMgPSByZXNwb25zZXMuY29uY2F0KHRyYWl0LnRyYWl0KCkucmVzcG9uc2VzKCkgYXMgYW55KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5iYXQuYXN0Lm9wdGlvbnMucmFtbC5yZXNvdXJjZVR5cGVzKSB7XG4gICAgICAgIGlmICh0eXBlKSB7XG4gICAgICAgICAgbGV0IHR5cGVNZXRob2RzID0gdHlwZS5yZXNvdXJjZVR5cGUoKS5tZXRob2RzKCkgYXMgUkFNTC5hcGkwOC5NZXRob2RbXTtcblxuICAgICAgICAgIHR5cGVNZXRob2RzID0gdHlwZU1ldGhvZHMuZmlsdGVyKHggPT4geC5tZXRob2QoKS50b1VwcGVyQ2FzZSgpID09IG1ldGhvZC5tZXRob2QoKS50b1VwcGVyQ2FzZSgpKTtcbiAgICAgICAgICB0eXBlTWV0aG9kcy5mb3JFYWNoKG0gPT4ge1xuICAgICAgICAgICAgbGV0IHR5cGVNZXRob2RKc29uID0gbS50b0pTT04oKVttLm1ldGhvZCgpLnRvTG93ZXJDYXNlKCldO1xuXG4gICAgICAgICAgICBpZiAodHlwZU1ldGhvZEpzb24ucXVlcnlQYXJhbWV0ZXJzKSB7XG4gICAgICAgICAgICAgIGZvciAobGV0IG5hbWUgaW4gdHlwZU1ldGhvZEpzb24ucXVlcnlQYXJhbWV0ZXJzKSB7XG4gICAgICAgICAgICAgICAgbGV0IHBhcmFtID0gdHlwZU1ldGhvZEpzb24ucXVlcnlQYXJhbWV0ZXJzW25hbWVdO1xuICAgICAgICAgICAgICAgIGZsYXRRdWVyeVBhcmFtZXRlcnNbcGFyYW0ubmFtZV0gPSBmbGF0UXVlcnlQYXJhbWV0ZXJzW3BhcmFtLm5hbWVdIHx8IHt9O1xuICAgICAgICAgICAgICAgIF8ubWVyZ2UoZmxhdFF1ZXJ5UGFyYW1ldGVyc1twYXJhbS5uYW1lXSwgcGFyYW0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJlc3BvbnNlcyA9IHJlc3BvbnNlcy5jb25jYXQobS5yZXNwb25zZXMoKSBhcyBhbnkpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9XG5cblxuICAgICAgcmVzcG9uc2VzID0gcmVzcG9uc2VzLmNvbmNhdChtZXRob2QucmVzcG9uc2VzKCkgYXMgYW55KTtcblxuICAgICAgbGV0IGZsYXRSZXNwb25zZXM6IEFUTEhlbHBlcnMuSURpY3Rpb25hcnk8e1xuICAgICAgICBzdGF0dXM/OiBzdHJpbmc7XG4gICAgICAgIHN0YXR1c0FTVD86IFJBTUwubGwuSUxvd0xldmVsQVNUTm9kZTtcbiAgICAgICAgaGVhZGVycz86IEFUTEhlbHBlcnMuSURpY3Rpb25hcnk8UkFNTC5hcGkwOC5QYXJhbWV0ZXI+O1xuICAgICAgICBib2RpZXM/OiBBVExIZWxwZXJzLklEaWN0aW9uYXJ5PHtcbiAgICAgICAgICBjb250ZW50VHlwZT86IHN0cmluZztcbiAgICAgICAgICBjb250ZW50VHlwZUFTVD86IFJBTUwubGwuSUxvd0xldmVsQVNUTm9kZTtcbiAgICAgICAgICBzY2hlbWE/OiBSQU1MLmFwaTA4LlNjaGVtYVN0cmluZztcbiAgICAgICAgICBzY2hlbWFTdHJpbmc/OiBzdHJpbmc7XG4gICAgICAgIH0+O1xuICAgICAgfT4gPSB7fTtcblxuICAgICAgcmVzcG9uc2VzLmZvckVhY2goeCA9PiB7XG4gICAgICAgIGxldCBrZXkgPSB4LmNvZGUoKS52YWx1ZSgpO1xuICAgICAgICBsZXQgZmxhdFJlc3BvbnNlID0gZmxhdFJlc3BvbnNlc1trZXldID0gZmxhdFJlc3BvbnNlc1trZXldIHx8IHt9O1xuICAgICAgICBmbGF0UmVzcG9uc2Uuc3RhdHVzID0ga2V5O1xuICAgICAgICBmbGF0UmVzcG9uc2Uuc3RhdHVzQVNUID0geC5jb2RlKCkuaGlnaExldmVsKCkubG93TGV2ZWwoKTtcblxuICAgICAgICB4LmhlYWRlcnMoKS5mb3JFYWNoKGggPT4ge1xuICAgICAgICAgIGZsYXRSZXNwb25zZS5oZWFkZXJzID0gZmxhdFJlc3BvbnNlLmhlYWRlcnMgfHwge307XG4gICAgICAgICAgZmxhdFJlc3BvbnNlLmhlYWRlcnNbaC5uYW1lKCldID0gaCB8fCBmbGF0UmVzcG9uc2UuaGVhZGVyc1toLm5hbWUoKV07XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGZsYXRSZXNwb25zZS5ib2RpZXMgPSB7fTtcblxuICAgICAgICB4LmJvZHkoKS5mb3JFYWNoKGggPT4ge1xuICAgICAgICAgIGxldCBjb250ZW50VHlwZSA9IGgubmFtZSgpO1xuXG4gICAgICAgICAgbGV0IGJvZHkgPSBmbGF0UmVzcG9uc2UuYm9kaWVzW2NvbnRlbnRUeXBlXSA9IGZsYXRSZXNwb25zZS5ib2RpZXNbY29udGVudFR5cGVdIHx8IHtcbiAgICAgICAgICAgIGNvbnRlbnRUeXBlXG4gICAgICAgICAgfTtcblxuICAgICAgICAgIGJvZHkuY29udGVudFR5cGVBU1QgPSBoLmhpZ2hMZXZlbCgpLmxvd0xldmVsKCk7XG5cbiAgICAgICAgICBpZiAoaC5zY2hlbWFDb250ZW50KCkpIHtcbiAgICAgICAgICAgIGJvZHkuc2NoZW1hID0gaC5zY2hlbWEoKTtcbiAgICAgICAgICAgIGJvZHkuc2NoZW1hU3RyaW5nID0gaC5zY2hlbWFDb250ZW50KCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgICBpZiAoT2JqZWN0LmtleXMoZmxhdFF1ZXJ5UGFyYW1ldGVycykubGVuZ3RoKSB7XG4gICAgICAgIE9iamVjdC5rZXlzKGZsYXRRdWVyeVBhcmFtZXRlcnMpXG4gICAgICAgICAgLm1hcChrZXkgPT4gZmxhdFF1ZXJ5UGFyYW1ldGVyc1trZXldKVxuICAgICAgICAgIC5mb3JFYWNoKHFwID0+IHtcbiAgICAgICAgICAgIG1ldGhvZEFzc2V0aW9ucy5pbm5lckFzc2VydGlvbnMucHVzaChcbiAgICAgICAgICAgICAgbmV3IENvdmVyYWdlQXNzZXJ0aW9uKCdyZXF1ZXN0LnF1ZXJ5UGFyYW1ldGVyOjonICsgcXAubmFtZSArICcgbXVzdCBiZSBwcmVzZW50IG9uIHNvbWUgY2FsbCcsIChyZXN1bHRzKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCFyZXN1bHRzLnNvbWUoXG4gICAgICAgICAgICAgICAgICB4ID0+XG4gICAgICAgICAgICAgICAgICAgIHgudGVzdC5tZXRob2QudG9VcHBlckNhc2UoKSA9PSBtZXRob2ROYW1lXG4gICAgICAgICAgICAgICAgICAgICYmXG4gICAgICAgICAgICAgICAgICAgIHgudGVzdC5yZXF1ZXN0LnF1ZXJ5UGFyYW1ldGVyc1xuICAgICAgICAgICAgICAgICAgICAmJlxuICAgICAgICAgICAgICAgICAgICAocXAubmFtZSBpbiB4LnRlc3QucmVxdWVzdC5xdWVyeVBhcmFtZXRlcnMpXG4gICAgICAgICAgICAgICAgKSlcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyAocXAucmVxdWlyZWQgPyBFcnJvciA6IE5vdEltcGxlbWVudGVkRXJyb3IpKFwiUXVlcnkgcGFyYW1ldGVyIG5vdCBwcmVzZW50XCIpO1xuICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgICAgIG1ldGhvZEFzc2V0aW9ucy5pbm5lckFzc2VydGlvbnMucHVzaChcbiAgICAgICAgICAgICAgbmV3IENvdmVyYWdlQXNzZXJ0aW9uKCdyZXF1ZXN0LnF1ZXJ5UGFyYW1ldGVyOjonICsgcXAubmFtZSArICcgbXVzdCBub3QgYmUgcHJlc2VudCcsIChyZXN1bHRzKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCFyZXN1bHRzLnNvbWUoXG4gICAgICAgICAgICAgICAgICB4ID0+XG4gICAgICAgICAgICAgICAgICAgIHgudGVzdC5tZXRob2QudG9VcHBlckNhc2UoKSA9PSBtZXRob2ROYW1lXG4gICAgICAgICAgICAgICAgICAgICYmXG4gICAgICAgICAgICAgICAgICAgIHgudGVzdC5yZXF1ZXN0LnF1ZXJ5UGFyYW1ldGVyc1xuICAgICAgICAgICAgICAgICAgICAmJlxuICAgICAgICAgICAgICAgICAgICAocXAubmFtZSBpbiB4LnRlc3QucmVxdWVzdC5xdWVyeVBhcmFtZXRlcnMpXG4gICAgICAgICAgICAgICAgKSlcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBOb3RJbXBsZW1lbnRlZEVycm9yKFwiUXVlcnkgcGFyYW1ldGVyIG5vdCBwcmVzZW50XCIpO1xuICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChyZXNwb25zZXMubGVuZ3RoID09IDApIHtcbiAgICAgICAgbWV0aG9kQXNzZXRpb25zLmlubmVyQXNzZXJ0aW9ucy5wdXNoKG5ldyBDb3ZlcmFnZUFzc2VydGlvbignc2hvdWxkIGhhdmUgYmVlbiBjYWxsZWQnLCAocmVzdWx0cykgPT4ge1xuICAgICAgICAgIGlmICghcmVzdWx0cy5zb21lKFxuICAgICAgICAgICAgeCA9PiB4LnRlc3QubWV0aG9kLnRvVXBwZXJDYXNlKCkgPT0gbWV0aG9kTmFtZVxuICAgICAgICAgICkpXG4gICAgICAgICAgICB0aHJvdyBuZXcgTm90SW1wbGVtZW50ZWRFcnJvcihcIm5vIG1hdGNoaW5nIHJlcXVlc3RzIGZvdW5kXCIpO1xuICAgICAgICB9KSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBPYmplY3Qua2V5cyhmbGF0UmVzcG9uc2VzKS5mb3JFYWNoKHN0YXR1c0NvZGUgPT4ge1xuICAgICAgICAgIGxldCByZXNwb25zZSA9IGZsYXRSZXNwb25zZXNbc3RhdHVzQ29kZV07XG5cbiAgICAgICAgICBtZXRob2RBc3NldGlvbnMuaW5uZXJBc3NlcnRpb25zLnB1c2goXG4gICAgICAgICAgICBuZXcgQ292ZXJhZ2VBc3NlcnRpb24oJ2NoZWNrICcgKyBzdGF0dXNDb2RlICsgJyByZXNwb25zZScsIChyZXN1bHRzKSA9PiB7XG4gICAgICAgICAgICAgIGxldCByZXNwb25zZXMgPSByZXN1bHRzLmZpbHRlcih4ID0+XG4gICAgICAgICAgICAgICAgeC50ZXN0LnJlc3BvbnNlLnN0YXR1cyA9PSBzdGF0dXNDb2RlXG4gICAgICAgICAgICAgICAgJiZcbiAgICAgICAgICAgICAgICB4LnRlc3QubWV0aG9kLnRvVXBwZXJDYXNlKCkgPT0gbWV0aG9kTmFtZVxuICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgIGlmICghcmVzcG9uc2VzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcInN0YXR1cyBjb2RlIFwiICsgc3RhdHVzQ29kZSArIFwiIG5vdCBjb3ZlcmVkXCIpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJhY2UocmVzcG9uc2VzLm1hcCh4ID0+IHgudGVzdC5wcm9taXNlKSlcbiAgICAgICAgICAgICAgICAgIC50aGVuKHggPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoeC5zdGF0dXMgIT0gcGFyc2VJbnQoc3RhdHVzQ29kZSkpXG4gICAgICAgICAgICAgICAgICAgICAgdGhyb3cgQVRMSGVscGVycy5lcnJvckRpZmYoJ3VuZXhwZWN0ZWQgcmVzcG9uc2Uuc3RhdHVzJywgc3RhdHVzQ29kZSwgeC5zdGF0dXMsIHgpO1xuICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sIHJlc3BvbnNlLnN0YXR1c0FTVClcbiAgICAgICAgICApO1xuXG4gICAgICAgICAgbGV0IGFsbEJvZGllcyA9IE9iamVjdC5rZXlzKHJlc3BvbnNlLmJvZGllcyk7XG5cbiAgICAgICAgICBsZXQgcmVzcG9uc2VBc3NlcnRpb24gPSBuZXcgQ292ZXJhZ2VBc3NlcnRpb24oc3RhdHVzQ29kZSk7XG5cbiAgICAgICAgICBtZXRob2RBc3NldGlvbnMuaW5uZXJBc3NlcnRpb25zLnB1c2gocmVzcG9uc2VBc3NlcnRpb24pO1xuXG4gICAgICAgICAgYWxsQm9kaWVzLmZvckVhY2goY29udGVudFR5cGUgPT4ge1xuXG4gICAgICAgICAgICBsZXQgYm9keUFzc2VyaW9uID0gbmV3IENvdmVyYWdlQXNzZXJ0aW9uKGNvbnRlbnRUeXBlKTtcblxuICAgICAgICAgICAgbGV0IGFjdHVhbEJvZHkgPSByZXNwb25zZS5ib2RpZXNbY29udGVudFR5cGVdO1xuXG4gICAgICAgICAgICByZXNwb25zZUFzc2VydGlvbi5pbm5lckFzc2VydGlvbnMucHVzaChib2R5QXNzZXJpb24pO1xuXG4gICAgICAgICAgICBib2R5QXNzZXJpb24uaW5uZXJBc3NlcnRpb25zLnB1c2goXG4gICAgICAgICAgICAgIG5ldyBDb3ZlcmFnZUFzc2VydGlvbigncmVzcG9uc2UuaGVhZGVyczo6Y29udGVudC10eXBlJywgKHJlc3VsdHMpID0+IHtcbiAgICAgICAgICAgICAgICBsZXQgcmVzcG9uc2VzID0gcmVzdWx0cy5maWx0ZXIoeCA9PlxuICAgICAgICAgICAgICAgICAgeC50ZXN0LnJlc3BvbnNlLnN0YXR1cyA9PSBzdGF0dXNDb2RlXG4gICAgICAgICAgICAgICAgICAmJlxuICAgICAgICAgICAgICAgICAgeC50ZXN0Lm1ldGhvZC50b1VwcGVyQ2FzZSgpID09IG1ldGhvZE5hbWVcbiAgICAgICAgICAgICAgICAgICYmXG4gICAgICAgICAgICAgICAgICAoeC5yZXNwb25zZS5nZXQoJ2NvbnRlbnQtdHlwZScpIHx8ICcnKS50b0xvd2VyQ2FzZSgpLmluZGV4T2YoY29udGVudFR5cGUudG9Mb3dlckNhc2UoKSkgPT0gMFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgaWYgKCFyZXNwb25zZXMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBBVExIZWxwZXJzLmVycm9yKFwiQ29udGVudC1UeXBlIG5vdCBjb3ZlcmVkIChcIiArIGNvbnRlbnRUeXBlICsgXCIpXCIsIHJlc3BvbnNlcy5tYXAoeCA9PiB4LnJlc3BvbnNlLmdldCgnY29udGVudC10eXBlJykpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0sIGFjdHVhbEJvZHkuY29udGVudFR5cGVBU1QpXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICBpZiAoYWN0dWFsQm9keS5zY2hlbWFTdHJpbmcpIHtcbiAgICAgICAgICAgICAgbGV0IHYgPSB0aGlzLmJhdC5vYnRhaW5TY2hlbWFWYWxpZGF0b3IoYWN0dWFsQm9keS5zY2hlbWFTdHJpbmcpO1xuXG4gICAgICAgICAgICAgIGJvZHlBc3Nlcmlvbi5pbm5lckFzc2VydGlvbnMucHVzaChcbiAgICAgICAgICAgICAgICBuZXcgQ292ZXJhZ2VBc3NlcnRpb24oJ3Jlc3BvbnNlLmJvZHkgc2NoZW1hJywgKHJlc3VsdHMpID0+IHtcbiAgICAgICAgICAgICAgICAgIGxldCByZXNwb25zZXMgPSByZXN1bHRzLmZpbHRlcih4ID0+XG4gICAgICAgICAgICAgICAgICAgIHgudGVzdC5yZXNwb25zZS5zdGF0dXMgPT0gc3RhdHVzQ29kZVxuICAgICAgICAgICAgICAgICAgICAmJlxuICAgICAgICAgICAgICAgICAgICB4LnRlc3QubWV0aG9kLnRvVXBwZXJDYXNlKCkgPT0gbWV0aG9kTmFtZVxuICAgICAgICAgICAgICAgICAgICAmJlxuICAgICAgICAgICAgICAgICAgICAoeC5yZXNwb25zZS5nZXQoJ2NvbnRlbnQtdHlwZScpIHx8ICcnKS50b0xvd2VyQ2FzZSgpLmluZGV4T2YoY29udGVudFR5cGUudG9Mb3dlckNhc2UoKSkgPT0gMFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJhY2UocmVzcG9uc2VzLm1hcCh4ID0+IHgudGVzdC5wcm9taXNlKSlcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4oKHJlc3BvbnNlOiByZXF1ZXN0LlJlc3BvbnNlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgbGV0IHZhbGlkYXRpb25SZXN1bHQgPSB2KHJlc3BvbnNlLmJvZHkpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgaWYgKCF2YWxpZGF0aW9uUmVzdWx0LnZhbGlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBBVExIZWxwZXJzLmVycm9yKCh2YWxpZGF0aW9uUmVzdWx0LmVycm9ycyAmJiB2YWxpZGF0aW9uUmVzdWx0LmVycm9ycy5tYXAoeCA9PiBcIiAgXCIgKyB4LnN0YWNrKSkuam9pbignXFxuJykgfHwgXCJJbnZhbGlkIHNjaGVtYVwiLCByZXNwb25zZSk7XG4gICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9LCBhY3R1YWxCb2R5LnNjaGVtYS5oaWdoTGV2ZWwoKS5sb3dMZXZlbCgpKVxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgaWYgKHJlc3BvbnNlLmhlYWRlcnMpIHtcbiAgICAgICAgICAgIGxldCBoZWFkZXJzID0gT2JqZWN0LmtleXMocmVzcG9uc2UuaGVhZGVycyk7XG5cbiAgICAgICAgICAgIGhlYWRlcnMuZm9yRWFjaChoZWFkZXJLZXkgPT4ge1xuICAgICAgICAgICAgICBsZXQgaGVhZGVyT2JqZWN0OiBSQU1MLmFwaTA4LlBhcmFtZXRlciA9IHJlc3BvbnNlLmhlYWRlcnNbaGVhZGVyS2V5XTtcblxuICAgICAgICAgICAgICBoZWFkZXJLZXkgPSBoZWFkZXJLZXkudG9Mb3dlckNhc2UoKTtcblxuICAgICAgICAgICAgICBtZXRob2RBc3NldGlvbnMuaW5uZXJBc3NlcnRpb25zLnB1c2goXG4gICAgICAgICAgICAgICAgbmV3IENvdmVyYWdlQXNzZXJ0aW9uKCdyZXNwb25zZS5oZWFkZXJzOjonICsgaGVhZGVyS2V5LCAocmVzdWx0cykgPT4ge1xuICAgICAgICAgICAgICAgICAgbGV0IHJlc3BvbnNlcyA9IHJlc3VsdHMuZmlsdGVyKHggPT5cbiAgICAgICAgICAgICAgICAgICAgeC50ZXN0LnJlc3BvbnNlLnN0YXR1cyA9PSBzdGF0dXNDb2RlXG4gICAgICAgICAgICAgICAgICAgICYmXG4gICAgICAgICAgICAgICAgICAgIHgudGVzdC5tZXRob2QudG9VcHBlckNhc2UoKSA9PSBtZXRob2ROYW1lXG4gICAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yYWNlKFxuICAgICAgICAgICAgICAgICAgICByZXNwb25zZXMubWFwKHggPT4geC50ZXN0LnByb21pc2UpKVxuICAgICAgICAgICAgICAgICAgICAudGhlbihcbiAgICAgICAgICAgICAgICAgICAgKHJlc3BvbnNlOiByZXF1ZXN0LlJlc3BvbnNlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgbGV0IHJlY2VpdmVkSGVhZGVycyA9IE9iamVjdC5rZXlzKHJlc3BvbnNlLmhlYWRlcikubWFwKHggPT4geC50b0xvd2VyQ2FzZSgpKTtcblxuICAgICAgICAgICAgICAgICAgICAgIGlmIChyZWNlaXZlZEhlYWRlcnMuaW5kZXhPZihoZWFkZXJLZXkpID09IC0xKVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGhlYWRlck9iamVjdC5vcHRpb25hbCgpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgT3B0aW9uYWxFcnJvcihoZWFkZXJLZXkgKyBcIiBoZWFkZXIgbm90IHJlY2VpdmVkIChPcHRpb25hbClcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IEFUTEhlbHBlcnMuZXJyb3IoaGVhZGVyS2V5ICsgXCIgaGVhZGVyIG5vdCByZWNlaXZlZFwiLCByZWNlaXZlZEhlYWRlcnMpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9LCBoZWFkZXJPYmplY3QuaGlnaExldmVsKCkubG93TGV2ZWwoKSlcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuXG4gIHJlc29sdmUodGVzdDogQVRMSGVscGVycy5BVExUZXN0LCByZXNwb25zZTogcmVxdWVzdC5SZXNwb25zZSkge1xuICAgIHRoaXMucmVzdWx0cy5wdXNoKHtcbiAgICAgIHRlc3QsXG4gICAgICByZXNwb25zZVxuICAgIH0pO1xuICB9XG5cbiAgcmVnaXN0ZXJDb3ZlcmFnZUxpbmUobGluZURhdGE6IHtcbiAgICBmaWxlOiBzdHJpbmc7XG4gICAgbGluZTogbnVtYmVyO1xuICAgIGxpbmVFbmQ6IG51bWJlcjtcbiAgICBzdGFydDogbnVtYmVyO1xuICAgIGVuZDogbnVtYmVyO1xuICAgIGNvdmVyZWQ6IGJvb2xlYW47XG4gIH0pIHtcbiAgICBsZXQgY292ID0gdGhpcy5iYXQuY292ZXJhZ2VEYXRhO1xuXG4gICAgbGV0IGRhdGEgPSAoY292W2xpbmVEYXRhLmZpbGVdID0gY292W2xpbmVEYXRhLmZpbGVdIHx8IHsgc291cmNlOiBbXSB9KTtcblxuICAgIGlmIChsaW5lRGF0YS5saW5lID49IDApIHtcbiAgICAgIHdoaWxlICgobGluZURhdGEubGluZSArIDEpID4gZGF0YS5zb3VyY2UubGVuZ3RoKSB7XG4gICAgICAgIGRhdGEuc291cmNlLnB1c2godW5kZWZpbmVkKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobGluZURhdGEuY292ZXJlZCkge1xuICAgICAgZGF0YS5zb3VyY2VbbGluZURhdGEubGluZV0gPSAoZGF0YS5zb3VyY2VbbGluZURhdGEubGluZV0gYXMgbnVtYmVyIHx8IDApICsgMTtcbiAgICB9IGVsc2Uge1xuICAgICAgZGF0YS5zb3VyY2VbbGluZURhdGEubGluZV0gPSBkYXRhLnNvdXJjZVtsaW5lRGF0YS5saW5lXSB8fCAwO1xuICAgIH1cbiAgfVxuXG4gIGdldENvdmVyYWdlKCk6IFByb21pc2U8eyB0b3RhbDogbnVtYmVyOyBlcnJvcmVkOiBudW1iZXI7IG5vdENvdmVyZWQ6IG51bWJlcjsgfT4ge1xuICAgIGxldCBwcm9tID0gQVRMSGVscGVycy5mbGF0UHJvbWlzZSgpO1xuXG4gICAgbGV0IHRvdGFsID0gMDtcbiAgICBsZXQgbm90Q292ZXJlZCA9IDA7XG4gICAgbGV0IGVycm9yZWQgPSAwO1xuICAgIGxldCBsaW5lcyA9IDA7XG5cbiAgICBjb25zdCB3YWxrID0gKGFzc2VydGlvbjogQ292ZXJhZ2VBc3NlcnRpb24pID0+IHtcbiAgICAgIGlmIChhc3NlcnRpb24udmFsaWRhdGlvbkZuKSB7XG4gICAgICAgIHRvdGFsKys7XG5cbiAgICAgICAgaWYgKCFhc3NlcnRpb24udmFsaWQpIHtcbiAgICAgICAgICBpZiAoYXNzZXJ0aW9uLmVycm9yICYmIChhc3NlcnRpb24uZXJyb3IgaW5zdGFuY2VvZiBOb3RJbXBsZW1lbnRlZEVycm9yKSkge1xuICAgICAgICAgICAgbm90Q292ZXJlZCsrO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlcnJvcmVkKys7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGxldCBjb3ZlcmFnZVJlc3VsdCA9IGFzc2VydGlvbi5nZXRDb3ZlcmFnZSgpO1xuXG4gICAgICBpZiAoY292ZXJhZ2VSZXN1bHQpIHtcbiAgICAgICAgdGhpcy5yZWdpc3RlckNvdmVyYWdlTGluZShjb3ZlcmFnZVJlc3VsdCk7XG4gICAgICAgIGxpbmVzICs9IGNvdmVyYWdlUmVzdWx0LmxpbmVFbmQgLSBjb3ZlcmFnZVJlc3VsdC5saW5lICsgMTtcbiAgICAgIH1cblxuICAgICAgaWYgKGFzc2VydGlvbi5pbm5lckFzc2VydGlvbnMubGVuZ3RoKSB7XG4gICAgICAgIGFzc2VydGlvbi5pbm5lckFzc2VydGlvbnMuZm9yRWFjaCh4ID0+IHdhbGsoeCkpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICBjb25zdCBjYWxjdWxhdGVDb3ZlcmFnZSA9ICgpID0+IHtcbiAgICAgIHdhbGsodGhpcy5yZXNvdXJjZUFzc2VydGlvbik7XG5cbiAgICAgIHByb20ucmVzb2x2ZXIoe1xuICAgICAgICB0b3RhbCxcbiAgICAgICAgZXJyb3JlZCxcbiAgICAgICAgbm90Q292ZXJlZFxuICAgICAgfSk7XG4gICAgfTtcblxuICAgIHRoaXMucmVzb3VyY2VBc3NlcnRpb24ucHJvbWlzZS5wcm9taXNlLnRoZW4oY2FsY3VsYXRlQ292ZXJhZ2UpLmNhdGNoKGNhbGN1bGF0ZUNvdmVyYWdlKTtcblxuICAgIHJldHVybiBwcm9tLnByb21pc2U7XG4gIH1cblxuICBpbmplY3RNb2NoYVRlc3RzKCkge1xuICAgIGNvbnN0IHdhbGsgPSAoYXNzZXJ0aW9uOiBDb3ZlcmFnZUFzc2VydGlvbiwgbGV2ZWw6IG51bWJlcikgPT4ge1xuICAgICAgaWYgKGFzc2VydGlvbi52YWxpZGF0aW9uRm4pIHtcbiAgICAgICAgaXQoYXNzZXJ0aW9uLm5hbWUsIGZ1bmN0aW9uIChkb25lKSB7XG4gICAgICAgICAgY29uc3QgdGhhdCA9IHRoaXM7XG4gICAgICAgICAgYXNzZXJ0aW9uLnByb21pc2UucHJvbWlzZVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4gZG9uZSgpKVxuICAgICAgICAgICAgLmNhdGNoKGRvbmUpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIGlmIChhc3NlcnRpb24uaW5uZXJBc3NlcnRpb25zLmxlbmd0aCkge1xuICAgICAgICBkZXNjcmliZShhc3NlcnRpb24ubmFtZSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHRoaXMuYmFpbChmYWxzZSk7XG4gICAgICAgICAgYXNzZXJ0aW9uLmlubmVyQXNzZXJ0aW9ucy5mb3JFYWNoKHggPT4gd2Fsayh4LCBsZXZlbCArIDEpKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIHdhbGsodGhpcy5yZXNvdXJjZUFzc2VydGlvbiwgMCk7XG4gIH1cblxuICBydW4oKSB7XG4gICAgcmV0dXJuIHRoaXMucmVzb3VyY2VBc3NlcnRpb24udmFsaWRhdGUodGhpcy5yZXN1bHRzKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgTm90SW1wbGVtZW50ZWRFcnJvciBleHRlbmRzIEVycm9yIHtcbiAgY29uc3RydWN0b3IobWVzc2FnZTogc3RyaW5nKSB7XG4gICAgc3VwZXIobWVzc2FnZSk7XG4gICAgdGhpcy5tZXNzYWdlID0gbWVzc2FnZTtcbiAgICB0aGlzLm5hbWUgPSBcIk1ldGhvZCBub3QgaW1wbGVtZW50ZWRcIjtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgT3B0aW9uYWxFcnJvciBleHRlbmRzIEVycm9yIHtcbiAgY29uc3RydWN0b3IobWVzc2FnZTogc3RyaW5nKSB7XG4gICAgc3VwZXIobWVzc2FnZSk7XG4gICAgdGhpcy5tZXNzYWdlID0gbWVzc2FnZTtcbiAgICB0aGlzLm5hbWUgPSBcIk9wdGlvbmFsIEVycm9yXCI7XG4gIH1cbn0iXX0=