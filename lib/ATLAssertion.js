"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var ATLHelpers_1 = require('./ATLHelpers');
var util_1 = require('util');
var _ = require('lodash');
var ATLError = (function (_super) {
    __extends(ATLError, _super);
    function ATLError() {
        _super.apply(this, arguments);
    }
    return ATLError;
}(Error));
exports.ATLError = ATLError;
var ATLSkipped = (function (_super) {
    __extends(ATLSkipped, _super);
    function ATLSkipped() {
        _super.call(this, 'SKIPPED');
    }
    return ATLSkipped;
}(Error));
exports.ATLSkipped = ATLSkipped;
var ATLAssertion = (function () {
    function ATLAssertion(parent) {
        this.parent = parent;
        this.skip = false;
        this.promise = Promise.reject(null);
    }
    ATLAssertion.prototype.error = function (data) {
        var message = data.message
            .replace('{actual}', util_1.inspect(data.actual))
            .replace('{expected}', util_1.inspect(data.expected));
        var err = new ATLError(message);
        err.actual = data.actual;
        err.expected = data.expected;
        err.assertion = this;
        throw err;
    };
    ATLAssertion.prototype.getObjectValue = function (object) {
        return ATLHelpers_1.cloneObjectUsingPointers(object, this.parent.suite.ATL.options.variables);
    };
    return ATLAssertion;
}());
exports.ATLAssertion = ATLAssertion;
var ATLResponseAssertion = (function (_super) {
    __extends(ATLResponseAssertion, _super);
    function ATLResponseAssertion(test) {
        var _this = this;
        _super.call(this, test);
        this.promise =
            test
                .requester
                .promise
                .then(function (response) {
                try {
                    var result = _this.validate(response);
                    if (!result)
                        return Promise.resolve();
                    return result;
                }
                catch (err) {
                    err.assertion = _this;
                    return Promise.reject(err);
                }
            })
                .catch(function (err) { return Promise.reject(err); });
    }
    return ATLResponseAssertion;
}(ATLAssertion));
exports.ATLResponseAssertion = ATLResponseAssertion;
var CommonAssertions;
(function (CommonAssertions) {
    var PromiseAssertion = (function (_super) {
        __extends(PromiseAssertion, _super);
        function PromiseAssertion(parent, name, evaluator) {
            _super.call(this, parent);
            this.evaluator = evaluator;
            this.name = name;
        }
        PromiseAssertion.prototype.validate = function (response) {
            return this
                .evaluator(response)
                .catch(function (err) { return Promise.resolve(err); });
        };
        return PromiseAssertion;
    }(ATLResponseAssertion));
    CommonAssertions.PromiseAssertion = PromiseAssertion;
    var StatusCodeAssertion = (function (_super) {
        __extends(StatusCodeAssertion, _super);
        function StatusCodeAssertion(parent, statusCode) {
            _super.call(this, parent);
            this.statusCode = statusCode;
            this.name = "response.status == " + statusCode;
        }
        StatusCodeAssertion.prototype.validate = function (response) {
            if (response.status != this.statusCode)
                this.error({
                    message: 'expected status code {expected} got {actual} instead',
                    expected: this.statusCode,
                    actual: response.status
                });
        };
        return StatusCodeAssertion;
    }(ATLResponseAssertion));
    CommonAssertions.StatusCodeAssertion = StatusCodeAssertion;
    var BodyEqualsAssertion = (function (_super) {
        __extends(BodyEqualsAssertion, _super);
        function BodyEqualsAssertion(parent, bodyIs) {
            _super.call(this, parent);
            this.bodyIs = bodyIs;
            this.name = "response.body is #value";
        }
        BodyEqualsAssertion.prototype.validate = function (response) {
            if (this.bodyIs && typeof this.bodyIs == "object" && this.bodyIs instanceof RegExp) {
                /* istanbul ignore if */
                if (!this.bodyIs.test(response.text)) {
                    this.error({
                        message: 'expected response.body to match {expected}, got {actual}',
                        expected: this.bodyIs,
                        actual: response.text
                    });
                }
            }
            else {
                var takenBody = void 0;
                if (typeof this.bodyIs == "string") {
                    takenBody = response.text;
                }
                else {
                    takenBody = response.body;
                }
                var bodyEquals = this.getObjectValue(this.bodyIs);
                /* istanbul ignore if */
                if (!_.isEqual(bodyEquals, takenBody)) {
                    this.error({
                        message: 'expected response.body {expected}, got {actual}',
                        expected: bodyEquals,
                        actual: takenBody
                    });
                }
            }
        };
        return BodyEqualsAssertion;
    }(ATLResponseAssertion));
    CommonAssertions.BodyEqualsAssertion = BodyEqualsAssertion;
    var BodyMatchesAssertion = (function (_super) {
        __extends(BodyMatchesAssertion, _super);
        function BodyMatchesAssertion(parent, key, value) {
            _super.call(this, parent);
            this.key = key;
            this.value = value;
            this.name = "response.body::" + key;
        }
        BodyMatchesAssertion.prototype.validate = function (response) {
            var value = this.getObjectValue(this.value);
            var readed = _.get(response.body, this.key);
            if ((!(value instanceof RegExp) && !_.isEqual(readed, value))
                ||
                    ((value instanceof RegExp) && !value.test(readed))) {
                this.error({
                    message: 'expected response.body::' + this.key + ' to match {expected}, got {actual}',
                    expected: value,
                    actual: readed
                });
            }
        };
        return BodyMatchesAssertion;
    }(ATLResponseAssertion));
    CommonAssertions.BodyMatchesAssertion = BodyMatchesAssertion;
    var CopyBodyValueOperation = (function (_super) {
        __extends(CopyBodyValueOperation, _super);
        function CopyBodyValueOperation(parent, key, value) {
            _super.call(this, parent);
            this.key = key;
            this.value = value;
            this.name = "response.body::" + key + " >> !variables " + value.path;
        }
        CopyBodyValueOperation.prototype.validate = function (response) {
            if (this.key === '*') {
                this.value.set(this.parent.suite.ATL.options.variables, response.body);
            }
            else {
                var takenValue = _.get(response.body, this.key);
                this.value.set(this.parent.suite.ATL.options.variables, takenValue);
            }
        };
        return CopyBodyValueOperation;
    }(ATLResponseAssertion));
    CommonAssertions.CopyBodyValueOperation = CopyBodyValueOperation;
    var ValidateSchemaOperation = (function (_super) {
        __extends(ValidateSchemaOperation, _super);
        function ValidateSchemaOperation(parent, schema) {
            _super.call(this, parent);
            this.schema = schema;
            this.name = "response.body schema " + schema;
        }
        ValidateSchemaOperation.prototype.validate = function (response) {
            var v = this.parent.suite.ATL.obtainSchemaValidator(this.schema);
            var validationResult = v(response.body);
            if (!validationResult.valid) {
                var errors_1 = ["Schema error:"];
                validationResult.errors && validationResult.errors.forEach(function (x) { return errors_1.push("  " + x.stack); });
                this.error({ message: errors_1.join('\n') });
            }
        };
        return ValidateSchemaOperation;
    }(ATLResponseAssertion));
    CommonAssertions.ValidateSchemaOperation = ValidateSchemaOperation;
    var HeaderMatchesAssertion = (function (_super) {
        __extends(HeaderMatchesAssertion, _super);
        function HeaderMatchesAssertion(parent, header, value) {
            _super.call(this, parent);
            this.header = header;
            this.value = value;
            this.header = header.toLowerCase();
            this.name = "response.header::" + header;
        }
        HeaderMatchesAssertion.prototype.validate = function (response) {
            var value = this.getObjectValue(this.value);
            var readed = response.get(this.header);
            if (this.header === 'content-type') {
                if (readed.indexOf(';') != -1) {
                    readed = readed.substr(0, readed.indexOf(';')).trim();
                }
            }
            if (typeof value != "string" &&
                typeof value != "number" &&
                typeof value != "undefined" &&
                typeof value != "object" &&
                !(value instanceof RegExp) &&
                value !== null) {
                this.error({
                    message: 'readed value of header MUST be string, number or undefined, got {expected} instead. response.header::' + this.header + ' is {actual}',
                    expected: value,
                    actual: readed
                });
            }
            if ((!(value instanceof RegExp) && !_.isEqual(readed, value))
                ||
                    ((value instanceof RegExp) && !value.test(readed))) {
                this.error({
                    message: 'expected response.header::' + this.header + ' to match {expected}, got {actual}',
                    expected: value,
                    actual: readed
                });
            }
        };
        return HeaderMatchesAssertion;
    }(ATLResponseAssertion));
    CommonAssertions.HeaderMatchesAssertion = HeaderMatchesAssertion;
})(CommonAssertions = exports.CommonAssertions || (exports.CommonAssertions = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQVRMQXNzZXJ0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiQVRMQXNzZXJ0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLDJCQUFrRCxjQUFjLENBQUMsQ0FBQTtBQUNqRSxxQkFBd0IsTUFBTSxDQUFDLENBQUE7QUFFL0IsSUFBTyxDQUFDLFdBQVcsUUFBUSxDQUFDLENBQUM7QUFHN0I7SUFBOEIsNEJBQUs7SUFBbkM7UUFBOEIsOEJBQUs7SUFJbkMsQ0FBQztJQUFELGVBQUM7QUFBRCxDQUFDLEFBSkQsQ0FBOEIsS0FBSyxHQUlsQztBQUpZLGdCQUFRLFdBSXBCLENBQUE7QUFFRDtJQUFnQyw4QkFBSztJQUNuQztRQUNFLGtCQUFNLFNBQVMsQ0FBQyxDQUFDO0lBQ25CLENBQUM7SUFDSCxpQkFBQztBQUFELENBQUMsQUFKRCxDQUFnQyxLQUFLLEdBSXBDO0FBSlksa0JBQVUsYUFJdEIsQ0FBQTtBQUVEO0lBTUUsc0JBQW1CLE1BQWU7UUFBZixXQUFNLEdBQU4sTUFBTSxDQUFTO1FBRmxDLFNBQUksR0FBWSxLQUFLLENBQUM7UUFHcEIsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3RDLENBQUM7SUFFRCw0QkFBSyxHQUFMLFVBQU0sSUFBdUQ7UUFDM0QsSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU87YUFDdkIsT0FBTyxDQUFDLFVBQVUsRUFBRSxjQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2FBQ3pDLE9BQU8sQ0FBQyxZQUFZLEVBQUUsY0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBRWpELElBQUksR0FBRyxHQUFHLElBQUksUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2hDLEdBQUcsQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQztRQUN6QixHQUFHLENBQUMsUUFBUSxHQUFHLElB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QUFjO29CQUMvSSxRQUFRLEVBQUUsS0FBSztvQkFDZixNQUFNLEVBQUUsTUFBTTtpQkFDZixDQUFDLENBQUM7WUFDTCxDQUFDO1lBRUQsRUFBRSxDQUFDLENBQ0QsQ0FBQyxDQUFDLENBQUMsS0FBSyxZQUFZLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7O29CQUV6RCxDQUFDLENBQUMsS0FBSyxZQUFZLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FDbkQsQ0FBQyxDQUFDLENBQUM7Z0JBQ0QsSUFBSSxDQUFDLEtBQUssQ0FBQztvQkFDVCxPQUFPLEVBQUUsNEJBQTRCLEdBQUcsSUFBSSxDQUFDLE1BQU0sR0FBRyxvQ0FBb0M7b0JBQzFGLFFBQVEsRUFBRSxLQUFLO29CQUNmLE1BQU0sRUFBRSxNQUFNO2lCQUNmLENBQUMsQ0FBQztZQUNMLENBQUM7UUFDSCxDQUFDO1FBQ0gsNkJBQUM7SUFBRCxDQUFDLEFBN0NELENBQTRDLG9CQUFvQixHQTZDL0Q7SUE3Q1ksdUNBQXNCLHlCQTZDbEMsQ0FBQTtBQUVILENBQUMsRUFyTGdCLGdCQUFnQixHQUFoQix3QkFBZ0IsS0FBaEIsd0JBQWdCLFFBcUxoQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFUTFRlc3QsIGNsb25lT2JqZWN0VXNpbmdQb2ludGVycyB9IGZyb20gJy4vQVRMSGVscGVycyc7XG5pbXBvcnQgeyBpbnNwZWN0IH0gZnJvbSAndXRpbCc7XG5pbXBvcnQgeyBSZXNwb25zZSB9IGZyb20gJ3N1cGVyYWdlbnQnO1xuaW1wb3J0IF8gPSByZXF1aXJlKCdsb2Rhc2gnKTtcbmltcG9ydCB7IFBvaW50ZXIgfSBmcm9tICcuL1BvaW50ZXInO1xuXG5leHBvcnQgY2xhc3MgQVRMRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gIGV4cGVjdGVkOiBhbnk7XG4gIGFjdHVhbDogYW55O1xuICBhc3NlcnRpb246IEFUTEFzc2VydGlvbjtcbn1cblxuZXhwb3J0IGNsYXNzIEFUTFNraXBwZWQgZXh0ZW5kcyBFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKCdTS0lQUEVEJyk7XG4gIH1cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFUTEFzc2VydGlvbiB7XG4gIHByb21pc2U6IFByb21pc2U8QVRMRXJyb3I+O1xuICBuYW1lOiBzdHJpbmc7XG5cbiAgc2tpcDogYm9vbGVhbiA9IGZhbHNlO1xuXG4gIGNvbnN0cnVjdG9yKHB1YmxpYyBwYXJlbnQ6IEFUTFRlc3QpIHtcbiAgICB0aGlzLnByb21pc2UgPSBQcm9taXNlLnJlamVjdChudWxsKTtcbiAgfVxuXG4gIGVycm9yKGRhdGE6IHsgYWN0dWFsPzogYW55OyBleHBlY3RlZD86IGFueTsgbWVzc2FnZTogc3RyaW5nIH0pIHtcbiAgICBsZXQgbWVzc2FnZSA9IGRhdGEubWVzc2FnZVxuICAgICAgLnJlcGxhY2UoJ3thY3R1YWx9JywgaW5zcGVjdChkYXRhLmFjdHVhbCkpXG4gICAgICAucmVwbGFjZSgne2V4cGVjdGVkfScsIGluc3BlY3QoZGF0YS5leHBlY3RlZCkpO1xuXG4gICAgbGV0IGVyciA9IG5ldyBBVExFcnJvcihtZXNzYWdlKTtcbiAgICBlcnIuYWN0dWFsID0gZGF0YS5hY3R1YWw7XG4gICAgZXJyLmV4cGVjdGVkID0gZGF0YS5leHBlY3RlZDtcbiAgICBlcnIuYXNzZXJ0aW9uID0gdGhpcztcbiAgICB0aHJvdyBlcnI7XG4gIH1cblxuICBwcm90ZWN0ZWQgZ2V0T2JqZWN0VmFsdWUob2JqZWN0OiBhbnkpIHtcbiAgICByZXR1cm4gY2xvbmVPYmplY3RVc2luZ1BvaW50ZXJzKG9iamVjdCwgdGhpcy5wYXJlbnQuc3VpdGUuQVRMLm9wdGlvbnMudmFyaWFibGVzKTtcbiAgfVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQVRMUmVzcG9uc2VBc3NlcnRpb24gZXh0ZW5kcyBBVExBc3NlcnRpb24ge1xuICBjb25zdHJ1Y3Rvcih0ZXN0OiBBVExUZXN0KSB7XG4gICAgc3VwZXIodGVzdCk7XG5cbiAgICB0aGlzLnByb21pc2UgPVxuICAgICAgdGVzdFxuICAgICAgICAucmVxdWVzdGVyXG4gICAgICAgIC5wcm9taXNlXG4gICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgbGV0IHJlc3VsdCA9IHRoaXMudmFsaWRhdGUocmVzcG9uc2UpO1xuICAgICAgICAgICAgaWYgKCFyZXN1bHQpXG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQgYXMgUHJvbWlzZTxBVExFcnJvcj47XG4gICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBlcnIuYXNzZXJ0aW9uID0gdGhpcztcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChlcnIpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgICAgLy8gd2UgZG9uJ3QgY2FyZSBhYm91dCBJTyBlcnJvcnNcbiAgICAgICAgLmNhdGNoKGVyciA9PiBQcm9taXNlLnJlamVjdChlcnIpKTtcbiAgfVxuXG4gIGFic3RyYWN0IHZhbGlkYXRlKHJlc3BvbnNlOiBSZXNwb25zZSk6IFByb21pc2U8QVRMRXJyb3I+IHwgdm9pZDtcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDb21tb25Bc3NlcnRpb25zIHtcblxuICBleHBvcnQgY2xhc3MgUHJvbWlzZUFzc2VydGlvbiBleHRlbmRzIEFUTFJlc3BvbnNlQXNzZXJ0aW9uIHtcbiAgICBjb25zdHJ1Y3RvcihwYXJlbnQ6IEFUTFRlc3QsIG5hbWU6IHN0cmluZywgcHVibGljIGV2YWx1YXRvcjogKHJlczogUmVzcG9uc2UpID0+IFByb21pc2U8RXJyb3IgfCBBVExFcnJvciB8IHZvaWQ+KSB7XG4gICAgICBzdXBlcihwYXJlbnQpO1xuICAgICAgdGhpcy5uYW1lID0gbmFtZTtcbiAgICB9XG5cbiAgICB2YWxpZGF0ZShyZXNwb25zZTogUmVzcG9uc2UpIHtcbiAgICAgIHJldHVybiB0aGlzXG4gICAgICAgIC5ldmFsdWF0b3IocmVzcG9uc2UpXG4gICAgICAgIC5jYXRjaChlcnIgPT4gUHJvbWlzZS5yZXNvbHZlKGVycikpO1xuICAgIH1cbiAgfVxuXG4gIGV4cG9ydCBjbGFzcyBTdGF0dXNDb2RlQXNzZXJ0aW9uIGV4dGVuZHMgQVRMUmVzcG9uc2VBc3NlcnRpb24ge1xuICAgIGNvbnN0cnVjdG9yKHBhcmVudDogQVRMVGVzdCwgcHVibGljIHN0YXR1c0NvZGU6IG51bWJlcikge1xuICAgICAgc3VwZXIocGFyZW50KTtcbiAgICAgIHRoaXMubmFtZSA9IFwicmVzcG9uc2Uuc3RhdHVzID09IFwiICsgc3RhdHVzQ29kZTtcbiAgICB9XG5cbiAgICB2YWxpZGF0ZShyZXNwb25zZTogUmVzcG9uc2UpIHtcbiAgICAgIGlmIChyZXNwb25zZS5zdGF0dXMgIT0gdGhpcy5zdGF0dXNDb2RlKVxuICAgICAgICB0aGlzLmVycm9yKHtcbiAgICAgICAgICBtZXNzYWdlOiAnZXhwZWN0ZWQgc3RhdHVzIGNvZGUge2V4cGVjdGVkfSBnb3Qge2FjdHVhbH0gaW5zdGVhZCcsXG4gICAgICAgICAgZXhwZWN0ZWQ6IHRoaXMuc3RhdHVzQ29kZSxcbiAgICAgICAgICBhY3R1YWw6IHJlc3BvbnNlLnN0YXR1c1xuICAgICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBleHBvcnQgY2xhc3MgQm9keUVxdWFsc0Fzc2VydGlvbiBleHRlbmRzIEFUTFJlc3BvbnNlQXNzZXJ0aW9uIHtcbiAgICBjb25zdHJ1Y3RvcihwYXJlbnQ6IEFUTFRlc3QsIHB1YmxpYyBib2R5SXM6IGFueSkge1xuICAgICAgc3VwZXIocGFyZW50KTtcbiAgICAgIHRoaXMubmFtZSA9IFwicmVzcG9uc2UuYm9keSBpcyAjdmFsdWVcIjtcbiAgICB9XG5cbiAgICB2YWxpZGF0ZShyZXNwb25zZTogUmVzcG9uc2UpIHtcbiAgICAgIGlmICh0aGlzLmJvZHlJcyAmJiB0eXBlb2YgdGhpcy5ib2R5SXMgPT0gXCJvYmplY3RcIiAmJiB0aGlzLmJvZHlJcyBpbnN0YW5jZW9mIFJlZ0V4cCkge1xuICAgICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgaWYgKi9cbiAgICAgICAgaWYgKCF0aGlzLmJvZHlJcy50ZXN0KHJlc3BvbnNlLnRleHQpKSB7XG4gICAgICAgICAgdGhpcy5lcnJvcih7XG4gICAgICAgICAgICBtZXNzYWdlOiAnZXhwZWN0ZWQgcmVzcG9uc2UuYm9keSB0byBtYXRjaCB7ZXhwZWN0ZWR9LCBnb3Qge2FjdHVhbH0nLFxuICAgICAgICAgICAgZXhwZWN0ZWQ6IHRoaXMuYm9keUlzLFxuICAgICAgICAgICAgYWN0dWFsOiByZXNwb25zZS50ZXh0XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxldCB0YWtlbkJvZHk7XG5cbiAgICAgICAgaWYgKHR5cGVvZiB0aGlzLmJvZHlJcyA9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgdGFrZW5Cb2R5ID0gcmVzcG9uc2UudGV4dDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0YWtlbkJvZHkgPSByZXNwb25zZS5ib2R5O1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGJvZHlFcXVhbHMgPSB0aGlzLmdldE9iamVjdFZhbHVlKHRoaXMuYm9keUlzKTtcblxuICAgICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgaWYgKi9cbiAgICAgICAgaWYgKCFfLmlzRXF1YWwoYm9keUVxdWFscywgdGFrZW5Cb2R5KSkge1xuICAgICAgICAgIHRoaXMuZXJyb3Ioe1xuICAgICAgICAgICAgbWVzc2FnZTogJ2V4cGVjdGVkIHJlc3BvbnNlLmJvZHkge2V4cGVjdGVkfSwgZ290IHthY3R1YWx9JyxcbiAgICAgICAgICAgIGV4cGVjdGVkOiBib2R5RXF1YWxzLFxuICAgICAgICAgICAgYWN0dWFsOiB0YWtlbkJvZHlcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG5cbiAgZXhwb3J0IGNsYXNzIEJvZHlNYXRjaGVzQXNzZXJ0aW9uIGV4dGVuZHMgQVRMUmVzcG9uc2VBc3NlcnRpb24ge1xuICAgIGNvbnN0cnVjdG9yKHBhcmVudDogQVRMVGVzdCwgcHVibGljIGtleTogc3RyaW5nLCBwdWJsaWMgdmFsdWU6IGFueSkge1xuICAgICAgc3VwZXIocGFyZW50KTtcbiAgICAgIHRoaXMubmFtZSA9IFwicmVzcG9uc2UuYm9keTo6XCIgKyBrZXk7XG4gICAgfVxuXG4gICAgdmFsaWRhdGUocmVzcG9uc2U6IFJlc3BvbnNlKSB7XG4gICAgICBsZXQgdmFsdWU6IGFueSA9IHRoaXMuZ2V0T2JqZWN0VmFsdWUodGhpcy52YWx1ZSk7XG5cbiAgICAgIGxldCByZWFkZWQgPSBfLmdldChyZXNwb25zZS5ib2R5LCB0aGlzLmtleSk7XG5cbiAgICAgIGlmIChcbiAgICAgICAgKCEodmFsdWUgaW5zdGFuY2VvZiBSZWdFeHApICYmICFfLmlzRXF1YWwocmVhZGVkLCB2YWx1ZSkpXG4gICAgICAgIHx8XG4gICAgICAgICgodmFsdWUgaW5zdGFuY2VvZiBSZWdFeHApICYmICF2YWx1ZS50ZXN0KHJlYWRlZCkpXG4gICAgICApIHtcbiAgICAgICAgdGhpcy5lcnJvcih7XG4gICAgICAgICAgbWVzc2FnZTogJ2V4cGVjdGVkIHJlc3BvbnNlLmJvZHk6OicgKyB0aGlzLmtleSArICcgdG8gbWF0Y2gge2V4cGVjdGVkfSwgZ290IHthY3R1YWx9JyxcbiAgICAgICAgICBleHBlY3RlZDogdmFsdWUsXG4gICAgICAgICAgYWN0dWFsOiByZWFkZWRcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cblxuICBleHBvcnQgY2xhc3MgQ29weUJvZHlWYWx1ZU9wZXJhdGlvbiBleHRlbmRzIEFUTFJlc3BvbnNlQXNzZXJ0aW9uIHtcbiAgICBjb25zdHJ1Y3RvcihwYXJlbnQ6IEFUTFRlc3QsIHB1YmxpYyBrZXk6IHN0cmluZywgcHVibGljIHZhbHVlOiBQb2ludGVyKSB7XG4gICAgICBzdXBlcihwYXJlbnQpO1xuICAgICAgdGhpcy5uYW1lID0gXCJyZXNwb25zZS5ib2R5OjpcIiArIGtleSArIFwiID4+ICF2YXJpYWJsZXMgXCIgKyB2YWx1ZS5wYXRoO1xuICAgIH1cblxuICAgIHZhbGlkYXRlKHJlc3BvbnNlOiBSZXNwb25zZSkge1xuICAgICAgaWYgKHRoaXMua2V5ID09PSAnKicpIHtcbiAgICAgICAgdGhpcy52YWx1ZS5zZXQodGhpcy5wYXJlbnQuc3VpdGUuQVRMLm9wdGlvbnMudmFyaWFibGVzLCByZXNwb25zZS5ib2R5KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxldCB0YWtlblZhbHVlID0gXy5nZXQocmVzcG9uc2UuYm9keSwgdGhpcy5rZXkpO1xuICAgICAgICB0aGlzLnZhbHVlLnNldCh0aGlzLnBhcmVudC5zdWl0ZS5BVEwub3B0aW9ucy52YXJpYWJsZXMsIHRha2VuVmFsdWUpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGV4cG9ydCBjbGFzcyBWYWxpZGF0ZVNjaGVtYU9wZXJhdGlvbiBleHRlbmRzIEFUTFJlc3BvbnNlQXNzZXJ0aW9uIHtcbiAgICBjb25zdHJ1Y3RvcihwYXJlbnQ6IEFUTFRlc3QsIHB1YmxpYyBzY2hlbWE6IHN0cmluZykge1xuICAgICAgc3VwZXIocGFyZW50KTtcbiAgICAgIHRoaXMubmFtZSA9IFwicmVzcG9uc2UuYm9keSBzY2hlbWEgXCIgKyBzY2hlbWE7XG4gICAgfVxuXG4gICAgdmFsaWRhdGUocmVzcG9uc2U6IFJlc3BvbnNlKSB7XG4gICAgICBsZXQgdiA9IHRoaXMucGFyZW50LnN1aXRlLkFUTC5vYnRhaW5TY2hlbWFWYWxpZGF0b3IodGhpcy5zY2hlbWEpO1xuXG4gICAgICBsZXQgdmFsaWRhdGlvblJlc3VsdCA9IHYocmVzcG9uc2UuYm9keSk7XG5cbiAgICAgIGlmICghdmFsaWRhdGlvblJlc3VsdC52YWxpZCkge1xuICAgICAgICBsZXQgZXJyb3JzID0gW1wiU2NoZW1hIGVycm9yOlwiXTtcblxuICAgICAgICB2YWxpZGF0aW9uUmVzdWx0LmVycm9ycyAmJiB2YWxpZGF0aW9uUmVzdWx0LmVycm9ycy5mb3JFYWNoKHggPT4gZXJyb3JzLnB1c2goXCIgIFwiICsgeC5zdGFjaykpO1xuXG4gICAgICAgIHRoaXMuZXJyb3IoeyBtZXNzYWdlOiBlcnJvcnMuam9pbignXFxuJykgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZXhwb3J0IGNsYXNzIEhlYWRlck1hdGNoZXNBc3NlcnRpb24gZXh0ZW5kcyBBVExSZXNwb25zZUFzc2VydGlvbiB7XG4gICAgY29uc3RydWN0b3IocGFyZW50OiBBVExUZXN0LCBwdWJsaWMgaGVhZGVyOiBzdHJpbmcsIHB1YmxpYyB2YWx1ZTogYW55KSB7XG4gICAgICBzdXBlcihwYXJlbnQpO1xuICAgICAgdGhpcy5oZWFkZXIgPSBoZWFkZXIudG9Mb3dlckNhc2UoKTtcbiAgICAgIHRoaXMubmFtZSA9IFwicmVzcG9uc2UuaGVhZGVyOjpcIiArIGhlYWRlcjtcbiAgICB9XG5cbiAgICB2YWxpZGF0ZShyZXNwb25zZTogUmVzcG9uc2UpIHtcbiAgICAgIGxldCB2YWx1ZTogYW55ID0gdGhpcy5nZXRPYmplY3RWYWx1ZSh0aGlzLnZhbHVlKTtcblxuICAgICAgbGV0IHJlYWRlZCA9IHJlc3BvbnNlLmdldCh0aGlzLmhlYWRlcik7XG5cbiAgICAgIGlmICh0aGlzLmhlYWRlciA9PT0gJ2NvbnRlbnQtdHlwZScpIHtcbiAgICAgICAgaWYgKHJlYWRlZC5pbmRleE9mKCc7JykgIT0gLTEpIHtcbiAgICAgICAgICByZWFkZWQgPSByZWFkZWQuc3Vic3RyKDAsIHJlYWRlZC5pbmRleE9mKCc7JykpLnRyaW0oKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHR5cGVvZiB2YWx1ZSAhPSBcInN0cmluZ1wiICYmXG4gICAgICAgIHR5cGVvZiB2YWx1ZSAhPSBcIm51bWJlclwiICYmXG4gICAgICAgIHR5cGVvZiB2YWx1ZSAhPSBcInVuZGVmaW5lZFwiICYmXG4gICAgICAgIHR5cGVvZiB2YWx1ZSAhPSBcIm9iamVjdFwiICYmXG4gICAgICAgICEodmFsdWUgaW5zdGFuY2VvZiBSZWdFeHApICYmXG4gICAgICAgIHZhbHVlICE9PSBudWxsXG4gICAgICApIHtcbiAgICAgICAgdGhpcy5lcnJvcih7XG4gICAgICAgICAgbWVzc2FnZTogJ3JlYWRlZCB2YWx1ZSBvZiBoZWFkZXIgTVVTVCBiZSBzdHJpbmcsIG51bWJlciBvciB1bmRlZmluZWQsIGdvdCB7ZXhwZWN0ZWR9IGluc3RlYWQuIHJlc3BvbnNlLmhlYWRlcjo6JyArIHRoaXMuaGVhZGVyICsgJyBpcyB7YWN0dWFsfScsXG4gICAgICAgICAgZXhwZWN0ZWQ6IHZhbHVlLFxuICAgICAgICAgIGFjdHVhbDogcmVhZGVkXG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgICghKHZhbHVlIGluc3RhbmNlb2YgUmVnRXhwKSAmJiAhXy5pc0VxdWFsKHJlYWRlZCwgdmFsdWUpKVxuICAgICAgICB8fFxuICAgICAgICAoKHZhbHVlIGluc3RhbmNlb2YgUmVnRXhwKSAmJiAhdmFsdWUudGVzdChyZWFkZWQpKVxuICAgICAgKSB7XG4gICAgICAgIHRoaXMuZXJyb3Ioe1xuICAgICAgICAgIG1lc3NhZ2U6ICdleHBlY3RlZCByZXNwb25zZS5oZWFkZXI6OicgKyB0aGlzLmhlYWRlciArICcgdG8gbWF0Y2gge2V4cGVjdGVkfSwgZ290IHthY3R1YWx9JyxcbiAgICAgICAgICBleHBlY3RlZDogdmFsdWUsXG4gICAgICAgICAgYWN0dWFsOiByZWFkZWRcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbn0iXX0=