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

## Comments and Likes

Comment/like to the given post is not visible for viewer if the post is not
visible.

Comment/like is visible when:
* The comment/like author is not banned by viewer OR post is published to a
group where the viewer had disabled bans. Thus, all comments/likes in groups
with disabled bans are visible.

If the post is visible but the comment is not, the comment may appear as a stub
(with hideType = HIDDEN_BANNED). It depends on *hideCommentsOfTypes* field of
viewer properties.

### In code
The post visibility rules calculates in the following places:
* app/support/DbAdapter/visibility.js, notBannedSQLFabric function. This makes
  SQL filter fabric to select non-banned comments/likes.
* app/support/DbAdapter/visibility.js, getUsersWhoCanSeeComment function. This
  function returns list of users (IDs) who can see the given comment.
* app/support/DbAdapter/visibility.js, isCommentBannedForViewer function. This
  function returns true if comment is banned (and should be hidden) for the
  given viewer.
