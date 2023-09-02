import staticConfig from 'config';
import { describe, it } from 'mocha';
import expect from 'unexpected';

import { currentConfig } from '../../app/support/app-async-context';
import { withModifiedConfig } from '../helpers/with-modified-config';

describe('withModifiedConfig helper', () => {
  it(`should return a regular config`, () => {
    expect(currentConfig().siteTitle, 'to be', staticConfig.siteTitle);
  });

  describe('site title is modified', () => {
    const newTitle = `${staticConfig.siteTitle}!!!`;
    withModifiedConfig({ siteTitle: newTitle });

    it(`should return a modified config`, () => {
      expect(currentConfig().siteTitle, 'to be', newTitle);
    });
  });
});

describe('check if the config was restored', () => {
  it(`should return a regular config again`, () => {
    expect(currentConfig().siteTitle, 'to be', staticConfig.siteTitle);
  });
});
