import React from 'react';
import config from 'config';

export default class Link extends React.Component {
  render() {
    const contents = this.props.children ? this.props.children : this.props.to;
    const link = `${config.host}${this.props.to}`;

    return (
      <a href={link} className={this.props.className}>
        {contents}
      </a>
    );
  }
}
