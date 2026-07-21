# Changelog
All notable changes to this project will be documented in this file.

## [2.1.0](https://github.com/patternfly/patternfly-mcp/compare/3f168697b386921faf1703c8befe09459721a1a8...a67ace72f75be5badfc9e510871c03ca1cf498a6) (2026-07-20)
⚠ **Potential breaking changes**
* Diagnostic channel names for logging and stats now include a `mode` prefix. This affects programmatic server implementations that manually parse channel names. See [#233](https://github.com/patternfly/patternfly-mcp/pull/233).
* Moved URL whitelist and protocols from `patternflyOptions` to a new top-level object. This may affect maintainers using internal programmatic defaults. See [#254](https://github.com/patternfly/patternfly-mcp/pull/254).

### Tests
*  pf-4387 stdio client logging flake ([#253](https://github.com/patternfly/patternfly-mcp/pull/253)) ([9175e06](https://github.com/patternfly/patternfly-mcp/commit/9175e065b0b154f06d76ae795933b610f6443d3f))

### Features
*  pf-4298 build, run container ([#231](https://github.com/patternfly/patternfly-mcp/pull/231)) ([c207c42](https://github.com/patternfly/patternfly-mcp/commit/c207c4262c928df8b921d7fd77d3c302bc6a59ef))

### Code Refactoring
* **assertions** pf-4387 allow codes, errors for assertions ([#252](https://github.com/patternfly/patternfly-mcp/pull/252)) ([93efa31](https://github.com/patternfly/patternfly-mcp/commit/93efa31605f6b7af1cf76620651ad2cdf701e05d))
* **options** pf-4387 centralize url whitelist ([#254](https://github.com/patternfly/patternfly-mcp/pull/254)) ([b87aeae](https://github.com/patternfly/patternfly-mcp/commit/b87aeae95701a30aae88c8e8f24e60fedd6775a6))
* **options** pf-3874 log to channel basename ([#233](https://github.com/patternfly/patternfly-mcp/pull/233)) ([2659a24](https://github.com/patternfly/patternfly-mcp/commit/2659a2456c5f8d781d19e43f7a8cd5d9f07a8024))

### Builds
* **deps** lock update ([#257](https://github.com/patternfly/patternfly-mcp/pull/257)) ([a67ace7](https://github.com/patternfly/patternfly-mcp/commit/a67ace72f75be5badfc9e510871c03ca1cf498a6))
* **deps** bump semver from 7.8.4 to 7.8.5 ([#245](https://github.com/patternfly/patternfly-mcp/pull/245)) ([8dcadfb](https://github.com/patternfly/patternfly-mcp/commit/8dcadfb9ce5e401c7fb305d41e72c6f58220bc21))
* **deps-dev** bump dev group with 3 updates ([#244](https://github.com/patternfly/patternfly-mcp/pull/244)) ([9aebad4](https://github.com/patternfly/patternfly-mcp/commit/9aebad40787b33dac0437a9cbd08fca787e12d62))
* **deps** bump actions/checkout from 6 to 7 ([#235](https://github.com/patternfly/patternfly-mcp/pull/235)) ([4c35c79](https://github.com/patternfly/patternfly-mcp/commit/4c35c79cc8fb415d23e35a80f2ab49a915316baa))
* **deps-dev** bump eslint from 9.39.4 to 10.5.0 ([#237](https://github.com/patternfly/patternfly-mcp/pull/237)) ([c51fcd0](https://github.com/patternfly/patternfly-mcp/commit/c51fcd01025c512a0652c3c0cfb6bd49ed9e3f8c))
* **deps-dev** bump dev group with 3 updates ([#236](https://github.com/patternfly/patternfly-mcp/pull/236)) ([3190577](https://github.com/patternfly/patternfly-mcp/commit/3190577893b1a125551260d036c21a506df8aa5f))
* **deps-dev** bump dev group with 4 updates ([#229](https://github.com/patternfly/patternfly-mcp/pull/229)) ([0379f61](https://github.com/patternfly/patternfly-mcp/commit/0379f6127322f25fd138cb28421d250745110fff))
* **deps** bump semver from 7.8.1 to 7.8.4 ([#230](https://github.com/patternfly/patternfly-mcp/pull/230)) ([8d64d23](https://github.com/patternfly/patternfly-mcp/commit/8d64d2312f1aadc47d810f2db252f5b827e34100))
* **deps-dev** bump cspell from 9.7.0 to 10.0.1 ([#226](https://github.com/patternfly/patternfly-mcp/pull/226)) ([818016b](https://github.com/patternfly/patternfly-mcp/commit/818016b71b625bf85f6e652a80895446ef3330cc))
* **deps-dev** bump dev group with 4 updates ([#225](https://github.com/patternfly/patternfly-mcp/pull/225)) ([576d996](https://github.com/patternfly/patternfly-mcp/commit/576d99636dbea2b5768a90698747f59ea2edf823))

### Bug Fixes
* **assertions** pf-4387 block non-urls ([#255](https://github.com/patternfly/patternfly-mcp/pull/255)) ([441b1a1](https://github.com/patternfly/patternfly-mcp/commit/441b1a13948b8d957ed055f316e53c477a4d5055))
* **stats** pf-3874 move to managed task handler ([#234](https://github.com/patternfly/patternfly-mcp/pull/234)) ([8cddf8c](https://github.com/patternfly/patternfly-mcp/commit/8cddf8c53b9b00f95e83535b5d6ca5984878eee3))

## [2.0.1](https://github.com/patternfly/patternfly-mcp/compare/2bea4e09d959849f767bd3b9983fbf9a91768690...c3bda3321eb77ddeff829f47af191c04f523872f) (2026-06-17)


### Bug Fixes
* **tools** pf-3836 strict url validation and pf uris ([#227](https://github.com/patternfly/patternfly-mcp/pull/227)) ([c3bda33](https://github.com/patternfly/patternfly-mcp/commit/c3bda3321eb77ddeff829f47af191c04f523872f))

## [2.0.0](https://github.com/patternfly/patternfly-mcp/compare/c3a6d9340df21a5d07f16e98d3cfae6ca8525c3e...e9b0086aa7ea1f54ae0ec7c957bf4d1b9af555a1) (2026-06-15)
★ **HIGHLIGHTS**
* Context management, a refined token-optimized MCP tool that turns the two existing MCP tools into a single MCP tool called `searchPatternFly`. This work is an architecture gateway to even more token optimizations planned for version `2.x.x` and `experimental` settings. [Learn how to activate context management](https://github.com/patternfly/patternfly-mcp/tree/e9b0086aa7ea1f54ae0ec7c957bf4d1b9af555a1/docs/experimental.md#contextmanagement)
* Multiple behind-the-scenes optimizations and refactors, like parallel search filtering and registering experimental options, to keep the MCP stable and running smoothly.

⚠ **BREAKING CHANGES**
* Node.js 20 support has been removed. Either [pin the existing PatternFly MCP package to continue using Node.js 20](https://github.com/patternfly/patternfly-mcp/tree/e9b0086aa7ea1f54ae0ec7c957bf4d1b9af555a1/docs/usage.md#pinned-mcp-package-version) or move to using Node.js 22 for version `2.0.0`. [Why Node.js 20 was dropped, see our planned architecture](https://github.com/patternfly/patternfly-mcp/tree/e9b0086aa7ea1f54ae0ec7c957bf4d1b9af555a1/docs/architecture.md#planned-features-and-integrations).
* Programmatic use server options are now limited. Previously, any server options field could be supplied programmatically. Extra keys are simply ignored now. [See the refined options](https://github.com/patternfly/patternfly-mcp/tree/e9b0086aa7ea1f54ae0ec7c957bf4d1b9af555a1/docs/development.md#server-configuration-options).

### Features
* **tools** pf-4120 resource optimized searchPatternFly ([#211](https://github.com/patternfly/patternfly-mcp/pull/211)) ([f7eeb96](https://github.com/patternfly/patternfly-mcp/commit/f7eeb96bfaa2f682649900c27cff07ac7dc1652c))
* **tools,resources** pf-4120 conditional registration ([#215](https://github.com/patternfly/patternfly-mcp/pull/215)) ([b2e0f44](https://github.com/patternfly/patternfly-mcp/commit/b2e0f448593a6af4501d027dc7f937c338f95182))
* **search** pf-4120 parallel result filtering ([#210](https://github.com/patternfly/patternfly-mcp/pull/210)) ([c604bcc](https://github.com/patternfly/patternfly-mcp/commit/c604bcc57191b828caecdda9b174aa55d3274952))
* **skills** pf-4236 zod integration reports ([#206](https://github.com/patternfly/patternfly-mcp/pull/206)) ([fea5c19](https://github.com/patternfly/patternfly-mcp/commit/fea5c195c4bafb4f824c3d236d30bee2230f06dd))
* ⚠ **options** pf-4119 programmatic, CLI, experimental registry ([#200](https://github.com/patternfly/patternfly-mcp/pull/200)) ([0a3420d](https://github.com/patternfly/patternfly-mcp/commit/0a3420da0b9668316dcf1dec4614799b8cb468cb))

### Documentation
*  pf-4128 governance, security policies ([#221](https://github.com/patternfly/patternfly-mcp/pull/221)) ([e9b0086](https://github.com/patternfly/patternfly-mcp/commit/e9b0086aa7ea1f54ae0ec7c957bf4d1b9af555a1))

### Code Refactoring
* **docs** pf-3874 pf release updates ([#219](https://github.com/patternfly/patternfly-mcp/pull/219)) ([41e31c9](https://github.com/patternfly/patternfly-mcp/commit/41e31c98d4cea679c36d6ced4d16f735fd487432))
* **tools** pf-3836 allow search by uri, hash, path ([#207](https://github.com/patternfly/patternfly-mcp/pull/207)) ([88f8ede](https://github.com/patternfly/patternfly-mcp/commit/88f8eded4d3121fe2e53d417f01460b986d15376))
* **server** pf-3836 processDocsFunction, metadata, errors ([#209](https://github.com/patternfly/patternfly-mcp/pull/209)) ([20faaba](https://github.com/patternfly/patternfly-mcp/commit/20faabab21dbaff107833950ed61732a4f98f9ac))
* **typings** pf-4119 rename, deprecate cli options ([#199](https://github.com/patternfly/patternfly-mcp/pull/199)) ([ad97803](https://github.com/patternfly/patternfly-mcp/commit/ad9780305e5a1125ce73681a324c8f83ce95165e))
* **mcpSdk,server** pf-3836 sdk related typings ([#198](https://github.com/patternfly/patternfly-mcp/pull/198)) ([50ebb04](https://github.com/patternfly/patternfly-mcp/commit/50ebb040b6b2803317412587247495b45f31c7be))
* **server** pf-3836 colocate register tools, resources ([#197](https://github.com/patternfly/patternfly-mcp/pull/197)) ([7318252](https://github.com/patternfly/patternfly-mcp/commit/73182520c0461740a1b43a3bb3846b072f335aa3))
* **options** pf-4119 plugin isolation list ([#196](https://github.com/patternfly/patternfly-mcp/pull/196)) ([bb557ee](https://github.com/patternfly/patternfly-mcp/commit/bb557ee7d9874db9c41ae701bdd6b6842c9f1958))

### Builds
* **deps** lock update ([#220](https://github.com/patternfly/patternfly-mcp/pull/220)) ([81dc3f7](https://github.com/patternfly/patternfly-mcp/commit/81dc3f76ad3a58912c22d61540b64d0a237ff654))
* **deps-dev** bump pkgroll from 2.27.0 to 2.27.1 ([#217](https://github.com/patternfly/patternfly-mcp/pull/217)) ([6a5aa7b](https://github.com/patternfly/patternfly-mcp/commit/6a5aa7b3e21b57dc4183ba2d99cc38c23e70e9a9))
* **deps** bump semver from 7.8.0 to 7.8.1 ([#218](https://github.com/patternfly/patternfly-mcp/pull/218)) ([9639c72](https://github.com/patternfly/patternfly-mcp/commit/9639c727079ff38af94dfecd7c25e9d4e7120480))
* **deps-dev** bump dev group with 7 updates ([#214](https://github.com/patternfly/patternfly-mcp/pull/214)) ([af3f33d](https://github.com/patternfly/patternfly-mcp/commit/af3f33d7ec3d5b91c2499f95419e6e4767c32d2b))
* **deps** bump actions/setup-node from 6.3.0 to 6.4.0 ([#213](https://github.com/patternfly/patternfly-mcp/pull/213)) ([0b16801](https://github.com/patternfly/patternfly-mcp/commit/0b1680171217a0e2f239b48561e6e6af78188e51))
* **deps** bump semver from 7.7.4 to 7.8.0 ([#208](https://github.com/patternfly/patternfly-mcp/pull/208)) ([69a0d13](https://github.com/patternfly/patternfly-mcp/commit/69a0d13967d30994f69587208f505003df7d0daa))
* **deps** bump zod from 4.3.6 to 4.4.3 ([#202](https://github.com/patternfly/patternfly-mcp/pull/202)) ([fce59ff](https://github.com/patternfly/patternfly-mcp/commit/fce59ff827f46c0006db8eea7bc5ca732a5e2dd0))
* ⚠ **node.js** pf-3843 remove 20 support ([#169](https://github.com/patternfly/patternfly-mcp/pull/169)) ([589a390](https://github.com/patternfly/patternfly-mcp/commit/589a390bc9a329321c59e3e4b98c4b13fffb25a5))
* **deps-dev** bump the dev group with 3 updates ([#195](https://github.com/patternfly/patternfly-mcp/pull/195)) ([88e5122](https://github.com/patternfly/patternfly-mcp/commit/88e5122ef76ae3efd6f53ac94308c2dbf10d5810))

### Bug Fixes
*  pf-4120 central mcp sdk typings ([#216](https://github.com/patternfly/patternfly-mcp/pull/216)) ([05053d7](https://github.com/patternfly/patternfly-mcp/commit/05053d71b3b83dcec174aec161ab8bdce0e6071c))

## [1.1.0](https://github.com/patternfly/patternfly-mcp/compare/362dd7f7439ba94617b0739dc9591fba115913d6...de4fbe8501faa2e26e000d206a05c87f190f64d9) (2026-05-11)


### Features
* **cli,resources** pf-4059 cli catch start issues ([#179](https://github.com/patternfly/patternfly-mcp/pull/179)) ([5974f60](https://github.com/patternfly/patternfly-mcp/commit/5974f606b28240912792a7956fc5be34a4417f88))

### Documentation
*  troubleshooting steps, examples ([#173](https://github.com/patternfly/patternfly-mcp/pull/173)) ([e69a213](https://github.com/patternfly/patternfly-mcp/commit/e69a213f35b0bc15dfde829df675b446e0b0167f))

### Code Refactoring
* **docs** pf-4036 pf-cli references ([#170](https://github.com/patternfly/patternfly-mcp/pull/170)) ([3b004b7](https://github.com/patternfly/patternfly-mcp/commit/3b004b7fb9f1ed16e86a45b7e169c25657598a18))

### Chores
*  add pf team label workflow ([#177](https://github.com/patternfly/patternfly-mcp/pull/177)) ([db78d35](https://github.com/patternfly/patternfly-mcp/commit/db78d35d3c1f5bd98bf01c5509493e01d93b7218))

### Builds
* **deps** lock update ([#191](https://github.com/patternfly/patternfly-mcp/pull/191)) ([de4fbe8](https://github.com/patternfly/patternfly-mcp/commit/de4fbe8501faa2e26e000d206a05c87f190f64d9))
* **deps** lock update ([#189](https://github.com/patternfly/patternfly-mcp/pull/189)) ([f75460f](https://github.com/patternfly/patternfly-mcp/commit/f75460ffecf5a0720fbd050d1d937a606f2b88b8))
* **deps-dev** bump dev group with 4 updates ([#180](https://github.com/patternfly/patternfly-mcp/pull/180)) ([10a49da](https://github.com/patternfly/patternfly-mcp/commit/10a49daa57654ee14e6820cc91477e4a9a3aa641))
* **deps** bump actions/setup-node from 6 to 6.3.0 ([#178](https://github.com/patternfly/patternfly-mcp/pull/178)) ([c16a164](https://github.com/patternfly/patternfly-mcp/commit/c16a16429bfd95330751c02835a417111dd7d3ec))
*  add codeowners, pr reviews ([#175](https://github.com/patternfly/patternfly-mcp/pull/175)) ([70c9470](https://github.com/patternfly/patternfly-mcp/commit/70c94709a179eacd99245dac20bd3f8a962a6f8d))
* **deps-dev** bump dev group with 4 updates ([#174](https://github.com/patternfly/patternfly-mcp/pull/174)) ([871098a](https://github.com/patternfly/patternfly-mcp/commit/871098ab1b231bfeaa28f63e4ed7c0b4ab509fab))

### Bug Fixes
* **patternfly** keyword exception list filter ([#171](https://github.com/patternfly/patternfly-mcp/pull/171)) ([77f664f](https://github.com/patternfly/patternfly-mcp/commit/77f664f22fd48a3fc3c994c648b6330992678af4))

## [1.0.1](https://github.com/patternfly/patternfly-mcp/compare/320c784093dc1498c70f99c4f4ff7374be295c02...5a63c12d88adf40fcc9c2cfa5d94b41ce142d543) (2026-04-27)


### Documentation
*  remove update skill refs for docs.json ([#167](https://github.com/patternfly/patternfly-mcp/pull/167)) ([7d6b188](https://github.com/patternfly/patternfly-mcp/commit/7d6b1884eec5d459f78b44e92ce68b511dc5766a))

### Chores
* **docs** pf-4036 add pf-cli, ai-helpers intros ([#166](https://github.com/patternfly/patternfly-mcp/pull/166)) ([5a63c12](https://github.com/patternfly/patternfly-mcp/commit/5a63c12d88adf40fcc9c2cfa5d94b41ce142d543))

### Builds
*  workflow, coverage, issue templates ([#164](https://github.com/patternfly/patternfly-mcp/pull/164)) ([ec5c76f](https://github.com/patternfly/patternfly-mcp/commit/ec5c76f99f04726f6d2b8dfff27e4dce3b1ac7de))
* **deps-dev** bump dev group with 4 updates ([#162](https://github.com/patternfly/patternfly-mcp/pull/162)) ([cee9368](https://github.com/patternfly/patternfly-mcp/commit/cee93680f2518827730c6787d5472cc16d4ea6ee))
* **deps** lock update ([#161](https://github.com/patternfly/patternfly-mcp/pull/161)) ([5c9e9ba](https://github.com/patternfly/patternfly-mcp/commit/5c9e9ba4769b3b6c9dfa3b291b6b53149a5367cb))
* **deps** @modelcontextprotocol/sdk from 1.27.1 to 1.29.0 ([#159](https://github.com/patternfly/patternfly-mcp/pull/159)) ([161fca1](https://github.com/patternfly/patternfly-mcp/commit/161fca10a6703d8da76b22b3a5093b97f2b07fe5))
* **deps** bump pid-port from 2.1.0 to 2.1.1 ([#158](https://github.com/patternfly/patternfly-mcp/pull/158)) ([1976ade](https://github.com/patternfly/patternfly-mcp/commit/1976adefa9f38f7d3e35b79137e39a3a3a15cce1))
* **deps-dev** bump dev group with 5 updates ([#157](https://github.com/patternfly/patternfly-mcp/pull/157)) ([ae338dd](https://github.com/patternfly/patternfly-mcp/commit/ae338ddbd4dcaa013800d6aa263c0cc15ce0c35d))
* **deps-dev** bump dev group with 3 updates ([#152](https://github.com/patternfly/patternfly-mcp/pull/152)) ([d2d65c4](https://github.com/patternfly/patternfly-mcp/commit/d2d65c4c70531209eb437f6b8d300b3bbe70a2a9))
* **deps** bump pid-port from 2.0.1 to 2.1.0 ([#150](https://github.com/patternfly/patternfly-mcp/pull/150)) ([6a47a78](https://github.com/patternfly/patternfly-mcp/commit/6a47a78351fc23b8fa5a296e6959a2d428222bf5))
* **deps-dev** bump dev group with 4 updates ([#149](https://github.com/patternfly/patternfly-mcp/pull/149)) ([b6f99ea](https://github.com/patternfly/patternfly-mcp/commit/b6f99ea7766420a7197620b69c7d20e861bdcbfc))

### Bug Fixes
* **server** catch tool registration errors ([#155](https://github.com/patternfly/patternfly-mcp/pull/155)) ([934f7c7](https://github.com/patternfly/patternfly-mcp/commit/934f7c73903d2feaf00a2fdf5ea6666f1ffa84ae))

## [1.0.0](https://github.com/patternfly/patternfly-mcp/compare/eab711f0d79baa3b1a092514f83bffc2d9ada71d...d7185c712d90741480098d6dd2cac72242ca8445) (2026-03-30)
⚠ BREAKING CHANGES, remove componentSchemas MCP tool, favor MCP resources instead, see [#137](https://github.com/patternfly/patternfly-mcp/pull/137)

### Features
*  generate meta resources ([#130](https://github.com/patternfly/patternfly-mcp/pull/130)) ([083adc0](https://github.com/patternfly/patternfly-mcp/commit/083adc029ac4a5bc88ee24756085aa90d946e99e))

### Documentation
*  consistent casing, copy, grammar, spacing ([#144](https://github.com/patternfly/patternfly-mcp/pull/144)) ([784be0a](https://github.com/patternfly/patternfly-mcp/commit/784be0a2cdde90bc7ba520836c97a6ca13dc5ba2))
*  update usage, architecture, maintenance ([#143](https://github.com/patternfly/patternfly-mcp/pull/143)) ([7a2188f](https://github.com/patternfly/patternfly-mcp/commit/7a2188f743968f5ce51736f577c34d070673705f))
*  add contributor, repo skills ([#136](https://github.com/patternfly/patternfly-mcp/pull/136)) ([365e318](https://github.com/patternfly/patternfly-mcp/commit/365e318b59743dc448901da2383fb696088e1b4a))

### Code Refactoring
* ⚠ **tools** remove componentSchemas tool ([#137](https://github.com/patternfly/patternfly-mcp/pull/137)) ([396b0d5](https://github.com/patternfly/patternfly-mcp/commit/396b0d593d52f93b42c3cc2faea370c9d6841151))

### Builds
* **deps** lock update ([#145](https://github.com/patternfly/patternfly-mcp/pull/145)) ([d7185c7](https://github.com/patternfly/patternfly-mcp/commit/d7185c712d90741480098d6dd2cac72242ca8445))
* **deps** lock update ([#140](https://github.com/patternfly/patternfly-mcp/pull/140)) ([560a3c1](https://github.com/patternfly/patternfly-mcp/commit/560a3c180b83cfcdc6766983206a10109a79c437))
* **deps-dev** bump dev group with 8 updates ([#138](https://github.com/patternfly/patternfly-mcp/pull/138)) ([77c9c40](https://github.com/patternfly/patternfly-mcp/commit/77c9c403578148a8f37a64f1fa31c2d6d017f736))
* **deps-dev** bump dev group with 2 updates ([#135](https://github.com/patternfly/patternfly-mcp/pull/135)) ([45509c0](https://github.com/patternfly/patternfly-mcp/commit/45509c0e0b7e73576f78bb9d792637d37159955f))

### Bug Fixes
* **resources** schemas index mimeType ([#133](https://github.com/patternfly/patternfly-mcp/pull/133)) ([8585475](https://github.com/patternfly/patternfly-mcp/commit/85854754e0a7355f266ab56357275c9fb2e21181))

## [0.9.0](https://github.com/patternfly/patternfly-mcp/compare/175057cc77fb6069e41dd8ef4e89c8794c32c00c...b097f506eb42c2b9fe734552458784173f419bee) (2026-03-17)
⚠ May contain a breaking update for embedded use only. Move from `docsPath: string` to `docsPaths: string[]` with a behavior shift, see [#125](https://github.com/patternfly/patternfly-mcp/pull/125)

### Features
*  activate resource completions ([#107](https://github.com/patternfly/patternfly-mcp/pull/107)) ([09563dd](https://github.com/patternfly/patternfly-mcp/commit/09563dd42e1aadd1366aa15088fac409a2fe55a3))
* **server** expose instructions ([#128](https://github.com/patternfly/patternfly-mcp/pull/128)) ([d7df9c2](https://github.com/patternfly/patternfly-mcp/commit/d7df9c2ddf83f464dc8d2145cbeafbcba8b28a48))

### Code Refactoring
* **tools** combine components, docs for search ([#129](https://github.com/patternfly/patternfly-mcp/pull/129)) ([c2b7176](https://github.com/patternfly/patternfly-mcp/commit/c2b7176291201300676069d15c2266cf90f00f72))
* **docs** migrate to ai-helpers ([#125](https://github.com/patternfly/patternfly-mcp/pull/125)) ([124f41e](https://github.com/patternfly/patternfly-mcp/commit/124f41ec28ef901e4936141d1d23845497640b16))

### Chores
* **docs** add codemods, getting started guides ([#124](https://github.com/patternfly/patternfly-mcp/pull/124)) ([4492355](https://github.com/patternfly/patternfly-mcp/commit/4492355c8f6057f3ee7d0aba7fff34dd7b88ff37))

### Builds
* **deps** lock update ([#131](https://github.com/patternfly/patternfly-mcp/pull/131)) ([b097f50](https://github.com/patternfly/patternfly-mcp/commit/b097f506eb42c2b9fe734552458784173f419bee))
* **deps** @modelcontextprotocol/sdk from 1.27.0 to 1.27.1 ([#127](https://github.com/patternfly/patternfly-mcp/pull/127)) ([dd4b2b5](https://github.com/patternfly/patternfly-mcp/commit/dd4b2b5ddeadf8cb38762854465372d18a02aa55))
* **deps-dev** bump dev group with 8 updates ([#126](https://github.com/patternfly/patternfly-mcp/pull/126)) ([ca3d6c8](https://github.com/patternfly/patternfly-mcp/commit/ca3d6c8c52d20f805a90a6ae46e842650fb3fe17))

## [0.8.0](https://github.com/patternfly/patternfly-mcp/compare/f8bcb722c9d738f41688364e02ef882bc8665abd...c04aa0dcb9e0375326f697844abd03d0a526a28b) (2026-03-05)


### Features
*  nodejs assertions base ([#113](https://github.com/patternfly/patternfly-mcp/pull/113)) ([d537fd6](https://github.com/patternfly/patternfly-mcp/commit/d537fd67ddf5b0871f1e9779ce7dd145fa34ecc9))
* **patternFly** find closest pf version ([#102](https://github.com/patternfly/patternfly-mcp/pull/102)) ([af09f10](https://github.com/patternfly/patternfly-mcp/commit/af09f109e936007acdcd22eafd42ad7435355901))
* **server.search** allow partial matchTypes ([#100](https://github.com/patternfly/patternfly-mcp/pull/100)) ([e36c2de](https://github.com/patternfly/patternfly-mcp/commit/e36c2deca70b3d52c09da3d0b065ea93313e4710))

### Code Refactoring
*  api base, move to docs.json ([#120](https://github.com/patternfly/patternfly-mcp/pull/120)) ([1f5e4d6](https://github.com/patternfly/patternfly-mcp/commit/1f5e4d6636872f91890f751fca7c7fccbba5d591))
*  centralize search, get resources ([#106](https://github.com/patternfly/patternfly-mcp/pull/106)) ([a381ed5](https://github.com/patternfly/patternfly-mcp/commit/a381ed53313dafe21d2961687f43cc6bcf139da0))
* **e2e,audit,docs** relocate tests, convert links to json ([#105](https://github.com/patternfly/patternfly-mcp/pull/105)) ([1df4434](https://github.com/patternfly/patternfly-mcp/commit/1df443433a52828516b1bb3557ecdffc51f4fa28))
* **options** mode options, e2e testing mocks ([#98](https://github.com/patternfly/patternfly-mcp/pull/98)) ([06fdcdc](https://github.com/patternfly/patternfly-mcp/commit/06fdcdcf71ae737277abec38f550641cca52dcb4))

### Chores
* **docs** add ai, extensions, foundations, styles guidance ([#121](https://github.com/patternfly/patternfly-mcp/pull/121)) ([c04aa0d](https://github.com/patternfly/patternfly-mcp/commit/c04aa0dcb9e0375326f697844abd03d0a526a28b))
*  pr template ([#119](https://github.com/patternfly/patternfly-mcp/pull/119)) ([c99afea](https://github.com/patternfly/patternfly-mcp/commit/c99afea0f16aacb630be4d2b83eb94cffd7bf0ef))

### Builds
* **deps** lock update ([#122](https://github.com/patternfly/patternfly-mcp/pull/122)) ([d0fa57a](https://github.com/patternfly/patternfly-mcp/commit/d0fa57a9ad0756d716d0430b653990f80a772ed5))
* **deps** @modelcontextprotocol/sdk from 1.26.0 to 1.27.0 ([#118](https://github.com/patternfly/patternfly-mcp/pull/118)) ([3d8cb74](https://github.com/patternfly/patternfly-mcp/commit/3d8cb74150e6f6646810646fd577287e0d10380e))
* **deps-dev** bump dev group with 4 updates ([#116](https://github.com/patternfly/patternfly-mcp/pull/116)) ([8735c0a](https://github.com/patternfly/patternfly-mcp/commit/8735c0a663ad0b82d8fe39c1fea35ff0db1102b6))
* **deps** @modelcontextprotocol/sdk from 1.25.3 to 1.26.0 ([#111](https://github.com/patternfly/patternfly-mcp/pull/111)) ([2dfe03b](https://github.com/patternfly/patternfly-mcp/commit/2dfe03be9cf68a751dcbca2cb4d43c9ad33cca64))
* **deps** bump semver from 7.7.3 to 7.7.4 ([#110](https://github.com/patternfly/patternfly-mcp/pull/110)) ([65407d1](https://github.com/patternfly/patternfly-mcp/commit/65407d1dd7026ca60f00ad1b26c62de514649d52))
* **deps-dev** bump dev group with 5 updates ([#109](https://github.com/patternfly/patternfly-mcp/pull/109)) ([1638e1b](https://github.com/patternfly/patternfly-mcp/commit/1638e1bb4ae8cca9e1665fdaa2ac7ec3579e3b94))
* **deps-dev** bump dev group with 4 updates ([#104](https://github.com/patternfly/patternfly-mcp/pull/104)) ([4c52846](https://github.com/patternfly/patternfly-mcp/commit/4c52846b3648e00e7d73274848c3a24ce93b6e38))
* **deps** bump zod from 4.3.5 to 4.3.6 ([#103](https://github.com/patternfly/patternfly-mcp/pull/103)) ([00bbd0d](https://github.com/patternfly/patternfly-mcp/commit/00bbd0d567b3d792a1ab5222bdf0e3fcc520402f))
* **deps-dev** bump dev group with 6 updates ([#101](https://github.com/patternfly/patternfly-mcp/pull/101)) ([1e10745](https://github.com/patternfly/patternfly-mcp/commit/1e107455f1df1b8ff6be26c7ede072c6a65b16d2))
* **deps** @modelcontextprotocol/sdk from 1.25.2 to 1.25.3 ([#97](https://github.com/patternfly/patternfly-mcp/pull/97)) ([e7063bf](https://github.com/patternfly/patternfly-mcp/commit/e7063bfb2535443d246cfc789c063657cedb65ac))

### Bug Fixes
* **search** search filters, keyword mapping ([#112](https://github.com/patternfly/patternfly-mcp/pull/112)) ([a7861d1](https://github.com/patternfly/patternfly-mcp/commit/a7861d1f08dcc26cd7515fc4f3b30c63250a0899))

## [0.7.0](https://github.com/patternfly/patternfly-mcp/compare/177783c66e9676cb5bcbe7d66026fd84c2add228...8eae2529b391b9b7d813bf7d982f1770c33af05d) (2026-02-02)


### Documentation
*  restructure, expand documentation ([#81](https://github.com/patternfly/patternfly-mcp/pull/81)) ([1d69fcd](https://github.com/patternfly/patternfly-mcp/commit/1d69fcd5aaf88d5e5eea9ba1a65ef4f34642f7cf))

### Code Refactoring
*  remove unused llms files, docsHost option ([#89](https://github.com/patternfly/patternfly-mcp/pull/89)) ([b056d5b](https://github.com/patternfly/patternfly-mcp/commit/b056d5b83ef29abdced7afc8330191e117033d6b))

### Builds
* **deps** bump actions/checkout from 4 to 6 ([#94](https://github.com/patternfly/patternfly-mcp/pull/94)) ([8eae252](https://github.com/patternfly/patternfly-mcp/commit/8eae2529b391b9b7d813bf7d982f1770c33af05d))
* **deps** lock update ([#93](https://github.com/patternfly/patternfly-mcp/pull/93)) ([5726c87](https://github.com/patternfly/patternfly-mcp/commit/5726c87300a124813ad8051df5fb06735b6c28a1))
* **deps-dev** bump dev group with 4 updates ([#91](https://github.com/patternfly/patternfly-mcp/pull/91)) ([5d60f08](https://github.com/patternfly/patternfly-mcp/commit/5d60f082a8195789d5d0b932738a866729ec7ef7))
* **deps** bump prod group with 2 updates ([#92](https://github.com/patternfly/patternfly-mcp/pull/92)) ([2275313](https://github.com/patternfly/patternfly-mcp/commit/2275313cf674b3a1e7ca0dbbda1c9e31e17227e0))
* **deps** bump zod from 4.2.1 to 4.3.5 ([#86](https://github.com/patternfly/patternfly-mcp/pull/86)) ([764b55f](https://github.com/patternfly/patternfly-mcp/commit/764b55f3a24a855b2b37ea81795f300e3d7b4273))
* **deps-dev** bump the dev group with 5 updates ([#85](https://github.com/patternfly/patternfly-mcp/pull/85)) ([7031dc3](https://github.com/patternfly/patternfly-mcp/commit/7031dc397535af2ab37395094bb4402a78fb42d6))

### Bug Fixes
* **getResources** move dotenv to default options ([#90](https://github.com/patternfly/patternfly-mcp/pull/90)) ([34a250b](https://github.com/patternfly/patternfly-mcp/commit/34a250b8796b0cdd88e48e03aba895dd88dc94ff))
*  search, max string length ([#88](https://github.com/patternfly/patternfly-mcp/pull/88)) ([0d607db](https://github.com/patternfly/patternfly-mcp/commit/0d607db1ed6a7d8d1a85f2c5c98bc0b39913cefd))

## [0.6.0](https://github.com/patternfly/patternfly-mcp/compare/7ed6ff8b977ec1a15cec5a75a99df172be5caa01...c86ad8ad5dfe9eac41ef17a63afa0b2e191c3b4b) (2026-01-19)


### Features
* **search,resources** search for docs, migrate to mcp resources ([#74](https://github.com/patternfly/patternfly-mcp/pull/74)) ([2cb5ca7](https://github.com/patternfly/patternfly-mcp/commit/2cb5ca7bbac18285136498f652d23c1807fc383e))
* **stats** getStats, server report channels ([#78](https://github.com/patternfly/patternfly-mcp/pull/78)) ([3b7c9a0](https://github.com/patternfly/patternfly-mcp/commit/3b7c9a0eb78f3ef570d43d44662603457414d014))

### Builds
* **deps** @modelcontextprotocol/sdk from 1.24.3 to 1.25.1 ([#66](https://github.com/patternfly/patternfly-mcp/pull/66)) ([fbabe34](https://github.com/patternfly/patternfly-mcp/commit/fbabe346edcf66a5dc990fb01ab4be55b0513b64))
* **deps-dev** bump the dev group with 3 updates ([#79](https://github.com/patternfly/patternfly-mcp/pull/79)) ([e7e5c64](https://github.com/patternfly/patternfly-mcp/commit/e7e5c64646528f9f280821791c91283ed9ecb739))
* **deps-dev** bump @types/node from 24.10.1 to 25.0.3 ([#77](https://github.com/patternfly/patternfly-mcp/pull/77)) ([562b4a6](https://github.com/patternfly/patternfly-mcp/commit/562b4a6b3e86262376cbf75d8c686ae46baf7ae3))
* **deps-dev** bump the dev group with 3 updates ([#76](https://github.com/patternfly/patternfly-mcp/pull/76)) ([0a8eb99](https://github.com/patternfly/patternfly-mcp/commit/0a8eb9957296526ddba9ce2ad65b32cf3d35e9f3))

### Bug Fixes
*  stat report typing ([#83](https://github.com/patternfly/patternfly-mcp/pull/83)) ([c86ad8a](https://github.com/patternfly/patternfly-mcp/commit/c86ad8ad5dfe9eac41ef17a63afa0b2e191c3b4b))

## [0.5.0](https://github.com/patternfly/patternfly-mcp/compare/3c49d4babc7344013c55c67326a3a001c44e02c0...3ee99f52c126471e03bf1baf1003e2259d2d9d21) (2026-01-05)


### Tests
*  minor typing, annotation, config refactor ([#55](https://github.com/patternfly/patternfly-mcp/pull/55)) ([83c6f2d](https://github.com/patternfly/patternfly-mcp/commit/83c6f2dc0063f3eee0cb0d371adf28e29ac9fa4e))
*  lint consistency ([#45](https://github.com/patternfly/patternfly-mcp/pull/45)) ([f0c2a34](https://github.com/patternfly/patternfly-mcp/commit/f0c2a34e96b1774e2da3b510fa6eea55d5c0960e))

### Features
* **tools-plugins** allow mcp tool plugins ([#41](https://github.com/patternfly/patternfly-mcp/pull/41)) ([e6a9aed](https://github.com/patternfly/patternfly-mcp/commit/e6a9aed210ee6a8433d3235250ec1855b34b90a5))
* **tools-user** user-facing helpers for tools-as-plugins ([#63](https://github.com/patternfly/patternfly-mcp/pull/63)) ([84c9efb](https://github.com/patternfly/patternfly-mcp/commit/84c9efbf63181c673fac3815ad2a778b764f0f5a))
* **tools-host** creators, child validation for tools-as-plugins ([#62](https://github.com/patternfly/patternfly-mcp/pull/62)) ([97f855a](https://github.com/patternfly/patternfly-mcp/commit/97f855a64c5315a8d170bc4cfa4cb429043c80eb))
* **logger** format unknown errors ([#59](https://github.com/patternfly/patternfly-mcp/pull/59)) ([55df65e](https://github.com/patternfly/patternfly-mcp/commit/55df65e872d0406d1777a5416087a5c455041da9))
* **schema** schema support helpers ([#57](https://github.com/patternfly/patternfly-mcp/pull/57)) ([e55eea5](https://github.com/patternfly/patternfly-mcp/commit/e55eea52db0004ab2140db5562273e8784417e41))
*  memo, add keyHash option ([#54](https://github.com/patternfly/patternfly-mcp/pull/54)) ([0755c28](https://github.com/patternfly/patternfly-mcp/commit/0755c28ab1b92780021d0723115d08df30a1d362))

### Code Refactoring
*  options, nodejs version, path resolves ([#58](https://github.com/patternfly/patternfly-mcp/pull/58)) ([6634b01](https://github.com/patternfly/patternfly-mcp/commit/6634b01c62095910d01932b34961a5470b8dd5bc))
* **server** use builtInTools const, logging, annotations ([#56](https://github.com/patternfly/patternfly-mcp/pull/56)) ([048a70a](https://github.com/patternfly/patternfly-mcp/commit/048a70ad30621b44ab68ee4ecbb459d7583e4916))

### Builds
* **deps** bump actions/cache from 4 to 5 ([#69](https://github.com/patternfly/patternfly-mcp/pull/69)) ([870fd68](https://github.com/patternfly/patternfly-mcp/commit/870fd68209f8f620c582ca4d9451bca4615a28aa))
* **deps** bump actions/setup-node from 4 to 6 ([#68](https://github.com/patternfly/patternfly-mcp/pull/68)) ([f14605a](https://github.com/patternfly/patternfly-mcp/commit/f14605a9975c3b4f72b7ab01c2c9c1c22390b116))
* **deps-dev** bump dev group with 4 updates ([#67](https://github.com/patternfly/patternfly-mcp/pull/67)) ([b34425f](https://github.com/patternfly/patternfly-mcp/commit/b34425f72853abbeaa7b8f322ec57e583b7d3277))
* **deps** bump @modelcontextprotocol/sdk in the prod group ([#65](https://github.com/patternfly/patternfly-mcp/pull/65)) ([be4f884](https://github.com/patternfly/patternfly-mcp/commit/be4f8849232a0f2c7c01060a4983e26163788fdc))
* **deps** @modelcontextprotocol/sdk from 1.23.0 to 1.24.1 ([#53](https://github.com/patternfly/patternfly-mcp/pull/53)) ([3986841](https://github.com/patternfly/patternfly-mcp/commit/3986841c78dc3654df9e16d68f84eb10b70d1092))
* **deps-dev** bump dev group with 3 updates ([#51](https://github.com/patternfly/patternfly-mcp/pull/51)) ([49d37d9](https://github.com/patternfly/patternfly-mcp/commit/49d37d9b07ccc6a3e2d31831b31312effd221f48))
* **deps-dev** bump dev group with 4 updates ([#50](https://github.com/patternfly/patternfly-mcp/pull/50)) ([729dcd9](https://github.com/patternfly/patternfly-mcp/commit/729dcd9ffdd2beae070da72b34f3e310f4f12491))
* **deps** @modelcontextprotocol/sdk from 1.22.0 to 1.23.0 ([#48](https://github.com/patternfly/patternfly-mcp/pull/48)) ([25b63c8](https://github.com/patternfly/patternfly-mcp/commit/25b63c825df45cf9b8c447d91a1a84969399f8f9))
* **deps-dev** @types/node from 22.18.8 to 24.10.1 ([#47](https://github.com/patternfly/patternfly-mcp/pull/47)) ([b8b72d9](https://github.com/patternfly/patternfly-mcp/commit/b8b72d9d85e1ba985ba3e1b5d5a1c4678b7b9b07))

### Bug Fixes
* **server** clean sigint handler on shutdown ([#72](https://github.com/patternfly/patternfly-mcp/pull/72)) ([3ee99f5](https://github.com/patternfly/patternfly-mcp/commit/3ee99f52c126471e03bf1baf1003e2259d2d9d21))
* **logger** avoid recursive error handling ([#71](https://github.com/patternfly/patternfly-mcp/pull/71)) ([fb78d63](https://github.com/patternfly/patternfly-mcp/commit/fb78d6354a42520bdd6b2591d2ddd36504fd0f6d))

## [0.4.0](https://github.com/patternfly/patternfly-mcp/compare/088d56496e9e3534b15c6975daece01ecd607c42...727fc0a8ee45ffb54c8bc47b6324cc01904611d8) (2025-12-07)


### Tests
*  update fetchMock routing ([#31](https://github.com/patternfly/patternfly-mcp/pull/31)) ([51bbc31](https://github.com/patternfly/patternfly-mcp/commit/51bbc311ce9d046257341d637ee32f8399d36a3e))

### Features
*  support http transport ([#1](https://github.com/patternfly/patternfly-mcp/pull/1)) ([12e8734](https://github.com/patternfly/patternfly-mcp/commit/12e8734ee1e8fb4e0c64eab3c10bf9fb14ed0936))

### Code Refactoring
*  cli as standalone ([#30](https://github.com/patternfly/patternfly-mcp/pull/30)) ([55e3360](https://github.com/patternfly/patternfly-mcp/commit/55e33609a0f8b003d2ba23968502830f2aa5d32e))

### Builds
* **deps-dev** bump dev group with 7 updates ([#37](https://github.com/patternfly/patternfly-mcp/pull/37)) ([6a65e19](https://github.com/patternfly/patternfly-mcp/commit/6a65e19f744f30640b99d3d68d8f4fc9bcca525a))
* **deps** @modelcontextprotocol/sdk from 1.19.1 to 1.22.0 ([#36](https://github.com/patternfly/patternfly-mcp/pull/36)) ([8a81066](https://github.com/patternfly/patternfly-mcp/commit/8a8106690b5b3a6341a15458257c107296559c8a))
*  activate dependabot ([#33](https://github.com/patternfly/patternfly-mcp/pull/33)) ([5b91b72](https://github.com/patternfly/patternfly-mcp/commit/5b91b7271cb591961234a18039f62882177a9692))

### Bug Fixes
*  cli http port option, typings ([#40](https://github.com/patternfly/patternfly-mcp/pull/40)) ([727fc0a](https://github.com/patternfly/patternfly-mcp/commit/727fc0a8ee45ffb54c8bc47b6324cc01904611d8))
*  allow process to exit, consistent imports ([#32](https://github.com/patternfly/patternfly-mcp/pull/32)) ([fa5c734](https://github.com/patternfly/patternfly-mcp/commit/fa5c734f2e5db1134c6443b40c5e0e8562100732))

## [0.3.0](https://github.com/patternfly/patternfly-mcp/compare/e31c15bab47c4949d2e233e400fe81c27ab33144...53d69b5b2f5c14b4cef4e6fa2c9b7ed2ec857c5c) (2025-12-03)


### Features
*  log channels, avoid polluting stdout ([#25](https://github.com/patternfly/patternfly-mcp/pull/25)) ([cc82731](https://github.com/patternfly/patternfly-mcp/commit/cc82731ceb5d97caba84c93e1530c6c87f763799))

### Bug Fixes
*  markdown format for links ([#28](https://github.com/patternfly/patternfly-mcp/pull/28)) ([53d69b5](https://github.com/patternfly/patternfly-mcp/commit/53d69b5b2f5c14b4cef4e6fa2c9b7ed2ec857c5c))

## [0.2.0](https://github.com/patternfly/patternfly-mcp/compare/1913d18b82ca50b57999cf1c6cf7c1100eff3e94...bb8f4be6da8629bef34beb2d82dc8ce826f68c44) (2025-11-30)


### Tests
*  stdio client refactor for e2e ([#16](https://github.com/patternfly/patternfly-mcp/pull/16)) ([ce9970c](https://github.com/patternfly/patternfly-mcp/commit/ce9970cec38a656d02d92ac94a8625dea80d2424))

### Features
*  memo cache expire, rollout callbacks ([#17](https://github.com/patternfly/patternfly-mcp/pull/17)) ([c9e4838](https://github.com/patternfly/patternfly-mcp/commit/c9e48389df6af11b60d90a1af7c3cc92248e3102))
* **schemas** add component-schemas tool ([#12](https://github.com/patternfly/patternfly-mcp/pull/12)) ([4e58b28](https://github.com/patternfly/patternfly-mcp/commit/4e58b28452c6b608baccd98e2e466b7a1c33ea97))
*  shortest distance search helpers ([#14](https://github.com/patternfly/patternfly-mcp/pull/14)) ([0f2b54a](https://github.com/patternfly/patternfly-mcp/commit/0f2b54ad941a003b1825030a1b541b5161f77936))
*  expose server-instance stop, status ([#9](https://github.com/patternfly/patternfly-mcp/pull/9)) ([68222cb](https://github.com/patternfly/patternfly-mcp/commit/68222cb89efd3d9aa16057c0dfb39885680affd7))

### Code Refactoring
*  patternfly doc path updates ([#26](https://github.com/patternfly/patternfly-mcp/pull/26)) ([12334cf](https://github.com/patternfly/patternfly-mcp/commit/12334cf6932554ea7fdfb0d0871dbafdb6f97c0b))
*  move from global to context options ([#10](https://github.com/patternfly/patternfly-mcp/pull/10)) ([aa134f6](https://github.com/patternfly/patternfly-mcp/commit/aa134f642b97529d2f29356dc09306f958303e93))

### Bug Fixes
*  os agnostic repoName ([#15](https://github.com/patternfly/patternfly-mcp/pull/15)) ([bb8f4be](https://github.com/patternfly/patternfly-mcp/commit/bb8f4be6da8629bef34beb2d82dc8ce826f68c44))

## 0.1.0 (2025-10-23)


### General
*  Initial commit  ([e085648](https://github.com/patternfly/patternfly-mcp/commit/e085648993c6c85ecba8e431f93c0805f4ce6a20))

### Features
*  programmatic option override ([#5](https://github.com/patternfly/patternfly-mcp/pull/5)) ([ad96c74](https://github.com/patternfly/patternfly-mcp/commit/ad96c74b7dccc153cb9b664a1c7e71ac2c293452))

### Continuous Integrations
*  npm publish workflow ([#8](https://github.com/patternfly/patternfly-mcp/pull/8)) ([26236ab](https://github.com/patternfly/patternfly-mcp/commit/26236ab57b126e620c26d2da147bc45f3396d2f4))

### Builds
*  changelog generator ([#6](https://github.com/patternfly/patternfly-mcp/pull/6)) ([6068954](https://github.com/patternfly/patternfly-mcp/commit/606895485f1c2a1659c1920dc30347373f01604a))
*  mcp-config to patternfly package ([#4](https://github.com/patternfly/patternfly-mcp/pull/4)) ([c1e13eb](https://github.com/patternfly/patternfly-mcp/commit/c1e13ebadc2b0cacca2570bf95c406d8e5821916))
*  move to nodejs 20 ([#3](https://github.com/patternfly/patternfly-mcp/pull/3)) ([c60fec1](https://github.com/patternfly/patternfly-mcp/commit/c60fec1a86ba6970575ded02bd82a8e7b1c8a2d6))
*  move to patternfly branding ([#2](https://github.com/patternfly/patternfly-mcp/pull/2)) ([3000fb5](https://github.com/patternfly/patternfly-mcp/commit/3000fb5f7f20a8c4db727b6a4cdb269e3ca19241))
