# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Not released
### Added
- Initial Typescript definitions for DbAdapter and models
- The new type of authorization sessions (SessionTokenV1). Sessions can be
  created, reissued, closed (at sign out); user can view list of their session
  with the information of last usage and close one or more of them. The old
  session tokens (SessionTokenV0) are still supported but deprecated.

### Removed
- Old serializers (they were not used already)

## [1.88.1] - 2020-11-17
### Fixed
- Isolate data-changes to specific realtime-users. Previously, comments which
  were marked as hidden for one of the users could be delivered as hidden to
  other users too.

## [1.88.0] - 2020-11-10
### Fixed
 - Send 'comment:new' realtime event for comments from banned users (to display
   them as placeholders, if viewer chooses to see them)

### Added
 - Application tokens now have an `expiresAt` field. The expiration time can be
   specified during token creation. Tokens are automatically invalidated after
   the expiration time.

 - We added new `activationCode` field to responses, which create or reissue app
   tokens. This code can be used to obtain full token value. Activation codes
   are short (6 alphanumeric characters) and have narrow lifetime (5 min), they
   are useful for transfer via the non-secure communication channel.

 - The output of `GET /v2/server-info` has a new field
   _externalAuthProvidersInfo_ that contains an id, brand and title of each
   available external identity provider, so the client can show the proper
   buttons even if it doesn't know about these providers. The type of this field
   is `{ id: string, brand: string, title: string }[]`. The
   _externalAuthProviders_ field still present for compatibility with the old
   clients and contains only id's of these providers.

### Changed
 - The realtime socket authorizations is now re-validates every 5 minutes to
   handle the expired app tokens.
 
 - The format of _externalAuthProviders_ configuration key was changed, see the
   [separate document](config/external-auth-providers.md) for the details. The
   site administrator can now configure almost any OAuth2 external identity
   provider. There are three predefined templates for Google, Facebook, and
   GitHub.

 - The new fields in the config: _siteTitle_, _company.title_ and
   _company.address_. These fields can be used to customize site (FreeFeed
   instance) branding in emails, RSS feeds and service messages.

## [1.87.0] - 2020-10-13
### Added
 - The Server-Timing response header (for now, it contains a single metric,
   'total' - the total request processing time)

### Fixed
 - In the real-time message about the groups' update, the listener's
   subscription to the groups additionally checked. Without this check, the user
   could see groups he isn't subscribed to in the recent groups' list.

## [1.86.0] - 2020-09-15

### Added
- Improve search: search by exact word form, by prefix and with word order
  operator

## [1.85.0] - 2020-09-01

### Fixed

- Groups in realtime events (such as `user:update` or `global:user:update`) now
  serializes according to the current user. This affects the visibility of the
  group's administrators list.
- Respect privacy-settings given during account creation

### Changed
- The main homefeed hide list is now applied to posts authored by friends (in
  _friends-all-activity_ mode). It affects the following situation: you are
  subscribed to the user U in main homefeed and to the group G in secondary
  homefeed, and U created a post in G. Now you will not see this post in main
  homefeed in _friends-all-activity_ mode.
