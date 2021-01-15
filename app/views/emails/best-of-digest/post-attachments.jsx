import React from 'react';

import ImageAttachmentsContainer from './post-attachment-image-container.jsx';

export default (props) => {
  const attachments = props.attachments || [];

  const imageAttachments = attachments.filter((attachment) => attachment.mediaType === 'image');
  const imageAttachmentsContainer = imageAttachments.length ? (
    <ImageAttachmentsContainer
      attachments={imageAttachments}
      postId={props.postId}
      postLink={props.postLink}
    />
  ) : (
    false
  );

  const otherAttachments = attachments.filter((attachment) => attachment.mediaType !== 'image')
    .length;
  const otherAttachmentsContainer =
    otherAttachments > 0 ? (
      <div className="general-attachments">{otherAttachments} attachment(s)</div>
    ) : (
      false
    );

  return attachments.length > 0 ? (
    <div className="attachments">
      {imageAttachmentsContainer}
      {otherAttachmentsContainer}
    </div>
  ) : (
    false
  );
};
