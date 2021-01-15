import stubTransport from 'nodemailer-stub-transport';

module.exports = {
  port: 31337,
  database: 3,
  monitorPrefix: 'tests',

  application: { EXTRA_STOP_LIST: ['thatcreepyguy', 'nicegirlnextdoor', 'perfectstranger'] },
  media: { storage: { rootDir: '/tmp/pepyatka-media/' } },
  attachments: {
    imageSizes: {
      t: {
        path: 'attachments/thumbnails/', // must have trailing slash
        bounds: { width: 525, height: 175 },
      },
      t2: {
        path: 'attachments/thumbnails2/', // must have trailing slash
        bounds: { width: 1050, height: 350 },
      },
      anotherTestSize: {
        path: 'attachments/anotherTestSize/', // must have trailing slash
        bounds: { width: 1600, height: 1200 },
      },
    },
  },
  mailer: { transport: stubTransport },
  postgres: { connection: { database: 'freefeed_test' } },
  externalAuthProviders: [
    {
      template: 'facebook',
      params: {
        clientId: 'test',
        clientSecret: 'test',
      },
    },
    {
      id: 'test',
      title: 'Test',
      adapter: 'test',
      params: {
        clientId: 'test',
        clientSecret: 'test',
      },
    },
  ],

  registrationsLimit: { maxCount: 10 },
};
