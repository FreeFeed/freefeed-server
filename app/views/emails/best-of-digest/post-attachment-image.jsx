import React from 'react';
import classnames from 'classnames';
import numeral from 'numeral';

export default class ImageAttachment extends React.Component {
  render() {
    const { props } = this;
    const formattedFileSize  = numeral(props.fileSize).format('0.[0] b');
    const formattedImageSize = (props.imageSizes.o ? `, ${props.imageSizes.o.w}×${props.imageSizes.o.h}px` : '');
    const nameAndSize        = props.fileName + ' (' + formattedFileSize + formattedImageSize + ')';

    const imageAttributes = {
      src:    props.imageSizes.t && props.imageSizes.t.url || props.thumbnailUrl,
      alt:    nameAndSize,
      width:  props.imageSizes.t ? props.imageSizes.t.w : (props.imageSizes.o ? props.imageSizes.o.w : undefined),
      height: props.imageSizes.t ? props.imageSizes.t.h : (props.imageSizes.o ? props.imageSizes.o.h : undefined)
    };

    return (
      <div className={classnames({attachment: true})}>
        <a href={props.url} title={nameAndSize} target="_blank" className="image-attachment-link">
          {props.thumbnailUrl ? (
          <img className="image-attachment-img" {...imageAttributes}/>
            ) : (
            props.id
            )}
        </a>
      </div>
    );
  }
}

