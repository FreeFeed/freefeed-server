# Content visibility rules

This document describes an algorithm that determines whether a given user
(*viewer*) can see a particular content: post, comment, like, comment like.

## Posts

Post is not visible to anyone when its author is in any *gone status*.

### Anonymous viewer

Anonymous viewer can see all (and only) public posts.

### Logged-in viewer

Logged-in viewer can see post when two conditions are true: the privacy
condition AND the bans condition.

The privacy condition: post is not private OR viewer is subscribed to any of
post destination feeds.

The bans condition (AND-joined):
* Post author is not banned by the viewer OR post is published to a group where
  the viewer had disabled bans.
* Viewer is not banned by the post author OR post is published to a group where
  the viewer *is admin* and had disabled bans.

### In code
The post visibility rules calculates in the following places:
* app/support/DbAdapter/visibility.js, postsVisibilitySQL function. This
  function makes SQL filter to select only visible posts.
* app/support/DbAdapter/visibility.js, getUsersWhoCanSeePost function. This
  function returns list of users (IDs) who can see the given post.

## Comments, Likes and Comment likes

Comments, Likes and Comment likes (hereinafter "actions") shares the same logic.

Actions on the given post is not visible for viewer if the post is not visible.

Action is visible when:
* The action author is not banned by viewer OR post is published to a group
where the viewer had disabled bans. Thus, all actions in groups with disabled
bans are visible.

If the post is visible but the comment is not, the comment may appear as a stub
(with hideType = HIDDEN_BANNED). It depends on *hideCommentsOfTypes* field of
viewer properties.

Handling the visibility of comments is a bit special (see the
'commentAccessRequired' middleware). If the viewer has access to post, but not
to comment, the middleware acts as follows:
* If the comment itself is requested, the comment is returned, but with the
  appropriate hideType and with a placeholder instead of the body.
* If the comment-related resource is requested (currently it is a comment like),
  the middleware throws a 403 error.

### In code
The action visibility rules calculates in the following places:
* app/support/DbAdapter/visibility.js, notBannedSQLFabric function. This makes
  SQL filter fabric to select non-banned actions.
* app/support/DbAdapter/visibility.js, getUsersWhoCanSeeComment function. This
  function returns list of users (IDs) who can see the given comment.
* app/support/DbAdapter/visibility.js, isCommentBannedForViewer function. This
  function returns true if comment is banned (and should be hidden) for the
  given viewer.
* app/pubsub-listener.js, broadcastMessage function checks access for actions.
* app/controllers/middlewares/comment-access-required.js, the
  'commentAccessRequired' middleware.