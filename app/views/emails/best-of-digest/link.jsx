import React from 'react';

export default class Link extends React.Component {
  render() {
    const contents = this.props.children ? this.props.children : this.props.to;

    return (
      <a href={this.props.to} className={this.props.className}>{contents}</a>
    );
  }
}
