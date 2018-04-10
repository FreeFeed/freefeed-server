import React from 'react';
import classnames from 'classnames';

import PieceOfText from './piece-of-text';
import UserName from './user-name';


export default class PostComment extends React.Component {
  renderBody() {
    console.log(this.props);
    const authorAndButtons = (
      <span>
        {' -'}&nbsp;
        <UserName user={this.props.createdBy} me={this.props.me}/>
      </span>
    );

    return (
      <div className="comment-body">
        <PieceOfText
          text={this.props.body}
        />
        {authorAndButtons}
      </div>
    );
  }

  render() {
    const className = classnames({
      'comment': true,
      'highlighted': false,
      'omit-bubble': false,
      'is-hidden': false,
      'highlight-from-url': false,
      'my-comment': false
    });


    return (
      <div
        className={className}
        data-author={this.props.createdBy.username}
      >
        {this.renderBody()}
      </div>
    );
  }
}
