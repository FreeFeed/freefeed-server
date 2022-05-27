# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - Not released
### Removed
- Support for NodeJs 12.x
- Support for Postgres 10.x, 11.x

### Changed
- Using ESBuild instead of Babel for transpiling
- The user preference defaults are now defined in configuration.

### Added
- The ability to override user preference defaults based on user's creation
  time. It allows changing the default values for new users if needed.

### Fixed
- Users will not longer receive notifications about someone else's actions over
  inaccessible (for recipient) posts. Previously, such notifications were sent
  when a user's comment was deleted in a post that was hidden from him.

## [1.109.0] - 2022-05-12
### Fixed
- Ignore minor exif-errors while sanitizing images.
- Skip files which can not be sanitized because if errors after and report the errors.
- In the case of registration with an already taken email, return 'This email
  address is already in use' message instead of obscure 'Invalid email'.

## [1.108.1] - 2022-05-03
### Changed
- Temporary turned off the batch attachments sanitize job handler 

## [1.108.0] - 2022-04-20

Technical release. Updated dependencies

## [1.107.0] - 2022-03-24
### Added
- New method _sanitizeOriginal_ of Attachment object allows to sanitize metadata
  of existing attachments.
- New API methods:
  * `GET /v2/attachments/my/stats` (in `read-my-files` scope) returns statistics
    about attachments of current user. The output includes total number of
    attachments, number of sanitized attachments, and the state of the sanitize
    task (if present).
  * `POST /v2/attachments/my/sanitize` (in `manage-my-files` scope) initiates
    the sanitization of existing user's attachments.

## [1.106.0] - 2022-02-03
### Added
- The new server-side user preference flag _sanitizeMediaMetadata_ (default:
  true). When this flag is true, uploaded files are checked for sensitive
  metadata tags related to GPS, owner info and serial numbers. All such tags are
  removed from the file. This applies not only to images, but also to all other
  files such as videos.
- New attachment (and its database table) field _sanitized_ indicates that the
  file metadata was sanitized. The value of field is 0 (wasn't sanitized) or 1
  (was sanitized).

## Changed
- Reduced the password reset token length to 12 bytes. Perhaps enormous tokens
  (48 bytes = 96 hexadecimal characters) were broken in the email texts. Also
  reduced the TTL of the token from several years :) to 8 hours.

## [1.105.0] - 2022-01-05
### Fixed
- A group administrator could not delete a message with an empty body (and with
  attachments) from a managed group.
- "Direct left" events could be duplicated. They are unique now

### Added
- The new API method, `GET /v2/attachments/my` returns all attachments created
  by the current user, paginated and in the reverse date order. 
  
  This method accepts two URL parameters: _limit_ (default: 30, maximum: 100)
  and _page_ (1-based, default: 1). The result format is { attachments:
  AttObject[], users: UserObject[], hasMore: boolean }.
- The new API token scope: `read-my-files`. For now it contains only one method:
  `GET /v2/attachments/my`

### Changed
- The serialized attachments now have an additional field _postId_. This field
  is either _null_ or the UUID of the post to which the file is attached.

## [1.104.2] - 2021-12-13
### Fixed
- Allow to edit direct message without recipients.

## [1.104.1] - 2021-12-08
### Fixed
- backlink indexer script: add support for orphaned comments

## [1.104.0] - 2021-12-08
### Added
- Any recipient of a direct message (except the author of the message) can now
  leave the direct, i.e. exclude themselves from direct recipients. Any
  recipient's comments and likes of the post will not be removed.

### Changed
- The backlinks logic was rewritten to use a separate table for backlinks
  information. You must run `yarn babel bin/reindex_backlinks.js` to fill the
  `backlinks` table by the existing links.

## [1.103.1] - 2021-11-18
### Changed
- Disabled backlinks (performance issues. still)

## [1.103.0] - 2021-11-17
### Changed
- Re-enabled backlinks (see description in 1.101.0)

## [1.102.0] - 2021-10-12
### Changed
- Use original filename in content-disposition header.
  Now, it's for both name and extension. Before, it only used original extension for whitelisted formats, setting empty extension for others.

## [1.101.1] - 2021-09-19
### Changed
- Disabled backlinks (performance issues)

## [1.101.0] - 2021-09-19
### Added
- All serialized posts now have a new numeric 'backlinksCount' field. This field
  is the count of texts (posts or comments) that mentioned the post's UUID and
  visible to the current user. The client should display this count as a link to
  the search by post's UUID.

  When the post hase new or removed mention in somewhere, the 'post:update'
  realtime message is delivered with the updated backlinksCount.

  It is also recommended to re-run the search indexer (`yarn babel
  bin/reindex_search.js`) after this changes applied. The indexing of UUIDs in
  the plain texts (not in URLs) is slightly changed, so in rare cases the search
  may work incorrectly. These changes are not affects the backlinks
  functionality though.
- There are two new notification types related to backlinks: 'backlink_in_post'
  (fired when your post or comment has been mention in somebody's post) and
  'backlink_in_comment' (same for mention in comment).
  
  The notification objects in  API have two new fields: 'target_post_id' and
  'target_comment_id'. The 'target_post_id' is an ID of the mentioned post and
  the 'target_comment_id' is an ID of the mentioned comment. When the
  'target_comment_id' is not null, the 'target_post_id' is an ID of post this
  comment belongs.

### Changed
- Post can now have an empty body if it contains one or more attachments.

## [1.100.0] - 2021-07-30
### Added
- The `DELETE /v1/posts/:postId` API method now can have one or more 'fromFeed'
   GET-parameters. These parameter defines the 'Posts' feeds (by username) from
   which this post should be deleted. If there are no 'fromFeed' parameters, the
   post will be deleted completely (by author) or from all managed groups (by
   groups admin).

### Changed
- When the private group info is changed, the 'global:user:update' realtime
  event is delivered only to the group subscribers (earlier it was sent to
  everyone).

## [1.99.1] - 2021-07-03
### Fixed
- GDPR script works again

## [1.99.0] - 2021-06-08
### Fixed
- The gone user's comment likes was counted in some API responses and realtime
  messages.

### Removed
- The old session tokens (SessionTokenV0) are no longer supported.

## [1.98.0] - 2021-04-08

**WARNING:** this version requires you to run manual migration script. It might run
for tens of minutes (depending on the size of database and your server's hardware
specs).

`yarn babel bin/migration_comment_numbers.js`

### Added
- New API method `GET /v2/notifications/:notifId` allows to fetch single
  notification by its id.
- The new `yarn babel` helper script in the package.json. This command is a
  shortcut for the `babel-node --extensions ".js,.jsx,.ts"` (all extensions used
  in this project), so one can now run CLI scripts as `yarn babel
  bin/somescript.js`
- The comment numbers in API output. Each comment now has the `seqNumber` field
  which is a sequence number of the comment in the post. Some rules on numbering:
    - The first comment has number 1.
    - Every new comment gets a number of `max(seqNumber) + 1`.
    - When a comment is deleted, the numbers of other comments are not changed. It
      allows to detect the comments deletion by holes in the numeration.
    - When the last comment is deleted, the `max(seqNumber)` is decreased, because
      the last comment always has the maximum number. So next added comment will
      have the same number as the deleted.
- The new API methods:
    - `GET /v1/comments/:commentId` returns comment by its ID;
    - `GET /v2/posts/:postId/comments/:seqNumber` returns comment by its
      `seqNumber` in the given post;
    - `POST /v2/posts/byIds` returns posts by their IDs. It uses the POST method
      because it can accept many post IDs (up to 100 at once). The POST body
      format is `{ "postIds": [...] }`. The output schema is the same as in other
      post-collections methods (like `GET /v2/everything`), but it has an
      additional `postsNotFound` field with those post IDs that were not found.
      This method accepts `maxComments=all` and `maxLikes=all` get parameters.
- WebP attachments support. The uploaded WebP originals are kept unchanged, but
  have JPEG thumbnails for better compatibility with older browsers.
- The "to:" search operator. "to:user1,group2" limits search to posts published
  in group2 feed or written _to_ user1 as a direct message. This operator acts
  like "in:" for the groups but also allows to search in direct messages with
  the specific addressee.

## [1.94.2] - 2021-03-09
### Fixed
- Handle deleted posts/comments/users in the notification emails

## [1.94.1] - 2021-02-24
### Fixed
- The 'create attachment'  method now accepts any name for the file in form
  field. It should fix upload issues with some third-party clients.

### Added
- Expose some server settings via /v2/server-info for the client needs. The new fields are:
  - attachments { fileSizeLimit, maxCountPerPost } 
  - maxTextLength { post, comment, description }.

## [1.94.0] - 2021-02-18
### Fixed
- Fixed attachment creation bug that caused backend crash on image upload and
  empty `users` field of the `POST /v1/attachments` response.

### Changed
- Raise max post and comment lengths to 3000 chars

## [1.93.0] - 2021-01-27
### Added
- The notification events are now delivered to the 'user:{userId}' realtime
  channel with the 'event:new' message type. The message format is the same as
  in `GET /v2/notifications` response.

### Changed
- Do not block authorization sessions if token with the invalid issue is comes.
  We probably should add another blocking criteria in the future.
- Remove old authorization sessions by last use (instead of last update) time.

## [1.92.1] - 2021-01-24
### Added
- Count blocked auth sessions in StatsD

## [1.92.0] - 2021-01-24
### Changed
- Eslint is applied to all source tree now. The specific exceptions is defined
  in .eslintignore file.

## [1.91.0] - 2021-01-15
### Fixed
- Properly index texts with HTML-like tags (like spoiler tags)

### Added
- The new type of authorization sessions (SessionTokenV1). Sessions can be
  created, reissued, closed (at sign out); user can view list of their session
  with the information of last usage and close one or more of them. The old
  session tokens (SessionTokenV0) are still supported but deprecated.
- The 'proxyIpHeader' config option (default value is 'X-Forwarded-For') for the
  instances behind the proxy. Active when the 'trustProxyHeaders' option is
  true.
- Explicit list of the attachments' MIME types that should be served with
  'Content-Disposition: inline'. All other attachments should be served with
  'Content-Disposition: attachment' to prevent in-browser execution of active
  content.
## [1.90.1] - 2021-01-12
### Fixed
- Prevent the theft of attachments from other posts when creating a post.

## [1.90.0] - 2020-12-29
### Fixed
- The 'post:new' realtime event was emitted without the `realtimeChannels`
  field. As a result, the client had no information on which channels the
  message was sent to. This led to new posts appearing in unrelated feeds.

## [1.89.1] - 2020-12-15
### Fixed
- Fix EJS-templates, which broke cron-scripts

## [1.89.0] - 2020-12-13
### Added
- Initial Typescript definitions for DbAdapter and models

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
