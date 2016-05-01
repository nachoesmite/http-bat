# Http Blackbox API Tester (http-bat)

It's a markup for blackbox tests. Based on YAML

It uses supertest and mocha to test APIs

## Usage

```
$ npm install http-bat
$ mocha
```

```javascript
// test1.spec.js
var bat = require('http-bat')();

var app = require('../app'); //express server

bat.load(__dirname + '/test-1.yml');

bat.run(app);
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