import React from 'react';
import classnames from 'classnames';
import ImageAttachment from './post-attachment-image.jsx';

export default class ImageAttachmentsContainer extends React.Component {
  state = {
    containerWidth: 0,
    isFolded: false,
    needsFolding: false,
  };

  container = null;

  render() {
    const isSingleImage = true;
    const className = classnames({
      'image-attachments': true,
      'is-folded': this.state.isFolded,
      'needs-folding': this.state.needsFolding,
      'single-image': isSingleImage
    });


    const a = this.props.attachments[0];

    return (
      <div className={className} ref={(el) => this.container = el}>
        <ImageAttachment
          key={a.id}
          {...a} />
      </div>
    );
  }
}
