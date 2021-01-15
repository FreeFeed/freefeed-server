import React from 'react';

import Link from './link.jsx';

const MoreCommentsWrapper = (props) => (
  <div className="comment more-comments-wrapper">
    <Link to={props.entryUrl} className="more-comments-link">
      {getText(props)}
    </Link>
  </div>
);

function getText({ omittedComments }) {
  return `${omittedComments} more comment${plural(omittedComments)}`;
}

function plural(count) {
  return count > 1 ? 's' : '';
}

export default MoreCommentsWrapper;
