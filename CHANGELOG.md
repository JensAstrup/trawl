# Changelog

## [0.1.0] — 2026-03-06

Initial release.

### Added

- Zero-click outdated dependency diagnostics with semver-aware severity (major → error, minor → warning, patch → info, prerelease → hint)
- Hover cards showing version range, latest version, update status, publish date, and links to npm/homepage
- Version autocomplete with real npm versions sorted newest-first, including dist-tags and publish dates
- Quick-fix actions to update to latest, pin to exact version, or open on npm
- Monorepo support — scans all `package.json` files in the workspace, excluding `node_modules`
- In-memory cache with configurable TTL, request deduplication, and background refresh
- Commands: `NPM: Check Outdated Dependencies` and `NPM: Refresh Dependency Cache`
- Settings: `enableDiagnostics`, `enableVersionAutocomplete`, `enableHover`, `cacheTTLMinutes`, `concurrency`, `ignoredPackages`
