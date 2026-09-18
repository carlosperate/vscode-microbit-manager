# Extension Dev Nots


```sh
npm install
npm run typecheck   # tsc over src/, then over src/node/ and test/
npm run build       # esbuild -> dist/browser.js and dist/node.js
npm run build:icon  # assets/icon.svg -> assets/icon.png, transparent 256x256
npm test            # vitest, the pure modules and the build guards
npm run test:integration
npm run test:integration:desktop
npm run test:all    # all of the above in CI's order, stopping at the first failure
```

## Driving a real editor

```sh
npm run serve      # web on :3000, no browser launched, for the Playwright MCP server
npm run chrome     # web, launches its own Chromium
npm run desktop    # desktop VS Code, Node host, a fresh profile every launch
```

All three open `test/workspace/`, the bench. It is checked in and deliberately small, so a manual
check is repeatable rather than "make some files and see".

They load nothing else, so the panel shows both install links. The fixture adds a second group to
the status bar menu, with nothing outside this repository:

```sh
npm run serve -- --extensionPath=./test/fixtures/fake-language     # one extra menu group
npm run desktop -- --extensionPath=test/fixtures/fake-language     # the same on desktop, same flag
```

For the setup a user will have, `:languages` loads the published language extensions, latest of
each. It needs no checkout:

```sh
npm run serve:languages                                                   # the two published language extensions
npm run desktop:languages                                                 # the same, installed into a fresh profile
npm run serve:languages -- --extensionPath=./test/fixtures/fake-language  # those two and the fixture
```

The ids are in the `:languages` scripts in `package.json`. **Never pass a checkout of one of them to
`:languages`**: the same extension loads twice under one id. Run a checkout through plain `serve`,
`chrome` or `desktop` instead:

```sh
npm run chrome -- --extensionPath=../a-language-extension --extensionPath=../another-one
```

All three `:languages` scripts go through `config/with-extensions.mjs`. It takes
`--extensionPath=<path>` once per extension folder and `--extensionId=publisher.name[@version]` once
per published one, and needs at least one. It builds any checkout with a `build` script (so
`npm install` in each once) and passes everything else through. It names no extension itself.

**A published extension is fetched once.** `config/extension-cache.mjs` downloads the VSIX from Open
VSX into `.vscode-test/published/`, keyed by exact version, and later runs read it from there with
no network at all. The profile wipe does not touch that folder. The `:languages` scripts pin no version,
so each run costs one small lookup for what latest is and picks up a new release by itself; pass
`@1.2.3` to hold a version and need no network at all.

Do not use the web harness's own `--extensionId` for this. It resolves the id in the browser on
every page load, so every run is a version check and a full download, which rate limits; it also
refuses a pinned version, and drops an id it cannot parse while serving on regardless.

**The hosts install it differently**, which is the one place the flag is not symmetric. Desktop
installs the VSIX into the profile it just wiped, which is how a user has it; web has nothing to
install into, so the unpacked folder is served from disk. **A desktop install resolves that
extension's own dependencies and pack over the network**, so a launch is only fully offline when
those are cached and installed first too.

**`--extensionPath=` means the same thing everywhere**: an extension folder, or a folder of them, on
web and on desktop alike. The web harness defines it, `config/extensions.mjs` gives the desktop
launcher the same rule, and `config/with-extensions.mjs` reads both through it.

**Check both hosts.** They are two different environments: a Web Worker against a virtual filesystem
on one side, a Node host against real `file:` URIs on the other.

## Packaging

```sh
npx @vscode/vsce ls        # what would ship
npx @vscode/vsce package   # a .vsix, for installing by hand
```

Releases are built and published via CI, triggered by a GitHub Release.

## Version floor

`engines.vscode` is `^1.91.0`, which is what the micro:bit Web IDE pins. Its Node is far older than
the `@types/node` this compiles against, so a Node API newer than it compiles here and throws there.
Running against the floor is the only thing that catches it:

```sh
npm run desktop -- --vscode-version=1.91.1
```

The flag reaches the launcher through npm, and going via the script is what builds first: running
`config/desktop.mjs` by hand launches whatever `dist/` happens to hold.

Every interactive launch starts as a fresh install: the launcher removes the bench's own profile,
`.vscode-test/user-data` and `.vscode-test/extensions` in this checkout, or the `mbmgr-` fallback in
the temp directory when the checkout is too deep, and seeds the one setting again. It refuses any
other path, so the machine's own VS Code is never touched.
