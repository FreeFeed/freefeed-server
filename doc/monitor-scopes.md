Namespacing for dogstatsd monitor
=================================

Scopes are separated with dots.

Scopes start with MONITOR_PREFIX set in the environment file:
This prefix is supported by monitor-dog package automatically.

Default:
* 'development'
* 'development-console'
* 'tests'

Production:
* 'micropeppa'
* 'freefeed'

Then optional 'private' specifier for internal/debugging data stats.

Then specific counters follow:

* 'post.' + post id for specific post
* 'posts' for generic post
* 'user.' + user id for specific user
* 'users' for generic user
* 'comment.' + comment id for specific comment
* 'comments' for generic comment etc.

Then type suffixes:
* 'create-time', 'destroy-time' and other with `-time` suffix for timing histograms
* 'creates', 'destroys', 'updates', 'likes' and other with plural suffix for increment counters
* 'unlikes', 'unreactions' and other with plural suffix and `un-` prefix for decrement counters (which are still incremented)
* 'bandwidth-gauge' and other with `-gauge` suffix for gauges

Examples:
'tests.private.post.fcfafafaf-fcaf-cfafafaf-cfafacaffc.likes'
'freefeed.posts.create-time'
