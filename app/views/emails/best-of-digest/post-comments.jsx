import React from 'react';

import PostComment from './post-comment.jsx';
import MoreCommentsWrapper from './more-comments-wrapper.jsx';

export default class PostComments extends React.Component {
  renderComment(comment, me) {
    return <PostComment key={comment.id} {...comment} me={me} />;
  }

  renderMiddle(me) {
    const { post, comments, entryUrl } = this.props;
    const foldedCount = post.omittedComments;
    const showExpand = post.omittedComments > 0;

    const middleComments = comments
      .slice(1, comments.length - 1)
      .map((c) => this.renderComment(c, me));

    if (showExpand) {
      return <MoreCommentsWrapper omittedComments={foldedCount} entryUrl={entryUrl} />;
    }

    return middleComments;
  }

  render() {
    const { comments, me } = this.props;
    const [first] = comments;
    const last = comments.length > 1 && comments[comments.length - 1];

    return (
      <div className="comments">
        {first ? this.renderComment(first, me) : false}
        {this.renderMiddle(me)}
        {last ? this.renderComment(last, me) : false}
      </div>
    );
  }
}
