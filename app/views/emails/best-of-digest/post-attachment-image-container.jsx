import React from 'react';
import classnames from 'classnames';

import ImageAttachment from './post-attachment-image.jsx';
import Link from './link.jsx';

export default class ImageAttachmentsContainer extends React.Component {
  state = {
    containerWidth: 0,
    isFolded: false,
    needsFolding: false,
  };

  container = null;

  render() {
    const isSingleImage = this.props.attachments.length === 1;
    const className = classnames({
      'image-attachments': true,
      'is-folded': this.state.isFolded,
      'needs-folding': this.state.needsFolding,
      'single-image': true,
    });

    const [a] = this.props.attachments;

    return (
      <div className={className} ref={(el) => (this.container = el)}>
        <ImageAttachment key={a.id} {...a} />
        {isSingleImage ? (
          false
        ) : (
          <div className="show-more">
            <Link to={this.props.postLink}>
              <img
                src="cid:fachevronright@2x"
                className="fa fa-chevron-circle-right icon"
                width="24px"
                height="24px"
              />
            </Link>
          </div>
        )}
      </div>
    );
  }
}
