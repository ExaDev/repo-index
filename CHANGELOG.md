## [1.3.2](https://github.com/ExaDev/repo-index/compare/v1.3.1...v1.3.2) (2026-11-23)

### Bug Fixes

- skip dependencies whose repository GitHub forbids the token to see ([9d13d96](https://github.com/ExaDev/repo-index/commit/9d13d96e4df53231eca667bd2cffe875aa83c576))

## [1.3.1](https://github.com/ExaDev/repo-index/compare/v1.3.0...v1.3.1) (2026-11-23)

### Bug Fixes

- retry GitHub's transient query errors, not only server error statuses ([8039c63](https://github.com/ExaDev/repo-index/commit/8039c63955fb20caaa60b581d775b9eed726a0f6))

## [1.3.0](https://github.com/ExaDev/repo-index/compare/v1.2.0...v1.3.0) (2026-11-23)

### Features

- group by activity by default and show topics in a column ([1966f08](https://github.com/ExaDev/repo-index/commit/1966f0801573dcad85d1e8487e8f3bab5855b0f7))

## [1.2.0](https://github.com/ExaDev/repo-index/compare/v1.1.3...v1.2.0) (2026-11-23)

### Features

- show relationships between listed repositories and guard private references ([f3db6c0](https://github.com/ExaDev/repo-index/commit/f3db6c0c88b9517f6a32fb3900e20ba62bcd6631))

## [1.1.3](https://github.com/ExaDev/repo-index/compare/v1.1.2...v1.1.3) (2026-11-23)

### Build System

- **deps:** update dev dependencies to patched versions ([5d00bd8](https://github.com/ExaDev/repo-index/commit/5d00bd802cd5b6e39425d2ddd8fafdeee089e38b))

## [1.1.2](https://github.com/ExaDev/repo-index/compare/v1.1.1...v1.1.2) (2026-11-23)

### Build System

- **deps:** bump the npm_and_yarn group across 1 directory with 3 updates ([6fe89cf](https://github.com/ExaDev/repo-index/commit/6fe89cfc95c5b95606d56fcfc87e4329c4a73788))

## [1.1.1](https://github.com/ExaDev/repo-index/compare/v1.1.0...v1.1.1) (2026-11-21)

### Bug Fixes

- request read-only Contents on the App token for the activity sort ([4b22361](https://github.com/ExaDev/repo-index/commit/4b22361594f4d977a7f39d52fbe2f5b03f237941))

## [1.1.0](https://github.com/ExaDev/repo-index/compare/v1.0.1...v1.1.0) (2026-11-21)

### Features

- sort by activity with a recency half-life by default ([cf85a35](https://github.com/ExaDev/repo-index/commit/cf85a355c676cb04895c25b6ed0294bf5b81c5d7))

## [1.0.1](https://github.com/ExaDev/repo-index/compare/v1.0.0...v1.0.1) (2026-11-21)

### Bug Fixes

- refuse visibility all when only the default token is available ([7697293](https://github.com/ExaDev/repo-index/commit/76972936c05ff52db6efa9a2bc938ce7c6daa250))

## 1.0.0 (2026-11-21)

### Features

- generate a grouped index of an owner's repositories into README regions ([e280535](https://github.com/ExaDev/repo-index/commit/e280535ebd231775cb84d3461978cac617fdfa62))

### Documentation

- add README and licence ([2231f5e](https://github.com/ExaDev/repo-index/commit/2231f5ed532bd56c3aaa4933e63764b257ef00e8))
- show the no-secret workflow first and document markers, dry runs and credentials ([65be54b](https://github.com/ExaDev/repo-index/commit/65be54b9bc0b283c7d24912e856247f868578874))

### Build System

- add TypeScript, lint, format, commit and release tooling ([4ee3dc2](https://github.com/ExaDev/repo-index/commit/4ee3dc22b688f6d5660c260884f8798d5a5bc072))

### Continuous Integration

- check types, lint, format and tests, and release with semantic-release ([8bcd744](https://github.com/ExaDev/repo-index/commit/8bcd744246c092a69cdf942b0de5bbb69f7ba93c))
- install dependencies before running the tests ([3ed9b72](https://github.com/ExaDev/repo-index/commit/3ed9b72b0c4f1110e112b1ca9c0a1ff9960058b6))
