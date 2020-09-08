# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- Improve search: search by exact word form, by prefix and with word order operator

## [1.85.0] - 2020-09-01

### Fixed

- Groups in realtime events (such as `user:update` or `global:user:update`) now serializes according to the current user. This affects the visibility of the group's administrators list.
- Respect privacy-settings given during account creation

### Changed
- The main homefeed hide list is now applied to posts authored by friends (in
  _friends-all-activity_ mode). It affects the following situation: you are
  subscribed to the user U in main homefeed and to the group G in secondary
  homefeed, and U created a post in G. Now you will not see this post in main
  homefeed in _friends-all-activity_ mode.
