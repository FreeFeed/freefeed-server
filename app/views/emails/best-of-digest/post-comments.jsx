import React from 'react';

import Link from './link.jsx';
import PostComment from './post-comment.jsx';
import MoreCommentsWrapper from './more-comments-wrapper.jsx';

export default class PostComments extends React.Component {
  renderAddCommentLink() {
    const { props } = this;

    console.log('RENDER_ADD_COMMENT', props.comments.length > 2 && !props.post.omittedComments);
    if (props.comments.length > 2 && !props.post.omittedComments) {
      return (
        <div className="comment">
          <Link to={props.entryUrl} className="comment-icon fa-stack fa-1x">
            <i className="fa fa-comment-o fa-stack-1x" />
            <i className="fa fa-square fa-inverse fa-stack-1x" />
            <i className="fa fa-plus fa-stack-1x" />
          </Link>
          <Link to={props.entryUrl} className="add-comment-link">Add comment</Link>
        </div>
      );
    }

    return false;
  }

  renderComment(comment, me) {
    return (
      <PostComment
        key={comment.id}
        {...comment}
        me={me}
      />
    );
  }

  renderMiddle(me) {
    const { post, comments, entryUrl } = this.props;
    const foldedCount = post.omittedComments;
    const showExpand = post.omittedComments > 0;

    const middleComments = comments.slice(1, comments.length - 1).map((c) => this.renderComment(c, me));

    if (showExpand) {
      return (
        <MoreCommentsWrapper
          omittedComments={foldedCount}
          entryUrl={entryUrl}
          omittedCommentLikes={post.omittedCommentLikes}
        />
      );
    }

    return middleComments;
  }

  render() {
    const { post, comments, me } = this.props;
    const first = comments[0];
    const last = comments.length > 1 && comments[comments.length - 1];
    const canAddComment = !post.commentsDisabled;

    return (
      <div className="comments">
        {first ? this.renderComment(first, me) : false}
        {this.renderMiddle(me)}
        {last ? this.renderComment(last, me) : false}
        {canAddComment ? this.renderAddCommentLink() : false}
      </div>
    );
  }
}

