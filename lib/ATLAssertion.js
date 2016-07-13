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
            this.name = "response.body::" + key + " >> " + value.path;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQVRMQXNzZXJ0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiQVRMQXNzZXJ0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLDJCQUFrRCxjQUFjLENBQUMsQ0FBQTtBQUNqRSxxQkFBd0IsTUFBTSxDQUFDLENBQUE7QUFFL0IsSUFBTyxDQUFDLFdBQVcsUUFBUSxDQUFDLENBQUM7QUFHN0I7SUFBOEIsNEJBQUs7SUFBbkM7UUFBOEIsOEJBQUs7SUFJbkMsQ0FBQztJQUFELGVBQUM7QUFBRCxDQUFDLEFBSkQsQ0FBOEIsS0FBSyxHQUlsQztBQUpZLGdCQUFRLFdBSXBCLENBQUE7QUFFRDtJQUFnQyw4QkFBSztJQUNuQztRQUNFLGtCQUFNLFNBQVMsQ0FBQyxDQUFDO0lBQ25CLENBQUM7SUFDSCxpQkFBQztBQUFELENBQUMsQUFKRCxDQUFnQyxLQUFLLEdBSXBDO0FBSlksa0JBQVUsYUFJdEIsQ0FBQTtBQUVEO0lBSUUsc0JBQW1CLE1BQWU7UUFBZixXQUFNLEdBQU4sTUFBTSxDQUFTO1FBQ2hDLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN0QyxDQUFDO0lBRUQsNEJBQUssR0FBTCxVQUFNLElBQXVEO1FBQzNELElBQUksT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPO2FBQ3ZCLE9BQU8sQ0FBQyxVQUFVLEVBQUUsY0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQzthQUN6QyxPQUFPLENBQUMsWUFBWSxFQUFFLGNBQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztRQUVqRCxJQUFJLEdBQUcsR0FBRyxJQUFJLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNoQyxHQUFHLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7UUFDekIsR0FBRyxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDO1FBQzdCLEdB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QUssSUFDWixDQUFDLENBQUMsQ0FBQztnQkFDRCxJQUFJLENBQUMsS0FBSyxDQUFDO29CQUNULE9BQU8sRUFBRSx1R0FBdUcsR0FBRyxJQUFJLENBQUMsTUFBTSxHQUFHLGNBQWM7b0JBQy9JLFFBQVEsRUFBRSxLQUFLO29CQUNmLE1BQU0sRUFBRSxNQUFNO2lCQUNmLENBQUMsQ0FBQztZQUNMLENBQUM7WUFFRCxFQUFFLENBQUMsQ0FDRCxDQUFDLENBQUMsQ0FBQyxLQUFLLFlBQVksTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQzs7b0JBRXpELENBQUMsQ0FBQyxLQUFLLFlBQVksTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUNuRCxDQUFDLENBQUMsQ0FBQztnQkFDRCxJQUFJLENBQUMsS0FBSyxDQUFDO29CQUNULE9BQU8sRUFBRSw0QkFBNEIsR0FBRyxJQUFJLENBQUMsTUFBTSxHQUFHLG9DQUFvQztvQkFDMUYsUUFBUSxFQUFFLEtBQUs7b0JBQ2YsTUFBTSxFQUFFLE1BQU07aUJBQ2YsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztRQUNILENBQUM7UUFDSCw2QkFBQztJQUFELENBQUMsQUE3Q0QsQ0FBNEMsb0JBQW9CLEdBNkMvRDtJQTdDWSx1Q0FBc0IseUJBNkNsQyxDQUFBO0FBRUgsQ0FBQyxFQWhLZ0IsZ0JBQWdCLEdBQWhCLHdCQUFnQixLQUFoQix3QkFBZ0IsUUFnS2hDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQVRMVGVzdCwgY2xvbmVPYmplY3RVc2luZ1BvaW50ZXJzIH0gZnJvbSAnLi9BVExIZWxwZXJzJztcbmltcG9ydCB7IGluc3BlY3QgfSBmcm9tICd1dGlsJztcbmltcG9ydCB7IFJlc3BvbnNlIH0gZnJvbSAnc3VwZXJhZ2VudCc7XG5pbXBvcnQgXyA9IHJlcXVpcmUoJ2xvZGFzaCcpO1xuaW1wb3J0IHsgUG9pbnRlciB9IGZyb20gJy4vUG9pbnRlcic7XG5cbmV4cG9ydCBjbGFzcyBBVExFcnJvciBleHRlbmRzIEVycm9yIHtcbiAgZXhwZWN0ZWQ6IGFueTtcbiAgYWN0dWFsOiBhbnk7XG4gIGFzc2VydGlvbjogQVRMQXNzZXJ0aW9uO1xufVxuXG5leHBvcnQgY2xhc3MgQVRMU2tpcHBlZCBleHRlbmRzIEVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoJ1NLSVBQRUQnKTtcbiAgfVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQVRMQXNzZXJ0aW9uIHtcbiAgcHJvbWlzZTogUHJvbWlzZTxBVExFcnJvcj47XG4gIG5hbWU6IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihwdWJsaWMgcGFyZW50OiBBVExUZXN0KSB7XG4gICAgdGhpcy5wcm9taXNlID0gUHJvbWlzZS5yZWplY3QobnVsbCk7XG4gIH1cblxuICBlcnJvcihkYXRhOiB7IGFjdHVhbD86IGFueTsgZXhwZWN0ZWQ/OiBhbnk7IG1lc3NhZ2U6IHN0cmluZyB9KSB7XG4gICAgbGV0IG1lc3NhZ2UgPSBkYXRhLm1lc3NhZ2VcbiAgICAgIC5yZXBsYWNlKCd7YWN0dWFsfScsIGluc3BlY3QoZGF0YS5hY3R1YWwpKVxuICAgICAgLnJlcGxhY2UoJ3tleHBlY3RlZH0nLCBpbnNwZWN0KGRhdGEuZXhwZWN0ZWQpKTtcblxuICAgIGxldCBlcnIgPSBuZXcgQVRMRXJyb3IobWVzc2FnZSk7XG4gICAgZXJyLmFjdHVhbCA9IGRhdGEuYWN0dWFsO1xuICAgIGVyci5leHBlY3RlZCA9IGRhdGEuZXhwZWN0ZWQ7XG4gICAgZXJyLmFzc2VydGlvbiA9IHRoaXM7XG4gICAgdGhyb3cgZXJyO1xuICB9XG5cbiAgcHJvdGVjdGVkIGdldE9iamVjdFZhbHVlKG9iamVjdDogYW55KSB7XG4gICAgcmV0dXJuIGNsb25lT2JqZWN0VXNpbmdQb2ludGVycyhvYmplY3QsIHRoaXMucGFyZW50LnN1aXRlLkFUTC5vcHRpb25zLnZhcmlhYmxlcyk7XG4gIH1cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFUTFJlc3BvbnNlQXNzZXJ0aW9uIGV4dGVuZHMgQVRMQXNzZXJ0aW9uIHtcbiAgY29uc3RydWN0b3IodGVzdDogQVRMVGVzdCkge1xuICAgIHN1cGVyKHRlc3QpO1xuXG4gICAgdGhpcy5wcm9taXNlID1cbiAgICAgIHRlc3RcbiAgICAgICAgLnJlcXVlc3RlclxuICAgICAgICAucHJvbWlzZVxuICAgICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGxldCByZXN1bHQgPSB0aGlzLnZhbGlkYXRlKHJlc3BvbnNlKTtcbiAgICAgICAgICAgIGlmICghcmVzdWx0KVxuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0IGFzIFByb21pc2U8QVRMRXJyb3I+O1xuICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgZXJyLmFzc2VydGlvbiA9IHRoaXM7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICAgIC8vIHdlIGRvbid0IGNhcmUgYWJvdXQgSU8gZXJyb3JzXG4gICAgICAgIC5jYXRjaChlcnIgPT4gUHJvbWlzZS5yZWplY3QoZXJyKSk7XG4gIH1cblxuICBhYnN0cmFjdCB2YWxpZGF0ZShyZXNwb25zZTogUmVzcG9uc2UpOiBQcm9taXNlPEFUTEVycm9yPiB8IHZvaWQ7XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ29tbW9uQXNzZXJ0aW9ucyB7XG5cbiAgZXhwb3J0IGNsYXNzIFByb21pc2VBc3NlcnRpb24gZXh0ZW5kcyBBVExSZXNwb25zZUFzc2VydGlvbiB7XG4gICAgY29uc3RydWN0b3IocGFyZW50OiBBVExUZXN0LCBuYW1lOiBzdHJpbmcsIHB1YmxpYyBldmFsdWF0b3I6IChyZXM6IFJlc3BvbnNlKSA9PiBQcm9taXNlPEVycm9yIHwgQVRMRXJyb3IgfCB2b2lkPikge1xuICAgICAgc3VwZXIocGFyZW50KTtcbiAgICAgIHRoaXMubmFtZSA9IG5hbWU7XG4gICAgfVxuXG4gICAgdmFsaWRhdGUocmVzcG9uc2U6IFJlc3BvbnNlKSB7XG4gICAgICByZXR1cm4gdGhpc1xuICAgICAgICAuZXZhbHVhdG9yKHJlc3BvbnNlKVxuICAgICAgICAuY2F0Y2goZXJyID0+IFByb21pc2UucmVzb2x2ZShlcnIpKTtcbiAgICB9XG4gIH1cblxuICBleHBvcnQgY2xhc3MgU3RhdHVzQ29kZUFzc2VydGlvbiBleHRlbmRzIEFUTFJlc3BvbnNlQXNzZXJ0aW9uIHtcbiAgICBjb25zdHJ1Y3RvcihwYXJlbnQ6IEFUTFRlc3QsIHB1YmxpYyBzdGF0dXNDb2RlOiBudW1iZXIpIHtcbiAgICAgIHN1cGVyKHBhcmVudCk7XG4gICAgICB0aGlzLm5hbWUgPSBcInJlc3BvbnNlLnN0YXR1cyA9PSBcIiArIHN0YXR1c0NvZGU7XG4gICAgfVxuXG4gICAgdmFsaWRhdGUocmVzcG9uc2U6IFJlc3BvbnNlKSB7XG4gICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzICE9IHRoaXMuc3RhdHVzQ29kZSlcbiAgICAgICAgdGhpcy5lcnJvcih7XG4gICAgICAgICAgbWVzc2FnZTogJ2V4cGVjdGVkIHN0YXR1cyBjb2RlIHtleHBlY3RlZH0gZ290IHthY3R1YWx9IGluc3RlYWQnLFxuICAgICAgICAgIGV4cGVjdGVkOiB0aGlzLnN0YXR1c0NvZGUsXG4gICAgICAgICAgYWN0dWFsOiByZXNwb25zZS5zdGF0dXNcbiAgICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgZXhwb3J0IGNsYXNzIEJvZHlFcXVhbHNBc3NlcnRpb24gZXh0ZW5kcyBBVExSZXNwb25zZUFzc2VydGlvbiB7XG4gICAgY29uc3RydWN0b3IocGFyZW50OiBBVExUZXN0LCBwdWJsaWMgYm9keUlzOiBhbnkpIHtcbiAgICAgIHN1cGVyKHBhcmVudCk7XG4gICAgICB0aGlzLm5hbWUgPSBcInJlc3BvbnNlLmJvZHkgaXMgI3ZhbHVlXCI7XG4gICAgfVxuXG4gICAgdmFsaWRhdGUocmVzcG9uc2U6IFJlc3BvbnNlKSB7XG4gICAgICBpZiAodGhpcy5ib2R5SXMgJiYgdHlwZW9mIHRoaXMuYm9keUlzID09IFwib2JqZWN0XCIgJiYgdGhpcy5ib2R5SXMgaW5zdGFuY2VvZiBSZWdFeHApIHtcbiAgICAgICAgLyogaXN0YW5idWwgaWdub3JlIGlmICovXG4gICAgICAgIGlmICghdGhpcy5ib2R5SXMudGVzdChyZXNwb25zZS50ZXh0KSkge1xuICAgICAgICAgIHRoaXMuZXJyb3Ioe1xuICAgICAgICAgICAgbWVzc2FnZTogJ2V4cGVjdGVkIHJlc3BvbnNlLmJvZHkgdG8gbWF0Y2gge2V4cGVjdGVkfSwgZ290IHthY3R1YWx9JyxcbiAgICAgICAgICAgIGV4cGVjdGVkOiB0aGlzLmJvZHlJcyxcbiAgICAgICAgICAgIGFjdHVhbDogcmVzcG9uc2UudGV4dFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsZXQgdGFrZW5Cb2R5O1xuXG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy5ib2R5SXMgPT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgIHRha2VuQm9keSA9IHJlc3BvbnNlLnRleHQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGFrZW5Cb2R5ID0gcmVzcG9uc2UuYm9keTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBib2R5RXF1YWxzID0gdGhpcy5nZXRPYmplY3RWYWx1ZSh0aGlzLmJvZHlJcyk7XG5cbiAgICAgICAgLyogaXN0YW5idWwgaWdub3JlIGlmICovXG4gICAgICAgIGlmICghXy5pc0VxdWFsKGJvZHlFcXVhbHMsIHRha2VuQm9keSkpIHtcbiAgICAgICAgICB0aGlzLmVycm9yKHtcbiAgICAgICAgICAgIG1lc3NhZ2U6ICdleHBlY3RlZCByZXNwb25zZS5ib2R5IHtleHBlY3RlZH0sIGdvdCB7YWN0dWFsfScsXG4gICAgICAgICAgICBleHBlY3RlZDogYm9keUVxdWFscyxcbiAgICAgICAgICAgIGFjdHVhbDogdGFrZW5Cb2R5XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuXG4gIGV4cG9ydCBjbGFzcyBCb2R5TWF0Y2hlc0Fzc2VydGlvbiBleHRlbmRzIEFUTFJlc3BvbnNlQXNzZXJ0aW9uIHtcbiAgICBjb25zdHJ1Y3RvcihwYXJlbnQ6IEFUTFRlc3QsIHB1YmxpYyBrZXk6IHN0cmluZywgcHVibGljIHZhbHVlOiBhbnkpIHtcbiAgICAgIHN1cGVyKHBhcmVudCk7XG4gICAgICB0aGlzLm5hbWUgPSBcInJlc3BvbnNlLmJvZHk6OlwiICsga2V5O1xuICAgIH1cblxuICAgIHZhbGlkYXRlKHJlc3BvbnNlOiBSZXNwb25zZSkge1xuICAgICAgbGV0IHZhbHVlOiBhbnkgPSB0aGlzLmdldE9iamVjdFZhbHVlKHRoaXMudmFsdWUpO1xuXG4gICAgICBsZXQgcmVhZGVkID0gXy5nZXQocmVzcG9uc2UuYm9keSwgdGhpcy5rZXkpO1xuXG4gICAgICBpZiAoXG4gICAgICAgICghKHZhbHVlIGluc3RhbmNlb2YgUmVnRXhwKSAmJiAhXy5pc0VxdWFsKHJlYWRlZCwgdmFsdWUpKVxuICAgICAgICB8fFxuICAgICAgICAoKHZhbHVlIGluc3RhbmNlb2YgUmVnRXhwKSAmJiAhdmFsdWUudGVzdChyZWFkZWQpKVxuICAgICAgKSB7XG4gICAgICAgIHRoaXMuZXJyb3Ioe1xuICAgICAgICAgIG1lc3NhZ2U6ICdleHBlY3RlZCByZXNwb25zZS5ib2R5OjonICsgdGhpcy5rZXkgKyAnIHRvIG1hdGNoIHtleHBlY3RlZH0sIGdvdCB7YWN0dWFsfScsXG4gICAgICAgICAgZXhwZWN0ZWQ6IHZhbHVlLFxuICAgICAgICAgIGFjdHVhbDogcmVhZGVkXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG5cbiAgZXhwb3J0IGNsYXNzIENvcHlCb2R5VmFsdWVPcGVyYXRpb24gZXh0ZW5kcyBBVExSZXNwb25zZUFzc2VydGlvbiB7XG4gICAgY29uc3RydWN0b3IocGFyZW50OiBBVExUZXN0LCBwdWJsaWMga2V5OiBzdHJpbmcsIHB1YmxpYyB2YWx1ZTogUG9pbnRlcikge1xuICAgICAgc3VwZXIocGFyZW50KTtcbiAgICAgIHRoaXMubmFtZSA9IFwicmVzcG9uc2UuYm9keTo6XCIgKyBrZXkgKyBcIiA+PiBcIiArIHZhbHVlLnBhdGg7XG4gICAgfVxuXG4gICAgdmFsaWRhdGUocmVzcG9uc2U6IFJlc3BvbnNlKSB7XG4gICAgICBpZiAodGhpcy5rZXkgPT09ICcqJykge1xuICAgICAgICB0aGlzLnZhbHVlLnNldCh0aGlzLnBhcmVudC5zdWl0ZS5BVEwub3B0aW9ucy52YXJpYWJsZXMsIHJlc3BvbnNlLmJvZHkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbGV0IHRha2VuVmFsdWUgPSBfLmdldChyZXNwb25zZS5ib2R5LCB0aGlzLmtleSk7XG4gICAgICAgIHRoaXMudmFsdWUuc2V0KHRoaXMucGFyZW50LnN1aXRlLkFUTC5vcHRpb25zLnZhcmlhYmxlcywgdGFrZW5WYWx1ZSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZXhwb3J0IGNsYXNzIEhlYWRlck1hdGNoZXNBc3NlcnRpb24gZXh0ZW5kcyBBVExSZXNwb25zZUFzc2VydGlvbiB7XG4gICAgY29uc3RydWN0b3IocGFyZW50OiBBVExUZXN0LCBwdWJsaWMgaGVhZGVyOiBzdHJpbmcsIHB1YmxpYyB2YWx1ZTogYW55KSB7XG4gICAgICBzdXBlcihwYXJlbnQpO1xuICAgICAgdGhpcy5oZWFkZXIgPSBoZWFkZXIudG9Mb3dlckNhc2UoKTtcbiAgICAgIHRoaXMubmFtZSA9IFwicmVzcG9uc2UuaGVhZGVyOjpcIiArIGhlYWRlcjtcbiAgICB9XG5cbiAgICB2YWxpZGF0ZShyZXNwb25zZTogUmVzcG9uc2UpIHtcbiAgICAgIGxldCB2YWx1ZTogYW55ID0gdGhpcy5nZXRPYmplY3RWYWx1ZSh0aGlzLnZhbHVlKTtcblxuICAgICAgbGV0IHJlYWRlZCA9IHJlc3BvbnNlLmdldCh0aGlzLmhlYWRlcik7XG5cbiAgICAgIGlmICh0aGlzLmhlYWRlciA9PT0gJ2NvbnRlbnQtdHlwZScpIHtcbiAgICAgICAgaWYgKHJlYWRlZC5pbmRleE9mKCc7JykgIT0gLTEpIHtcbiAgICAgICAgICByZWFkZWQgPSByZWFkZWQuc3Vic3RyKDAsIHJlYWRlZC5pbmRleE9mKCc7JykpLnRyaW0oKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHR5cGVvZiB2YWx1ZSAhPSBcInN0cmluZ1wiICYmXG4gICAgICAgIHR5cGVvZiB2YWx1ZSAhPSBcIm51bWJlclwiICYmXG4gICAgICAgIHR5cGVvZiB2YWx1ZSAhPSBcInVuZGVmaW5lZFwiICYmXG4gICAgICAgIHR5cGVvZiB2YWx1ZSAhPSBcIm9iamVjdFwiICYmXG4gICAgICAgICEodmFsdWUgaW5zdGFuY2VvZiBSZWdFeHApICYmXG4gICAgICAgIHZhbHVlICE9PSBudWxsXG4gICAgICApIHtcbiAgICAgICAgdGhpcy5lcnJvcih7XG4gICAgICAgICAgbWVzc2FnZTogJ3JlYWRlZCB2YWx1ZSBvZiBoZWFkZXIgTVVTVCBiZSBzdHJpbmcsIG51bWJlciBvciB1bmRlZmluZWQsIGdvdCB7ZXhwZWN0ZWR9IGluc3RlYWQuIHJlc3BvbnNlLmhlYWRlcjo6JyArIHRoaXMuaGVhZGVyICsgJyBpcyB7YWN0dWFsfScsXG4gICAgICAgICAgZXhwZWN0ZWQ6IHZhbHVlLFxuICAgICAgICAgIGFjdHVhbDogcmVhZGVkXG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgICghKHZhbHVlIGluc3RhbmNlb2YgUmVnRXhwKSAmJiAhXy5pc0VxdWFsKHJlYWRlZCwgdmFsdWUpKVxuICAgICAgICB8fFxuICAgICAgICAoKHZhbHVlIGluc3RhbmNlb2YgUmVnRXhwKSAmJiAhdmFsdWUudGVzdChyZWFkZWQpKVxuICAgICAgKSB7XG4gICAgICAgIHRoaXMuZXJyb3Ioe1xuICAgICAgICAgIG1lc3NhZ2U6ICdleHBlY3RlZCByZXNwb25zZS5oZWFkZXI6OicgKyB0aGlzLmhlYWRlciArICcgdG8gbWF0Y2gge2V4cGVjdGVkfSwgZ290IHthY3R1YWx9JyxcbiAgICAgICAgICBleHBlY3RlZDogdmFsdWUsXG4gICAgICAgICAgYWN0dWFsOiByZWFkZWRcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbn0iXX0=