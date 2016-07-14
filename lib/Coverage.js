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
        /// Resolves when the validation is OK
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
                Object.keys(flatResponses).map(function (x) { return parseInt(x); }).forEach(function (statusCode) {
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
                            return Promise.race(responses.map(function (x) { return x.test.requester.promise; })).then(function (x) {
                                if (x.status != statusCode)
                                    throw ATLHelpers.errorDiff('unexpected response.status', statusCode, x.status, x);
                            });
                        }
                    }, response.statusAST));
                    var allBodies = Object.keys(response.bodies);
                    var responseAssertion = new CoverageAssertion(statusCode.toString());
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
                            var v_1 = _this.bat.ast.obtainSchemaValidator(actualBody.schemaString);
                            bodyAsserion.innerAssertions.push(new CoverageAssertion('response.body schema', function (results) {
                                var responses = results.filter(function (x) {
                                    return x.test.response.status == statusCode
                                        &&
                                            x.test.method.toUpperCase() == methodName
                                        &&
                                            (x.response.get('content-type') || '').toLowerCase().indexOf(contentType.toLowerCase()) == 0;
                                });
                                return Promise.race(responses.map(function (x) { return x.test.requester.promise; })).then(function (response) {
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
                                return Promise.race(responses.map(function (x) { return x.test.requester.promise; })).then(function (response) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ292ZXJhZ2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJDb3ZlcmFnZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFJQSxJQUFPLElBQUksV0FBVyxNQUFNLENBQUMsQ0FBQztBQUk5QixJQUFPLENBQUMsV0FBVyxRQUFRLENBQUMsQ0FBQztBQUk3QixJQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDekMsSUFBTSxTQUFTLEdBQUcsT0FBTyxDQUFDLGlCQUFpQixDQUFDLENBQUM7QUFJN0MsSUFBTyxVQUFVLFdBQVcsY0FBYyxDQUFDLENBQUM7QUFXNUM7SUFlRSwyQkFBbUIsSUFBWSxFQUFTLFlBQTBELEVBQVUsV0FBc0M7UUFmcEosaUJBMkdDO1FBNUZvQixTQUFJLEdBQUosSUFBSSxDQUFRO1FBQVMsaUJBQVksR0FBWixZQUFZLENBQThDO1FBQVUsZ0JBQVcsR0FBWCxXQUFXLENBQTJCO1FBWmxKLFVBQUssR0FBWSxJQUFJLENBQUM7UUFDdEIsb0JBQWUsR0FBd0IsRUFBRSxDQUFDO1FBRTFDLHNDQUFzQztRQUN0QyxZQUFPLEdBQUcsVUFBVSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBU2pDLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTzthQUNqQixJQUFJLENBQUMsVUFBQSxDQUFDO1lBQ0wsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDTixLQUFJLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQztnQkFDZixLQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztnQkFDbkIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDM0IsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNOLE9BQU8sS0FBSSxDQUFDLEtBQUssQ0FBQztnQkFDbEIsS0FBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUM7Z0JBQ2xCLE1BQU0sQ0FBQyxPQUFPLENBQUMs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QyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3ZELENBQUM7SUFDSCx1QkFBQztBQUFELENBQUMsQUFuWEQsSUFtWEM7QUFuWFksd0JBQWdCLG1CQW1YNUIsQ0FBQTtBQUVEO0lBQXlDLHVDQUFLO0lBQzVDLDZCQUFZLE9BQWU7UUFDekIsa0JBQU0sT0FBTyxDQUFDLENBQUM7UUFDZixJQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztRQUN2QixJQUFJLENBQUMsSUFBSSxHQUFHLHdCQUF3QixDQUFDO0lBQ3ZDLENBQUM7SUFDSCwwQkFBQztBQUFELENBQUMsQUFORCxDQUF5QyxLQUFLLEdBTTdDO0FBTlksMkJBQW1CLHNCQU0vQixDQUFBO0FBRUQ7SUFBbUMsaUNBQUs7SUFDdEMsdUJBQVksT0FBZTtRQUN6QixrQkFBTSxPQUFPLENBQUMsQ0FBQztRQUNmLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxJQUFJLEdBQUcsZ0JBQWdCLENBQUM7SUFDL0IsQ0FBQztJQUNILG9CQUFDO0FBQUQsQ0FBQyxBQU5ELENBQW1DLEtBQUssR0FNdkM7QUFOWSxxQkFBYSxnQkFNekIsQ0FBQSIsInNvdXJjZXNDb250ZW50IjpbIi8vIE5vZGVcbmltcG9ydCBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG5pbXBvcnQgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKTtcbmltcG9ydCB1cmwgPSByZXF1aXJlKCd1cmwnKTtcbmltcG9ydCB1dGlsID0gcmVxdWlyZSgndXRpbCcpO1xuXG4vLyBOUE1cbmltcG9ydCBqc1lhbWwgPSByZXF1aXJlKCdqcy15YW1sJyk7XG5pbXBvcnQgXyA9IHJlcXVpcmUoJ2xvZGFzaCcpO1xuaW1wb3J0IHJlcXVlc3QgPSByZXF1aXJlKCdzdXBlcnRlc3QnKTtcbmltcG9ydCBleHBlY3QgPSByZXF1aXJlKCdleHBlY3QnKTtcbmltcG9ydCBSQU1MID0gcmVxdWlyZSgncmFtbC0xLXBhcnNlcicpO1xuY29uc3QganNvbnNjaGVtYSA9IHJlcXVpcmUoJ2pzb25zY2hlbWEnKTtcbmNvbnN0IHBhdGhNYXRjaCA9IHJlcXVpcmUoJ3JhbWwtcGF0aC1tYXRjaCcpO1xuXG4vLyBMb2NhbHNcbmltcG9ydCBBVEwgPSByZXF1aXJlKCcuL0FUTCcpO1xuaW1wb3J0IEFUTEhlbHBlcnMgPSByZXF1aXJlKCcuL0FUTEhlbHBlcnMnKTtcblxuaW1wb3J0IHtCYXR9IGZyb20gJy4vYmF0JztcblxuZXhwb3J0IGludGVyZmFjZSBJVGVzdFJlc3VsdCB7XG4gIHRlc3Q6IEFUTEhlbHBlcnMuQVRMVGVzdDtcbiAgcmVzcG9uc2U6IHJlcXVlc3QuUmVzcG9uc2U7XG59XG5cblxuXG5leHBvcnQgY2xhc3MgQ292ZXJhZ2VBc3NlcnRpb24ge1xuXG4gIGVycm9yOiBFcnJvcjtcbiAgdmFsaWQ6IGJvb2xlYW4gPSBudWxsO1xuICBpbm5lckFzc2VydGlvbnM6IENvdmVyYWdlQXNzZXJ0aW9uW10gPSBbXTtcblxuICAvLy8gUmVzb2x2ZXMgd2hlbiB0aGUgdmFsaWRhdGlvbiBpcyBPS1xuICBwcm9taXNlID0gQVRMSGVscGVycy5mbGF0UHJvbWlzZSgpO1xuXG4gIHNyY19maWxlOiBzdHJpbmc7XG4gIHNyY19saW5lOiBudW1iZXI7XG4gIHNyY19saW5lX2VuZDogbnVtYmVyO1xuICBzcmNfc3RhcnQ6IG51bWJlcjtcbiAgc3JjX2VuZDogbnVtYmVyO1xuXG4gIGNvbnN0cnVjdG9yKHB1YmxpYyBuYW1lOiBzdHJpbmcsIHB1YmxpYyB2YWxpZGF0aW9uRm4/OiAocmVzOiBJVGVzdFJlc3VsdFtdKSA9PiBQcm9taXNlPGFueT4gfCB2b2lkLCBwcml2YXRlIGxvd0xldmVsQVNUPzogUkFNTC5sbC5JTG93TGV2ZWxBU1ROb2RlKSB7XG4gICAgdGhpcy5wcm9taXNlLnByb21pc2VcbiAgICAgIC50aGVuKHggPT4ge1xuICAgICAgICBpZiAoeCkge1xuICAgICAgICAgIHRoaXMuZXJyb3IgPSB4O1xuICAgICAgICAgIHRoaXMudmFsaWQgPSBmYWxzZTtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoeCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuZXJyb3I7XG4gICAgICAgICAgdGhpcy52YWxpZCA9IHRydWU7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmNhdGNoKHggPT4ge1xuICAgICAgICB0aGlzLmVycm9yID0geDtcbiAgICAgICAgdGhpcy52YWxpZCA9IGZhbHNlO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoeCk7XG4gICAgICB9KTtcblxuICAgIGlmIChsb3dMZXZlbEFTVCkge1xuICAgICAgdGhpcy5zcmNfZmlsZSA9IGxvd0xldmVsQVNULnVuaXQoKS5hYnNvbHV0ZVBhdGgoKTtcbiAgICAgIGlmICh0aGlzLnNyY19maWxlKSB7XG4gICAgICAgIHRoaXMuc3JjX2xpbmUgPSBsb3dMZXZlbEFTVC51bml0KCkubGluZU1hcHBlcigpLnBvc2l0aW9uKGxvd0xldmVsQVNULnN0YXJ0KCkpLmxpbmU7XG4gICAgICAgIHRoaXMuc3JjX2xpbmVfZW5kID0gbG93TGV2ZWxBU1QudW5pdCgpLmxpbmVNYXBwZXIoKS5wb3NpdGlvbihsb3dMZXZlbEFTVC5lbmQoKSkubGluZTtcbiAgICAgICAgdGhpcy5zcmNfc3RhcnQgPSBsb3dMZXZlbEFTVC5zdGFydCgpO1xuICAgICAgICB0aGlzLnNyY19lbmQgPSBsb3dMZXZlbEFTVC5lbmQoKTtcbiAgICAgIH1cbiAgICAgIC8vIGNvbnNvbGUubG9nKG5hbWUsIHRoaXMuc3JjX2ZpbGUgKyAnIycgKyAodGhpcy5zcmNfbGluZSArIDEpICsgJyB0byAnICsgKHRoaXMuc3JjX2xpbmVfZW5kICsgMSkpO1xuICAgIH1cbiAgfVxuXG4gIGdldENvdmVyYWdlKCkge1xuICAgIGlmICh0aGlzLnNyY19maWxlKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBmaWxlOiB0aGlzLnNyY19maWxlLFxuICAgICAgICBsaW5lOiB0aGlzLnNyY19saW5lLFxuICAgICAgICBsaW5lRW5kOiB0aGlzLnNyY19saW5lX2VuZCxcbiAgICAgICAgc3RhcnQ6IHRoaXMuc3JjX3N0YXJ0LFxuICAgICAgICBlbmQ6IHRoaXMuc3JjX2VuZCxcbiAgICAgICAgY292ZXJlZDogdGhpcy52YWxpZFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICB2YWxpZGF0ZShyZXM6IElUZXN0UmVzdWx0W10pOiBQcm9taXNlPGFueT4ge1xuXG4gICAgbGV0IHdhaXRGb3JJbm5lcjogUHJvbWlzZTxhbnk+ID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cblxuICAgIHRyeSB7XG4gICAgICBpZiAoIXJlcyB8fCAhcmVzLmxlbmd0aCkge1xuICAgICAgICB0aHJvdyBuZXcgTm90SW1wbGVtZW50ZWRFcnJvcihcIk5vIG1hdGNoaW5nIHJlc3VsdHNcIik7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLnZhbGlkYXRpb25Gbikge1xuICAgICAgICBsZXQgYWN0dWFsUmVzdWx0ID0gdGhpcy52YWxpZGF0aW9uRm4ocmVzKSBhcyBhbnk7XG5cbiAgICAgICAgaWYgKGFjdHVhbFJlc3VsdCkge1xuICAgICAgICAgIGlmICghKGFjdHVhbFJlc3VsdCBpbnN0YW5jZW9mIFByb21pc2UpKSB7XG4gICAgICAgICAgICB0aGlzLnByb21pc2UucmVqZWN0ZXIobmV3IEVycm9yKHRoaXMubmFtZSArIFwiIGRvZXMgbm90IHJldHVybiBhIFByb21pc2UsIGdvdCBcIiArIHV0aWwuaW5zcGVjdChhY3R1YWxSZXN1bHQpKSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGFjdHVhbFJlc3VsdFxuICAgICAgICAgICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgIHRoaXMucHJvbWlzZS5yZWplY3RlcihyZXN1bHQpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICB0aGlzLnByb21pc2UucmVzb2x2ZXIoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMucHJvbWlzZS5yZWplY3RlcihlcnIpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5wcm9taXNlLnJlc29sdmVyKCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMucHJvbWlzZS5yZXNvbHZlcigpO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHRoaXMucHJvbWlzZS5yZWplY3RlcihlKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5pbm5lckFzc2VydGlvbnMubGVuZ3RoKSB7XG4gICAgICB3YWl0Rm9ySW5uZXIgPSBQcm9taXNlLmFsbCh0aGlzLmlubmVyQXNzZXJ0aW9ucy5tYXAoeCA9PiB4LnZhbGlkYXRlKHJlcykpKTtcbiAgICB9XG5cbiAgICAvLyBUSElTIE1FVE9EIE1VU1QgUkVTT0xWRSBFVkVSWSBUSU1FXG4gICAgcmV0dXJuIHRoaXMucHJvbWlzZS5wcm9taXNlXG4gICAgICAudGhlbihlcnJvciA9PiB3YWl0Rm9ySW5uZXIudGhlbigoKSA9PiBlcnJvcikpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4gd2FpdEZvcklubmVyLnRoZW4oKCkgPT4gUHJvbWlzZS5yZXNvbHZlKGVycm9yKSkpO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBDb3ZlcmFnZVJlc291cmNlIHtcbiAgcmVsYXRpdmVVcmw6IHN0cmluZztcbiAgbWF0Y2hlczogKHN0cjogc3RyaW5nKSA9PiBib29sZWFuIHwgYW55O1xuXG4gIHJlc3VsdHM6IElUZXN0UmVzdWx0W10gPSBbXTtcblxuICBjb3ZlcmFnZVRyZWU6IEFUTEhlbHBlcnMuSURpY3Rpb25hcnk8YW55PiA9IHt9O1xuXG4gIHJlc291cmNlSlNPTiA9IG51bGw7XG5cbiAgdXJpUGFyYW1ldGVyczogYW55W10gPSBbXTtcblxuICBjb25zdHJ1Y3RvcihwdWJsaWMgcmVzb3VyY2U6IFJBTUwuYXBpMDguUmVzb3VyY2UsIHB1YmxpYyBiYXQ6IEJhdCkge1xuICAgIHRoaXMucmVsYXRpdmVVcmwgPSByZXNvdXJjZS5jb21wbGV0ZVJlbGF0aXZlVXJpKCk7XG5cbiAgICB0aGlzLnVyaVBhcmFtZXRlcnMgPSByZXNvdXJjZS5hYnNvbHV0ZVVyaVBhcmFtZXRlcnMoKS5tYXAoeCA9PiB4LnRvSlNPTigpKTtcblxuICAgIHRoaXMubWF0Y2hlcyA9IHBhdGhNYXRjaCh0aGlzLnJlbGF0aXZlVXJsLCB0aGlzLnVyaVBhcmFtZXRlcnMpO1xuICAgIHRoaXMuZ2VuZXJhdGVBc3NlcnRpb25zKCk7XG4gIH1cblxuICByZXNvdXJjZUFzc2VydGlvbjogQ292ZXJhZ2VBc3NlcnRpb247XG5cbiAgcHJpdmF0ZSBnZW5lcmF0ZUFzc2VydGlvbnMoKSB7XG5cbiAgICB0aGlzLnJlc291cmNlQXNzZXJ0aW9uID0gbmV3IENvdmVyYWdlQXNzZXJ0aW9uKHRoaXMucmVzb3VyY2UuY29tcGxldGVSZWxhdGl2ZVVyaSgpKTtcblxuICAgIGxldCBtZXRob2RzID0gW107XG5cbiAgICBsZXQgdHlwZSA9IHRoaXMucmVzb3VyY2UudHlwZSgpO1xuXG4gICAgbWV0aG9kcyA9IG1ldGhvZHMuY29uY2F0KHRoaXMucmVzb3VyY2UubWV0aG9kcygpKTtcblxuICAgIC8vIGNvbnNvbGUubG9nKHV0aWwuaW5zcGVjdCh0aGlzLnJlc291cmNlLnRvSlNPTigpLCBmYWxzZSwgMTAsIHRydWUpKTtcblxuICAgIG1ldGhvZHMuZm9yRWFjaChtZXRob2QgPT4ge1xuICAgICAgbGV0IG1ldGhvZE5hbWUgPSBtZXRob2QubWV0aG9kKCkudG9VcHBlckNhc2UoKTtcbiAgICAgIGxldCBtZXRob2RKc29uID0gbWV0aG9kLnRvSlNPTigpO1xuICAgICAgbGV0IG1ldGhvZEFzc2V0aW9ucyA9IG5ldyBDb3ZlcmFnZUFzc2VydGlvbihtZXRob2ROYW1lLCBudWxsLCBtZXRob2QuaGlnaExldmVsKCkubG93TGV2ZWwoKSk7XG5cbiAgICAgIHRoaXMucmVzb3VyY2VBc3NlcnRpb24uaW5uZXJBc3NlcnRpb25zLnB1c2gobWV0aG9kQXNzZXRpb25zKTtcblxuICAgICAgbGV0IHJlc3BvbnNlczogUkFNTC5hcGkwOC5SZXNwb25zZVtdID0gW107XG4gICAgICBsZXQgZmxhdFF1ZXJ5UGFyYW1ldGVyczogQVRMSGVscGVycy5JRGljdGlvbmFyeTxhbnk+ID0ge307XG5cbiAgICAgIGlmICh0aGlzLmJhdC5hc3Qub3B0aW9ucy5yYW1sLnRyYWl0cykge1xuICAgICAgICBsZXQgdHJhaXRzID0gbWV0aG9kLmlzKCk7XG4gICAgICAgIGZvciAobGV0IHRyYWl0SW5kZXggPSAwOyB0cmFpdEluZGV4IDwgdHJhaXRzLmxlbmd0aDsgdHJhaXRJbmRleCsrKSB7XG4gICAgICAgICAgbGV0IHRyYWl0ID0gdHJhaXRzW3RyYWl0SW5kZXhdO1xuXG4gICAgICAgICAgbGV0IHRyYWl0SlNPTiA9IHRyYWl0LnRyYWl0KCkudG9KU09OKCk7XG4gICAgICAgICAgbGV0IHRyYWl0TmFtZSA9IHRyYWl0Lm5hbWUoKTtcblxuICAgICAgICAgIGlmICh0cmFpdEpTT05bdHJhaXROYW1lXS5xdWVyeVBhcmFtZXRlcnMpIHtcbiAgICAgICAgICAgIGZvciAobGV0IG5hbWUgaW4gdHJhaXRKU09OW3RyYWl0TmFtZV0ucXVlcnlQYXJhbWV0ZXJzKSB7XG4gICAgICAgICAgICAgIGxldCBwYXJhbSA9IHRyYWl0SlNPTlt0cmFpdE5hbWVdLnF1ZXJ5UGFyYW1ldGVyc1tuYW1lXTtcbiAgICAgICAgICAgICAgZmxhdFF1ZXJ5UGFyYW1ldGVyc1twYXJhbS5uYW1lXSA9IGZsYXRRdWVyeVBhcmFtZXRlcnNbcGFyYW0ubmFtZV0gfHwge307XG4gICAgICAgICAgICAgIF8ubWVyZ2UoZmxhdFF1ZXJ5UGFyYW1ldGVyc1twYXJhbS5uYW1lXSwgcGFyYW0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmVzcG9uc2VzID0gcmVzcG9uc2VzLmNvbmNhdCh0cmFpdC50cmFpdCgpLnJlc3BvbnNlcygpIGFzIGFueSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuYmF0LmFzdC5vcHRpb25zLnJhbWwucmVzb3VyY2VUeXBlcykge1xuICAgICAgICBpZiAodHlwZSkge1xuICAgICAgICAgIGxldCB0eXBlTWV0aG9kcyA9IHR5cGUucmVzb3VyY2VUeXBlKCkubWV0aG9kcygpIGFzIFJBTUwuYXBpMDguTWV0aG9kW107XG5cbiAgICAgICAgICB0eXBlTWV0aG9kcyA9IHR5cGVNZXRob2RzLmZpbHRlcih4ID0+IHgubWV0aG9kKCkudG9VcHBlckNhc2UoKSA9PSBtZXRob2QubWV0aG9kKCkudG9VcHBlckNhc2UoKSk7XG4gICAgICAgICAgdHlwZU1ldGhvZHMuZm9yRWFjaChtID0+IHtcbiAgICAgICAgICAgIGxldCB0eXBlTWV0aG9kSnNvbiA9IG0udG9KU09OKClbbS5tZXRob2QoKS50b0xvd2VyQ2FzZSgpXTtcblxuICAgICAgICAgICAgaWYgKHR5cGVNZXRob2RKc29uLnF1ZXJ5UGFyYW1ldGVycykge1xuICAgICAgICAgICAgICBmb3IgKGxldCBuYW1lIGluIHR5cGVNZXRob2RKc29uLnF1ZXJ5UGFyYW1ldGVycykge1xuICAgICAgICAgICAgICAgIGxldCBwYXJhbSA9IHR5cGVNZXRob2RKc29uLnF1ZXJ5UGFyYW1ldGVyc1tuYW1lXTtcbiAgICAgICAgICAgICAgICBmbGF0UXVlcnlQYXJhbWV0ZXJzW3BhcmFtLm5hbWVdID0gZmxhdFF1ZXJ5UGFyYW1ldGVyc1twYXJhbS5uYW1lXSB8fCB7fTtcbiAgICAgICAgICAgICAgICBfLm1lcmdlKGZsYXRRdWVyeVBhcmFtZXRlcnNbcGFyYW0ubmFtZV0sIHBhcmFtKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXNwb25zZXMgPSByZXNwb25zZXMuY29uY2F0KG0ucmVzcG9uc2VzKCkgYXMgYW55KTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG5cbiAgICAgIHJlc3BvbnNlcyA9IHJlc3BvbnNlcy5jb25jYXQobWV0aG9kLnJlc3BvbnNlcygpIGFzIGFueSk7XG5cbiAgICAgIGxldCBmbGF0UmVzcG9uc2VzOiBBVExIZWxwZXJzLklEaWN0aW9uYXJ5PHtcbiAgICAgICAgc3RhdHVzPzogc3RyaW5nO1xuICAgICAgICBzdGF0dXNBU1Q/OiBSQU1MLmxsLklMb3dMZXZlbEFTVE5vZGU7XG4gICAgICAgIGhlYWRlcnM/OiBBVExIZWxwZXJzLklEaWN0aW9uYXJ5PFJBTUwuYXBpMDguUGFyYW1ldGVyPjtcbiAgICAgICAgYm9kaWVzPzogQVRMSGVscGVycy5JRGljdGlvbmFyeTx7XG4gICAgICAgICAgY29udGVudFR5cGU/OiBzdHJpbmc7XG4gICAgICAgICAgY29udGVudFR5cGVBU1Q/OiBSQU1MLmxsLklMb3dMZXZlbEFTVE5vZGU7XG4gICAgICAgICAgc2NoZW1hPzogUkFNTC5hcGkwOC5TY2hlbWFTdHJpbmc7XG4gICAgICAgICAgc2NoZW1hU3RyaW5nPzogc3RyaW5nO1xuICAgICAgICB9PjtcbiAgICAgIH0+ID0ge307XG5cbiAgICAgIHJlc3BvbnNlcy5mb3JFYWNoKHggPT4ge1xuICAgICAgICBsZXQga2V5ID0geC5jb2RlKCkudmFsdWUoKTtcbiAgICAgICAgbGV0IGZsYXRSZXNwb25zZSA9IGZsYXRSZXNwb25zZXNba2V5XSA9IGZsYXRSZXNwb25zZXNba2V5XSB8fCB7fTtcbiAgICAgICAgZmxhdFJlc3BvbnNlLnN0YXR1cyA9IGtleTtcbiAgICAgICAgZmxhdFJlc3BvbnNlLnN0YXR1c0FTVCA9IHguY29kZSgpLmhpZ2hMZXZlbCgpLmxvd0xldmVsKCk7XG5cbiAgICAgICAgeC5oZWFkZXJzKCkuZm9yRWFjaChoID0+IHtcbiAgICAgICAgICBmbGF0UmVzcG9uc2UuaGVhZGVycyA9IGZsYXRSZXNwb25zZS5oZWFkZXJzIHx8IHt9O1xuICAgICAgICAgIGZsYXRSZXNwb25zZS5oZWFkZXJzW2gubmFtZSgpXSA9IGggfHwgZmxhdFJlc3BvbnNlLmhlYWRlcnNbaC5uYW1lKCldO1xuICAgICAgICB9KTtcblxuICAgICAgICBmbGF0UmVzcG9uc2UuYm9kaWVzID0ge307XG5cbiAgICAgICAgeC5ib2R5KCkuZm9yRWFjaChoID0+IHtcbiAgICAgICAgICBsZXQgY29udGVudFR5cGUgPSBoLm5hbWUoKTtcblxuICAgICAgICAgIGxldCBib2R5ID0gZmxhdFJlc3BvbnNlLmJvZGllc1tjb250ZW50VHlwZV0gPSBmbGF0UmVzcG9uc2UuYm9kaWVzW2NvbnRlbnRUeXBlXSB8fCB7XG4gICAgICAgICAgICBjb250ZW50VHlwZVxuICAgICAgICAgIH07XG5cbiAgICAgICAgICBib2R5LmNvbnRlbnRUeXBlQVNUID0gaC5oaWdoTGV2ZWwoKS5sb3dMZXZlbCgpO1xuXG4gICAgICAgICAgaWYgKGguc2NoZW1hQ29udGVudCgpKSB7XG4gICAgICAgICAgICBib2R5LnNjaGVtYSA9IGguc2NoZW1hKCk7XG4gICAgICAgICAgICBib2R5LnNjaGVtYVN0cmluZyA9IGguc2NoZW1hQ29udGVudCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgaWYgKE9iamVjdC5rZXlzKGZsYXRRdWVyeVBhcmFtZXRlcnMpLmxlbmd0aCkge1xuICAgICAgICBPYmplY3Qua2V5cyhmbGF0UXVlcnlQYXJhbWV0ZXJzKVxuICAgICAgICAgIC5tYXAoa2V5ID0+IGZsYXRRdWVyeVBhcmFtZXRlcnNba2V5XSlcbiAgICAgICAgICAuZm9yRWFjaChxcCA9PiB7XG4gICAgICAgICAgICBtZXRob2RBc3NldGlvbnMuaW5uZXJBc3NlcnRpb25zLnB1c2goXG4gICAgICAgICAgICAgIG5ldyBDb3ZlcmFnZUFzc2VydGlvbigncmVxdWVzdC5xdWVyeVBhcmFtZXRlcjo6JyArIHFwLm5hbWUgKyAnIG11c3QgYmUgcHJlc2VudCBvbiBzb21lIGNhbGwnLCAocmVzdWx0cykgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghcmVzdWx0cy5zb21lKFxuICAgICAgICAgICAgICAgICAgeCA9PlxuICAgICAgICAgICAgICAgICAgICB4LnRlc3QubWV0aG9kLnRvVXBwZXJDYXNlKCkgPT0gbWV0aG9kTmFtZVxuICAgICAgICAgICAgICAgICAgICAmJlxuICAgICAgICAgICAgICAgICAgICB4LnRlc3QucmVxdWVzdC5xdWVyeVBhcmFtZXRlcnNcbiAgICAgICAgICAgICAgICAgICAgJiZcbiAgICAgICAgICAgICAgICAgICAgKHFwLm5hbWUgaW4geC50ZXN0LnJlcXVlc3QucXVlcnlQYXJhbWV0ZXJzKVxuICAgICAgICAgICAgICAgICkpXG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgKHFwLnJlcXVpcmVkID8gRXJyb3IgOiBOb3RJbXBsZW1lbnRlZEVycm9yKShcIlF1ZXJ5IHBhcmFtZXRlciBub3QgcHJlc2VudFwiKTtcbiAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgICAgICBtZXRob2RBc3NldGlvbnMuaW5uZXJBc3NlcnRpb25zLnB1c2goXG4gICAgICAgICAgICAgIG5ldyBDb3ZlcmFnZUFzc2VydGlvbigncmVxdWVzdC5xdWVyeVBhcmFtZXRlcjo6JyArIHFwLm5hbWUgKyAnIG11c3Qgbm90IGJlIHByZXNlbnQnLCAocmVzdWx0cykgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghcmVzdWx0cy5zb21lKFxuICAgICAgICAgICAgICAgICAgeCA9PlxuICAgICAgICAgICAgICAgICAgICB4LnRlc3QubWV0aG9kLnRvVXBwZXJDYXNlKCkgPT0gbWV0aG9kTmFtZVxuICAgICAgICAgICAgICAgICAgICAmJlxuICAgICAgICAgICAgICAgICAgICB4LnRlc3QucmVxdWVzdC5xdWVyeVBhcmFtZXRlcnNcbiAgICAgICAgICAgICAgICAgICAgJiZcbiAgICAgICAgICAgICAgICAgICAgKHFwLm5hbWUgaW4geC50ZXN0LnJlcXVlc3QucXVlcnlQYXJhbWV0ZXJzKVxuICAgICAgICAgICAgICAgICkpXG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgTm90SW1wbGVtZW50ZWRFcnJvcihcIlF1ZXJ5IHBhcmFtZXRlciBub3QgcHJlc2VudFwiKTtcbiAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVzcG9uc2VzLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIG1ldGhvZEFzc2V0aW9ucy5pbm5lckFzc2VydGlvbnMucHVzaChuZXcgQ292ZXJhZ2VBc3NlcnRpb24oJ3Nob3VsZCBoYXZlIGJlZW4gY2FsbGVkJywgKHJlc3VsdHMpID0+IHtcbiAgICAgICAgICBpZiAoIXJlc3VsdHMuc29tZShcbiAgICAgICAgICAgIHggPT4geC50ZXN0Lm1ldGhvZC50b1VwcGVyQ2FzZSgpID09IG1ldGhvZE5hbWVcbiAgICAgICAgICApKVxuICAgICAgICAgICAgdGhyb3cgbmV3IE5vdEltcGxlbWVudGVkRXJyb3IoXCJubyBtYXRjaGluZyByZXF1ZXN0cyBmb3VuZFwiKTtcbiAgICAgICAgfSkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgT2JqZWN0LmtleXMoZmxhdFJlc3BvbnNlcykubWFwKHggPT4gcGFyc2VJbnQoeCkpLmZvckVhY2goc3RhdHVzQ29kZSA9PiB7XG4gICAgICAgICAgbGV0IHJlc3BvbnNlID0gZmxhdFJlc3BvbnNlc1tzdGF0dXNDb2RlXTtcblxuICAgICAgICAgIG1ldGhvZEFzc2V0aW9ucy5pbm5lckFzc2VydGlvbnMucHVzaChcbiAgICAgICAgICAgIG5ldyBDb3ZlcmFnZUFzc2VydGlvbignY2hlY2sgJyArIHN0YXR1c0NvZGUgKyAnIHJlc3BvbnNlJywgKHJlc3VsdHMpID0+IHtcbiAgICAgICAgICAgICAgbGV0IHJlc3BvbnNlcyA9IHJlc3VsdHMuZmlsdGVyKHggPT5cbiAgICAgICAgICAgICAgICB4LnRlc3QucmVzcG9uc2Uuc3RhdHVzID09IHN0YXR1c0NvZGVcbiAgICAgICAgICAgICAgICAmJlxuICAgICAgICAgICAgICAgIHgudGVzdC5tZXRob2QudG9VcHBlckNhc2UoKSA9PSBtZXRob2ROYW1lXG4gICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgaWYgKCFyZXNwb25zZXMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwic3RhdHVzIGNvZGUgXCIgKyBzdGF0dXNDb2RlICsgXCIgbm90IGNvdmVyZWRcIik7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmFjZShcbiAgICAgICAgICAgICAgICAgIHJlc3BvbnNlcy5tYXAoeCA9PiB4LnRlc3QucmVxdWVzdGVyLnByb21pc2UpXG4gICAgICAgICAgICAgICAgKS50aGVuKHggPT4ge1xuICAgICAgICAgICAgICAgICAgaWYgKHguc3RhdHVzICE9IHN0YXR1c0NvZGUpXG4gICAgICAgICAgICAgICAgICAgIHRocm93IEFUTEhlbHBlcnMuZXJyb3JEaWZmKCd1bmV4cGVjdGVkIHJlc3BvbnNlLnN0YXR1cycsIHN0YXR1c0NvZGUsIHguc3RhdHVzLCB4KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSwgcmVzcG9uc2Uuc3RhdHVzQVNUKVxuICAgICAgICAgICk7XG5cbiAgICAgICAgICBsZXQgYWxsQm9kaWVzID0gT2JqZWN0LmtleXMocmVzcG9uc2UuYm9kaWVzKTtcblxuICAgICAgICAgIGxldCByZXNwb25zZUFzc2VydGlvbiA9IG5ldyBDb3ZlcmFnZUFzc2VydGlvbihzdGF0dXNDb2RlLnRvU3RyaW5nKCkpO1xuXG4gICAgICAgICAgbWV0aG9kQXNzZXRpb25zLmlubmVyQXNzZXJ0aW9ucy5wdXNoKHJlc3BvbnNlQXNzZXJ0aW9uKTtcblxuICAgICAgICAgIGFsbEJvZGllcy5mb3JFYWNoKGNvbnRlbnRUeXBlID0+IHtcblxuICAgICAgICAgICAgbGV0IGJvZHlBc3NlcmlvbiA9IG5ldyBDb3ZlcmFnZUFzc2VydGlvbihjb250ZW50VHlwZSk7XG5cbiAgICAgICAgICAgIGxldCBhY3R1YWxCb2R5ID0gcmVzcG9uc2UuYm9kaWVzW2NvbnRlbnRUeXBlXTtcblxuICAgICAgICAgICAgcmVzcG9uc2VBc3NlcnRpb24uaW5uZXJBc3NlcnRpb25zLnB1c2goYm9keUFzc2VyaW9uKTtcblxuICAgICAgICAgICAgYm9keUFzc2VyaW9uLmlubmVyQXNzZXJ0aW9ucy5wdXNoKFxuICAgICAgICAgICAgICBuZXcgQ292ZXJhZ2VBc3NlcnRpb24oJ3Jlc3BvbnNlLmhlYWRlcnM6OmNvbnRlbnQtdHlwZScsIChyZXN1bHRzKSA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IHJlc3BvbnNlcyA9IHJlc3VsdHMuZmlsdGVyKHggPT5cbiAgICAgICAgICAgICAgICAgIHgudGVzdC5yZXNwb25zZS5zdGF0dXMgPT0gc3RhdHVzQ29kZVxuICAgICAgICAgICAgICAgICAgJiZcbiAgICAgICAgICAgICAgICAgIHgudGVzdC5tZXRob2QudG9VcHBlckNhc2UoKSA9PSBtZXRob2ROYW1lXG4gICAgICAgICAgICAgICAgICAmJlxuICAgICAgICAgICAgICAgICAgKHgucmVzcG9uc2UuZ2V0KCdjb250ZW50LXR5cGUnKSB8fCAnJykudG9Mb3dlckNhc2UoKS5pbmRleE9mKGNvbnRlbnRUeXBlLnRvTG93ZXJDYXNlKCkpID09IDBcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGlmICghcmVzcG9uc2VzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgQVRMSGVscGVycy5lcnJvcihcIkNvbnRlbnQtVHlwZSBub3QgY292ZXJlZCAoXCIgKyBjb250ZW50VHlwZSArIFwiKVwiLCByZXNwb25zZXMubWFwKHggPT4geC5yZXNwb25zZS5nZXQoJ2NvbnRlbnQtdHlwZScpKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9LCBhY3R1YWxCb2R5LmNvbnRlbnRUeXBlQVNUKVxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgaWYgKGFjdHVhbEJvZHkuc2NoZW1hU3RyaW5nKSB7XG4gICAgICAgICAgICAgIGxldCB2ID0gdGhpcy5iYXQuYXN0Lm9idGFpblNjaGVtYVZhbGlkYXRvcihhY3R1YWxCb2R5LnNjaGVtYVN0cmluZyk7XG5cbiAgICAgICAgICAgICAgYm9keUFzc2VyaW9uLmlubmVyQXNzZXJ0aW9ucy5wdXNoKFxuICAgICAgICAgICAgICAgIG5ldyBDb3ZlcmFnZUFzc2VydGlvbigncmVzcG9uc2UuYm9keSBzY2hlbWEnLCAocmVzdWx0cykgPT4ge1xuICAgICAgICAgICAgICAgICAgbGV0IHJlc3BvbnNlcyA9IHJlc3VsdHMuZmlsdGVyKHggPT5cbiAgICAgICAgICAgICAgICAgICAgeC50ZXN0LnJlc3BvbnNlLnN0YXR1cyA9PSBzdGF0dXNDb2RlXG4gICAgICAgICAgICAgICAgICAgICYmXG4gICAgICAgICAgICAgICAgICAgIHgudGVzdC5tZXRob2QudG9VcHBlckNhc2UoKSA9PSBtZXRob2ROYW1lXG4gICAgICAgICAgICAgICAgICAgICYmXG4gICAgICAgICAgICAgICAgICAgICh4LnJlc3BvbnNlLmdldCgnY29udGVudC10eXBlJykgfHwgJycpLnRvTG93ZXJDYXNlKCkuaW5kZXhPZihjb250ZW50VHlwZS50b0xvd2VyQ2FzZSgpKSA9PSAwXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmFjZShcbiAgICAgICAgICAgICAgICAgICAgcmVzcG9uc2VzLm1hcCh4ID0+IHgudGVzdC5yZXF1ZXN0ZXIucHJvbWlzZSlcbiAgICAgICAgICAgICAgICAgICkudGhlbigocmVzcG9uc2U6IHJlcXVlc3QuUmVzcG9uc2UpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHZhbGlkYXRpb25SZXN1bHQgPSB2KHJlc3BvbnNlLmJvZHkpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICghdmFsaWRhdGlvblJlc3VsdC52YWxpZCkge1xuICAgICAgICAgICAgICAgICAgICAgIHRocm93IEFUTEhlbHBlcnMuZXJyb3IoKHZhbGlkYXRpb25SZXN1bHQuZXJyb3JzICYmIHZhbGlkYXRpb25SZXN1bHQuZXJyb3JzLm1hcCh4ID0+IFwiICBcIiArIHguc3RhY2spKS5qb2luKCdcXG4nKSB8fCBcIkludmFsaWQgc2NoZW1hXCIsIHJlc3BvbnNlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSwgYWN0dWFsQm9keS5zY2hlbWEuaGlnaExldmVsKCkubG93TGV2ZWwoKSlcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGlmIChyZXNwb25zZS5oZWFkZXJzKSB7XG4gICAgICAgICAgICBsZXQgaGVhZGVycyA9IE9iamVjdC5rZXlzKHJlc3BvbnNlLmhlYWRlcnMpO1xuXG4gICAgICAgICAgICBoZWFkZXJzLmZvckVhY2goaGVhZGVyS2V5ID0+IHtcbiAgICAgICAgICAgICAgbGV0IGhlYWRlck9iamVjdDogUkFNTC5hcGkwOC5QYXJhbWV0ZXIgPSByZXNwb25zZS5oZWFkZXJzW2hlYWRlcktleV07XG5cbiAgICAgICAgICAgICAgaGVhZGVyS2V5ID0gaGVhZGVyS2V5LnRvTG93ZXJDYXNlKCk7XG5cbiAgICAgICAgICAgICAgbWV0aG9kQXNzZXRpb25zLmlubmVyQXNzZXJ0aW9ucy5wdXNoKFxuICAgICAgICAgICAgICAgIG5ldyBDb3ZlcmFnZUFzc2VydGlvbigncmVzcG9uc2UuaGVhZGVyczo6JyArIGhlYWRlcktleSwgKHJlc3VsdHMpID0+IHtcbiAgICAgICAgICAgICAgICAgIGxldCByZXNwb25zZXMgPSByZXN1bHRzLmZpbHRlcih4ID0+XG4gICAgICAgICAgICAgICAgICAgIHgudGVzdC5yZXNwb25zZS5zdGF0dXMgPT0gc3RhdHVzQ29kZVxuICAgICAgICAgICAgICAgICAgICAmJlxuICAgICAgICAgICAgICAgICAgICB4LnRlc3QubWV0aG9kLnRvVXBwZXJDYXNlKCkgPT0gbWV0aG9kTmFtZVxuICAgICAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmFjZShcbiAgICAgICAgICAgICAgICAgICAgcmVzcG9uc2VzLm1hcCh4ID0+IHgudGVzdC5yZXF1ZXN0ZXIucHJvbWlzZSlcbiAgICAgICAgICAgICAgICAgICkudGhlbihcbiAgICAgICAgICAgICAgICAgICAgKHJlc3BvbnNlOiByZXF1ZXN0LlJlc3BvbnNlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgbGV0IHJlY2VpdmVkSGVhZGVycyA9IE9iamVjdC5rZXlzKHJlc3BvbnNlLmhlYWRlcikubWFwKHggPT4geC50b0xvd2VyQ2FzZSgpKTtcblxuICAgICAgICAgICAgICAgICAgICAgIGlmIChyZWNlaXZlZEhlYWRlcnMuaW5kZXhPZihoZWFkZXJLZXkpID09IC0xKVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGhlYWRlck9iamVjdC5vcHRpb25hbCgpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgT3B0aW9uYWxFcnJvcihoZWFkZXJLZXkgKyBcIiBoZWFkZXIgbm90IHJlY2VpdmVkIChPcHRpb25hbClcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IEFUTEhlbHBlcnMuZXJyb3IoaGVhZGVyS2V5ICsgXCIgaGVhZGVyIG5vdCByZWNlaXZlZFwiLCByZWNlaXZlZEhlYWRlcnMpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9LCBoZWFkZXJPYmplY3QuaGlnaExldmVsKCkubG93TGV2ZWwoKSlcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuXG4gIHJlc29sdmUodGVzdDogQVRMSGVscGVycy5BVExUZXN0LCByZXNwb25zZTogcmVxdWVzdC5SZXNwb25zZSkge1xuICAgIHRoaXMucmVzdWx0cy5wdXNoKHtcbiAgICAgIHRlc3QsXG4gICAgICByZXNwb25zZVxuICAgIH0pO1xuICB9XG5cbiAgcmVnaXN0ZXJDb3ZlcmFnZUxpbmUobGluZURhdGE6IHtcbiAgICBmaWxlOiBzdHJpbmc7XG4gICAgbGluZTogbnVtYmVyO1xuICAgIGxpbmVFbmQ6IG51bWJlcjtcbiAgICBzdGFydDogbnVtYmVyO1xuICAgIGVuZDogbnVtYmVyO1xuICAgIGNvdmVyZWQ6IGJvb2xlYW47XG4gIH0pIHtcbiAgICBsZXQgY292ID0gdGhpcy5iYXQuY292ZXJhZ2VEYXRhO1xuXG4gICAgbGV0IGRhdGEgPSAoY292W2xpbmVEYXRhLmZpbGVdID0gY292W2xpbmVEYXRhLmZpbGVdIHx8IHsgc291cmNlOiBbXSB9KTtcblxuICAgIGlmIChsaW5lRGF0YS5saW5lID49IDApIHtcbiAgICAgIHdoaWxlICgobGluZURhdGEubGluZSArIDEpID4gZGF0YS5zb3VyY2UubGVuZ3RoKSB7XG4gICAgICAgIGRhdGEuc291cmNlLnB1c2godW5kZWZpbmVkKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobGluZURhdGEuY292ZXJlZCkge1xuICAgICAgZGF0YS5zb3VyY2VbbGluZURhdGEubGluZV0gPSAoZGF0YS5zb3VyY2VbbGluZURhdGEubGluZV0gYXMgbnVtYmVyIHx8IDApICsgMTtcbiAgICB9IGVsc2Uge1xuICAgICAgZGF0YS5zb3VyY2VbbGluZURhdGEubGluZV0gPSBkYXRhLnNvdXJjZVtsaW5lRGF0YS5saW5lXSB8fCAwO1xuICAgIH1cbiAgfVxuXG4gIGdldENvdmVyYWdlKCk6IFByb21pc2U8eyB0b3RhbDogbnVtYmVyOyBlcnJvcmVkOiBudW1iZXI7IG5vdENvdmVyZWQ6IG51bWJlcjsgfT4ge1xuICAgIGxldCBwcm9tID0gQVRMSGVscGVycy5mbGF0UHJvbWlzZSgpO1xuXG4gICAgbGV0IHRvdGFsID0gMDtcbiAgICBsZXQgbm90Q292ZXJlZCA9IDA7XG4gICAgbGV0IGVycm9yZWQgPSAwO1xuICAgIGxldCBsaW5lcyA9IDA7XG5cbiAgICBjb25zdCB3YWxrID0gKGFzc2VydGlvbjogQ292ZXJhZ2VBc3NlcnRpb24pID0+IHtcbiAgICAgIGlmIChhc3NlcnRpb24udmFsaWRhdGlvbkZuKSB7XG4gICAgICAgIHRvdGFsKys7XG5cbiAgICAgICAgaWYgKCFhc3NlcnRpb24udmFsaWQpIHtcbiAgICAgICAgICBpZiAoYXNzZXJ0aW9uLmVycm9yICYmIChhc3NlcnRpb24uZXJyb3IgaW5zdGFuY2VvZiBOb3RJbXBsZW1lbnRlZEVycm9yKSkge1xuICAgICAgICAgICAgbm90Q292ZXJlZCsrO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlcnJvcmVkKys7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGxldCBjb3ZlcmFnZVJlc3VsdCA9IGFzc2VydGlvbi5nZXRDb3ZlcmFnZSgpO1xuXG4gICAgICBpZiAoY292ZXJhZ2VSZXN1bHQpIHtcbiAgICAgICAgdGhpcy5yZWdpc3RlckNvdmVyYWdlTGluZShjb3ZlcmFnZVJlc3VsdCk7XG4gICAgICAgIGxpbmVzICs9IGNvdmVyYWdlUmVzdWx0LmxpbmVFbmQgLSBjb3ZlcmFnZVJlc3VsdC5saW5lICsgMTtcbiAgICAgIH1cblxuICAgICAgaWYgKGFzc2VydGlvbi5pbm5lckFzc2VydGlvbnMubGVuZ3RoKSB7XG4gICAgICAgIGFzc2VydGlvbi5pbm5lckFzc2VydGlvbnMuZm9yRWFjaCh4ID0+IHdhbGsoeCkpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICBjb25zdCBjYWxjdWxhdGVDb3ZlcmFnZSA9ICgpID0+IHtcbiAgICAgIHdhbGsodGhpcy5yZXNvdXJjZUFzc2VydGlvbik7XG5cbiAgICAgIHByb20ucmVzb2x2ZXIoe1xuICAgICAgICB0b3RhbCxcbiAgICAgICAgZXJyb3JlZCxcbiAgICAgICAgbm90Q292ZXJlZFxuICAgICAgfSk7XG4gICAgfTtcblxuICAgIHRoaXMucmVzb3VyY2VBc3NlcnRpb24ucHJvbWlzZS5wcm9taXNlLnRoZW4oY2FsY3VsYXRlQ292ZXJhZ2UpLmNhdGNoKGNhbGN1bGF0ZUNvdmVyYWdlKTtcblxuICAgIHJldHVybiBwcm9tLnByb21pc2U7XG4gIH1cblxuICBydW4oKSB7XG4gICAgcmV0dXJuIHRoaXMucmVzb3VyY2VBc3NlcnRpb24udmFsaWRhdGUodGhpcy5yZXN1bHRzKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgTm90SW1wbGVtZW50ZWRFcnJvciBleHRlbmRzIEVycm9yIHtcbiAgY29uc3RydWN0b3IobWVzc2FnZTogc3RyaW5nKSB7XG4gICAgc3VwZXIobWVzc2FnZSk7XG4gICAgdGhpcy5tZXNzYWdlID0gbWVzc2FnZTtcbiAgICB0aGlzLm5hbWUgPSBcIk1ldGhvZCBub3QgaW1wbGVtZW50ZWRcIjtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgT3B0aW9uYWxFcnJvciBleHRlbmRzIEVycm9yIHtcbiAgY29uc3RydWN0b3IobWVzc2FnZTogc3RyaW5nKSB7XG4gICAgc3VwZXIobWVzc2FnZSk7XG4gICAgdGhpcy5tZXNzYWdlID0gbWVzc2FnZTtcbiAgICB0aGlzLm5hbWUgPSBcIk9wdGlvbmFsIEVycm9yXCI7XG4gIH1cbn0iXX0=