import React from 'react';
import classnames from 'classnames';
import _ from 'lodash';

import { load as configLoader } from '../../../../config/config';
import PostAttachments from './post-attachments.jsx';
import PostLikes from './post-likes.jsx';
import UserName from './user-name.jsx';
import PieceOfText from './piece-of-text.jsx';
import PostComments from './post-comments.jsx';
import TimeDisplay from './time-display.jsx';
import Link from './link.jsx';

const config = configLoader();

export default class Post extends React.Component {

  render() {
    const { props } = this;

    const profilePicture = props.createdBy.profilePictureMediumUrl || config.profilePictures.defaultProfilePictureMediumUrl;
    const profilePictureSize = 50;

    const postClass = classnames({
      'post': true,
      'single-post': false,
      'timeline-post': true,
      'direct-post': false
    });

    const recipientCustomDisplay = function (recipient) {
      if (recipient.id !== props.createdBy.id) {
        return false;
      }

      const lastCharacter = recipient.username[recipient.username.length - 1];
      const suffix = lastCharacter === 's' ? '\u2019 feed' : '\u2019s feed';

      return `${recipient.username}${suffix}`;
    };

    let { recipients } = props;
    // Check if the post has been only submitted to one recipient
    // and if we can omit it
    if (recipients.length === 1) {
      // If the post is in user/group feed (one-source list), we should omit
      // the only recipient, since it would be that feed.
      if (recipients[0].id === props.createdBy.id) {
        // When in a many-sources list (Home, Direct messages, My discussions),
        // we should omit the only recipient if it's the author's feed.
        recipients = [];
      }
    }
    recipients = recipients.map((recipient, index) => (
      <span key={index}>
        <UserName
          className="post-recipient"
          user={recipient}
          display={recipientCustomDisplay(recipient)}
          me={props.user}
        />
        {index < props.recipients.length - 2 ? ', ' : false}
        {index === props.recipients.length - 2 ? ' and ' : false}
      </span>
    ));

    const canonicalPostURI = canonicalURI(props);

    const authorOrGroupsRecipients = props.recipients
      .filter((r) => r.id === props.createdBy.id || r.type === 'group')
      .map((r) => {
        // TODO Remove it when we'll have guaranty of isPrivate => isProtected
        if (r.isPrivate === '1') {
          r.isProtected = '1';
        }
        return r;
      });
    const isPublic = authorOrGroupsRecipients.some((r) => r.isProtected === '0');
    const isProtected = !isPublic && authorOrGroupsRecipients.some((r) => r.isPrivate === '0');
    const isPrivate = !isPublic && !isProtected;

    // "Comments disabled" / "Comment"
    let commentLink;
    if (props.commentsDisabled === '1') {
      commentLink = (
        <span>
          {' - '}
          <i>Comments disabled</i>
        </span>
      );
    } else {
      commentLink = (
        <span>
          {' - '}
          <Link to={canonicalPostURI} className="post-action">Comment</Link>
        </span>
      );
    }

    // "Like" / "Un-like"
    const didILikePost = _.find(props.usersLikedPost, { id: props.user.id });
    const likeLink = (
      <span>
        {' - '}
        <Link to={canonicalPostURI} className="post-action">
          {didILikePost ? 'Un-like' : 'Like'}
        </Link>
      </span>
    );

    return (
      <div className={postClass} data-author={props.createdBy.username}>
        <div>
          <div className="post-userpic">
            <Link to={`/${props.createdBy.username}`}>
              <img className="post-userpic-img" src={profilePicture} width={profilePictureSize} height={profilePictureSize} data-inline-ignore />
            </Link>
          </div>
          <div className="post-body">
            <div className="post-header">
              <UserName className="post-author" user={props.createdBy} me={props.user}/>
              {recipients.length > 0 ? ' to ' : false}
              {recipients}
            </div>
            <div className="post-text">
              <PieceOfText
                text={props.body}
              />
            </div>
          </div>
        </div>

        <div className="post-body">
          <PostAttachments
            postId={props.id}
            postLink={canonicalPostURI}
            attachments={props.attachments}
          />

          <div className="post-footer">
            {isPrivate ? (
              <img src="cid:falock@2x" className="post-lock-icon fa fa-lock" width="16px" height="16px" title="This entry is private"/>
              ) : isProtected ? (
              <img src="cid:postprotected@2x" className="post-lock-icon post-protected-icon fa fa-lock" width="16px" height="16px" title="This entry is only visible to FreeFeed users"/>
              ) : false}
            <Link to={canonicalPostURI} className="post-timestamp">
              <TimeDisplay timeStamp={+props.createdAt} />
            </Link>
            {commentLink}
            {likeLink}
          </div>

          <PostLikes
            post={props}
            likes={props.usersLikedPost}
            me={props.user}
          />

          <PostComments
            post={props}
            comments={props.comments}
            entryUrl={canonicalPostURI}
            me={props.user}
          />

        </div>
      </div>
    );
  }
}

// Canonical post URI (pathname)
export function canonicalURI(post) {
  // If posted _only_ into groups, use first recipient's username
  let urlName = post.createdBy.username;
  if (post.recipients.length > 0 && !post.recipients.some((r) => r.type === "user")) {
    urlName = post.recipients[0].username;
  }
  return `/${encodeURIComponent(urlName)}/${encodeURIComponent(post.id)}`;
}
