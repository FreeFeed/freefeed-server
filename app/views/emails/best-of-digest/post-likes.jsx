import React from 'react';

import UserName from './user-name.jsx';
import Link from './link.jsx';
import { canonicalURI } from './Post.jsx';

const renderLike = (item, i, items) => (
  <li key={item.id} className="post-like">
    {item.id !== 'more-likes' ? (
      <UserName user={item} me={item.viewer}/>
    ) : (
      <Link to={item.canonicalPostURI} className="more-post-likes-link">{item.omittedLikes} other people</Link>
    )}

    {i < items.length - 2 ? (
      ', '
    ) : i === items.length - 2 ? (
      ' and '
    ) : (
      ' liked this '
    )}
  </li>
);

export default ({likes, post, me}) => {
  if (!likes.length) {
    return <div/>;
  }

  const likeList = likes;
  const canonicalPostURI = canonicalURI(post);

  if (post.omittedLikes) {
    likeList.push({
      id: 'more-likes',
      omittedLikes: post.omittedLikes,
      canonicalPostURI
    });
  }

  const renderedLikes = likeList.map(el => ({ ...el, viewer: me })).map(renderLike);

  return (
    <div className="post-likes">
      <img src="cid:faheart" className="fa fa-heart icon" width="15px" height="15px"/>
      <ul className="post-likes-list">{renderedLikes}</ul>
    </div>
  );
};
