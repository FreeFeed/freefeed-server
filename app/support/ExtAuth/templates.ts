const FBVersion = 'v8.0';

export const templates = {
  google: {
    id:      'google',
    title:   'Google',
    adapter: 'oauth2',
    params:  { discoveryRoot: 'https://accounts.google.com' },
  },

  facebook: {
    id:      'facebook',
    title:   'Facebook',
    adapter: 'oauth2',
    params:  {
      authorizationEndpoint: `https://www.facebook.com/${FBVersion}/dialog/oauth`,
      tokenEndpoint:         `https://graph.facebook.com/${FBVersion}/oauth/access_token`,
      userinfoEndpoint:      `https://graph.facebook.com/${FBVersion}/me?fields=name,email,picture`,
      scope:                 'email',
      userInfoFields:        {
        id:         'id',
        name:       'name',
        email:      'email',
        pictureURL: 'picture.data.url',
      },
    },
  },

  github: {
    id:      'github',
    title:   'GitHub',
    adapter: 'oauth2',
    params:  {
      authorizationEndpoint: 'https://github.com/login/oauth/authorize',
      tokenEndpoint:         'https://github.com/login/oauth/access_token',
      userinfoEndpoint:      'https://api.github.com/user',
      scope:                 'user:email',
      userInfoFields:        {
        id:         'id',
        pictureURL: 'avatar_url',
      },
    },
  },
};
