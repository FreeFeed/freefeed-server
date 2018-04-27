import React from 'react';
import ReactDOMServer from 'react-dom/server';

import Feed from './Feed';

const SummaryEmail = (props) => {
  return (
    <div className="container">
      <link rel="stylesheet" href="app/views/emails/best-of-digest/assets/app.css"/>
      <div className="loader-container -full">
        <div className="row">
          <div className="content">
            <div className="box">
              <div className="box-body">
                <Feed {...props}/>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const renderToString = (props) => ReactDOMServer.renderToStaticMarkup(SummaryEmail(props));