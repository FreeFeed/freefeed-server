try {
  require('newrelic');
} catch (e) {
  // No newrelic's config found. Won't report stats to them
}

require('./index');
