# Changelog

## [0.4.1](https://github.com/kspiteri/pixmaler/compare/0.4.0...0.4.1) (2026-09-01)


### Fixes

* label the drawing-phase Ready button and add a hint caption ([81e74a5](https://github.com/kspiteri/pixmaler/commit/81e74a5895a29ec8c36ef77cc7667037eece5eb2))
* prevent double reprocess calls by scheduling with scheduleReprocess ([8829149](https://github.com/kspiteri/pixmaler/commit/88291492a40f5600fc0a78c414a88efdb0a04119))
* simplify comment ([b58c5e5](https://github.com/kspiteri/pixmaler/commit/b58c5e59257917492d8fd054f7d23beb10ff93c8))


### Under the hood

* drop `drewThisRound` from the shared `Player` type ([b5d9048](https://github.com/kspiteri/pixmaler/commit/b5d90485fee2f0845c9fc992edc77202ff76f448))
* extract `TargetMsg` and `RoundConfig` ([b07bc2f](https://github.com/kspiteri/pixmaler/commit/b07bc2f959395d70b9f9b61de41838267fb5b51f))
* keep `drewThisRound` off with a server-only `RoomPlayer` ([52a65a0](https://github.com/kspiteri/pixmaler/commit/52a65a0dc0ebca674f94f9ed0e702cc4ab182dc7))
* make `nextWake` return a non-nullable deadline ([74fdf80](https://github.com/kspiteri/pixmaler/commit/74fdf80330688a8e2c7685f22a1b1889bd109eb1))
* manage targetGrid independently ([e6bb321](https://github.com/kspiteri/pixmaler/commit/e6bb321d0b3878c42e6eeb670a149ffc3622083c))
* point canvas imports at the split modules ([2fc59ed](https://github.com/kspiteri/pixmaler/commit/2fc59ed644bc1310156a48eab818c08023fc55d8))
* refine palette generation and improve fallback handling ([c56adb6](https://github.com/kspiteri/pixmaler/commit/c56adb60fd2d316396cd20a436d46f6dd8b18df1))
* remove `colours` from result emission ([9069899](https://github.com/kspiteri/pixmaler/commit/90698999e5c29768fc4629f877e4e8eafd243077))
* split GmConfigureMsg ([790f1e2](https://github.com/kspiteri/pixmaler/commit/790f1e2f3d92d2a27c86eda47dfeb4df6cfd9063))
* split the canvas module into geometry, surface and tools ([8e4c1f7](https://github.com/kspiteri/pixmaler/commit/8e4c1f78511f83079f9af829eecb937ac3b17005))

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
