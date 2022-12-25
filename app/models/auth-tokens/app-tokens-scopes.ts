export const alwaysAllowedRoutes = [
  'GET /vN/users/me',
  'GET /vN/app-tokens/current',
  'POST /vN/app-tokens/current/reissue',
  'GET /vN/server-info', // Doesn't require authorization
];

export const alwaysDisallowedRoutes = [
  // Passwords
  'POST /vN/passwords',
  'PUT /vN/passwords/:resetPasswordToken',
  'PUT /vN/users/updatePassword',
  // Session
  'POST /vN/session',
  'DELETE /vN/session',
  'POST /vN/session/reissue',
  'GET /vN/session/list',
  'PATCH /vN/session/list',
  // SUDO methods
  'POST /vN/groups/sudo',
  'POST /vN/users/sudo',
  // Stats
  'GET /vN/stats',
  // SSI Metatags
  'GET /vN/timelines-metatags/:username',
  'GET /vN/posts-opengraph/:postId',
  // Archives
  'POST /vN/archives/restoration',
  'PUT /vN/archives/activities',
  'GET /vN/archives-stats',
  // Invitations
  'GET /vN/invitations/:secureId',
  'POST /vN/invitations',
  // App tokens
  'GET /vN/app-tokens/scopes',
  'GET /vN/app-tokens',
  'POST /vN/app-tokens',
  'POST /vN/app-tokens/activate',
  'POST /vN/app-tokens/:tokenId/reissue',
  'PUT /vN/app-tokens/:tokenId',
  'DELETE /vN/app-tokens/:tokenId',
  // Ext. auth
  'GET /vN/ext-auth/profiles',
  'DELETE /vN/ext-auth/profiles/:profileId',
  'POST /vN/ext-auth/auth-start',
  'POST /vN/ext-auth/auth-finish',
  // User suspend/resume
  'POST /vN/users/suspend-me',
  'POST /vN/users/resume-me',
  // User creation
  'POST /vN/users',
  // Email verification
  'POST /vN/users/verifyEmail',
];

export const appTokensScopes = [
  {
    name: 'read-my-info',
    title: 'Read my user information',
    routes: [
      'GET /vN/users/whoami',
      'GET /vN/managedGroups',
      'GET /vN/users/blockedByMe',
      'GET /vN/timelines/home/list',
    ],
  },
  {
    name: 'read-my-files',
    title: 'Read information about my uploaded files',
    routes: ['GET /vN/attachments/my', 'GET /vN/attachments/my/stats'],
  },
  {
    name: 'read-feeds',
    title: 'Read feeds, including my feeds and direct messages',
    routes: [
      'GET /vN/timelines/home',
      'GET /vN/timelines/home/:feedId/posts',
      'GET /vN/timelines/home/list',
      'GET /vN/timelines/filter/discussions',
      'GET /vN/timelines/filter/directs',
      'GET /vN/timelines/filter/saves',
      'GET /vN/users/getUnreadDirectsNumber',
      'GET /vN/timelines/:username',
      'GET /vN/timelines/:username/likes',
      'GET /vN/timelines/:username/comments',
      'GET /vN/search',
      'GET /vN/summary/:days',
      'GET /vN/summary/:username/:days',
      'GET /vN/bestof',
      'GET /vN/timelines-rss/:username',
      'GET /vN/posts/:postId',
      'GET /vN/archives/post-by-old-name/:name',
      'GET /vN/allGroups',
      'GET /vN/comments/:commentId/likes',
      'GET /vN/everything',
      'GET /vN/comments/:commentId',
      'GET /vN/posts/:postId/comments/:seqNumber',
      'POST /vN/posts/byIds',
    ],
  },
  {
    name: 'read-users-info',
    title: "Read users' information",
    routes: [
      'GET /vN/users/:username',
      'GET /vN/users/:username/subscribers',
      'GET /vN/users/:username/subscriptions',
    ],
  },
  {
    name: 'read-realtime',
    title: 'Read realtime messages',
    routes: ['WS *'],
  },
  {
    name: 'manage-my-files',
    title: 'Update my uploaded files',
    routes: ['POST /vN/attachments/my/sanitize'],
  },
  {
    name: 'manage-notifications',
    title: 'Manage notifications',
    routes: [
      'GET /vN/notifications',
      'GET /vN/notifications/:notifId',
      'POST /vN/users/markAllNotificationsAsRead',
      'GET /vN/users/getUnreadNotificationsNumber',
    ],
  },
  {
    name: 'manage-posts',
    title: 'Manage (read, write and delete) posts, comments, and likes',
    routes: [
      'GET /vN/posts/:postId',
      'GET /vN/users/markAllDirectsAsRead',
      'GET /vN/comments/:commentId/likes',
      'POST /vN/attachments',
      'POST /vN/bookmarklet',
      'POST /vN/posts',
      'PUT /vN/posts/:postId',
      'POST /vN/posts/:postId/disableComments',
      'POST /vN/posts/:postId/enableComments',
      'DELETE /vN/posts/:postId',
      'POST /vN/comments',
      'PUT /vN/comments/:commentId',
      'DELETE /vN/comments/:commentId',
      'POST /vN/posts/:postId/like',
      'POST /vN/posts/:postId/unlike',
      'POST /vN/comments/:commentId/like',
      'POST /vN/comments/:commentId/unlike',
      'POST /vN/posts/:postId/leave',
    ],
  },
  {
    name: 'manage-my-feeds',
    title: 'Manage my subscriptions, hides, bans, and saves',
    routes: [
      'POST /vN/users/:username/subscribe',
      'PUT /vN/users/:username/subscribe',
      'POST /vN/users/:username/unsubscribe',
      'POST /vN/posts/:postId/hide',
      'POST /vN/posts/:postId/unhide',
      'POST /vN/users/:username/ban',
      'POST /vN/users/:username/unban',
      'POST /vN/posts/:postId/save',
      'DELETE /vN/posts/:postId/save',
      'POST /vN/users/:username/sendRequest',
      'POST /vN/requests/:followedUserName/revoke',
      'POST /vN/timelines/home',
      'PATCH /vN/timelines/home',
      'DELETE /vN/timelines/home/:feedId',
      'PATCH /vN/timelines/home/:feedId',
      'GET /vN/timelines/home/:feedId',
      'GET /vN/timelines/home/subscriptions',
      'PATCH /vN/timelines/home',
    ],
  },
  {
    name: 'manage-profile',
    title: 'Manage my and my groups profiles',
    routes: [
      'POST /vN/groups/:groupName/updateProfilePicture',
      'POST /vN/users/updateProfilePicture',
      'PUT /vN/users/:userId',
    ],
  },
  {
    name: 'manage-groups',
    title: 'Manage groups',
    routes: [
      'POST /vN/groups',
      'POST /vN/groups/:groupName/subscribers/:adminName/admin',
      'POST /vN/groups/:groupName/subscribers/:adminName/unadmin',
      'POST /vN/groups/:groupName/sendRequest',
      'POST /vN/groups/:groupName/acceptRequest/:userName',
      'POST /vN/groups/:groupName/rejectRequest/:userName',
      'POST /vN/groups/:groupName/unsubscribeFromGroup/:userName',
      'GET /vN/groups/:groupName/blockedUsers',
      'POST /vN/groups/:groupName/block/:userName',
      'POST /vN/groups/:groupName/unblock/:userName',
    ],
  },
  {
    name: 'manage-subscription-requests',
    title: 'Manage subscription requests',
    routes: [
      'POST /vN/users/acceptRequest/:username',
      'POST /vN/users/rejectRequest/:username',
      'POST /vN/users/:username/unsubscribeFromMe',
    ],
  },
];
