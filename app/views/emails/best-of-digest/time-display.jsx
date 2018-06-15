import React from 'react';
import moment from 'moment';

export default class TimeDisplay extends React.Component {
  render() {
    const time = moment(this.props.timeStamp);
    const timeAgo = Math.abs(moment().diff(time)) < 1000 ? 'just now' : time.fromNow();
    const timeISO = time.format();

    const title = this.props.timeAgoInTitle ? timeAgo : time.format('lll');
    const contents = this.props.children ? this.props.children : timeAgo;

    return (
      <time className={this.props.className} dateTime={timeISO} title={title}>{contents}</time>
    );
  }
}
