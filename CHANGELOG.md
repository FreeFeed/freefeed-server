# Changelog

## [Unreleased]

### Fixed
- Groups in realtime events (such as `user:update` or `global:user:update`) now serializes according to the current user. This affects the visibility of the group's administrators list.
