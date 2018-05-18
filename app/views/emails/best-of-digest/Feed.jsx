import React from 'react';
import Post from './Post.jsx';

export default (props) => {
  const getEntryComponent = () => (post) => {
    return (
      <Post
        {...post}
        key={post.id}
        user={props.user}
      />
    );
  };

  const visibleEntries = props.posts.map(getEntryComponent());

  return (
    <div className="posts">

      {visibleEntries}

    </div>
  );
};
