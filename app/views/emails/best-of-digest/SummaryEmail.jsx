import React from 'react';

import Feed from './Feed';

export const SummaryEmail = (props) => {
  return (
    <div className="container">
      <link rel="stylesheet" href="app/views/emails/best-of-digest/assets/app.css" />
      <div className="loader-container -full">
        <div className="row">
          <div className="content">
            <div className="box">
              <div className="box-body">
                <Feed {...props} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
