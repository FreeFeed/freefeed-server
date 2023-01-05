# Content visibility rules

This document describes an algorithm that determines whether a given user
(*viewer*) can see a particular content: post, comment, like, comment like.

## Post

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
The post visibility rules calculates in several places:
* app/support/DbAdapter/visibility.js, postsVisibilitySQL function. This
  function makes SQL filter to select only visible posts.
* app/support/DbAdapter/visibility.js, getUsersWhoCanSeePost function. This
  function returns list of users (IDs) who can see the given post.