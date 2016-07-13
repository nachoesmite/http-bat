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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ292ZXJhZ2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJDb3ZlcmFnZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFJQSxJQUFPLElBQUksV0FBVyxNQUFNLENBQUMsQ0FBQztBQUk5QixJQUFPLENBQUMsV0FBVyxRQUFRLENBQUMsQ0FBQztBQUk3QixJQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDekMsSUFBTSxTQUFTLEdBQUcsT0FBTyxDQUFDLGlCQUFpQixDQUFDLENBQUM7QUFJN0MsSUFBTyxVQUFVLFdBQVcsY0FBYyxDQUFDLENBQUM7QUFXNUM7SUFhRSwyQkFBbUIsSUFBWSxFQUFTLFlBQTBELEVBQVUsV0FBc0M7UUFicEosaUJBeUdDO1FBNUZvQixTQUFJLEdBQUosSUFBSSxDQUFRO1FBQVMsaUJBQVksR0FBWixZQUFZLENBQThDO1FBQVUsZ0JBQVcsR0FBWCxXQUFXLENBQTJCO1FBVmxKLFVBQUssR0FBWSxJQUFJLENBQUM7UUFDdEIsb0JBQWUsR0FBd0IsRUFBRSxDQUFDO1FBQzFDLFlBQU8sR0FBRyxVQUFVLENBQUMsV0FBVyxFQUFFLENBQUM7UUFTakMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPO2FBQ2pCLElBQUksQ0FBQyxVQUFBLENBQUM7WUFDTCxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNOLEtBQUksQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDO2dCQUNmLEtBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO2dCQUNuQixNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMzQixDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ04sT0FBTyxLQUFJLENBQUMsS0FBSyxDQUFDO2dCQUNsQixLQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztnQkFDbEIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FB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UUFBUSxDQUFDO2dCQUNaLE9BQUEsS0FBSztnQkFDTCxTQUFBLE9BQU87Z0JBQ1AsWUFBQSxVQUFVO2FBQ1gsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDO1FBRUYsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFFeEYsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUM7SUFDdEIsQ0FBQztJQUVELDhCQUFHLEdBQUg7UUFDRSxNQUFNLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDdkQsQ0FBQztJQUNILHVCQUFDO0FBQUQsQ0FBQyxBQTlYRCxJQThYQztBQTlYWSx3QkFBZ0IsbUJBOFg1QixDQUFBO0FBRUQ7SUFBeUMsdUNBQUs7SUFDNUMsNkJBQVksT0FBZTtRQUN6QixrQkFBTSxPQUFPLENBQUMsQ0FBQztRQUNmLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxJQUFJLEdBQUcsd0JBQXdCLENBQUM7SUFDdkMsQ0FBQztJQUNILDBCQUFDO0FBQUQsQ0FBQyxBQU5ELENBQXlDLEtBQUssR0FNN0M7QUFOWSwyQkFBbUIsc0JBTS9CLENBQUE7QUFFRDtJQUFtQyxpQ0FBSztJQUN0Qyx1QkFBWSxPQUFlO1FBQ3pCLGtCQUFNLE9BQU8sQ0FBQyxDQUFDO1FBQ2YsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7UUFDdkIsSUFBSSxDQUFDLElBQUksR0FBRyxnQkFBZ0IsQ0FBQztJQUMvQixDQUFDO0lBQ0gsb0JBQUM7QUFBRCxDQUFDLEFBTkQsQ0FBbUMsS0FBSyxHQU12QztBQU5ZLHFCQUFhLGdCQU16QixDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiLy8gTm9kZVxuaW1wb3J0IGZzID0gcmVxdWlyZSgnZnMnKTtcbmltcG9ydCBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuaW1wb3J0IHVybCA9IHJlcXVpcmUoJ3VybCcpO1xuaW1wb3J0IHV0aWwgPSByZXF1aXJlKCd1dGlsJyk7XG5cbi8vIE5QTVxuaW1wb3J0IGpzWWFtbCA9IHJlcXVpcmUoJ2pzLXlhbWwnKTtcbmltcG9ydCBfID0gcmVxdWlyZSgnbG9kYXNoJyk7XG5pbXBvcnQgcmVxdWVzdCA9IHJlcXVpcmUoJ3N1cGVydGVzdCcpO1xuaW1wb3J0IGV4cGVjdCA9IHJlcXVpcmUoJ2V4cGVjdCcpO1xuaW1wb3J0IFJBTUwgPSByZXF1aXJlKCdyYW1sLTEtcGFyc2VyJyk7XG5jb25zdCBqc29uc2NoZW1hID0gcmVxdWlyZSgnanNvbnNjaGVtYScpO1xuY29uc3QgcGF0aE1hdGNoID0gcmVxdWlyZSgncmFtbC1wYXRoLW1hdGNoJyk7XG5cbi8vIExvY2Fsc1xuaW1wb3J0IEFUTCA9IHJlcXVpcmUoJy4vQVRMJyk7XG5pbXBvcnQgQVRMSGVscGVycyA9IHJlcXVpcmUoJy4vQVRMSGVscGVycycpO1xuXG5pbXBvcnQge0JhdH0gZnJvbSAnLi9iYXQnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0UmVzdWx0IHtcbiAgdGVzdDogQVRMSGVscGVycy5BVExUZXN0O1xuICByZXNwb25zZTogcmVxdWVzdC5SZXNwb25zZTtcbn1cblxuXG5cbmV4cG9ydCBjbGFzcyBDb3ZlcmFnZUFzc2VydGlvbiB7XG5cbiAgZXJyb3I6IEVycm9yO1xuICB2YWxpZDogYm9vbGVhbiA9IG51bGw7XG4gIGlubmVyQXNzZXJ0aW9uczogQ292ZXJhZ2VBc3NlcnRpb25bXSA9IFtdO1xuICBwcm9taXNlID0gQVRMSGVscGVycy5mbGF0UHJvbWlzZSgpO1xuXG4gIHNyY19maWxlOiBzdHJpbmc7XG4gIHNyY19saW5lOiBudW1iZXI7XG4gIHNyY19saW5lX2VuZDogbnVtYmVyO1xuICBzcmNfc3RhcnQ6IG51bWJlcjtcbiAgc3JjX2VuZDogbnVtYmVyO1xuXG4gIGNvbnN0cnVjdG9yKHB1YmxpYyBuYW1lOiBzdHJpbmcsIHB1YmxpYyB2YWxpZGF0aW9uRm4/OiAocmVzOiBJVGVzdFJlc3VsdFtdKSA9PiBQcm9taXNlPGFueT4gfCB2b2lkLCBwcml2YXRlIGxvd0xldmVsQVNUPzogUkFNTC5sbC5JTG93TGV2ZWxBU1ROb2RlKSB7XG4gICAgdGhpcy5wcm9taXNlLnByb21pc2VcbiAgICAgIC50aGVuKHggPT4ge1xuICAgICAgICBpZiAoeCkge1xuICAgICAgICAgIHRoaXMuZXJyb3IgPSB4O1xuICAgICAgICAgIHRoaXMudmFsaWQgPSBmYWxzZTtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoeCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuZXJyb3I7XG4gICAgICAgICAgdGhpcy52YWxpZCA9IHRydWU7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmNhdGNoKHggPT4ge1xuICAgICAgICB0aGlzLmVycm9yID0geDtcbiAgICAgICAgdGhpcy52YWxpZCA9IGZhbHNlO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoeCk7XG4gICAgICB9KTtcblxuICAgIGlmIChsb3dMZXZlbEFTVCkge1xuICAgICAgdGhpcy5zcmNfZmlsZSA9IGxvd0xldmVsQVNULnVuaXQoKS5hYnNvbHV0ZVBhdGgoKTtcbiAgICAgIGlmICh0aGlzLnNyY19maWxlKSB7XG4gICAgICAgIHRoaXMuc3JjX2xpbmUgPSBsb3dMZXZlbEFTVC51bml0KCkubGluZU1hcHBlcigpLnBvc2l0aW9uKGxvd0xldmVsQVNULnN0YXJ0KCkpLmxpbmU7XG4gICAgICAgIHRoaXMuc3JjX2xpbmVfZW5kID0gbG93TGV2ZWxBU1QudW5pdCgpLmxpbmVNYXBwZXIoKS5wb3NpdGlvbihsb3dMZXZlbEFTVC5lbmQoKSkubGluZTtcbiAgICAgICAgdGhpcy5zcmNfc3RhcnQgPSBsb3dMZXZlbEFTVC5zdGFydCgpO1xuICAgICAgICB0aGlzLnNyY19lbmQgPSBsb3dMZXZlbEFTVC5lbmQoKTtcbiAgICAgIH1cbiAgICAgIC8vIGNvbnNvbGUubG9nKG5hbWUsIHRoaXMuc3JjX2ZpbGUgKyAnIycgKyAodGhpcy5zcmNfbGluZSArIDEpICsgJyB0byAnICsgKHRoaXMuc3JjX2xpbmVfZW5kICsgMSkpO1xuICAgIH1cbiAgfVxuXG4gIGdldENvdmVyYWdlKCkge1xuICAgIGlmICh0aGlzLnNyY19maWxlKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBmaWxlOiB0aGlzLnNyY19maWxlLFxuICAgICAgICBsaW5lOiB0aGlzLnNyY19saW5lLFxuICAgICAgICBsaW5lRW5kOiB0aGlzLnNyY19saW5lX2VuZCxcbiAgICAgICAgc3RhcnQ6IHRoaXMuc3JjX3N0YXJ0LFxuICAgICAgICBlbmQ6IHRoaXMuc3JjX2VuZCxcbiAgICAgICAgY292ZXJlZDogdGhpcy52YWxpZFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICB2YWxpZGF0ZShyZXM6IElUZXN0UmVzdWx0W10pOiBQcm9taXNlPGFueT4ge1xuXG4gICAgbGV0IHdhaXRGb3JJbm5lcjogUHJvbWlzZTxhbnk+ID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cblxuICAgIHRyeSB7XG4gICAgICBpZiAoIXJlcyB8fCAhcmVzLmxlbmd0aCkge1xuICAgICAgICB0aHJvdyBuZXcgTm90SW1wbGVtZW50ZWRFcnJvcihcIk5vIG1hdGNoaW5nIHJlc3VsdHNcIik7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLnZhbGlkYXRpb25Gbikge1xuICAgICAgICBsZXQgYWN0dWFsUmVzdWx0ID0gdGhpcy52YWxpZGF0aW9uRm4ocmVzKSBhcyBhbnk7XG5cbiAgICAgICAgaWYgKGFjdHVhbFJlc3VsdCkge1xuICAgICAgICAgIGlmICghKGFjdHVhbFJlc3VsdCBpbnN0YW5jZW9mIFByb21pc2UpKSB7XG4gICAgICAgICAgICB0aGlzLnByb21pc2UucmVqZWN0ZXIobmV3IEVycm9yKHRoaXMubmFtZSArIFwiIGRvZXMgbm90IHJldHVybiBhIFByb21pc2UsIGdvdCBcIiArIHV0aWwuaW5zcGVjdChhY3R1YWxSZXN1bHQpKSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGFjdHVhbFJlc3VsdFxuICAgICAgICAgICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgIHRoaXMucHJvbWlzZS5yZWplY3RlcihyZXN1bHQpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICB0aGlzLnByb21pc2UucmVzb2x2ZXIoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMucHJvbWlzZS5yZWplY3RlcihlcnIpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5wcm9taXNlLnJlc29sdmVyKCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMucHJvbWlzZS5yZXNvbHZlcigpO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHRoaXMucHJvbWlzZS5yZWplY3RlcihlKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5pbm5lckFzc2VydGlvbnMubGVuZ3RoKSB7XG4gICAgICB3YWl0Rm9ySW5uZXIgPSBQcm9taXNlLmFsbCh0aGlzLmlubmVyQXNzZXJ0aW9ucy5tYXAoeCA9PiB4LnZhbGlkYXRlKHJlcykpKTtcbiAgICB9XG5cbiAgICAvLyBUSElTIE1FVE9EIE1VU1QgUkVTT0xWRSBFVkVSWSBUSU1FXG4gICAgcmV0dXJuIHRoaXMucHJvbWlzZS5wcm9taXNlXG4gICAgICAudGhlbihlcnJvciA9PiB3YWl0Rm9ySW5uZXIudGhlbigoKSA9PiBlcnJvcikpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4gd2FpdEZvcklubmVyLnRoZW4oKCkgPT4gUHJvbWlzZS5yZXNvbHZlKGVycm9yKSkpO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBDb3ZlcmFnZVJlc291cmNlIHtcbiAgcmVsYXRpdmVVcmw6IHN0cmluZztcbiAgbWF0Y2hlczogKHN0cjogc3RyaW5nKSA9PiBib29sZWFuIHwgYW55O1xuXG4gIHJlc3VsdHM6IElUZXN0UmVzdWx0W10gPSBbXTtcblxuICBjb3ZlcmFnZVRyZWU6IEFUTEhlbHBlcnMuSURpY3Rpb25hcnk8YW55PiA9IHt9O1xuXG4gIHJlc291cmNlSlNPTiA9IG51bGw7XG5cbiAgdXJpUGFyYW1ldGVyczogYW55W10gPSBbXTtcblxuICBjb25zdHJ1Y3RvcihwdWJsaWMgcmVzb3VyY2U6IFJBTUwuYXBpMDguUmVzb3VyY2UsIHB1YmxpYyBiYXQ6IEJhdCkge1xuICAgIHRoaXMucmVsYXRpdmVVcmwgPSByZXNvdXJjZS5jb21wbGV0ZVJlbGF0aXZlVXJpKCk7XG5cbiAgICB0aGlzLnVyaVBhcmFtZXRlcnMgPSByZXNvdXJjZS5hYnNvbHV0ZVVyaVBhcmFtZXRlcnMoKS5tYXAoeCA9PiB4LnRvSlNPTigpKTtcblxuICAgIHRoaXMubWF0Y2hlcyA9IHBhdGhNYXRjaCh0aGlzLnJlbGF0aXZlVXJsLCB0aGlzLnVyaVBhcmFtZXRlcnMpO1xuICAgIHRoaXMuZ2VuZXJhdGVBc3NlcnRpb25zKCk7XG4gIH1cblxuICByZXNvdXJjZUFzc2VydGlvbjogQ292ZXJhZ2VBc3NlcnRpb247XG5cbiAgcHJpdmF0ZSBnZW5lcmF0ZUFzc2VydGlvbnMoKSB7XG5cbiAgICB0aGlzLnJlc291cmNlQXNzZXJ0aW9uID0gbmV3IENvdmVyYWdlQXNzZXJ0aW9uKHRoaXMucmVzb3VyY2UuY29tcGxldGVSZWxhdGl2ZVVyaSgpKTtcblxuXG4gICAgbGV0IG1ldGhvZHMgPSBbXTtcblxuICAgIGxldCB0eXBlID0gdGhpcy5yZXNvdXJjZS50eXBlKCk7XG5cbiAgICBtZXRob2RzID0gbWV0aG9kcy5jb25jYXQodGhpcy5yZXNvdXJjZS5tZXRob2RzKCkpO1xuXG4gICAgaWYgKG1ldGhvZHMubGVuZ3RoID09IDApIHtcbiAgICAgIGlmICh0eXBlKSB7XG4gICAgICAgIGxldCByZXNvdXJjZVR5cGUgPSB0eXBlLnJlc291cmNlVHlwZSgpO1xuXG4gICAgICAgIGlmIChyZXNvdXJjZVR5cGUpIHtcbiAgICAgICAgICBtZXRob2RzID0gbWV0aG9kcy5jb25jYXQocmVzb3VyY2VUeXBlLm1ldGhvZHMoKSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBjb25zb2xlLmxvZyh1dGlsLmluc3BlY3QodGhpcy5yZXNvdXJjZS50b0pTT04oKSwgZmFsc2UsIDEwLCB0cnVlKSk7XG5cbiAgICBtZXRob2RzLmZvckVhY2gobWV0aG9kID0+IHtcbiAgICAgIGxldCBtZXRob2ROYW1lID0gbWV0aG9kLm1ldGhvZCgpLnRvVXBwZXJDYXNlKCk7XG4gICAgICBsZXQgbWV0aG9kSnNvbiA9IG1ldGhvZC50b0pTT04oKTtcbiAgICAgIGxldCBtZXRob2RBc3NldGlvbnMgPSBuZXcgQ292ZXJhZ2VBc3NlcnRpb24obWV0aG9kTmFtZSwgbnVsbCwgbWV0aG9kLmhpZ2hMZXZlbCgpLmxvd0xldmVsKCkpO1xuXG4gICAgICB0aGlzLnJlc291cmNlQXNzZXJ0aW9uLmlubmVyQXNzZXJ0aW9ucy5wdXNoKG1ldGhvZEFzc2V0aW9ucyk7XG5cbiAgICAgIGxldCByZXNwb25zZXM6IFJBTUwuYXBpMDguUmVzcG9uc2VbXSA9IFtdO1xuICAgICAgbGV0IGZsYXRRdWVyeVBhcmFtZXRlcnM6IEFUTEhlbHBlcnMuSURpY3Rpb25hcnk8YW55PiA9IHt9O1xuXG4gICAgICBpZiAodGhpcy5iYXQuYXN0Lm9wdGlvbnMucmFtbC50cmFpdHMpIHtcbiAgICAgICAgbGV0IHRyYWl0cyA9IG1ldGhvZC5pcygpO1xuICAgICAgICBmb3IgKGxldCB0cmFpdEluZGV4ID0gMDsgdHJhaXRJbmRleCA8IHRyYWl0cy5sZW5ndGg7IHRyYWl0SW5kZXgrKykge1xuICAgICAgICAgIGxldCB0cmFpdCA9IHRyYWl0c1t0cmFpdEluZGV4XTtcblxuICAgICAgICAgIGxldCB0cmFpdEpTT04gPSB0cmFpdC50cmFpdCgpLnRvSlNPTigpO1xuICAgICAgICAgIGxldCB0cmFpdE5hbWUgPSB0cmFpdC5uYW1lKCk7XG5cbiAgICAgICAgICBpZiAodHJhaXRKU09OW3RyYWl0TmFtZV0ucXVlcnlQYXJhbWV0ZXJzKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBuYW1lIGluIHRyYWl0SlNPTlt0cmFpdE5hbWVdLnF1ZXJ5UGFyYW1ldGVycykge1xuICAgICAgICAgICAgICBsZXQgcGFyYW0gPSB0cmFpdEpTT05bdHJhaXROYW1lXS5xdWVyeVBhcmFtZXRlcnNbbmFtZV07XG4gICAgICAgICAgICAgIGZsYXRRdWVyeVBhcmFtZXRlcnNbcGFyYW0ubmFtZV0gPSBmbGF0UXVlcnlQYXJhbWV0ZXJzW3BhcmFtLm5hbWVdIHx8IHt9O1xuICAgICAgICAgICAgICBfLm1lcmdlKGZsYXRRdWVyeVBhcmFtZXRlcnNbcGFyYW0ubmFtZV0sIHBhcmFtKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgIH1cblxuICAgICAgICAgIHJlc3BvbnNlcyA9IHJlc3BvbnNlcy5jb25jYXQodHJhaXQudHJhaXQoKS5yZXNwb25zZXMoKSBhcyBhbnkpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLmJhdC5hc3Qub3B0aW9ucy5yYW1sLnJlc291cmNlVHlwZXMpIHtcbiAgICAgICAgaWYgKHR5cGUpIHtcbiAgICAgICAgICBsZXQgdHlwZU1ldGhvZHMgPSB0eXBlLnJlc291cmNlVHlwZSgpLm1ldGhvZHMoKSBhcyBSQU1MLmFwaTA4Lk1ldGhvZFtdO1xuXG4gICAgICAgICAgdHlwZU1ldGhvZHMgPSB0eXBlTWV0aG9kcy5maWx0ZXIoeCA9PiB4Lm1ldGhvZCgpLnRvVXBwZXJDYXNlKCkgPT0gbWV0aG9kLm1ldGhvZCgpLnRvVXBwZXJDYXNlKCkpO1xuICAgICAgICAgIHR5cGVNZXRob2RzLmZvckVhY2gobSA9PiB7XG4gICAgICAgICAgICBsZXQgdHlwZU1ldGhvZEpzb24gPSBtLnRvSlNPTigpW20ubWV0aG9kKCkudG9Mb3dlckNhc2UoKV07XG5cbiAgICAgICAgICAgIGlmICh0eXBlTWV0aG9kSnNvbi5xdWVyeVBhcmFtZXRlcnMpIHtcbiAgICAgICAgICAgICAgZm9yIChsZXQgbmFtZSBpbiB0eXBlTWV0aG9kSnNvbi5xdWVyeVBhcmFtZXRlcnMpIHtcbiAgICAgICAgICAgICAgICBsZXQgcGFyYW0gPSB0eXBlTWV0aG9kSnNvbi5xdWVyeVBhcmFtZXRlcnNbbmFtZV07XG4gICAgICAgICAgICAgICAgZmxhdFF1ZXJ5UGFyYW1ldGVyc1twYXJhbS5uYW1lXSA9IGZsYXRRdWVyeVBhcmFtZXRlcnNbcGFyYW0ubmFtZV0gfHwge307XG4gICAgICAgICAgICAgICAgXy5tZXJnZShmbGF0UXVlcnlQYXJhbWV0ZXJzW3BhcmFtLm5hbWVdLCBwYXJhbSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmVzcG9uc2VzID0gcmVzcG9uc2VzLmNvbmNhdChtLnJlc3BvbnNlcygpIGFzIGFueSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuXG4gICAgICByZXNwb25zZXMgPSByZXNwb25zZXMuY29uY2F0KG1ldGhvZC5yZXNwb25zZXMoKSBhcyBhbnkpO1xuXG4gICAgICBsZXQgZmxhdFJlc3BvbnNlczogQVRMSGVscGVycy5JRGljdGlvbmFyeTx7XG4gICAgICAgIHN0YXR1cz86IHN0cmluZztcbiAgICAgICAgc3RhdHVzQVNUPzogUkFNTC5sbC5JTG93TGV2ZWxBU1ROb2RlO1xuICAgICAgICBoZWFkZXJzPzogQVRMSGVscGVycy5JRGljdGlvbmFyeTxSQU1MLmFwaTA4LlBhcmFtZXRlcj47XG4gICAgICAgIGJvZGllcz86IEFUTEhlbHBlcnMuSURpY3Rpb25hcnk8e1xuICAgICAgICAgIGNvbnRlbnRUeXBlPzogc3RyaW5nO1xuICAgICAgICAgIGNvbnRlbnRUeXBlQVNUPzogUkFNTC5sbC5JTG93TGV2ZWxBU1ROb2RlO1xuICAgICAgICAgIHNjaGVtYT86IFJBTUwuYXBpMDguU2NoZW1hU3RyaW5nO1xuICAgICAgICAgIHNjaGVtYVN0cmluZz86IHN0cmluZztcbiAgICAgICAgfT47XG4gICAgICB9PiA9IHt9O1xuXG4gICAgICByZXNwb25zZXMuZm9yRWFjaCh4ID0+IHtcbiAgICAgICAgbGV0IGtleSA9IHguY29kZSgpLnZhbHVlKCk7XG4gICAgICAgIGxldCBmbGF0UmVzcG9uc2UgPSBmbGF0UmVzcG9uc2VzW2tleV0gPSBmbGF0UmVzcG9uc2VzW2tleV0gfHwge307XG4gICAgICAgIGZsYXRSZXNwb25zZS5zdGF0dXMgPSBrZXk7XG4gICAgICAgIGZsYXRSZXNwb25zZS5zdGF0dXNBU1QgPSB4LmNvZGUoKS5oaWdoTGV2ZWwoKS5sb3dMZXZlbCgpO1xuXG4gICAgICAgIHguaGVhZGVycygpLmZvckVhY2goaCA9PiB7XG4gICAgICAgICAgZmxhdFJlc3BvbnNlLmhlYWRlcnMgPSBmbGF0UmVzcG9uc2UuaGVhZGVycyB8fCB7fTtcbiAgICAgICAgICBmbGF0UmVzcG9uc2UuaGVhZGVyc1toLm5hbWUoKV0gPSBoIHx8IGZsYXRSZXNwb25zZS5oZWFkZXJzW2gubmFtZSgpXTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgZmxhdFJlc3BvbnNlLmJvZGllcyA9IHt9O1xuXG4gICAgICAgIHguYm9keSgpLmZvckVhY2goaCA9PiB7XG4gICAgICAgICAgbGV0IGNvbnRlbnRUeXBlID0gaC5uYW1lKCk7XG5cbiAgICAgICAgICBsZXQgYm9keSA9IGZsYXRSZXNwb25zZS5ib2RpZXNbY29udGVudFR5cGVdID0gZmxhdFJlc3BvbnNlLmJvZGllc1tjb250ZW50VHlwZV0gfHwge1xuICAgICAgICAgICAgY29udGVudFR5cGVcbiAgICAgICAgICB9O1xuXG4gICAgICAgICAgYm9keS5jb250ZW50VHlwZUFTVCA9IGguaGlnaExldmVsKCkubG93TGV2ZWwoKTtcblxuICAgICAgICAgIGlmIChoLnNjaGVtYUNvbnRlbnQoKSkge1xuICAgICAgICAgICAgYm9keS5zY2hlbWEgPSBoLnNjaGVtYSgpO1xuICAgICAgICAgICAgYm9keS5zY2hlbWFTdHJpbmcgPSBoLnNjaGVtYUNvbnRlbnQoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIGlmIChPYmplY3Qua2V5cyhmbGF0UXVlcnlQYXJhbWV0ZXJzKS5sZW5ndGgpIHtcbiAgICAgICAgT2JqZWN0LmtleXMoZmxhdFF1ZXJ5UGFyYW1ldGVycylcbiAgICAgICAgICAubWFwKGtleSA9PiBmbGF0UXVlcnlQYXJhbWV0ZXJzW2tleV0pXG4gICAgICAgICAgLmZvckVhY2gocXAgPT4ge1xuICAgICAgICAgICAgbWV0aG9kQXNzZXRpb25zLmlubmVyQXNzZXJ0aW9ucy5wdXNoKFxuICAgICAgICAgICAgICBuZXcgQ292ZXJhZ2VBc3NlcnRpb24oJ3JlcXVlc3QucXVlcnlQYXJhbWV0ZXI6OicgKyBxcC5uYW1lICsgJyBtdXN0IGJlIHByZXNlbnQgb24gc29tZSBjYWxsJywgKHJlc3VsdHMpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdHMuc29tZShcbiAgICAgICAgICAgICAgICAgIHggPT5cbiAgICAgICAgICAgICAgICAgICAgeC50ZXN0Lm1ldGhvZC50b1VwcGVyQ2FzZSgpID09IG1ldGhvZE5hbWVcbiAgICAgICAgICAgICAgICAgICAgJiZcbiAgICAgICAgICAgICAgICAgICAgeC50ZXN0LnJlcXVlc3QucXVlcnlQYXJhbWV0ZXJzXG4gICAgICAgICAgICAgICAgICAgICYmXG4gICAgICAgICAgICAgICAgICAgIChxcC5uYW1lIGluIHgudGVzdC5yZXF1ZXN0LnF1ZXJ5UGFyYW1ldGVycylcbiAgICAgICAgICAgICAgICApKVxuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IChxcC5yZXF1aXJlZCA/IEVycm9yIDogTm90SW1wbGVtZW50ZWRFcnJvcikoXCJRdWVyeSBwYXJhbWV0ZXIgbm90IHByZXNlbnRcIik7XG4gICAgICAgICAgICAgIH0pKTtcblxuICAgICAgICAgICAgbWV0aG9kQXNzZXRpb25zLmlubmVyQXNzZXJ0aW9ucy5wdXNoKFxuICAgICAgICAgICAgICBuZXcgQ292ZXJhZ2VBc3NlcnRpb24oJ3JlcXVlc3QucXVlcnlQYXJhbWV0ZXI6OicgKyBxcC5uYW1lICsgJyBtdXN0IG5vdCBiZSBwcmVzZW50JywgKHJlc3VsdHMpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdHMuc29tZShcbiAgICAgICAgICAgICAgICAgIHggPT5cbiAgICAgICAgICAgICAgICAgICAgeC50ZXN0Lm1ldGhvZC50b1VwcGVyQ2FzZSgpID09IG1ldGhvZE5hbWVcbiAgICAgICAgICAgICAgICAgICAgJiZcbiAgICAgICAgICAgICAgICAgICAgeC50ZXN0LnJlcXVlc3QucXVlcnlQYXJhbWV0ZXJzXG4gICAgICAgICAgICAgICAgICAgICYmXG4gICAgICAgICAgICAgICAgICAgIChxcC5uYW1lIGluIHgudGVzdC5yZXF1ZXN0LnF1ZXJ5UGFyYW1ldGVycylcbiAgICAgICAgICAgICAgICApKVxuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IE5vdEltcGxlbWVudGVkRXJyb3IoXCJRdWVyeSBwYXJhbWV0ZXIgbm90IHByZXNlbnRcIik7XG4gICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgaWYgKHJlc3BvbnNlcy5sZW5ndGggPT0gMCkge1xuICAgICAgICBtZXRob2RBc3NldGlvbnMuaW5uZXJBc3NlcnRpb25zLnB1c2gobmV3IENvdmVyYWdlQXNzZXJ0aW9uKCdzaG91bGQgaGF2ZSBiZWVuIGNhbGxlZCcsIChyZXN1bHRzKSA9PiB7XG4gICAgICAgICAgaWYgKCFyZXN1bHRzLnNvbWUoXG4gICAgICAgICAgICB4ID0+IHgudGVzdC5tZXRob2QudG9VcHBlckNhc2UoKSA9PSBtZXRob2ROYW1lXG4gICAgICAgICAgKSlcbiAgICAgICAgICAgIHRocm93IG5ldyBOb3RJbXBsZW1lbnRlZEVycm9yKFwibm8gbWF0Y2hpbmcgcmVxdWVzdHMgZm91bmRcIik7XG4gICAgICAgIH0pKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIE9iamVjdC5rZXlzKGZsYXRSZXNwb25zZXMpLm1hcCh4ID0+IHBhcnNlSW50KHgpKS5mb3JFYWNoKHN0YXR1c0NvZGUgPT4ge1xuICAgICAgICAgIGxldCByZXNwb25zZSA9IGZsYXRSZXNwb25zZXNbc3RhdHVzQ29kZV07XG5cbiAgICAgICAgICBtZXRob2RBc3NldGlvbnMuaW5uZXJBc3NlcnRpb25zLnB1c2goXG4gICAgICAgICAgICBuZXcgQ292ZXJhZ2VBc3NlcnRpb24oJ2NoZWNrICcgKyBzdGF0dXNDb2RlICsgJyByZXNwb25zZScsIChyZXN1bHRzKSA9PiB7XG4gICAgICAgICAgICAgIGxldCByZXNwb25zZXMgPSByZXN1bHRzLmZpbHRlcih4ID0+XG4gICAgICAgICAgICAgICAgeC50ZXN0LnJlc3BvbnNlLnN0YXR1cyA9PSBzdGF0dXNDb2RlXG4gICAgICAgICAgICAgICAgJiZcbiAgICAgICAgICAgICAgICB4LnRlc3QubWV0aG9kLnRvVXBwZXJDYXNlKCkgPT0gbWV0aG9kTmFtZVxuICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgIGlmICghcmVzcG9uc2VzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcInN0YXR1cyBjb2RlIFwiICsgc3RhdHVzQ29kZSArIFwiIG5vdCBjb3ZlcmVkXCIpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJhY2UoXG4gICAgICAgICAgICAgICAgICByZXNwb25zZXMubWFwKHggPT4geC50ZXN0LnJlcXVlc3Rlci5wcm9taXNlKVxuICAgICAgICAgICAgICAgICkudGhlbih4ID0+IHtcbiAgICAgICAgICAgICAgICAgIGlmICh4LnN0YXR1cyAhPSBzdGF0dXNDb2RlKVxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBBVExIZWxwZXJzLmVycm9yRGlmZigndW5leHBlY3RlZCByZXNwb25zZS5zdGF0dXMnLCBzdGF0dXNDb2RlLCB4LnN0YXR1cywgeCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sIHJlc3BvbnNlLnN0YXR1c0FTVClcbiAgICAgICAgICApO1xuXG4gICAgICAgICAgbGV0IGFsbEJvZGllcyA9IE9iamVjdC5rZXlzKHJlc3BvbnNlLmJvZGllcyk7XG5cbiAgICAgICAgICBsZXQgcmVzcG9uc2VBc3NlcnRpb24gPSBuZXcgQ292ZXJhZ2VBc3NlcnRpb24oc3RhdHVzQ29kZS50b1N0cmluZygpKTtcblxuICAgICAgICAgIG1ldGhvZEFzc2V0aW9ucy5pbm5lckFzc2VydGlvbnMucHVzaChyZXNwb25zZUFzc2VydGlvbik7XG5cbiAgICAgICAgICBhbGxCb2RpZXMuZm9yRWFjaChjb250ZW50VHlwZSA9PiB7XG5cbiAgICAgICAgICAgIGxldCBib2R5QXNzZXJpb24gPSBuZXcgQ292ZXJhZ2VBc3NlcnRpb24oY29udGVudFR5cGUpO1xuXG4gICAgICAgICAgICBsZXQgYWN0dWFsQm9keSA9IHJlc3BvbnNlLmJvZGllc1tjb250ZW50VHlwZV07XG5cbiAgICAgICAgICAgIHJlc3BvbnNlQXNzZXJ0aW9uLmlubmVyQXNzZXJ0aW9ucy5wdXNoKGJvZHlBc3Nlcmlvbik7XG5cbiAgICAgICAgICAgIGJvZHlBc3Nlcmlvbi5pbm5lckFzc2VydGlvbnMucHVzaChcbiAgICAgICAgICAgICAgbmV3IENvdmVyYWdlQXNzZXJ0aW9uKCdyZXNwb25zZS5oZWFkZXJzOjpjb250ZW50LXR5cGUnLCAocmVzdWx0cykgPT4ge1xuICAgICAgICAgICAgICAgIGxldCByZXNwb25zZXMgPSByZXN1bHRzLmZpbHRlcih4ID0+XG4gICAgICAgICAgICAgICAgICB4LnRlc3QucmVzcG9uc2Uuc3RhdHVzID09IHN0YXR1c0NvZGVcbiAgICAgICAgICAgICAgICAgICYmXG4gICAgICAgICAgICAgICAgICB4LnRlc3QubWV0aG9kLnRvVXBwZXJDYXNlKCkgPT0gbWV0aG9kTmFtZVxuICAgICAgICAgICAgICAgICAgJiZcbiAgICAgICAgICAgICAgICAgICh4LnJlc3BvbnNlLmdldCgnY29udGVudC10eXBlJykgfHwgJycpLnRvTG93ZXJDYXNlKCkuaW5kZXhPZihjb250ZW50VHlwZS50b0xvd2VyQ2FzZSgpKSA9PSAwXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBpZiAoIXJlc3BvbnNlcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IEFUTEhlbHBlcnMuZXJyb3IoXCJDb250ZW50LVR5cGUgbm90IGNvdmVyZWQgKFwiICsgY29udGVudFR5cGUgKyBcIilcIiwgcmVzcG9uc2VzLm1hcCh4ID0+IHgucmVzcG9uc2UuZ2V0KCdjb250ZW50LXR5cGUnKSkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSwgYWN0dWFsQm9keS5jb250ZW50VHlwZUFTVClcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIGlmIChhY3R1YWxCb2R5LnNjaGVtYVN0cmluZykge1xuICAgICAgICAgICAgICBsZXQgdiA9IHRoaXMuYmF0LmFzdC5vYnRhaW5TY2hlbWFWYWxpZGF0b3IoYWN0dWFsQm9keS5zY2hlbWFTdHJpbmcpO1xuXG4gICAgICAgICAgICAgIGJvZHlBc3Nlcmlvbi5pbm5lckFzc2VydGlvbnMucHVzaChcbiAgICAgICAgICAgICAgICBuZXcgQ292ZXJhZ2VBc3NlcnRpb24oJ3Jlc3BvbnNlLmJvZHkgc2NoZW1hJywgKHJlc3VsdHMpID0+IHtcbiAgICAgICAgICAgICAgICAgIGxldCByZXNwb25zZXMgPSByZXN1bHRzLmZpbHRlcih4ID0+XG4gICAgICAgICAgICAgICAgICAgIHgudGVzdC5yZXNwb25zZS5zdGF0dXMgPT0gc3RhdHVzQ29kZVxuICAgICAgICAgICAgICAgICAgICAmJlxuICAgICAgICAgICAgICAgICAgICB4LnRlc3QubWV0aG9kLnRvVXBwZXJDYXNlKCkgPT0gbWV0aG9kTmFtZVxuICAgICAgICAgICAgICAgICAgICAmJlxuICAgICAgICAgICAgICAgICAgICAoeC5yZXNwb25zZS5nZXQoJ2NvbnRlbnQtdHlwZScpIHx8ICcnKS50b0xvd2VyQ2FzZSgpLmluZGV4T2YoY29udGVudFR5cGUudG9Mb3dlckNhc2UoKSkgPT0gMFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJhY2UoXG4gICAgICAgICAgICAgICAgICAgIHJlc3BvbnNlcy5tYXAoeCA9PiB4LnRlc3QucmVxdWVzdGVyLnByb21pc2UpXG4gICAgICAgICAgICAgICAgICApLnRoZW4oKHJlc3BvbnNlOiByZXF1ZXN0LlJlc3BvbnNlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGxldCB2YWxpZGF0aW9uUmVzdWx0ID0gdihyZXNwb25zZS5ib2R5KTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoIXZhbGlkYXRpb25SZXN1bHQudmFsaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBBVExIZWxwZXJzLmVycm9yKCh2YWxpZGF0aW9uUmVzdWx0LmVycm9ycyAmJiB2YWxpZGF0aW9uUmVzdWx0LmVycm9ycy5tYXAoeCA9PiBcIiAgXCIgKyB4LnN0YWNrKSkuam9pbignXFxuJykgfHwgXCJJbnZhbGlkIHNjaGVtYVwiLCByZXNwb25zZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0sIGFjdHVhbEJvZHkuc2NoZW1hLmhpZ2hMZXZlbCgpLmxvd0xldmVsKCkpXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBpZiAocmVzcG9uc2UuaGVhZGVycykge1xuICAgICAgICAgICAgbGV0IGhlYWRlcnMgPSBPYmplY3Qua2V5cyhyZXNwb25zZS5oZWFkZXJzKTtcblxuICAgICAgICAgICAgaGVhZGVycy5mb3JFYWNoKGhlYWRlcktleSA9PiB7XG4gICAgICAgICAgICAgIGxldCBoZWFkZXJPYmplY3Q6IFJBTUwuYXBpMDguUGFyYW1ldGVyID0gcmVzcG9uc2UuaGVhZGVyc1toZWFkZXJLZXldO1xuXG4gICAgICAgICAgICAgIGhlYWRlcktleSA9IGhlYWRlcktleS50b0xvd2VyQ2FzZSgpO1xuXG4gICAgICAgICAgICAgIG1ldGhvZEFzc2V0aW9ucy5pbm5lckFzc2VydGlvbnMucHVzaChcbiAgICAgICAgICAgICAgICBuZXcgQ292ZXJhZ2VBc3NlcnRpb24oJ3Jlc3BvbnNlLmhlYWRlcnM6OicgKyBoZWFkZXJLZXksIChyZXN1bHRzKSA9PiB7XG4gICAgICAgICAgICAgICAgICBsZXQgcmVzcG9uc2VzID0gcmVzdWx0cy5maWx0ZXIoeCA9PlxuICAgICAgICAgICAgICAgICAgICB4LnRlc3QucmVzcG9uc2Uuc3RhdHVzID09IHN0YXR1c0NvZGVcbiAgICAgICAgICAgICAgICAgICAgJiZcbiAgICAgICAgICAgICAgICAgICAgeC50ZXN0Lm1ldGhvZC50b1VwcGVyQ2FzZSgpID09IG1ldGhvZE5hbWVcbiAgICAgICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJhY2UoXG4gICAgICAgICAgICAgICAgICAgIHJlc3BvbnNlcy5tYXAoeCA9PiB4LnRlc3QucmVxdWVzdGVyLnByb21pc2UpXG4gICAgICAgICAgICAgICAgICApLnRoZW4oXG4gICAgICAgICAgICAgICAgICAgIChyZXNwb25zZTogcmVxdWVzdC5SZXNwb25zZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgIGxldCByZWNlaXZlZEhlYWRlcnMgPSBPYmplY3Qua2V5cyhyZXNwb25zZS5oZWFkZXIpLm1hcCh4ID0+IHgudG9Mb3dlckNhc2UoKSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICBpZiAocmVjZWl2ZWRIZWFkZXJzLmluZGV4T2YoaGVhZGVyS2V5KSA9PSAtMSlcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChoZWFkZXJPYmplY3Qub3B0aW9uYWwoKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IE9wdGlvbmFsRXJyb3IoaGVhZGVyS2V5ICsgXCIgaGVhZGVyIG5vdCByZWNlaXZlZCAoT3B0aW9uYWwpXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBBVExIZWxwZXJzLmVycm9yKGhlYWRlcktleSArIFwiIGhlYWRlciBub3QgcmVjZWl2ZWRcIiwgcmVjZWl2ZWRIZWFkZXJzKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSwgaGVhZGVyT2JqZWN0LmhpZ2hMZXZlbCgpLmxvd0xldmVsKCkpXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cblxuICByZXNvbHZlKHRlc3Q6IEFUTEhlbHBlcnMuQVRMVGVzdCwgcmVzcG9uc2U6IHJlcXVlc3QuUmVzcG9uc2UpIHtcbiAgICB0aGlzLnJlc3VsdHMucHVzaCh7XG4gICAgICB0ZXN0LFxuICAgICAgcmVzcG9uc2VcbiAgICB9KTtcbiAgfVxuXG4gIHJlZ2lzdGVyQ292ZXJhZ2VMaW5lKGxpbmVEYXRhOiB7XG4gICAgZmlsZTogc3RyaW5nO1xuICAgIGxpbmU6IG51bWJlcjtcbiAgICBsaW5lRW5kOiBudW1iZXI7XG4gICAgc3RhcnQ6IG51bWJlcjtcbiAgICBlbmQ6IG51bWJlcjtcbiAgICBjb3ZlcmVkOiBib29sZWFuO1xuICB9KSB7XG4gICAgbGV0IGNvdiA9IHRoaXMuYmF0LmNvdmVyYWdlRGF0YTtcblxuICAgIGxldCBkYXRhID0gKGNvdltsaW5lRGF0YS5maWxlXSA9IGNvdltsaW5lRGF0YS5maWxlXSB8fCB7IHNvdXJjZTogW10gfSk7XG5cbiAgICBpZiAobGluZURhdGEubGluZSA+PSAwKSB7XG4gICAgICB3aGlsZSAoKGxpbmVEYXRhLmxpbmUgKyAxKSA+IGRhdGEuc291cmNlLmxlbmd0aCkge1xuICAgICAgICBkYXRhLnNvdXJjZS5wdXNoKHVuZGVmaW5lZCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGxpbmVEYXRhLmNvdmVyZWQpIHtcbiAgICAgIGRhdGEuc291cmNlW2xpbmVEYXRhLmxpbmVdID0gKGRhdGEuc291cmNlW2xpbmVEYXRhLmxpbmVdIGFzIG51bWJlciB8fCAwKSArIDE7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRhdGEuc291cmNlW2xpbmVEYXRhLmxpbmVdID0gZGF0YS5zb3VyY2VbbGluZURhdGEubGluZV0gfHwgMDtcbiAgICB9XG4gIH1cblxuICBnZXRDb3ZlcmFnZSgpOiBQcm9taXNlPHsgdG90YWw6IG51bWJlcjsgZXJyb3JlZDogbnVtYmVyOyBub3RDb3ZlcmVkOiBudW1iZXI7IH0+IHtcbiAgICBsZXQgcHJvbSA9IEFUTEhlbHBlcnMuZmxhdFByb21pc2UoKTtcblxuICAgIGxldCB0b3RhbCA9IDA7XG4gICAgbGV0IG5vdENvdmVyZWQgPSAwO1xuICAgIGxldCBlcnJvcmVkID0gMDtcbiAgICBsZXQgbGluZXMgPSAwO1xuXG4gICAgY29uc3Qgd2FsayA9IChhc3NlcnRpb246IENvdmVyYWdlQXNzZXJ0aW9uKSA9PiB7XG4gICAgICBpZiAoYXNzZXJ0aW9uLnZhbGlkYXRpb25Gbikge1xuICAgICAgICB0b3RhbCsrO1xuXG4gICAgICAgIGlmICghYXNzZXJ0aW9uLnZhbGlkKSB7XG4gICAgICAgICAgaWYgKGFzc2VydGlvbi5lcnJvciAmJiAoYXNzZXJ0aW9uLmVycm9yIGluc3RhbmNlb2YgTm90SW1wbGVtZW50ZWRFcnJvcikpIHtcbiAgICAgICAgICAgIG5vdENvdmVyZWQrKztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZXJyb3JlZCsrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBsZXQgY292ZXJhZ2VSZXN1bHQgPSBhc3NlcnRpb24uZ2V0Q292ZXJhZ2UoKTtcblxuICAgICAgaWYgKGNvdmVyYWdlUmVzdWx0KSB7XG4gICAgICAgIHRoaXMucmVnaXN0ZXJDb3ZlcmFnZUxpbmUoY292ZXJhZ2VSZXN1bHQpO1xuICAgICAgICBsaW5lcyArPSBjb3ZlcmFnZVJlc3VsdC5saW5lRW5kIC0gY292ZXJhZ2VSZXN1bHQubGluZSArIDE7XG4gICAgICB9XG5cbiAgICAgIGlmIChhc3NlcnRpb24uaW5uZXJBc3NlcnRpb25zLmxlbmd0aCkge1xuICAgICAgICBhc3NlcnRpb24uaW5uZXJBc3NlcnRpb25zLmZvckVhY2goeCA9PiB3YWxrKHgpKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgY29uc3QgY2FsY3VsYXRlQ292ZXJhZ2UgPSAoKSA9PiB7XG4gICAgICB3YWxrKHRoaXMucmVzb3VyY2VBc3NlcnRpb24pO1xuXG4gICAgICBwcm9tLnJlc29sdmVyKHtcbiAgICAgICAgdG90YWwsXG4gICAgICAgIGVycm9yZWQsXG4gICAgICAgIG5vdENvdmVyZWRcbiAgICAgIH0pO1xuICAgIH07XG5cbiAgICB0aGlzLnJlc291cmNlQXNzZXJ0aW9uLnByb21pc2UucHJvbWlzZS50aGVuKGNhbGN1bGF0ZUNvdmVyYWdlKS5jYXRjaChjYWxjdWxhdGVDb3ZlcmFnZSk7XG5cbiAgICByZXR1cm4gcHJvbS5wcm9taXNlO1xuICB9XG5cbiAgcnVuKCkge1xuICAgIHJldHVybiB0aGlzLnJlc291cmNlQXNzZXJ0aW9uLnZhbGlkYXRlKHRoaXMucmVzdWx0cyk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIE5vdEltcGxlbWVudGVkRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gIGNvbnN0cnVjdG9yKG1lc3NhZ2U6IHN0cmluZykge1xuICAgIHN1cGVyKG1lc3NhZ2UpO1xuICAgIHRoaXMubWVzc2FnZSA9IG1lc3NhZ2U7XG4gICAgdGhpcy5uYW1lID0gXCJNZXRob2Qgbm90IGltcGxlbWVudGVkXCI7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIE9wdGlvbmFsRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gIGNvbnN0cnVjdG9yKG1lc3NhZ2U6IHN0cmluZykge1xuICAgIHN1cGVyKG1lc3NhZ2UpO1xuICAgIHRoaXMubWVzc2FnZSA9IG1lc3NhZ2U7XG4gICAgdGhpcy5uYW1lID0gXCJPcHRpb25hbCBFcnJvclwiO1xuICB9XG59Il19