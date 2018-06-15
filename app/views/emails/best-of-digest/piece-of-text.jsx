import React from 'react';
import Linkify from './linkify.jsx';

// Separator element for "paragraphs"
const paragraphBreak = <div className="p-break"><br/></div>;

// Inject an element between every element in array.
// It's similar to array.join(separator), but returns an array, not a string.
const injectSeparator = (array, separator) => {
  if (array.length < 2) {
    return array;
  }

  const result = [];

  array.forEach((item, i) => {
    result.push(<span key={`item-${i}`}>{item}</span>);
    result.push(React.cloneElement(separator, { key: `separator-${i}` }, separator.props.children));
  });

  result.pop();

  return result;
};

// Replace single newlines with <br/> and trim every line
const brAndTrim = (text) => {
  const lines = text.split(/\n/g).map((line) => line.trim());
  return injectSeparator(lines, <br />);
};


const getExpandedText = (text) => {
  const trimmedText = text.trim();

  if (!/\n/.test(trimmedText)) {
    return trimmedText;
  }

  const paragraphs = trimmedText.split(/\n\s*\n/g).map(brAndTrim);

  return injectSeparator(paragraphs, paragraphBreak);
};

export default class PieceOfText extends React.Component {

  render() {
    return (this.props.text ? (
      <Linkify>{getExpandedText(this.props.text)}</Linkify>
    ) : <span/>);
  }
}
