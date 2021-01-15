import React from 'react';

import Link from './link.jsx';

const DISPLAYNAMES_DISPLAYNAME = 1;
const DISPLAYNAMES_BOTH = 2;
const DISPLAYNAMES_USERNAME = 3;

const DisplayOption = ({ user, me, preferences }) => {
  const { username, screenName } = user;

  if (!preferences || !preferences.displayOption) {
    preferences = {
      displayOption: DISPLAYNAMES_DISPLAYNAME,
      useYou: true,
    };
  }

  if (username === me && preferences.useYou) {
    return <span dir="ltr">You</span>;
  }

  if (screenName === username) {
    return <span dir="ltr">{screenName}</span>;
  }

  switch (preferences.displayOption) {
    case DISPLAYNAMES_DISPLAYNAME: {
      return <span dir="auto">{screenName}</span>;
    }
    case DISPLAYNAMES_BOTH: {
      return (
        <span dir="auto">
          {screenName} <span dir="ltr">({username})</span>
        </span>
      );
    }
    case DISPLAYNAMES_USERNAME: {
      return <span dir="ltr">{username}</span>;
    }
  }

  return <span>{user.screenName}</span>;
};

export default class UserName extends React.Component {
  render() {
    let displayNamesPreferences = this.props.me.frontendPreferences;

    if (displayNamesPreferences && displayNamesPreferences['net.freefeed']) {
      displayNamesPreferences = displayNamesPreferences['net.freefeed'].displayNames;
    }

    return (
      <span className="user-name-wrapper">
        <Link to={`/${this.props.user.username}`} className={this.props.className}>
          {this.props.display ? (
            <span dir="ltr">{this.props.display}</span>
          ) : (
            <DisplayOption
              user={this.props.user}
              me={this.props.me}
              preferences={displayNamesPreferences}
            />
          )}
        </Link>
      </span>
    );
  }
}
