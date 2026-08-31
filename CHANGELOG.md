# Changelog

## [0.4.0](https://github.com/kspiteri/pixmaler/compare/0.3.4...0.4.0) (2026-08-26)


### New

* add a crop framing widget to the image picker ([3b31d3e](https://github.com/kspiteri/pixmaler/commit/3b31d3e4c9fb1cc174165c4e7aae5471068f4776))
* report client and server versions for drift spotting ([e3fdcbd](https://github.com/kspiteri/pixmaler/commit/e3fdcbd8eda42fd0f6841301d52f9d558cf6ec06))


### Fixes

* derive `neverDrew` from `ranked` instead of `drewThisRound` ([02fe5d8](https://github.com/kspiteri/pixmaler/commit/02fe5d81d339b2f101c3bdd3f6167d0b3c32b893))


### Under the hood

* lift pure room and colour logic into testable modules ([dd2b531](https://github.com/kspiteri/pixmaler/commit/dd2b53174cd3d8705993317406f202f3d88d057b))
* replace pixelit with downscale to the grid ([d21f36e](https://github.com/kspiteri/pixmaler/commit/d21f36ee22a3932fe815ce6367fd79dbf0702342))
* run `pnpm test` before the build ([02405f3](https://github.com/kspiteri/pixmaler/commit/02405f3818bf2a7051b4584953f1f9126cd0575f))
* split the room server into per-concern modules ([fd1fd79](https://github.com/kspiteri/pixmaler/commit/fd1fd795244d90a607278f803ba525a055d5b0c7))

## [0.3.4](https://github.com/kspiteri/pixmaler/compare/0.3.3...0.3.4) (2026-08-25)


### Fixes

* catch phase-view crashes behind a `PhaseBoundary` ([8d2aac9](https://github.com/kspiteri/pixmaler/commit/8d2aac999b6d7b6cb72aebeebe1e425efd502ec9))
