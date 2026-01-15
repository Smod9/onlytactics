# [1.32.0](https://github.com/Smod9/onlytactics/compare/v1.31.0...v1.32.0) (2026-01-15)


### Features

* Enhance rules engine with stern rammer logic and update boat display names ([0c31547](https://github.com/Smod9/onlytactics/commit/0c315477ac791f2f06fc80cb47bd5f3b9b229111))
* Introduce reverse speed and leeward drift mechanics ([32d2ed1](https://github.com/Smod9/onlytactics/commit/32d2ed146e3196b6c3565341b4454c58a3e527d6))

# [1.31.0](https://github.com/Smod9/onlytactics/compare/v1.30.0...v1.31.0) (2026-01-15)


### Features

* Enhance wake dynamics with new parameters and visualizations ([91502c6](https://github.com/Smod9/onlytactics/commit/91502c6739ceb3b1affe6770a6845293d1277ba0))

# [1.30.0](https://github.com/Smod9/onlytactics/compare/v1.29.7...v1.30.0) (2026-01-14)


### Bug Fixes

* Adjusts the y-coordinate of the start line pin from 120 to 110 ([7f57a39](https://github.com/Smod9/onlytactics/commit/7f57a395ae00897cae7be04cb0dff90ef215ce4d))


### Features

* Add pickle badge to leaderboard for last place finishers and remove wind field toggle button for hosts ([c914313](https://github.com/Smod9/onlytactics/commit/c91431350e44746ec3d4f05fe18023bcb613d69d))

## [1.29.7](https://github.com/Smod9/onlytactics/compare/v1.29.6...v1.29.7) (2026-01-14)


### Bug Fixes

* Changes where patch rate is set on the server ([e397427](https://github.com/Smod9/onlytactics/commit/e3974274011438524b24a751eb9866feb321132f))
* Increases tick rate on server side to 33ms (30hz) from 10hz. hopefully we can go even faster and but also hopefully at the scale of 10 boats, this resolves our issues. ([ba0d7f1](https://github.com/Smod9/onlytactics/commit/ba0d7f1ced7283c2731fd0cb75172d65d71a0845))

## [1.29.6](https://github.com/Smod9/onlytactics/compare/v1.29.5...v1.29.6) (2026-01-05)


### Bug Fixes

* Puts right shift key back for hard turns and removes baggage from when i tried to split them out. ([27cdb4a](https://github.com/Smod9/onlytactics/commit/27cdb4a42e0f66d79c69b3b1dd731aa341406aa5))

## [1.29.5](https://github.com/Smod9/onlytactics/compare/v1.29.4...v1.29.5) (2026-01-02)


### Bug Fixes

* Allows client reconnect within 30s grace period. Refreshing the page is now safe in a game. ([7e6ed8c](https://github.com/Smod9/onlytactics/commit/7e6ed8cfbb517defc8499ad463dee469fffd75ba))

## [1.29.4](https://github.com/Smod9/onlytactics/compare/v1.29.3...v1.29.4) (2026-01-02)


### Bug Fixes

* Should resolve stuck button alert for windows users by removing the right shift key option for luffing as no one was using that anyway ([6853b8a](https://github.com/Smod9/onlytactics/commit/6853b8aeed25790918246b81ee708f113cbabbc2))

## [1.29.3](https://github.com/Smod9/onlytactics/compare/v1.29.2...v1.29.3) (2026-01-02)


### Bug Fixes

* increase bow radius from 4 to 4.5 to make collision more likely. ([055d7d7](https://github.com/Smod9/onlytactics/commit/055d7d72454c728a5a86352d079e9fdc0061985c))

## [1.29.2](https://github.com/Smod9/onlytactics/compare/v1.29.1...v1.29.2) (2026-01-02)


### Bug Fixes

* Luff button added for ipad. Buttons also slightly smaller on ipad now. ([916a8ae](https://github.com/Smod9/onlytactics/commit/916a8ae562ab820e8ab07953322c8243843b1880))

## [1.29.1](https://github.com/Smod9/onlytactics/compare/v1.29.0...v1.29.1) (2025-12-30)


### Bug Fixes

* Makes the left shift clear the right shift since at least safari (maybe others) spoof an extra key down weirdly - which was making the blown sails state stick ([a3e541c](https://github.com/Smod9/onlytactics/commit/a3e541c99c0d346bf68964e67b6dc266ed3128d8))

# [1.29.0](https://github.com/Smod9/onlytactics/compare/v1.28.1...v1.29.0) (2025-12-30)


### Features

* Adds ability to blow the sails and displays luffing sail ([f480139](https://github.com/Smod9/onlytactics/commit/f480139f7cd579298b6962546b81034d016f4142))
* Adds right shift key as alternate for blowing sails, only left shift key now turns hard ([2fbeb95](https://github.com/Smod9/onlytactics/commit/2fbeb951bc0d7b14f8f459b396c36c401c713102))

## [1.28.1](https://github.com/Smod9/onlytactics/compare/v1.28.0...v1.28.1) (2025-12-24)


### Bug Fixes

* **Issue #58:** Resolves ISS [#58](https://github.com/Smod9/onlytactics/issues/58). OCS now uses the capsule boat shape ([66c7633](https://github.com/Smod9/onlytactics/commit/66c7633fbba615747aa0faa58506e8343ff8530c))

# [1.28.0](https://github.com/Smod9/onlytactics/compare/v1.27.0...v1.28.0) (2025-12-24)


### Features

* enhance roster management and UI components ([e7623e7](https://github.com/Smod9/onlytactics/commit/e7623e7a28ab217b541137141517b882d24ed69b))

# [1.27.0](https://github.com/Smod9/onlytactics/compare/v1.26.8...v1.27.0) (2025-12-24)


### Bug Fixes

* Only refreshes wind field every 3rd race update, makes sprit pole line fixed, also experimenting with slowing puffs down and making them bigger (though im not sure that is a performance thing ([c3afd41](https://github.com/Smod9/onlytactics/commit/c3afd41e1f22d60831d83001e548874d534e3ce3))


### Features

* enhance boat rendering and wind shadow effects performance ([fa373b7](https://github.com/Smod9/onlytactics/commit/fa373b75fca2383f1e8b0fbf254783bbf39a02c7))

## [1.26.8](https://github.com/Smod9/onlytactics/compare/v1.26.7...v1.26.8) (2025-12-23)


### Bug Fixes

* decreases refresh rate to 100ms or 20hz ([#67](https://github.com/Smod9/onlytactics/issues/67)) ([9173623](https://github.com/Smod9/onlytactics/commit/9173623ab170ca47309d45ba28503c51a66d406a))

## [1.26.7](https://github.com/Smod9/onlytactics/compare/v1.26.6...v1.26.7) (2025-12-22)


### Bug Fixes

* Return focus to game after typing message ([#62](https://github.com/Smod9/onlytactics/issues/62)) ([17c9ce1](https://github.com/Smod9/onlytactics/commit/17c9ce13da987a41be28bbd853ee083881c0a49d)), closes [#60](https://github.com/Smod9/onlytactics/issues/60)

## [1.26.6](https://github.com/Smod9/onlytactics/compare/v1.26.5...v1.26.6) (2025-12-22)


### Bug Fixes

* Updates keyboard svg ([5aefb5b](https://github.com/Smod9/onlytactics/commit/5aefb5b396cda799ce8f0cdfa487f35f72f6d826))

## [1.26.5](https://github.com/Smod9/onlytactics/compare/v1.26.4...v1.26.5) (2025-12-22)


### Bug Fixes

* better help menu and tips ([091dfcf](https://github.com/Smod9/onlytactics/commit/091dfcfaa8c3db96cd7d35828db30e17a2e0da4f))
* help menu ([898afb9](https://github.com/Smod9/onlytactics/commit/898afb9e36c4ad8d673aadefad56913e493b53a1))
* improved help menu ([45c788c](https://github.com/Smod9/onlytactics/commit/45c788c09ca9c3a53225ff5d8b6f403387a04dcb))
* tweaks help tips ([e836229](https://github.com/Smod9/onlytactics/commit/e836229868917470e6331c806efa7f13b4640cac))
* Updates keyboard svg ([819514c](https://github.com/Smod9/onlytactics/commit/819514ca2dd93cbbb54f5fa94606f8182130d5c6))

## [1.26.4](https://github.com/Smod9/onlytactics/compare/v1.26.3...v1.26.4) (2025-12-21)


### Bug Fixes

* boats now mostly spawn on the screen when in birdseye ([129159f](https://github.com/Smod9/onlytactics/commit/129159f5893e082dc1d3834e400592c67fff1058))

## [1.26.3](https://github.com/Smod9/onlytactics/compare/v1.26.2...v1.26.3) (2025-12-21)


### Bug Fixes

* makes default number of laps 2 ([7df5000](https://github.com/Smod9/onlytactics/commit/7df5000e42dbbc85320fa7e6399d573035df96ec))

## [1.26.2](https://github.com/Smod9/onlytactics/compare/v1.26.1...v1.26.2) (2025-12-21)


### Bug Fixes

* Increases max speed to 16knts (from 12) ([ebe5add](https://github.com/Smod9/onlytactics/commit/ebe5add37e7e64e9fdc7639a28da047cb48bc220))

## [1.26.1](https://github.com/Smod9/onlytactics/compare/v1.26.0...v1.26.1) (2025-12-21)


### Bug Fixes

* 2 boat length zone became 4 somehow. 2 again ([d79e0c8](https://github.com/Smod9/onlytactics/commit/d79e0c8ce903f302f7f9c26c0eb735d5ec50deb8))
* Resolves TACK in HUD ([8c449c4](https://github.com/Smod9/onlytactics/commit/8c449c48be8ec0a7ea5a0714ba300f723f92c7eb))

# [1.26.0](https://github.com/Smod9/onlytactics/compare/v1.25.1...v1.26.0) (2025-12-21)


### Features

* **puffs:** Makes it a game time choice to turn puffs on and off. Some menu polish too ([be48d7f](https://github.com/Smod9/onlytactics/commit/be48d7f578c96ad0bd30af9246e792912a436797))
* **puffs:** Picks up env files ([ea7a044](https://github.com/Smod9/onlytactics/commit/ea7a0446c97ff739a98b551de4d2dc3c1d0e411e))
* **puffs:** Puffs working, pause game fixed for god mode ([0d811d4](https://github.com/Smod9/onlytactics/commit/0d811d4c49eafdcd469195064305cd0be5ebf6ae))
* **windField:** Introduce wind field configuration and visualization ([f971d5a](https://github.com/Smod9/onlytactics/commit/f971d5a9329f378071ba78bfc1c96be6cc8ba216))

## [1.25.1](https://github.com/Smod9/onlytactics/compare/v1.25.0...v1.25.1) (2025-12-21)


### Bug Fixes

* **trim:** Improve sail rotation calculation based on apparent wind angle ([1b51a8d](https://github.com/Smod9/onlytactics/commit/1b51a8d40c01a4f37de7aaf16596a4c9d24a9f6f))

# [1.25.0](https://github.com/Smod9/onlytactics/compare/v1.24.0...v1.25.0) (2025-12-21)


### Features

* Bunch of mostly protest feature related UI polish ([b068ce9](https://github.com/Smod9/onlytactics/commit/b068ce95d4af355b3dc2b5ecb27b1c946a06dd21))
* Lots of UI cleanup, some related to protests, others menu and such ([4cf263b](https://github.com/Smod9/onlytactics/commit/4cf263b8008858126d9fef1699b5e56a7d9a2253))

# [1.24.0](https://github.com/Smod9/onlytactics/compare/v1.23.3...v1.24.0) (2025-12-20)


### Features

* Add protest handling and role management in race state ([75b0980](https://github.com/Smod9/onlytactics/commit/75b09805a4b08463fcf6c3a81913a57b0c3c6a0c))
* **camera:** Implement follow boat functionality and enhance camera controls ([8672ddc](https://github.com/Smod9/onlytactics/commit/8672ddc1d21971a0e39de4987d9c170c34be289b))
* **protest:** Basics all working ([4209ef0](https://github.com/Smod9/onlytactics/commit/4209ef0697ba1ac29a0ff2837732b014fd6ed291))
* **protests:** Basics working. Roles added for spectator and judge ([378690a](https://github.com/Smod9/onlytactics/commit/378690a9489a2b405876978a1a5e56b6ca9f8b86))
* **protests:** Picks up initial files that were missed ([c1f15ad](https://github.com/Smod9/onlytactics/commit/c1f15ad6f4c4b141cca7fca4390155630fe15881))

## [1.23.3](https://github.com/Smod9/onlytactics/compare/v1.23.2...v1.23.3) (2025-12-19)


### Bug Fixes

* Increases race timeout to 25mins ([83fb233](https://github.com/Smod9/onlytactics/commit/83fb2334e6d3d455f3844ee44a2d37c236ff6f88))

## [1.23.2](https://github.com/Smod9/onlytactics/compare/v1.23.1...v1.23.2) (2025-12-18)


### Bug Fixes

* Improve keyboard event handling in ChatPanel to prevent interference with user input ([4265dc6](https://github.com/Smod9/onlytactics/commit/4265dc6013c702f26d08fd967ccea8d455c355ca))

## [1.23.1](https://github.com/Smod9/onlytactics/compare/v1.23.0...v1.23.1) (2025-12-18)


### Bug Fixes

* Mobile/iPad polish and resolves windshadow chip (PR [#47](https://github.com/Smod9/onlytactics/issues/47)) ([9816fb8](https://github.com/Smod9/onlytactics/commit/9816fb8b4a0786e9f0d578b72044dd5797f36b8f))

# [1.23.0](https://github.com/Smod9/onlytactics/compare/v1.22.1...v1.23.0) (2025-12-18)


### Bug Fixes

* Improve keyboard event handling in LiveClient and useTacticianControls ([7d9c257](https://github.com/Smod9/onlytactics/commit/7d9c25784743b13fb72b3759d21a917913f7715a))
* ipad controls ([b2e39ce](https://github.com/Smod9/onlytactics/commit/b2e39ce9699e46f9db510cb5185d11e4639a5d08))


### Features

* Enhance touch control interactions and prevent text selection in Safari ([184a285](https://github.com/Smod9/onlytactics/commit/184a2859cbd31fdea5ec7e4d8e4a21fbf74805cb))

## [1.22.1](https://github.com/Smod9/onlytactics/compare/v1.22.0...v1.22.1) (2025-12-18)


### Bug Fixes

* Moves rtt to screen, hides debug panel and updates help menu ([5018aa7](https://github.com/Smod9/onlytactics/commit/5018aa7fbedb9e2be174e90d502c912d8ee5628f))

# [1.22.0](https://github.com/Smod9/onlytactics/compare/v1.21.0...v1.22.0) (2025-12-18)


### Bug Fixes

* Update wind shift display to use '0' instead of 'ON' ([56f5e8c](https://github.com/Smod9/onlytactics/commit/56f5e8c8a125884a3c6e9ebcde3359afdeba6c17))


### Features

* Enhance HUD layout and touch control interactions ([079c892](https://github.com/Smod9/onlytactics/commit/079c89277c39a540881be664bc938621d74214ef))
* New instrument gauge, less zoomy zoom and a nice line to the next mark while zoomed ([71def48](https://github.com/Smod9/onlytactics/commit/71def489bd62f998b3828b130cc51e1d4cbc4e51))
* Update VMG mode functionality and UI elements ([aaad295](https://github.com/Smod9/onlytactics/commit/aaad295024d47ac2cfbf807136a3d0b2ca30fcb3))

# [1.21.0](https://github.com/Smod9/onlytactics/compare/v1.20.0...v1.21.0) (2025-12-18)


### Features

* Add follow camera zoom factor configuration ([14876f5](https://github.com/Smod9/onlytactics/commit/14876f593bffee13cc3c55b9ac54ccb187b7760b))
* Add follow-mode guidance line to RaceScene ([afe4bce](https://github.com/Smod9/onlytactics/commit/afe4bcee8a8c6dcc551e027992e88d7aac739cd2))

# [1.20.0](https://github.com/Smod9/onlytactics/compare/v1.19.1...v1.20.0) (2025-12-17)


### Features

* Implement camera mode toggle and enhance race scene rendering ([59635df](https://github.com/Smod9/onlytactics/commit/59635df2735d368f6d192af6b6effb88a5a64822))
* Polish on zoom and other features ([349bca4](https://github.com/Smod9/onlytactics/commit/349bca48585e3c802d5fde1e9d77102789382c35))
* zoom working, polish to touch controls associated with that ([a5c13e3](https://github.com/Smod9/onlytactics/commit/a5c13e3856f8b798e9623a891390c462956f4d66))

## [1.19.1](https://github.com/Smod9/onlytactics/compare/v1.19.0...v1.19.1) (2025-12-16)


### Bug Fixes

* Improves style of wind shadow indicator ([89206bd](https://github.com/Smod9/onlytactics/commit/89206bd9caf2705803847c7898cd27027a3fb57d))

# [1.19.0](https://github.com/Smod9/onlytactics/compare/v1.18.0...v1.19.0) (2025-12-13)


### Features

* Improves starting line, extends the course and polishes the zone(s). ([62ea1f9](https://github.com/Smod9/onlytactics/commit/62ea1f9cceaf96b890747ec4774c8b135c5126b9))

# [1.18.0](https://github.com/Smod9/onlytactics/compare/v1.17.0...v1.18.0) (2025-12-13)


### Features

* **capsule_collision:**  Hides circles unless debug enabled. They seem to work ([abfc798](https://github.com/Smod9/onlytactics/commit/abfc798b3e2c095dda448a9513edb961a0d06e0c))
* **capsule_collision:** POC of drawn capsules optimized for boat size to improve accuracy of collisions ([b955c68](https://github.com/Smod9/onlytactics/commit/b955c68d75668da722f63eac8a5c41b871a6710a))
* **wind shadow:** (PR [#36](https://github.com/Smod9/onlytactics/issues/36)) Initial implementation of Wind Shadow ([e836c55](https://github.com/Smod9/onlytactics/commit/e836c551ab43a932d2398f1b8b3c96ae138a8394))

# [1.17.0](https://github.com/Smod9/onlytactics/compare/v1.16.0...v1.17.0) (2025-12-08)


### Features

* **chat cleanup:** Messages now show up just above the input ([b75c276](https://github.com/Smod9/onlytactics/commit/b75c276f4225265a807305e534e37d7172f246ec))

# [1.16.0](https://github.com/Smod9/onlytactics/compare/v1.15.0...v1.16.0) (2025-12-07)


### Features

* **polish:** Fixes .env ([6abca31](https://github.com/Smod9/onlytactics/commit/6abca313736826eebcdb35a749c2821fb291b6d4))
* **polish:** More clear start button, denotes who is RC in leaderboard now. Moves speed to the screen ([9132a4b](https://github.com/Smod9/onlytactics/commit/9132a4bd9299ea38664b538ac05b632873e1400a))
* **polish:** Moves 360 button to the left ([b220f00](https://github.com/Smod9/onlytactics/commit/b220f002a719576d6bae58ebad7e4bc1ebf846f1))
* **polish:** Moves messages to the left. ([52adfb6](https://github.com/Smod9/onlytactics/commit/52adfb610805e2c2e880462f225201128e5431fe))
* **polish:** Moves speed and leaderboard a bit ([0745371](https://github.com/Smod9/onlytactics/commit/07453710991e1789626d49b2b8aab7dad7e5d989))
* **polish:** Moves wind readout a bit and makes it bigger ([a2240e5](https://github.com/Smod9/onlytactics/commit/a2240e507263177cda004dcef002db369a39a9ac))
* **polish:** Now all players can see who the RC (host) is and its clear why its not starting ([f8e2557](https://github.com/Smod9/onlytactics/commit/f8e2557714f8dcd3557fc4eb44886ed654313925))
* **polish:** Resolves build issues ([77d9674](https://github.com/Smod9/onlytactics/commit/77d96748faf42b245bcfab7a4ca02a809f1c9c8d))

# [1.15.0](https://github.com/Smod9/onlytactics/compare/v1.14.0...v1.15.0) (2025-12-07)


### Features

* **fast refresh:** Increases refresh rate to 50ms (probably could go faster) - now at 20hz - need to watch logs in a larger game ([b9b50f0](https://github.com/Smod9/onlytactics/commit/b9b50f025cef5c5b323ff34d7b455c0ed35ab231))
* **pipelines:** Release auto on main, and status checks on all branch ([#28](https://github.com/Smod9/onlytactics/issues/28)) ([18cedf2](https://github.com/Smod9/onlytactics/commit/18cedf2f8135495a49646f3368ddfd8283d463d5))

# [1.14.0](https://github.com/Smod9/onlytactics/compare/v1.13.0...v1.14.0) (2025-12-06)


### Bug Fixes

* **event-list-height:** Event list now takes up the full right side ([d8f34f6](https://github.com/Smod9/onlytactics/commit/d8f34f64e75a243df288f62b3bec1dabe4f5db2b))


### Features

* **faster-tacks:** Tacks now are less of a penalty (also fixes .env which we've gotta get out of here. ([5d1d522](https://github.com/Smod9/onlytactics/commit/5d1d52246b60229b4ab14e002960488a8598c849))
* **Leaderboard:** (PR [#25](https://github.com/Smod9/onlytactics/issues/25)) Adds concept of legs/laps/leaderboard. Will need polish, but you can win a race now 🥇 ([4f8db55](https://github.com/Smod9/onlytactics/commit/4f8db557785a60d53e9b505fbed7d5a8ec849c31))
* **p-key:** P now clears penalties - a debugging tool (easily abused) to clear penalties people believe were the apps fault in these early days ([74fe9f0](https://github.com/Smod9/onlytactics/commit/74fe9f07fa8539c174241f9052dd22ac2737d960))

# [1.13.0](https://github.com/Smod9/onlytactics/compare/v1.12.0...v1.13.0) (2025-12-04)


### Bug Fixes

* **crashbox:** Tightens up the crashbox to not include the name and allow dipping ([f2b9873](https://github.com/Smod9/onlytactics/commit/f2b98733e4bd7f4f16975340663f449d3d68a3c9))
* **port-starboard:** The rule was broken, and is now fixed ([87f6925](https://github.com/Smod9/onlytactics/commit/87f6925e393db0530cb4b92672a6e3c6985ddbfb))


### Features

* **any host:** Anyone can start and restart the race now for these early days. ([57cf594](https://github.com/Smod9/onlytactics/commit/57cf5940f487e88564b11ae808623848f96cbf8d))
* **moves gate:** Moves leeward gate further down the course ([92fc58f](https://github.com/Smod9/onlytactics/commit/92fc58fe8d9e4c2b395d7c1d00f9495d2e2a809a))
* **social links:** Adds social links to home page for easy access ([d55ec89](https://github.com/Smod9/onlytactics/commit/d55ec896dab84cbfe855d7fc6e4e970f81af5a42))


### Reverts

* Revert "feat(any host): Anyone can start and restart the race now for these e…" ([484315f](https://github.com/Smod9/onlytactics/commit/484315f0694b10ea37d4a5ed5191bb3578f6da70))

# [1.12.0](https://github.com/Smod9/onlytactics/compare/v1.11.0...v1.12.0) (2025-11-30)


### Features

* **ui polish:** Hides a bunch of buttons, adds more social tags, and updates the version number ([1819cdf](https://github.com/Smod9/onlytactics/commit/1819cdf589cb6cf87454bf5060c83b9035ecc304))
* **ui polish:** Moves chat to stage, moves name to header, adds flow for name change ([2cfe678](https://github.com/Smod9/onlytactics/commit/2cfe6785afc2699345f08e8c7020392cb132f25f))

# [1.11.0](https://github.com/Smod9/onlytactics/compare/v1.10.0...v1.11.0) (2025-11-30)


### Bug Fixes

* **penalty turns:** resolves regression with penalty turns ([e980ec3](https://github.com/Smod9/onlytactics/commit/e980ec39bbaad321550b8087a0a3f164e437028d))


### Features

* **adjust course:** Moves everything 'down' and drops right hand pin in gate to make it less right favored ([d79ffa7](https://github.com/Smod9/onlytactics/commit/d79ffa78c426385455f8233482acc3bbffd3cbc7))
* **auto_vmg:** Auto vmg working now. hit space once to go to vmgMode - any other control exits it ([a9c9945](https://github.com/Smod9/onlytactics/commit/a9c994562746b16ec1d05ad8ab6eaffa9e7b4007))
* **boats move faster:** Boats now move across the screen twice as fast by adjusting knots_to_ms ([ac3a15f](https://github.com/Smod9/onlytactics/commit/ac3a15f7a11bedfbb795d98fc7bef3ddd1d44d4f))
* **tack_lock:** Disabled the lock when tacking. you can now hit return again to abandon a tack ([255a99e](https://github.com/Smod9/onlytactics/commit/255a99e24730bf565346edd37b063531a080162b))
* **tacking cost:** Adds more variables to fine tune how expensive a tack is, and makes them meaningfully more costly. Also increases turn rate ([f56544e](https://github.com/Smod9/onlytactics/commit/f56544e3a0fc996812af4a016bfc5b120c2cd036))

# [1.10.0](https://github.com/Smod9/onlytactics/compare/v1.9.0...v1.10.0) (2025-11-27)


### Features

* **colyseus:** Fly server working ([1e9dded](https://github.com/Smod9/onlytactics/commit/1e9dded749391725f766626b59d80c4fe34d75a8))

# [1.9.0](https://github.com/Smod9/onlytactics/compare/v1.8.0...v1.9.0) (2025-11-27)


### Features

* **colyseus:** fly io config ([4d86827](https://github.com/Smod9/onlytactics/commit/4d86827168e0f755f6f74bde6585476670d1af79))

# [1.8.0](https://github.com/Smod9/onlytactics/compare/v1.7.0...v1.8.0) (2025-11-27)


### Features

* **colyseus:** trying to port to fly io ([1cc53c2](https://github.com/Smod9/onlytactics/commit/1cc53c20aafaf34dba422533534bd685c28636c7))

# [1.7.0](https://github.com/Smod9/onlytactics/compare/v1.6.0...v1.7.0) (2025-11-27)


### Features

* **colyseus:** Mx banner ([3acf2da](https://github.com/Smod9/onlytactics/commit/3acf2da51b20f61a620d75341e555ecefac05fdf))

# [1.6.0](https://github.com/Smod9/onlytactics/compare/v1.5.0...v1.6.0) (2025-11-27)


### Features

* **colyseus:** Polishing colyseus release ([ecbecf6](https://github.com/Smod9/onlytactics/commit/ecbecf6c371ef54bbbd8db92547ff1eb16945358))

# [1.5.0](https://github.com/Smod9/onlytactics/compare/v1.4.0...v1.5.0) (2025-11-27)


### Features

* **colyseus:** Polishing colyseus release ([51d7857](https://github.com/Smod9/onlytactics/commit/51d785779f06ed9a7e0eeee00485c502eb0445cf))

# [1.4.0](https://github.com/Smod9/onlytactics/compare/v1.3.0...v1.4.0) (2025-11-27)


### Features

* **colyseus:** More pipeline tries ([6d7c071](https://github.com/Smod9/onlytactics/commit/6d7c0710af3729f49835bda2fe224c5243e60d08))

# [1.3.0](https://github.com/Smod9/onlytactics/compare/v1.2.0...v1.3.0) (2025-11-27)


### Features

* **colyseus:** Trying to get stuff to deploy ([7f719d4](https://github.com/Smod9/onlytactics/commit/7f719d42cda344b08eb4d586835ba82c7c5d2314))

# [1.2.0](https://github.com/Smod9/onlytactics/compare/v1.1.0...v1.2.0) (2025-11-27)


### Features

* **colyseus:** working on deploying new backend ([2376cfe](https://github.com/Smod9/onlytactics/commit/2376cfe849a0a67737ff997162d0ab6319721be5))

# [1.1.0](https://github.com/Smod9/onlytactics/compare/v1.0.0...v1.1.0) (2025-11-26)


### Features

* **pipelines:** Adds version number to app ([f5bb0c0](https://github.com/Smod9/onlytactics/commit/f5bb0c01d8dff78efd89410c400bc5652be1abad))

# 1.0.0 (2025-11-26)


### Features

* **pipelines:** Adds semantic release ([27992b1](https://github.com/Smod9/onlytactics/commit/27992b19abcb0f6095382795c5d0aac05b16c749))

# Changelog

All notable changes to this project will be documented here automatically by semantic-release.
