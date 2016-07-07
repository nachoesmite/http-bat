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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ292ZXJhZ2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJDb3ZlcmFnZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFJQSxJQUFPLElBQUksV0FBVyxNQUFNLENBQUMsQ0FBQztBQUk5QixJQUFPLENBQUMsV0FBVyxRQUFRLENBQUMsQ0FBQztBQUk3QixJQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDekMsSUFBTSxTQUFTLEdBQUcsT0FBTyxDQUFDLGlCQUFpQixDQUFDLENBQUM7QUFJN0MsSUFBTyxVQUFVLFdBQVcsY0FBYyxDQUFDLENBQUM7QUFXNUM7SUFhRSwyQkFBbUIsSUFBWSxFQUFTLFlBQTBELEVBQVUsV0FBc0M7UUFicEosaUJBeUdDO1FBNUZvQixTQUFJLEdBQUosSUFBSSxDQUFRO1FBQVMsaUJBQVksR0FBWixZQUFZLENBQThDO1FBQVUsZ0JBQVcsR0FBWCxXQUFXLENBQTJCO1FBVmxKLFVBQUssR0FBWSxJQUFJLENBQUM7UUFDdEIsb0JBQWUsR0FBd0IsRUFBRSxDQUFDO1FBQzFDLFlBQU8sR0FBRyxVQUFVLENBQUMsV0FBVyxFQUFFLENBQUM7UUFTakMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPO2FBQ2pCLElBQUksQ0FBQyxVQUFBLENBQUM7WUFDTCxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNOLEtBQUksQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDO2dCQUNmLEtBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO2dCQUNuQixNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMzQixDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ04sT0FBTyxLQUFJLENBQUMsS0FBSyxDQUFDO2dCQUNsQixLQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztnQkFDbEIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FB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QUFPLENBQUMsQ0FBQztJQUN2RCxDQUFDO0lBQ0gsdUJBQUM7QUFBRCxDQUFDLEFBalpELElBaVpDO0FBalpZLHdCQUFnQixtQkFpWjVCLENBQUE7QUFFRDtJQUF5Qyx1Q0FBSztJQUM1Qyw2QkFBWSxPQUFlO1FBQ3pCLGtCQUFNLE9BQU8sQ0FBQyxDQUFDO1FBQ2YsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7UUFDdkIsSUFBSSxDQUFDLElBQUksR0FBRyx3QkFBd0IsQ0FBQztJQUN2QyxDQUFDO0lBQ0gsMEJBQUM7QUFBRCxDQUFDLEFBTkQsQ0FBeUMsS0FBSyxHQU03QztBQU5ZLDJCQUFtQixzQkFNL0IsQ0FBQTtBQUVEO0lBQW1DLGlDQUFLO0lBQ3RDLHVCQUFZLE9BQWU7UUFDekIsa0JBQU0sT0FBTyxDQUFDLENBQUM7UUFDZixJQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztRQUN2QixJQUFJLENBQUMsSUFBSSxHQUFHLGdCQUFnQixDQUFDO0lBQy9CLENBQUM7SUFDSCxvQkFBQztBQUFELENBQUMsQUFORCxDQUFtQyxLQUFLLEdBTXZDO0FBTlkscUJBQWEsZ0JBTXpCLENBQUEiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBOb2RlXG5pbXBvcnQgZnMgPSByZXF1aXJlKCdmcycpO1xuaW1wb3J0IHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XG5pbXBvcnQgdXJsID0gcmVxdWlyZSgndXJsJyk7XG5pbXBvcnQgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKTtcblxuLy8gTlBNXG5pbXBvcnQganNZYW1sID0gcmVxdWlyZSgnanMteWFtbCcpO1xuaW1wb3J0IF8gPSByZXF1aXJlKCdsb2Rhc2gnKTtcbmltcG9ydCByZXF1ZXN0ID0gcmVxdWlyZSgnc3VwZXJ0ZXN0Jyk7XG5pbXBvcnQgZXhwZWN0ID0gcmVxdWlyZSgnZXhwZWN0Jyk7XG5pbXBvcnQgUkFNTCA9IHJlcXVpcmUoJ3JhbWwtMS1wYXJzZXInKTtcbmNvbnN0IGpzb25zY2hlbWEgPSByZXF1aXJlKCdqc29uc2NoZW1hJyk7XG5jb25zdCBwYXRoTWF0Y2ggPSByZXF1aXJlKCdyYW1sLXBhdGgtbWF0Y2gnKTtcblxuLy8gTG9jYWxzXG5pbXBvcnQgQVRMID0gcmVxdWlyZSgnLi9BVEwnKTtcbmltcG9ydCBBVExIZWxwZXJzID0gcmVxdWlyZSgnLi9BVExIZWxwZXJzJyk7XG5cbmltcG9ydCB7QmF0fSBmcm9tICcuL2JhdCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlc3RSZXN1bHQge1xuICB0ZXN0OiBBVExIZWxwZXJzLkFUTFRlc3Q7XG4gIHJlc3BvbnNlOiByZXF1ZXN0LlJlc3BvbnNlO1xufVxuXG5cblxuZXhwb3J0IGNsYXNzIENvdmVyYWdlQXNzZXJ0aW9uIHtcblxuICBlcnJvcjogRXJyb3I7XG4gIHZhbGlkOiBib29sZWFuID0gbnVsbDtcbiAgaW5uZXJBc3NlcnRpb25zOiBDb3ZlcmFnZUFzc2VydGlvbltdID0gW107XG4gIHByb21pc2UgPSBBVExIZWxwZXJzLmZsYXRQcm9taXNlKCk7XG5cbiAgc3JjX2ZpbGU6IHN0cmluZztcbiAgc3JjX2xpbmU6IG51bWJlcjtcbiAgc3JjX2xpbmVfZW5kOiBudW1iZXI7XG4gIHNyY19zdGFydDogbnVtYmVyO1xuICBzcmNfZW5kOiBudW1iZXI7XG5cbiAgY29uc3RydWN0b3IocHVibGljIG5hbWU6IHN0cmluZywgcHVibGljIHZhbGlkYXRpb25Gbj86IChyZXM6IElUZXN0UmVzdWx0W10pID0+IFByb21pc2U8YW55PiB8IHZvaWQsIHByaXZhdGUgbG93TGV2ZWxBU1Q/OiBSQU1MLmxsLklMb3dMZXZlbEFTVE5vZGUpIHtcbiAgICB0aGlzLnByb21pc2UucHJvbWlzZVxuICAgICAgLnRoZW4oeCA9PiB7XG4gICAgICAgIGlmICh4KSB7XG4gICAgICAgICAgdGhpcy5lcnJvciA9IHg7XG4gICAgICAgICAgdGhpcy52YWxpZCA9IGZhbHNlO1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdCh4KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5lcnJvcjtcbiAgICAgICAgICB0aGlzLnZhbGlkID0gdHJ1ZTtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAuY2F0Y2goeCA9PiB7XG4gICAgICAgIHRoaXMuZXJyb3IgPSB4O1xuICAgICAgICB0aGlzLnZhbGlkID0gZmFsc2U7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdCh4KTtcbiAgICAgIH0pO1xuXG4gICAgaWYgKGxvd0xldmVsQVNUKSB7XG4gICAgICB0aGlzLnNyY19maWxlID0gbG93TGV2ZWxBU1QudW5pdCgpLmFic29sdXRlUGF0aCgpO1xuICAgICAgaWYgKHRoaXMuc3JjX2ZpbGUpIHtcbiAgICAgICAgdGhpcy5zcmNfbGluZSA9IGxvd0xldmVsQVNULnVuaXQoKS5saW5lTWFwcGVyKCkucG9zaXRpb24obG93TGV2ZWxBU1Quc3RhcnQoKSkubGluZTtcbiAgICAgICAgdGhpcy5zcmNfbGluZV9lbmQgPSBsb3dMZXZlbEFTVC51bml0KCkubGluZU1hcHBlcigpLnBvc2l0aW9uKGxvd0xldmVsQVNULmVuZCgpKS5saW5lO1xuICAgICAgICB0aGlzLnNyY19zdGFydCA9IGxvd0xldmVsQVNULnN0YXJ0KCk7XG4gICAgICAgIHRoaXMuc3JjX2VuZCA9IGxvd0xldmVsQVNULmVuZCgpO1xuICAgICAgfVxuICAgICAgLy8gY29uc29sZS5sb2cobmFtZSwgdGhpcy5zcmNfZmlsZSArICcjJyArICh0aGlzLnNyY19saW5lICsgMSkgKyAnIHRvICcgKyAodGhpcy5zcmNfbGluZV9lbmQgKyAxKSk7XG4gICAgfVxuICB9XG5cbiAgZ2V0Q292ZXJhZ2UoKSB7XG4gICAgaWYgKHRoaXMuc3JjX2ZpbGUpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGZpbGU6IHRoaXMuc3JjX2ZpbGUsXG4gICAgICAgIGxpbmU6IHRoaXMuc3JjX2xpbmUsXG4gICAgICAgIGxpbmVFbmQ6IHRoaXMuc3JjX2xpbmVfZW5kLFxuICAgICAgICBzdGFydDogdGhpcy5zcmNfc3RhcnQsXG4gICAgICAgIGVuZDogdGhpcy5zcmNfZW5kLFxuICAgICAgICBjb3ZlcmVkOiB0aGlzLnZhbGlkXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIHZhbGlkYXRlKHJlczogSVRlc3RSZXN1bHRbXSk6IFByb21pc2U8YW55PiB7XG5cbiAgICBsZXQgd2FpdEZvcklubmVyOiBQcm9taXNlPGFueT4gPSBQcm9taXNlLnJlc29sdmUoKTtcblxuXG4gICAgdHJ5IHtcbiAgICAgIGlmICghcmVzIHx8ICFyZXMubGVuZ3RoKSB7XG4gICAgICAgIHRocm93IG5ldyBOb3RJbXBsZW1lbnRlZEVycm9yKFwiTm8gbWF0Y2hpbmcgcmVzdWx0c1wiKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMudmFsaWRhdGlvbkZuKSB7XG4gICAgICAgIGxldCBhY3R1YWxSZXN1bHQgPSB0aGlzLnZhbGlkYXRpb25GbihyZXMpIGFzIGFueTtcblxuICAgICAgICBpZiAoYWN0dWFsUmVzdWx0KSB7XG4gICAgICAgICAgaWYgKCEoYWN0dWFsUmVzdWx0IGluc3RhbmNlb2YgUHJvbWlzZSkpIHtcbiAgICAgICAgICAgIHRoaXMucHJvbWlzZS5yZWplY3RlcihuZXcgRXJyb3IodGhpcy5uYW1lICsgXCIgZG9lcyBub3QgcmV0dXJuIGEgUHJvbWlzZSwgZ290IFwiICsgdXRpbC5pbnNwZWN0KGFjdHVhbFJlc3VsdCkpKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYWN0dWFsUmVzdWx0XG4gICAgICAgICAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgdGhpcy5wcm9taXNlLnJlamVjdGVyKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHRoaXMucHJvbWlzZS5yZXNvbHZlcigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5wcm9taXNlLnJlamVjdGVyKGVycik7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLnByb21pc2UucmVzb2x2ZXIoKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5wcm9taXNlLnJlc29sdmVyKCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgdGhpcy5wcm9taXNlLnJlamVjdGVyKGUpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLmlubmVyQXNzZXJ0aW9ucy5sZW5ndGgpIHtcbiAgICAgIHdhaXRGb3JJbm5lciA9IFByb21pc2UuYWxsKHRoaXMuaW5uZXJBc3NlcnRpb25zLm1hcCh4ID0+IHgudmFsaWRhdGUocmVzKSkpO1xuICAgIH1cblxuICAgIC8vIFRISVMgTUVUT0QgTVVTVCBSRVNPTFZFIEVWRVJZIFRJTUVcbiAgICByZXR1cm4gdGhpcy5wcm9taXNlLnByb21pc2VcbiAgICAgIC50aGVuKGVycm9yID0+IHdhaXRGb3JJbm5lci50aGVuKCgpID0+IGVycm9yKSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB3YWl0Rm9ySW5uZXIudGhlbigoKSA9PiBQcm9taXNlLnJlc29sdmUoZXJyb3IpKSk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIENvdmVyYWdlUmVzb3VyY2Uge1xuICByZWxhdGl2ZVVybDogc3RyaW5nO1xuICBtYXRjaGVzOiAoc3RyOiBzdHJpbmcpID0+IGJvb2xlYW4gfCBhbnk7XG5cbiAgcmVzdWx0czogSVRlc3RSZXN1bHRbXSA9IFtdO1xuXG4gIGNvdmVyYWdlVHJlZTogQVRMSGVscGVycy5JRGljdGlvbmFyeTxhbnk+ID0ge307XG5cbiAgcmVzb3VyY2VKU09OID0gbnVsbDtcblxuICB1cmlQYXJhbWV0ZXJzOiBhbnlbXSA9IFtdO1xuXG4gIGNvbnN0cnVjdG9yKHB1YmxpYyByZXNvdXJjZTogUkFNTC5hcGkwOC5SZXNvdXJjZSwgcHVibGljIGJhdDogQmF0KSB7XG4gICAgdGhpcy5yZWxhdGl2ZVVybCA9IHJlc291cmNlLmNvbXBsZXRlUmVsYXRpdmVVcmkoKTtcblxuICAgIHRoaXMudXJpUGFyYW1ldGVycyA9IHJlc291cmNlLmFic29sdXRlVXJpUGFyYW1ldGVycygpLm1hcCh4ID0+IHgudG9KU09OKCkpO1xuXG4gICAgdGhpcy5tYXRjaGVzID0gcGF0aE1hdGNoKHRoaXMucmVsYXRpdmVVcmwsIHRoaXMudXJpUGFyYW1ldGVycyk7XG4gICAgdGhpcy5nZW5lcmF0ZUFzc2VydGlvbnMoKTtcbiAgfVxuXG4gIHJlc291cmNlQXNzZXJ0aW9uOiBDb3ZlcmFnZUFzc2VydGlvbjtcblxuICBwcml2YXRlIGdlbmVyYXRlQXNzZXJ0aW9ucygpIHtcblxuICAgIHRoaXMucmVzb3VyY2VBc3NlcnRpb24gPSBuZXcgQ292ZXJhZ2VBc3NlcnRpb24odGhpcy5yZXNvdXJjZS5jb21wbGV0ZVJlbGF0aXZlVXJpKCkpO1xuXG5cbiAgICBsZXQgbWV0aG9kcyA9IFtdO1xuXG4gICAgbGV0IHR5cGUgPSB0aGlzLnJlc291cmNlLnR5cGUoKTtcblxuICAgIG1ldGhvZHMgPSBtZXRob2RzLmNvbmNhdCh0aGlzLnJlc291cmNlLm1ldGhvZHMoKSk7XG5cbiAgICBpZiAobWV0aG9kcy5sZW5ndGggPT0gMCkge1xuICAgICAgaWYgKHR5cGUpIHtcbiAgICAgICAgbGV0IHJlc291cmNlVHlwZSA9IHR5cGUucmVzb3VyY2VUeXBlKCk7XG5cbiAgICAgICAgaWYgKHJlc291cmNlVHlwZSkge1xuICAgICAgICAgIG1ldGhvZHMgPSBtZXRob2RzLmNvbmNhdChyZXNvdXJjZVR5cGUubWV0aG9kcygpKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIGNvbnNvbGUubG9nKHV0aWwuaW5zcGVjdCh0aGlzLnJlc291cmNlLnRvSlNPTigpLCBmYWxzZSwgMTAsIHRydWUpKTtcblxuICAgIG1ldGhvZHMuZm9yRWFjaChtZXRob2QgPT4ge1xuICAgICAgbGV0IG1ldGhvZE5hbWUgPSBtZXRob2QubWV0aG9kKCkudG9VcHBlckNhc2UoKTtcbiAgICAgIGxldCBtZXRob2RKc29uID0gbWV0aG9kLnRvSlNPTigpO1xuICAgICAgbGV0IG1ldGhvZEFzc2V0aW9ucyA9IG5ldyBDb3ZlcmFnZUFzc2VydGlvbihtZXRob2ROYW1lLCBudWxsLCBtZXRob2QuaGlnaExldmVsKCkubG93TGV2ZWwoKSk7XG5cbiAgICAgIHRoaXMucmVzb3VyY2VBc3NlcnRpb24uaW5uZXJBc3NlcnRpb25zLnB1c2gobWV0aG9kQXNzZXRpb25zKTtcblxuICAgICAgbGV0IHJlc3BvbnNlczogUkFNTC5hcGkwOC5SZXNwb25zZVtdID0gW107XG4gICAgICBsZXQgZmxhdFF1ZXJ5UGFyYW1ldGVyczogQVRMSGVscGVycy5JRGljdGlvbmFyeTxhbnk+ID0ge307XG5cbiAgICAgIGlmICh0aGlzLmJhdC5hc3Qub3B0aW9ucy5yYW1sLnRyYWl0cykge1xuICAgICAgICBsZXQgdHJhaXRzID0gbWV0aG9kLmlzKCk7XG4gICAgICAgIGZvciAobGV0IHRyYWl0SW5kZXggPSAwOyB0cmFpdEluZGV4IDwgdHJhaXRzLmxlbmd0aDsgdHJhaXRJbmRleCsrKSB7XG4gICAgICAgICAgbGV0IHRyYWl0ID0gdHJhaXRzW3RyYWl0SW5kZXhdO1xuXG4gICAgICAgICAgbGV0IHRyYWl0SlNPTiA9IHRyYWl0LnRyYWl0KCkudG9KU09OKCk7XG4gICAgICAgICAgbGV0IHRyYWl0TmFtZSA9IHRyYWl0Lm5hbWUoKTtcblxuICAgICAgICAgIGlmICh0cmFpdEpTT05bdHJhaXROYW1lXS5xdWVyeVBhcmFtZXRlcnMpIHtcbiAgICAgICAgICAgIGZvciAobGV0IG5hbWUgaW4gdHJhaXRKU09OW3RyYWl0TmFtZV0ucXVlcnlQYXJhbWV0ZXJzKSB7XG4gICAgICAgICAgICAgIGxldCBwYXJhbSA9IHRyYWl0SlNPTlt0cmFpdE5hbWVdLnF1ZXJ5UGFyYW1ldGVyc1tuYW1lXTtcbiAgICAgICAgICAgICAgZmxhdFF1ZXJ5UGFyYW1ldGVyc1twYXJhbS5uYW1lXSA9IGZsYXRRdWVyeVBhcmFtZXRlcnNbcGFyYW0ubmFtZV0gfHwge307XG4gICAgICAgICAgICAgIF8ubWVyZ2UoZmxhdFF1ZXJ5UGFyYW1ldGVyc1twYXJhbS5uYW1lXSwgcGFyYW0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmVzcG9uc2VzID0gcmVzcG9uc2VzLmNvbmNhdCh0cmFpdC50cmFpdCgpLnJlc3BvbnNlcygpIGFzIGFueSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuYmF0LmFzdC5vcHRpb25zLnJhbWwucmVzb3VyY2VUeXBlcykge1xuICAgICAgICBpZiAodHlwZSkge1xuICAgICAgICAgIGxldCB0eXBlTWV0aG9kcyA9IHR5cGUucmVzb3VyY2VUeXBlKCkubWV0aG9kcygpIGFzIFJBTUwuYXBpMDguTWV0aG9kW107XG5cbiAgICAgICAgICB0eXBlTWV0aG9kcyA9IHR5cGVNZXRob2RzLmZpbHRlcih4ID0+IHgubWV0aG9kKCkudG9VcHBlckNhc2UoKSA9PSBtZXRob2QubWV0aG9kKCkudG9VcHBlckNhc2UoKSk7XG4gICAgICAgICAgdHlwZU1ldGhvZHMuZm9yRWFjaChtID0+IHtcbiAgICAgICAgICAgIGxldCB0eXBlTWV0aG9kSnNvbiA9IG0udG9KU09OKClbbS5tZXRob2QoKS50b0xvd2VyQ2FzZSgpXTtcblxuICAgICAgICAgICAgaWYgKHR5cGVNZXRob2RKc29uLnF1ZXJ5UGFyYW1ldGVycykge1xuICAgICAgICAgICAgICBmb3IgKGxldCBuYW1lIGluIHR5cGVNZXRob2RKc29uLnF1ZXJ5UGFyYW1ldGVycykge1xuICAgICAgICAgICAgICAgIGxldCBwYXJhbSA9IHR5cGVNZXRob2RKc29uLnF1ZXJ5UGFyYW1ldGVyc1tuYW1lXTtcbiAgICAgICAgICAgICAgICBmbGF0UXVlcnlQYXJhbWV0ZXJzW3BhcmFtLm5hbWVdID0gZmxhdFF1ZXJ5UGFyYW1ldGVyc1twYXJhbS5uYW1lXSB8fCB7fTtcbiAgICAgICAgICAgICAgICBfLm1lcmdlKGZsYXRRdWVyeVBhcmFtZXRlcnNbcGFyYW0ubmFtZV0sIHBhcmFtKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXNwb25zZXMgPSByZXNwb25zZXMuY29uY2F0KG0ucmVzcG9uc2VzKCkgYXMgYW55KTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG5cbiAgICAgIHJlc3BvbnNlcyA9IHJlc3BvbnNlcy5jb25jYXQobWV0aG9kLnJlc3BvbnNlcygpIGFzIGFueSk7XG5cbiAgICAgIGxldCBmbGF0UmVzcG9uc2VzOiBBVExIZWxwZXJzLklEaWN0aW9uYXJ5PHtcbiAgICAgICAgc3RhdHVzPzogc3RyaW5nO1xuICAgICAgICBzdGF0dXNBU1Q/OiBSQU1MLmxsLklMb3dMZXZlbEFTVE5vZGU7XG4gICAgICAgIGhlYWRlcnM/OiBBVExIZWxwZXJzLklEaWN0aW9uYXJ5PFJBTUwuYXBpMDguUGFyYW1ldGVyPjtcbiAgICAgICAgYm9kaWVzPzogQVRMSGVscGVycy5JRGljdGlvbmFyeTx7XG4gICAgICAgICAgY29udGVudFR5cGU/OiBzdHJpbmc7XG4gICAgICAgICAgY29udGVudFR5cGVBU1Q/OiBSQU1MLmxsLklMb3dMZXZlbEFTVE5vZGU7XG4gICAgICAgICAgc2NoZW1hPzogUkFNTC5hcGkwOC5TY2hlbWFTdHJpbmc7XG4gICAgICAgICAgc2NoZW1hU3RyaW5nPzogc3RyaW5nO1xuICAgICAgICB9PjtcbiAgICAgIH0+ID0ge307XG5cbiAgICAgIHJlc3BvbnNlcy5mb3JFYWNoKHggPT4ge1xuICAgICAgICBsZXQga2V5ID0geC5jb2RlKCkudmFsdWUoKTtcbiAgICAgICAgbGV0IGZsYXRSZXNwb25zZSA9IGZsYXRSZXNwb25zZXNba2V5XSA9IGZsYXRSZXNwb25zZXNba2V5XSB8fCB7fTtcbiAgICAgICAgZmxhdFJlc3BvbnNlLnN0YXR1cyA9IGtleTtcbiAgICAgICAgZmxhdFJlc3BvbnNlLnN0YXR1c0FTVCA9IHguY29kZSgpLmhpZ2hMZXZlbCgpLmxvd0xldmVsKCk7XG5cbiAgICAgICAgeC5oZWFkZXJzKCkuZm9yRWFjaChoID0+IHtcbiAgICAgICAgICBmbGF0UmVzcG9uc2UuaGVhZGVycyA9IGZsYXRSZXNwb25zZS5oZWFkZXJzIHx8IHt9O1xuICAgICAgICAgIGZsYXRSZXNwb25zZS5oZWFkZXJzW2gubmFtZSgpXSA9IGggfHwgZmxhdFJlc3BvbnNlLmhlYWRlcnNbaC5uYW1lKCldO1xuICAgICAgICB9KTtcblxuICAgICAgICBmbGF0UmVzcG9uc2UuYm9kaWVzID0ge307XG5cbiAgICAgICAgeC5ib2R5KCkuZm9yRWFjaChoID0+IHtcbiAgICAgICAgICBsZXQgY29udGVudFR5cGUgPSBoLm5hbWUoKTtcblxuICAgICAgICAgIGxldCBib2R5ID0gZmxhdFJlc3BvbnNlLmJvZGllc1tjb250ZW50VHlwZV0gPSBmbGF0UmVzcG9uc2UuYm9kaWVzW2NvbnRlbnRUeXBlXSB8fCB7XG4gICAgICAgICAgICBjb250ZW50VHlwZVxuICAgICAgICAgIH07XG5cbiAgICAgICAgICBib2R5LmNvbnRlbnRUeXBlQVNUID0gaC5oaWdoTGV2ZWwoKS5sb3dMZXZlbCgpO1xuXG4gICAgICAgICAgaWYgKGguc2NoZW1hQ29udGVudCgpKSB7XG4gICAgICAgICAgICBib2R5LnNjaGVtYSA9IGguc2NoZW1hKCk7XG4gICAgICAgICAgICBib2R5LnNjaGVtYVN0cmluZyA9IGguc2NoZW1hQ29udGVudCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgaWYgKE9iamVjdC5rZXlzKGZsYXRRdWVyeVBhcmFtZXRlcnMpLmxlbmd0aCkge1xuICAgICAgICBPYmplY3Qua2V5cyhmbGF0UXVlcnlQYXJhbWV0ZXJzKVxuICAgICAgICAgIC5tYXAoa2V5ID0+IGZsYXRRdWVyeVBhcmFtZXRlcnNba2V5XSlcbiAgICAgICAgICAuZm9yRWFjaChxcCA9PiB7XG4gICAgICAgICAgICBtZXRob2RBc3NldGlvbnMuaW5uZXJBc3NlcnRpb25zLnB1c2goXG4gICAgICAgICAgICAgIG5ldyBDb3ZlcmFnZUFzc2VydGlvbigncmVxdWVzdC5xdWVyeVBhcmFtZXRlcjo6JyArIHFwLm5hbWUgKyAnIG11c3QgYmUgcHJlc2VudCBvbiBzb21lIGNhbGwnLCAocmVzdWx0cykgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghcmVzdWx0cy5zb21lKFxuICAgICAgICAgICAgICAgICAgeCA9PlxuICAgICAgICAgICAgICAgICAgICB4LnRlc3QubWV0aG9kLnRvVXBwZXJDYXNlKCkgPT0gbWV0aG9kTmFtZVxuICAgICAgICAgICAgICAgICAgICAmJlxuICAgICAgICAgICAgICAgICAgICB4LnRlc3QucmVxdWVzdC5xdWVyeVBhcmFtZXRlcnNcbiAgICAgICAgICAgICAgICAgICAgJiZcbiAgICAgICAgICAgICAgICAgICAgKHFwLm5hbWUgaW4geC50ZXN0LnJlcXVlc3QucXVlcnlQYXJhbWV0ZXJzKVxuICAgICAgICAgICAgICAgICkpXG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgKHFwLnJlcXVpcmVkID8gRXJyb3IgOiBOb3RJbXBsZW1lbnRlZEVycm9yKShcIlF1ZXJ5IHBhcmFtZXRlciBub3QgcHJlc2VudFwiKTtcbiAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgICAgICBtZXRob2RBc3NldGlvbnMuaW5uZXJBc3NlcnRpb25zLnB1c2goXG4gICAgICAgICAgICAgIG5ldyBDb3ZlcmFnZUFzc2VydGlvbigncmVxdWVzdC5xdWVyeVBhcmFtZXRlcjo6JyArIHFwLm5hbWUgKyAnIG11c3Qgbm90IGJlIHByZXNlbnQnLCAocmVzdWx0cykgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghcmVzdWx0cy5zb21lKFxuICAgICAgICAgICAgICAgICAgeCA9PlxuICAgICAgICAgICAgICAgICAgICB4LnRlc3QubWV0aG9kLnRvVXBwZXJDYXNlKCkgPT0gbWV0aG9kTmFtZVxuICAgICAgICAgICAgICAgICAgICAmJlxuICAgICAgICAgICAgICAgICAgICB4LnRlc3QucmVxdWVzdC5xdWVyeVBhcmFtZXRlcnNcbiAgICAgICAgICAgICAgICAgICAgJiZcbiAgICAgICAgICAgICAgICAgICAgKHFwLm5hbWUgaW4geC50ZXN0LnJlcXVlc3QucXVlcnlQYXJhbWV0ZXJzKVxuICAgICAgICAgICAgICAgICkpXG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgTm90SW1wbGVtZW50ZWRFcnJvcihcIlF1ZXJ5IHBhcmFtZXRlciBub3QgcHJlc2VudFwiKTtcbiAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVzcG9uc2VzLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIG1ldGhvZEFzc2V0aW9ucy5pbm5lckFzc2VydGlvbnMucHVzaChuZXcgQ292ZXJhZ2VBc3NlcnRpb24oJ3Nob3VsZCBoYXZlIGJlZW4gY2FsbGVkJywgKHJlc3VsdHMpID0+IHtcbiAgICAgICAgICBpZiAoIXJlc3VsdHMuc29tZShcbiAgICAgICAgICAgIHggPT4geC50ZXN0Lm1ldGhvZC50b1VwcGVyQ2FzZSgpID09IG1ldGhvZE5hbWVcbiAgICAgICAgICApKVxuICAgICAgICAgICAgdGhyb3cgbmV3IE5vdEltcGxlbWVudGVkRXJyb3IoXCJubyBtYXRjaGluZyByZXF1ZXN0cyBmb3VuZFwiKTtcbiAgICAgICAgfSkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgT2JqZWN0LmtleXMoZmxhdFJlc3BvbnNlcykuZm9yRWFjaChzdGF0dXNDb2RlID0+IHtcbiAgICAgICAgICBsZXQgcmVzcG9uc2UgPSBmbGF0UmVzcG9uc2VzW3N0YXR1c0NvZGVdO1xuXG4gICAgICAgICAgbWV0aG9kQXNzZXRpb25zLmlubmVyQXNzZXJ0aW9ucy5wdXNoKFxuICAgICAgICAgICAgbmV3IENvdmVyYWdlQXNzZXJ0aW9uKCdjaGVjayAnICsgc3RhdHVzQ29kZSArICcgcmVzcG9uc2UnLCAocmVzdWx0cykgPT4ge1xuICAgICAgICAgICAgICBsZXQgcmVzcG9uc2VzID0gcmVzdWx0cy5maWx0ZXIoeCA9PlxuICAgICAgICAgICAgICAgIHgudGVzdC5yZXNwb25zZS5zdGF0dXMgPT0gc3RhdHVzQ29kZVxuICAgICAgICAgICAgICAgICYmXG4gICAgICAgICAgICAgICAgeC50ZXN0Lm1ldGhvZC50b1VwcGVyQ2FzZSgpID09IG1ldGhvZE5hbWVcbiAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgICBpZiAoIXJlc3BvbnNlcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJzdGF0dXMgY29kZSBcIiArIHN0YXR1c0NvZGUgKyBcIiBub3QgY292ZXJlZFwiKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yYWNlKHJlc3BvbnNlcy5tYXAoeCA9PiB4LnRlc3QucHJvbWlzZSkpXG4gICAgICAgICAgICAgICAgICAudGhlbih4ID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHguc3RhdHVzICE9IHBhcnNlSW50KHN0YXR1c0NvZGUpKVxuICAgICAgICAgICAgICAgICAgICAgIHRocm93IEFUTEhlbHBlcnMuZXJyb3JEaWZmKCd1bmV4cGVjdGVkIHJlc3BvbnNlLnN0YXR1cycsIHN0YXR1c0NvZGUsIHguc3RhdHVzLCB4KTtcbiAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCByZXNwb25zZS5zdGF0dXNBU1QpXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIGxldCBhbGxCb2RpZXMgPSBPYmplY3Qua2V5cyhyZXNwb25zZS5ib2RpZXMpO1xuXG4gICAgICAgICAgbGV0IHJlc3BvbnNlQXNzZXJ0aW9uID0gbmV3IENvdmVyYWdlQXNzZXJ0aW9uKHN0YXR1c0NvZGUpO1xuXG4gICAgICAgICAgbWV0aG9kQXNzZXRpb25zLmlubmVyQXNzZXJ0aW9ucy5wdXNoKHJlc3BvbnNlQXNzZXJ0aW9uKTtcblxuICAgICAgICAgIGFsbEJvZGllcy5mb3JFYWNoKGNvbnRlbnRUeXBlID0+IHtcblxuICAgICAgICAgICAgbGV0IGJvZHlBc3NlcmlvbiA9IG5ldyBDb3ZlcmFnZUFzc2VydGlvbihjb250ZW50VHlwZSk7XG5cbiAgICAgICAgICAgIGxldCBhY3R1YWxCb2R5ID0gcmVzcG9uc2UuYm9kaWVzW2NvbnRlbnRUeXBlXTtcblxuICAgICAgICAgICAgcmVzcG9uc2VBc3NlcnRpb24uaW5uZXJBc3NlcnRpb25zLnB1c2goYm9keUFzc2VyaW9uKTtcblxuICAgICAgICAgICAgYm9keUFzc2VyaW9uLmlubmVyQXNzZXJ0aW9ucy5wdXNoKFxuICAgICAgICAgICAgICBuZXcgQ292ZXJhZ2VBc3NlcnRpb24oJ3Jlc3BvbnNlLmhlYWRlcnM6OmNvbnRlbnQtdHlwZScsIChyZXN1bHRzKSA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IHJlc3BvbnNlcyA9IHJlc3VsdHMuZmlsdGVyKHggPT5cbiAgICAgICAgICAgICAgICAgIHgudGVzdC5yZXNwb25zZS5zdGF0dXMgPT0gc3RhdHVzQ29kZVxuICAgICAgICAgICAgICAgICAgJiZcbiAgICAgICAgICAgICAgICAgIHgudGVzdC5tZXRob2QudG9VcHBlckNhc2UoKSA9PSBtZXRob2ROYW1lXG4gICAgICAgICAgICAgICAgICAmJlxuICAgICAgICAgICAgICAgICAgKHgucmVzcG9uc2UuZ2V0KCdjb250ZW50LXR5cGUnKSB8fCAnJykudG9Mb3dlckNhc2UoKS5pbmRleE9mKGNvbnRlbnRUeXBlLnRvTG93ZXJDYXNlKCkpID09IDBcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGlmICghcmVzcG9uc2VzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgQVRMSGVscGVycy5lcnJvcihcIkNvbnRlbnQtVHlwZSBub3QgY292ZXJlZCAoXCIgKyBjb250ZW50VHlwZSArIFwiKVwiLCByZXNwb25zZXMubWFwKHggPT4geC5yZXNwb25zZS5nZXQoJ2NvbnRlbnQtdHlwZScpKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9LCBhY3R1YWxCb2R5LmNvbnRlbnRUeXBlQVNUKVxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgaWYgKGFjdHVhbEJvZHkuc2NoZW1hU3RyaW5nKSB7XG4gICAgICAgICAgICAgIGxldCB2ID0gdGhpcy5iYXQub2J0YWluU2NoZW1hVmFsaWRhdG9yKGFjdHVhbEJvZHkuc2NoZW1hU3RyaW5nKTtcblxuICAgICAgICAgICAgICBib2R5QXNzZXJpb24uaW5uZXJBc3NlcnRpb25zLnB1c2goXG4gICAgICAgICAgICAgICAgbmV3IENvdmVyYWdlQXNzZXJ0aW9uKCdyZXNwb25zZS5ib2R5IHNjaGVtYScsIChyZXN1bHRzKSA9PiB7XG4gICAgICAgICAgICAgICAgICBsZXQgcmVzcG9uc2VzID0gcmVzdWx0cy5maWx0ZXIoeCA9PlxuICAgICAgICAgICAgICAgICAgICB4LnRlc3QucmVzcG9uc2Uuc3RhdHVzID09IHN0YXR1c0NvZGVcbiAgICAgICAgICAgICAgICAgICAgJiZcbiAgICAgICAgICAgICAgICAgICAgeC50ZXN0Lm1ldGhvZC50b1VwcGVyQ2FzZSgpID09IG1ldGhvZE5hbWVcbiAgICAgICAgICAgICAgICAgICAgJiZcbiAgICAgICAgICAgICAgICAgICAgKHgucmVzcG9uc2UuZ2V0KCdjb250ZW50LXR5cGUnKSB8fCAnJykudG9Mb3dlckNhc2UoKS5pbmRleE9mKGNvbnRlbnRUeXBlLnRvTG93ZXJDYXNlKCkpID09IDBcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yYWNlKHJlc3BvbnNlcy5tYXAoeCA9PiB4LnRlc3QucHJvbWlzZSkpXG4gICAgICAgICAgICAgICAgICAgIC50aGVuKChyZXNwb25zZTogcmVxdWVzdC5SZXNwb25zZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgIGxldCB2YWxpZGF0aW9uUmVzdWx0ID0gdihyZXNwb25zZS5ib2R5KTtcblxuICAgICAgICAgICAgICAgICAgICAgIGlmICghdmFsaWRhdGlvblJlc3VsdC52YWxpZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgQVRMSGVscGVycy5lcnJvcigodmFsaWRhdGlvblJlc3VsdC5lcnJvcnMgJiYgdmFsaWRhdGlvblJlc3VsdC5lcnJvcnMubWFwKHggPT4gXCIgIFwiICsgeC5zdGFjaykpLmpvaW4oJ1xcbicpIHx8IFwiSW52YWxpZCBzY2hlbWFcIiwgcmVzcG9uc2UpO1xuICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSwgYWN0dWFsQm9keS5zY2hlbWEuaGlnaExldmVsKCkubG93TGV2ZWwoKSlcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGlmIChyZXNwb25zZS5oZWFkZXJzKSB7XG4gICAgICAgICAgICBsZXQgaGVhZGVycyA9IE9iamVjdC5rZXlzKHJlc3BvbnNlLmhlYWRlcnMpO1xuXG4gICAgICAgICAgICBoZWFkZXJzLmZvckVhY2goaGVhZGVyS2V5ID0+IHtcbiAgICAgICAgICAgICAgbGV0IGhlYWRlck9iamVjdDogUkFNTC5hcGkwOC5QYXJhbWV0ZXIgPSByZXNwb25zZS5oZWFkZXJzW2hlYWRlcktleV07XG5cbiAgICAgICAgICAgICAgaGVhZGVyS2V5ID0gaGVhZGVyS2V5LnRvTG93ZXJDYXNlKCk7XG5cbiAgICAgICAgICAgICAgbWV0aG9kQXNzZXRpb25zLmlubmVyQXNzZXJ0aW9ucy5wdXNoKFxuICAgICAgICAgICAgICAgIG5ldyBDb3ZlcmFnZUFzc2VydGlvbigncmVzcG9uc2UuaGVhZGVyczo6JyArIGhlYWRlcktleSwgKHJlc3VsdHMpID0+IHtcbiAgICAgICAgICAgICAgICAgIGxldCByZXNwb25zZXMgPSByZXN1bHRzLmZpbHRlcih4ID0+XG4gICAgICAgICAgICAgICAgICAgIHgudGVzdC5yZXNwb25zZS5zdGF0dXMgPT0gc3RhdHVzQ29kZVxuICAgICAgICAgICAgICAgICAgICAmJlxuICAgICAgICAgICAgICAgICAgICB4LnRlc3QubWV0aG9kLnRvVXBwZXJDYXNlKCkgPT0gbWV0aG9kTmFtZVxuICAgICAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmFjZShcbiAgICAgICAgICAgICAgICAgICAgcmVzcG9uc2VzLm1hcCh4ID0+IHgudGVzdC5wcm9taXNlKSlcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4oXG4gICAgICAgICAgICAgICAgICAgIChyZXNwb25zZTogcmVxdWVzdC5SZXNwb25zZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgIGxldCByZWNlaXZlZEhlYWRlcnMgPSBPYmplY3Qua2V5cyhyZXNwb25zZS5oZWFkZXIpLm1hcCh4ID0+IHgudG9Mb3dlckNhc2UoKSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICBpZiAocmVjZWl2ZWRIZWFkZXJzLmluZGV4T2YoaGVhZGVyS2V5KSA9PSAtMSlcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChoZWFkZXJPYmplY3Qub3B0aW9uYWwoKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IE9wdGlvbmFsRXJyb3IoaGVhZGVyS2V5ICsgXCIgaGVhZGVyIG5vdCByZWNlaXZlZCAoT3B0aW9uYWwpXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBBVExIZWxwZXJzLmVycm9yKGhlYWRlcktleSArIFwiIGhlYWRlciBub3QgcmVjZWl2ZWRcIiwgcmVjZWl2ZWRIZWFkZXJzKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSwgaGVhZGVyT2JqZWN0LmhpZ2hMZXZlbCgpLmxvd0xldmVsKCkpXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cblxuICByZXNvbHZlKHRlc3Q6IEFUTEhlbHBlcnMuQVRMVGVzdCwgcmVzcG9uc2U6IHJlcXVlc3QuUmVzcG9uc2UpIHtcbiAgICB0aGlzLnJlc3VsdHMucHVzaCh7XG4gICAgICB0ZXN0LFxuICAgICAgcmVzcG9uc2VcbiAgICB9KTtcbiAgfVxuXG4gIHJlZ2lzdGVyQ292ZXJhZ2VMaW5lKGxpbmVEYXRhOiB7XG4gICAgZmlsZTogc3RyaW5nO1xuICAgIGxpbmU6IG51bWJlcjtcbiAgICBsaW5lRW5kOiBudW1iZXI7XG4gICAgc3RhcnQ6IG51bWJlcjtcbiAgICBlbmQ6IG51bWJlcjtcbiAgICBjb3ZlcmVkOiBib29sZWFuO1xuICB9KSB7XG4gICAgbGV0IGNvdiA9IHRoaXMuYmF0LmNvdmVyYWdlRGF0YTtcblxuICAgIGxldCBkYXRhID0gKGNvdltsaW5lRGF0YS5maWxlXSA9IGNvdltsaW5lRGF0YS5maWxlXSB8fCB7IHNvdXJjZTogW10gfSk7XG5cbiAgICBpZiAobGluZURhdGEubGluZSA+PSAwKSB7XG4gICAgICB3aGlsZSAoKGxpbmVEYXRhLmxpbmUgKyAxKSA+IGRhdGEuc291cmNlLmxlbmd0aCkge1xuICAgICAgICBkYXRhLnNvdXJjZS5wdXNoKHVuZGVmaW5lZCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGxpbmVEYXRhLmNvdmVyZWQpIHtcbiAgICAgIGRhdGEuc291cmNlW2xpbmVEYXRhLmxpbmVdID0gKGRhdGEuc291cmNlW2xpbmVEYXRhLmxpbmVdIGFzIG51bWJlciB8fCAwKSArIDE7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRhdGEuc291cmNlW2xpbmVEYXRhLmxpbmVdID0gZGF0YS5zb3VyY2VbbGluZURhdGEubGluZV0gfHwgMDtcbiAgICB9XG4gIH1cblxuICBnZXRDb3ZlcmFnZSgpOiBQcm9taXNlPHsgdG90YWw6IG51bWJlcjsgZXJyb3JlZDogbnVtYmVyOyBub3RDb3ZlcmVkOiBudW1iZXI7IH0+IHtcbiAgICBsZXQgcHJvbSA9IEFUTEhlbHBlcnMuZmxhdFByb21pc2UoKTtcblxuICAgIGxldCB0b3RhbCA9IDA7XG4gICAgbGV0IG5vdENvdmVyZWQgPSAwO1xuICAgIGxldCBlcnJvcmVkID0gMDtcbiAgICBsZXQgbGluZXMgPSAwO1xuXG4gICAgY29uc3Qgd2FsayA9IChhc3NlcnRpb246IENvdmVyYWdlQXNzZXJ0aW9uKSA9PiB7XG4gICAgICBpZiAoYXNzZXJ0aW9uLnZhbGlkYXRpb25Gbikge1xuICAgICAgICB0b3RhbCsrO1xuXG4gICAgICAgIGlmICghYXNzZXJ0aW9uLnZhbGlkKSB7XG4gICAgICAgICAgaWYgKGFzc2VydGlvbi5lcnJvciAmJiAoYXNzZXJ0aW9uLmVycm9yIGluc3RhbmNlb2YgTm90SW1wbGVtZW50ZWRFcnJvcikpIHtcbiAgICAgICAgICAgIG5vdENvdmVyZWQrKztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZXJyb3JlZCsrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBsZXQgY292ZXJhZ2VSZXN1bHQgPSBhc3NlcnRpb24uZ2V0Q292ZXJhZ2UoKTtcblxuICAgICAgaWYgKGNvdmVyYWdlUmVzdWx0KSB7XG4gICAgICAgIHRoaXMucmVnaXN0ZXJDb3ZlcmFnZUxpbmUoY292ZXJhZ2VSZXN1bHQpO1xuICAgICAgICBsaW5lcyArPSBjb3ZlcmFnZVJlc3VsdC5saW5lRW5kIC0gY292ZXJhZ2VSZXN1bHQubGluZSArIDE7XG4gICAgICB9XG5cbiAgICAgIGlmIChhc3NlcnRpb24uaW5uZXJBc3NlcnRpb25zLmxlbmd0aCkge1xuICAgICAgICBhc3NlcnRpb24uaW5uZXJBc3NlcnRpb25zLmZvckVhY2goeCA9PiB3YWxrKHgpKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgY29uc3QgY2FsY3VsYXRlQ292ZXJhZ2UgPSAoKSA9PiB7XG4gICAgICB3YWxrKHRoaXMucmVzb3VyY2VBc3NlcnRpb24pO1xuXG4gICAgICBwcm9tLnJlc29sdmVyKHtcbiAgICAgICAgdG90YWwsXG4gICAgICAgIGVycm9yZWQsXG4gICAgICAgIG5vdENvdmVyZWRcbiAgICAgIH0pO1xuICAgIH07XG5cbiAgICB0aGlzLnJlc291cmNlQXNzZXJ0aW9uLnByb21pc2UucHJvbWlzZS50aGVuKGNhbGN1bGF0ZUNvdmVyYWdlKS5jYXRjaChjYWxjdWxhdGVDb3ZlcmFnZSk7XG5cbiAgICByZXR1cm4gcHJvbS5wcm9taXNlO1xuICB9XG5cbiAgaW5qZWN0TW9jaGFUZXN0cygpIHtcbiAgICBjb25zdCB3YWxrID0gKGFzc2VydGlvbjogQ292ZXJhZ2VBc3NlcnRpb24sIGxldmVsOiBudW1iZXIpID0+IHtcbiAgICAgIGlmIChhc3NlcnRpb24udmFsaWRhdGlvbkZuKSB7XG4gICAgICAgIGl0KGFzc2VydGlvbi5uYW1lLCBmdW5jdGlvbiAoZG9uZSkge1xuICAgICAgICAgIGNvbnN0IHRoYXQgPSB0aGlzO1xuICAgICAgICAgIGFzc2VydGlvbi5wcm9taXNlLnByb21pc2VcbiAgICAgICAgICAgIC50aGVuKCgpID0+IGRvbmUoKSlcbiAgICAgICAgICAgIC5jYXRjaChkb25lKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBpZiAoYXNzZXJ0aW9uLmlubmVyQXNzZXJ0aW9ucy5sZW5ndGgpIHtcbiAgICAgICAgZGVzY3JpYmUoYXNzZXJ0aW9uLm5hbWUsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICB0aGlzLmJhaWwoZmFsc2UpO1xuICAgICAgICAgIGFzc2VydGlvbi5pbm5lckFzc2VydGlvbnMuZm9yRWFjaCh4ID0+IHdhbGsoeCwgbGV2ZWwgKyAxKSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH07XG5cbiAgICB3YWxrKHRoaXMucmVzb3VyY2VBc3NlcnRpb24sIDApO1xuICB9XG5cbiAgcnVuKCkge1xuICAgIHJldHVybiB0aGlzLnJlc291cmNlQXNzZXJ0aW9uLnZhbGlkYXRlKHRoaXMucmVzdWx0cyk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIE5vdEltcGxlbWVudGVkRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gIGNvbnN0cnVjdG9yKG1lc3NhZ2U6IHN0cmluZykge1xuICAgIHN1cGVyKG1lc3NhZ2UpO1xuICAgIHRoaXMubWVzc2FnZSA9IG1lc3NhZ2U7XG4gICAgdGhpcy5uYW1lID0gXCJNZXRob2Qgbm90IGltcGxlbWVudGVkXCI7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIE9wdGlvbmFsRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gIGNvbnN0cnVjdG9yKG1lc3NhZ2U6IHN0cmluZykge1xuICAgIHN1cGVyKG1lc3NhZ2UpO1xuICAgIHRoaXMubWVzc2FnZSA9IG1lc3NhZ2U7XG4gICAgdGhpcy5uYW1lID0gXCJPcHRpb25hbCBFcnJvclwiO1xuICB9XG59Il19