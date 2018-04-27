import React from 'react';
import Link from './link.jsx';

const DisplayOption = ({user}) => {
  return <span>{user.screenName}</span>;
};

export default class UserName extends React.Component {
  render() {
    return (
      <span className="user-name-wrapper">
        <Link to={`/${this.props.user.username}`} className={this.props.className}>
          {this.props.display ? (
            <span dir="ltr">{this.props.display}</span>
          ) : (
            <DisplayOption
              user={this.props.user}
              />
          )}
        </Link>
      </span>
    );
  }
}
