# Changelog

## [0.9.1](https://github.com/kspiteri/pixmaler/compare/0.9.0...0.9.1) (2026-09-15)


### Fixes

* add seat ownership with server-issued secrets ([d727afc](https://github.com/kspiteri/pixmaler/commit/d727afc6754ded9a112fbcc1b94fcb3b82fc3f37))
* enforce word-list validation for room code creation ([fb5abaf](https://github.com/kspiteri/pixmaler/commit/fb5abaf3d7d6a9d537091c90b4865d9fc5e00681))
* implement opaque submission IDs for anonymous voting ([e8240d5](https://github.com/kspiteri/pixmaler/commit/e8240d5e39d2c0ab8b49d69f74dbd55f8e1dc2c8))
* implement per-connection rate limiting for messages ([4484733](https://github.com/kspiteri/pixmaler/commit/4484733fdbea5557c201632e1149655371939b52))


### Under the hood

* consolidate buttons into a Button component ([b7334b1](https://github.com/kspiteri/pixmaler/commit/b7334b12636720c758b66ea199efb5632fdad1d0))

## [0.9.0](https://github.com/kspiteri/pixmaler/compare/0.8.3...0.9.0) (2026-09-14)


### New

* add "no such room" handling with create intent ([11f7eae](https://github.com/kspiteri/pixmaler/commit/11f7eae5e4641fb2f32b22b1842222db7bd486b3))
* add "room full" handling for player cap enforcement ([acce489](https://github.com/kspiteri/pixmaler/commit/acce489b3d5a54e78e574748ddf143e24da4bcc3))
* add `DuplicateTab` component for multi-tab handling ([9c1e886](https://github.com/kspiteri/pixmaler/commit/9c1e886eb534f90014057111de0a5fe2f022d92d))
* add GM-only "remove player" functionality for offline users ([3138d10](https://github.com/kspiteri/pixmaler/commit/3138d10c843c482fd3c37d1aae7d5061e2ec5d82))
* harden room existence checks ([750b702](https://github.com/kspiteri/pixmaler/commit/750b70226a525199bb9883dc1c9c0d0c8dd20fb4))


### Fixes

* add aria-labels for GM transfer and player removal buttons ([802a532](https://github.com/kspiteri/pixmaler/commit/802a53253d122b5fda3e5e0bca6e5a9fabc8036e))
* clear debounce timer on component unmount ([d1367cc](https://github.com/kspiteri/pixmaler/commit/d1367cc8ead565d889bfe212185ac70b781323ee))
* enforce name and identifier length limits ([9524763](https://github.com/kspiteri/pixmaler/commit/9524763b5b065f059461a20654054fff4133c11c))
* enforce player cap restriction ([31d541b](https://github.com/kspiteri/pixmaler/commit/31d541b150299caf2f2bb32859feca4207cd597d))
* ensure canvas shortcuts respect form field focus ([53d48b2](https://github.com/kspiteri/pixmaler/commit/53d48b20deee1e67fb8bb9ad5da9e1051a38c084))
* improve room lifecycle handling and cache logic ([91b1605](https://github.com/kspiteri/pixmaler/commit/91b1605837df5d561b52938fe9cb53356f4d41f3))
* prevent premature player disconnect ([fef658e](https://github.com/kspiteri/pixmaler/commit/fef658e2dcb86620734c25387c9c520d81352a14))
* sanitise display names with `sanitiseName` during edits ([2fe648d](https://github.com/kspiteri/pixmaler/commit/2fe648d3c97bbe1488032b077acc13a6bdb089a5))
* sanitise player names in `NameGate` submission ([708b5b1](https://github.com/kspiteri/pixmaler/commit/708b5b19582b3f17308c2f95b62f754e1d6ccd6b))


### Under the hood

* add URL builders for room links ([6114f7e](https://github.com/kspiteri/pixmaler/commit/6114f7efa3bc5462a4034d3213c0a84d0868702f))
* centralize name length validation with `clampName` ([86c7558](https://github.com/kspiteri/pixmaler/commit/86c7558335cf0d6ea155312e2a5dc259fa10648f))
* extract `applyVoteEcho` for reuse ([a8c794f](https://github.com/kspiteri/pixmaler/commit/a8c794f60a38810b8929f146c0527ad0459bb1ee))
* extract and modularize palette controls ([15e0ec6](https://github.com/kspiteri/pixmaler/commit/15e0ec6300558269730bc8d4edac8dd96603ddda))
* modularize `useRoom` for maintainability ([1a216a7](https://github.com/kspiteri/pixmaler/commit/1a216a7ca37e2250dfcafe308a6c813b4c5b7d85))
* modularize palette header and shortcuts ([32491fa](https://github.com/kspiteri/pixmaler/commit/32491faf91ee7af485312159f80acb37802ef808))
* move swatch/brush styles from scoped block to shared SCSS ([b66a203](https://github.com/kspiteri/pixmaler/commit/b66a203612090b5e839a4165c69aed04ea0e8455))
* replace `localStorage` calls with centralised utility ([75fd7d7](https://github.com/kspiteri/pixmaler/commit/75fd7d7ee13ec35b8d70799b46e13a793d930d28))
* replace `localStorage` calls with centralised utility ([8dd3214](https://github.com/kspiteri/pixmaler/commit/8dd3214700c0d68dec74732d93de83b26ac89115))
* unify room interstitial screens into shared component ([e2f51dc](https://github.com/kspiteri/pixmaler/commit/e2f51dca5ac6e55381ae2020b6dfcc8a86d9e0ea))
* use `roomHref` for constructing room links ([36c7e41](https://github.com/kspiteri/pixmaler/commit/36c7e41b72b065f72e8d1ce2547eea0aa2e25f00))
* use `roomHref` for Entry room link construction ([132a737](https://github.com/kspiteri/pixmaler/commit/132a737b9a13326b7c545bb3b4f401a70325241a))

## [0.8.3](https://github.com/kspiteri/pixmaler/compare/0.8.2...0.8.3) (2026-09-14)


### Fixes

* name sanitization and integrate for name validation ([bad0752](https://github.com/kspiteri/pixmaler/commit/bad0752c8eeaa4cc5a4bc7b43fba1efd3319c9df))


### Under the hood

* group components by role ([4b497ae](https://github.com/kspiteri/pixmaler/commit/4b497ae74f71df406c75563cd32e641e732cd756))
* move scss files into clearer folders ([e65cfd2](https://github.com/kspiteri/pixmaler/commit/e65cfd21a2ba7522d8130e45b4a629f83732a5a8))
* reorganize game components by feature folders ([da9b5c6](https://github.com/kspiteri/pixmaler/commit/da9b5c6de25e580a0478151e51bb31f85d1397aa))
* replace `CanvasPair` with `DrawBoard` ([2420646](https://github.com/kspiteri/pixmaler/commit/24206464534db8826f4ca38d6896771275baac92))
* replace all `CanvasPair` references with `DrawBoard` ([d3b4580](https://github.com/kspiteri/pixmaler/commit/d3b45802c462d1481986d2d22c73e8e51390a9f0))

## [0.8.2](https://github.com/kspiteri/pixmaler/compare/0.8.1...0.8.2) (2026-09-10)


### Fixes

* add touch mode toggle and integrate touch-friendly interactions ([c0c1252](https://github.com/kspiteri/pixmaler/commit/c0c125225d2cbca17e2a18656f6bf33243c90808))

## [0.8.1](https://github.com/kspiteri/pixmaler/compare/0.8.0...0.8.1) (2026-09-10)


### Fixes

* add palette docking and resizing with persisted preferences ([75b0681](https://github.com/kspiteri/pixmaler/commit/75b068148e23f77bc143d81c6996c301882fe665))
* improve canvas layout ([d225b0e](https://github.com/kspiteri/pixmaler/commit/d225b0e3a6130324661f068b2dea5afc9f04b6bb))


### Under the hood

* relocate reference img to palette panel and update layout ([68db109](https://github.com/kspiteri/pixmaler/commit/68db1099d031f65c53649f53bbf35a54413df42d))
* replace hardcoded colours with theme variables ([4c9175a](https://github.com/kspiteri/pixmaler/commit/4c9175ad2d9b422a8ec77326f5d79a36b3bb65a1))

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
