# External identity providers

This document describes the _externalAuthProviders_ key of server configuration.
This key is an array of objects that defines parameters of external identity
providers.

Providers can be configured using the predefined templates.

## Template-based configuration

Templates are the predefined configurations of the identity providers. Use them
like this:

```js
{
  template: "google",
  params: {
    clientId: "#####",
    clientSecret: "#####",
  }
}
```

There are three template currently available: `google`, `facebook`, and `github`
(defined in _externalAuthTemplates_ config key). All of these templates requires
the _clientId_ and _clientSecret_ parameters. You can define your own templates
in custom configs.

You can override any of the template fields right in the configuration. The rest
of template will be deeply merged with the provided config. For example you can
change the provider title (see "Manual configuration") like this:

```js
{
  template: "google",
  title: "Goooooogle",
  params: {
    clientId: "#####",
    clientSecret: "#####",
  }
}
```


## Manual configuration

Provider configuration object contains the following fields:

```js
{
  // Provider identifier. It is saves to database with the provider-generated
  // user ID, so it should not be changed after the first use. Also the client
  // can use it to show the icon/logo of the provider.
  id: "provider",
  
  // Public title of the provider. This title will be shown to users.
  title: "Provider",
  
  // Name of the adapter that works with this provider (see below).
  adapter: "oauth2",
  
  // Parameters of the adapter
  params: {
    // ...
  }
}
```

The client will receive the id and title fields of providers in response
of `GET /v2/server-info` request.

## Adapters

There is only one adapter available for now: **oauth2**. This adapter works with
the OAuth2 / OpenID Connect providers. It expects the following parameters:

```js
params: {
  // OAuth2 application ID
  clientId: "client",
  // OAuth2 application secret
  clientSecret: "secret",

  // (optional)
  // If this field is specified, the adapter will use the OpenID Connect 
  // well-known discovery URL 
  // (the https://example.com/.well-known/openid-configuration in this example)
  // to discover the endpoints configuration.
  discoveryRoot: "https://example.com";

  // (required if discoveryRoot isn't specified)
  authorizationEndpoint: "https://example.com/...",

  // (required if discoveryRoot isn't specified)
  tokenEndpoint: "https://example.com/...",

  // (required if discoveryRoot isn't specified)
  userinfoEndpoint: "https://example.com/...",

  // (optional)
  // Custom provider-specific OAuth2 scopes, if not specified it will default to
  // "openid profile email"
  scope: "openid profile email",

  // (optional)
  // Custom mapping of the userinfo response fields. The default mapping is 
  // shown below. If provider returning data in different fields, use this map
  // to override one or several fields.
  // 
  // For example, Facebook returns id in 'id' field and pictureURL in deep
  // picture.data.url path. Use the { id: 'id', pictureURL: 'picture.data.url' }
  // in this case (the lodash path syntax is accepted).
  userInfoFields: {
    id:         'sub',
    name:       'name',
    email:      'email',
    pictureURL: 'picture',
  }
}
```
