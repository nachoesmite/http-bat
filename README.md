# Http Blackbox API Tester (`http-bat`) [![Coverage Status](https://coveralls.io/repos/github/menduz/http-bat/badge.svg?branch=master)](https://coveralls.io/github/menduz/http-bat?branch=master) [![Build Status](https://travis-ci.org/menduz/http-bat.svg?branch=master)](https://travis-ci.org/menduz/http-bat)

It's a markup for blackbox tests. Based on YAML

It uses supertest and mocha to test APIs

## Usage

```
$ npm install http-bat --save-dev
$ mocha
```

```javascript
// test1.spec.js
var bat = require('http-bat')();

var app = require('../app'); //express server

bat.load(__dirname + '/test-1.yml');

bat.run(app);
```

## Examples

### Test response status code

```yaml
tests:
  "Favicon must exists":
    GET /favicon.ico:
      response:
        status: 200
  "Should return 401":
    GET /unauthorized_url:
      response:
        status: 401
  "Should return 404":
    GET /asjdnasjdnkasf:
      response:
        status: 404
```

### Send query string parameters

```yaml
tests:
  "Inline query string":
    GET /orders?page=10:
      response:
        status: 200
  "Non inline":
    GET /orders:
      queryParameters:
        page: 10
      response:
        status: 200
  "Override inline query string":
    # The final url will be /orders?page=10&qty=20 
    GET /orders?page={----asd---}&qty=20:
      queryParameters:
        page: 10                 
      response:
        status: 200
```

### Validate response ´Content-Type´

```yaml
tests:
  "Must return text":
    GET /responses/text:
      response:
        content-type: text/plain  
  "Must return json":
    GET /responses/json:
      response:
        content-type: application/json
  "Must return url-encoded":
    GET /responses/url-encoded:
      response:
        content-type: application/x-www-form-urlencoded
```

### Send headers

```yaml
tests:
  "Headers":
    GET /profile#UNAUTHORIZED:
      # headers:
      #  Authorization: Bearer asfgsgh-fasdddss
      response: 
        # UNAUTHORIZED
        status: 401 
    GET /profile:
      headers:
        Authorization: Bearer asfgsgh-fasdddss
      response: 
        # OK
        status: 200 
```


### Validate response headers

```yaml
tests:
  "Headers":
    PUT /bounce/headers:
      response:
        headers: 
          Access-Control-Allow-Headers: "Authorization, X-Default-Header, X-Custom-Header" # literal value
```

### Validate response content

```yaml
tests:
  "Must validate response body":
    GET /text:
      response:
        body: 
          content-type: text/plain
          is: "Success"
          # "is" means equals. In this case the response is the text "Success"
          
    GET /json:
      response:
        body: 
          content-type: application/json
          is: !!map { json: true }
          # "is" means equals. In this case the response is the JSON {"json":true}
    
    GET /json/v1:
      response:
        body: 
          content-type: application/json
          is: 
            json: true
            # "is" means equals. In this case the response is the JSON {"json":true}
            # this is the same as the previous example
```

### Validate response (partially)

```yaml
tests:
  "Must validate response body":
    GET /json:
      response:
        body: 
          content-type: application/json
          # In this case the response is the JSON { "json":true, "a": 1, "b": 2 }
          matches:
            a: 1
          # "json" and "b" properties will be ignored
          
          
    GET /users:
      response:
        body: 
          content-type: application/json
          # In this case the response is the JSON 
          # [ 
          #    { "id": 1, "name": "Agu" }, 
          #    { "id": 2, "name": "Dan" } 
          # ]
          matches:
            "[0].id": 1
            "[1].name": Dan
```


```yaml
# test-1.yml

baseUri: http://localhost:3000

myCustomStore: &oauth_token
  accessToken: "EMPTY_VALUE"

tests:
  "Test 404 error":
    GET /asjdnasjdnkasf:
      response:
        status: 404
        
  "Another":
    GET /hello?name=ERROR:
      queryParameters:
        name: agusa
      response:
        status: 200
        body: 
          is: "Hello agusa!"
          
  "Another tests":
    GET /status/200:
      response:
        status: 200
        body: 
         is: "Success"
        
    GET /hello:
      response:
        status: 200
        body: 
          is: "Hello World!"

    GET /hello?name=agus:
      response:
        status: 200
        body: 
          is: "Hello agus!"

  "Headers":
    PUT /bounce/headers:
      headers:
        Authorization: test
      response:
        headers: 
          Access-Control-Allow-Headers: "Authorization, X-Default-Header, X-Custom-Header"
        body:
          matches: 
            authorization: test
            
  "Text Response":
    GET /responses/text:
      response:
        status: 200
        body: 
          is: 'text'
          
  "JSON Response":
    GET /responses/json:
      response:
        status: 200
        body: 
          is: !!map { json: true }

  "Regexp body":
    GET /stream:
      response:
        status: 200
        body: 
          is: !!js/regexp /^Lorem/
   
  "Url encoded responses":
    GET /responses/url-encoded/basic:
      response:
        status: 200
        content-type: application/x-www-form-urlencoded
        body:
          is: 
            key: value

    GET /responses/url-encoded/duplicate:
      response:
        status: 200
        content-type: application/x-www-form-urlencoded
        body:
          is: 
            key: [ 1, 2, 3 ]
            
    GET /responses/url-encoded/escaped:
      response:
        status: 200
        content-type: application/x-www-form-urlencoded
        body:
          is: 
            key: "Hello, world!"
  
  "Access control by token":
    GET /secured_by_token#should-be-unauthorized:
      queryParameters: *oauth_token # send oauth_token as queryParameters
      response:
        status: 401
  
    POST /get_access_token: 
      # responses { new_token: "asd" }
      response:
        body:
          take: # take a value from body
            new_token: # the name or route of the value
              accessToken: *oauth_token # into *oauth_token.accessToken 
    
    GET /secured_by_token:
      queryParameters: *oauth_token # send oauth_token as queryParameters
      response:
        status: 200
        body:
          is:
            success: true

```