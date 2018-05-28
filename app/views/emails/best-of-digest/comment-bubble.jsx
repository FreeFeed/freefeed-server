import React from "react";
import TimeDisplay from "./time-display";


export default class CommentBubble extends React.Component {
  render() {
    return (
      <div className="comment-likes-container">
        {this.renderBubble()}
      </div>
    );
  }

  renderBubble = () => {
    return this.props.createdAt
      ? (
        <TimeDisplay className="comment-time" timeStamp={+this.props.createdAt} timeAgoInTitle={false}>
          <img
            src="cid:facommento"
            className="comment-icon fa fa-comment-o"
            width="14px"
            height="14px"
            id={`comment-${this.props.commentId}`}
          />
        </TimeDisplay>
      )
      : (
        <span className="comment-time">
          <img
            src="cid:facommento"
            className="comment-icon fa fa-comment-o"
            width="14px"
            height="14px"
          />
        </span>
      )
    ;
  };
}
