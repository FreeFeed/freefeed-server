import React from 'react';
import classnames from 'classnames';

import PieceOfText from './piece-of-text';
import UserName from './user-name';
import CommentBubble from './comment-bubble';


export default class PostComment extends React.Component {
  renderBody() {
    let authorAndButtons = '';
    if (!this.props.hideType) {
      authorAndButtons = (
        <span>
          {' -'}&nbsp;
          <UserName user={this.props.createdBy} me={this.props.me}/>
        </span>
      );
    }

    return (
      <div className="comment-body">
        <PieceOfText
          text={this.props.body}
        />
        {authorAndButtons}
      </div>
    );
  }

  renderCommentBubble() {
    if (this.props.hideType) {
      return false;
    }
    return (
      <CommentBubble
        commentId={this.props.id}
        createdAt={this.props.createdAt}
      />
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
      <div className={className}>
        {this.renderCommentBubble()}
        {this.renderBody()}
      </div>
    );
  }
}
