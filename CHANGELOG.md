# Changelog

## [0.8.0](https://github.com/kspiteri/pixmaler/compare/0.7.0...0.8.0) (2026-09-09)


### New

* add keyboard shortcuts for canvas tools and swatch enhancements ([48e7062](https://github.com/kspiteri/pixmaler/commit/48e706281136842fec82acf43baa6ba91263c023))
* add keyboard shortcuts panel and swatch quick-key overlay ([17612fa](https://github.com/kspiteri/pixmaler/commit/17612fa8cd0c8420053defefaeb23073ff7fe6a2))
* add toggle for keyboard shortcuts with desktop-only UI integration ([f154708](https://github.com/kspiteri/pixmaler/commit/f154708c5cdf3ae39148bcfafe54f5355fd341ee))


### Under the hood

* remove redundant keyboard shortcut handlers from views ([18434e0](https://github.com/kspiteri/pixmaler/commit/18434e0f3764a1182c6b42e54551b14e0f977680))

## [0.7.0](https://github.com/kspiteri/pixmaler/compare/0.6.1...0.7.0) (2026-09-09)


### New

* add `parseClientMsg` for server-side validation ([9e2e7b5](https://github.com/kspiteri/pixmaler/commit/9e2e7b524573da3d341cc7f0d26b9413100f47f6))
* add accessible countdown announcements and phase headings ([d688b69](https://github.com/kspiteri/pixmaler/commit/d688b69beff4275c072d394efa85981369311acc))
* add accessible countdown announcements for assistive tech ([0a5ba40](https://github.com/kspiteri/pixmaler/commit/0a5ba400adf3070eb8121adadf9d4cbdeb17fc01))
* add crop widget, GM controls, and pixel-art thumbnail components ([65a530b](https://github.com/kspiteri/pixmaler/commit/65a530b98a5b369986a0a8d913e715478d752a34))
* add invisible headings for better assistive tech navigation ([c01022b](https://github.com/kspiteri/pixmaler/commit/c01022bf4bc033b1cfd676961781aa9bb8b0cb25))
* add shared composables ([0a28c9d](https://github.com/kspiteri/pixmaler/commit/0a28c9d5a736a6b51240b98c5227a5486edf366b))
* implement `colorName` for accessible swatches and ARIA support ([815ef18](https://github.com/kspiteri/pixmaler/commit/815ef18d511a0ad9670cfdbcd2d9e89acbbab4a7))
* share foundation functions ([9bd8859](https://github.com/kspiteri/pixmaler/commit/9bd885932e7aae9bbf1640475b76e9f547925e3f))


### Under the hood

* "results" phase ([d1ce86f](https://github.com/kspiteri/pixmaler/commit/d1ce86f37dddfd3861458ae79d1df5b930cc2ee1))
* "voting" phase ([fcb39c1](https://github.com/kspiteri/pixmaler/commit/fcb39c13f831ff69c9a2a3ac94d2271c8ce3c53b))
* adjust `parseClientMsg` import path to `protocol` ([10999a4](https://github.com/kspiteri/pixmaler/commit/10999a48840be7d65080185ce21c0eddf68a1927))
* **components:** consolidate imports to `lib` using barrel file ([c7ad5a7](https://github.com/kspiteri/pixmaler/commit/c7ad5a7973efd79861fe6bcc510336e671278ce9))
* **components:** use `CropWidget` and consolidate imports to `lib` ([08749bd](https://github.com/kspiteri/pixmaler/commit/08749bd672e4f19bffae64be49419c5478f69fc6))
* consolidate imports to `lib` using barrel file ([d17099c](https://github.com/kspiteri/pixmaler/commit/d17099c6aab71efa75b2e393216af0fb6efb6017))
* drawing phase ([46ca67c](https://github.com/kspiteri/pixmaler/commit/46ca67c7602e0d8da84603512fd57b6bf0915286))
* **lib:** group modules into domain folders ([5c7dac1](https://github.com/kspiteri/pixmaler/commit/5c7dac1c16260656ea730474f35914f400279607))
* replace GM logic with `LobbyGmControls` and use `PixelThumb` ([0ab0a7e](https://github.com/kspiteri/pixmaler/commit/0ab0a7e0083fd7a612d876fe77bfb57a5f6189e4))
* **tests:** consolidate imports to `lib` ([5930a45](https://github.com/kspiteri/pixmaler/commit/5930a457bcb49505a7d6678df6cbfcb48afde294))
* update party imports to `protocol` and reorganise paths ([96c9874](https://github.com/kspiteri/pixmaler/commit/96c987419476cb8565c0ae629241a11a14e0625a))
* use `appHref` from barrel file for consistent URL handling ([664e5af](https://github.com/kspiteri/pixmaler/commit/664e5af1521b77335f210134b016647815944c3b))
* use `useOrientation` and consolidate imports to `lib` ([5dc17d7](https://github.com/kspiteri/pixmaler/commit/5dc17d7bb66b9f5a408bcbbdca32aaba4ffabf74))

## [0.6.1](https://github.com/kspiteri/pixmaler/compare/0.6.0...0.6.1) (2026-09-08)


### Fixes

* handle skipped transitions to prevent unhandled promise rejections ([1e03c24](https://github.com/kspiteri/pixmaler/commit/1e03c240e57cca548e5e96f27ae077c2f37ed5cb))
* improve image decoding with HEIC support and better error handling ([46fddb3](https://github.com/kspiteri/pixmaler/commit/46fddb3d35a01c98aae41746efe38f9308a35374))
* optimize drawing panel for mobile ([7444001](https://github.com/kspiteri/pixmaler/commit/744400142a77cb4644b1422053f2664d207c1edb))

## [0.6.0](https://github.com/kspiteri/pixmaler/compare/0.5.0...0.6.0) (2026-09-07)


### New

* add "Clear my data" feature and privacy notice ([0fce3ea](https://github.com/kspiteri/pixmaler/commit/0fce3ea45aed5500edcb618d0df97f8dc6911ee0))
* add `SettingsMenu` component ([3406e75](https://github.com/kspiteri/pixmaler/commit/3406e755678b8803b89b731ae35331269d77cbf3))
* add reusable `ToggleSwitch` component ([7d3c259](https://github.com/kspiteri/pixmaler/commit/7d3c259b22b47b806f011636d93af667d208e0ad))


### Fixes

* prevent canvas from unmounting when settings are collapsed ([d255b2d](https://github.com/kspiteri/pixmaler/commit/d255b2d7ff46428755053fa7dcc2252312bc9ac4))


### Under the hood

* centralize font size control with `fs()` and `--text-scale` ([ab2d421](https://github.com/kspiteri/pixmaler/commit/ab2d4215a0cf7ee6487656fb53056e5f7536e5a6))
* centralize identity handling with `lib/identity` ([116eb26](https://github.com/kspiteri/pixmaler/commit/116eb2670f56b982ae44abfa6d570d0b02d63f88))
* extract room connection and state management into `useRoom` ([216fc4b](https://github.com/kspiteri/pixmaler/commit/216fc4bc2358983b97a57839cc4c28461af42b9a))
* improve privacy notice styling and structure ([8b083c3](https://github.com/kspiteri/pixmaler/commit/8b083c3ab742343e45c15f700d800f53645f93cc))
* remove per-screen canvas rules and streamline styling ([5c7b92d](https://github.com/kspiteri/pixmaler/commit/5c7b92d99ec5f758231d1bba2c9ba296bd8be1ab))
* replace `ThemeToggle` with `SettingsMenu` ([e63d72c](https://github.com/kspiteri/pixmaler/commit/e63d72cc19d6fb6f341ff9330bc8026fcee10cfd))
* replace custom `ThemeToggle` logic with `ToggleSwitch` ([26e4da1](https://github.com/kspiteri/pixmaler/commit/26e4da18154f664a2384a28194012c4f858042d8))
* replace inline name inputs with reusable `NameField` component ([61a102d](https://github.com/kspiteri/pixmaler/commit/61a102d93c57140fda2b4b36f3b71430c47c19eb))
* self-host fonts locally ([3df668e](https://github.com/kspiteri/pixmaler/commit/3df668e33f074718e149b2e0c197f066446218ea))

## [0.5.0](https://github.com/kspiteri/pixmaler/compare/0.4.1...0.5.0) (2026-09-01)


### New

* add customizable background for transparent images ([c3207ca](https://github.com/kspiteri/pixmaler/commit/c3207ca828ca0f9b4c5ef4ed5cb474922c91c7e1))
* notify players when a round is cancelled mid-game ([e1363c3](https://github.com/kspiteri/pixmaler/commit/e1363c3a23128dc7f555c7347b9bd06cd7a1904f))


### Fixes

* enhance image format handling and error messaging in `ImagePicker` ([3899a67](https://github.com/kspiteri/pixmaler/commit/3899a67a71da103e38050f580ab7e225efb091a8))


### Under the hood

* centralize interstitial screen styles with mixins ([a5acdb9](https://github.com/kspiteri/pixmaler/commit/a5acdb99946e1a33644fa6cf0e06de1bd0becc57))
* extract `NameGate` and `SessionClosed` screens into own views ([b80c96b](https://github.com/kspiteri/pixmaler/commit/b80c96bf2a1c505d0ead42f2602d015d9cc971f8))

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
