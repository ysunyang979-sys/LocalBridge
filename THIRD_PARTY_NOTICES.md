# Nexus / LocalBridge Third-Party Software Notices and Licenses

This document contains third-party software notices, attributions, and license texts for components distributed with, bundled in, or utilized as transitive dependencies of Nexus (LocalBridge).

---

## Table of Contents

1. [Bundled Third-Party Executables & Core Runtimes](#1-bundled-third-party-executables--core-runtimes)
   - [Cloudflare cloudflared](#11-cloudflare-cloudflared-tunnel-runtime)
   - [Microsoft TypeScript](#12-typescript-language-engine)
   - [typescript-language-server](#13-typescript-language-server)
   - [Node.js Portable Runtime](#14-nodejs-portable-runtime)
   - [better-sqlite3](#15-better-sqlite3-native-sqlite-engine)
   - [Tauri Framework & Plugins](#16-tauri-framework--plugins)
2. [Third-Party Code, Design & Documentation Attributions](#2-third-party-code-design--documentation-attributions)
3. [NPM / Node.js Transitive Dependencies License Manifest](#3-npm--nodejs-transitive-dependencies-license-manifest)
4. [Rust / Cargo Transitive Dependencies License Manifest](#4-rust--cargo-transitive-dependencies-license-manifest)
5. [Standard License Texts](#5-standard-license-texts)

---

## 1. Bundled Third-Party Executables & Core Runtimes

### 1.1 Cloudflare cloudflared (Tunnel Runtime)
- **Component**: `cloudflared` (`tunnel-client-runtime-cloudflared.exe`)
- **Publisher**: Cloudflare, Inc.
- **Repository**: [https://github.com/cloudflare/cloudflared](https://github.com/cloudflare/cloudflared)
- **License**: Apache License 2.0 ([Apache-2.0](#51-apache-license-version-20))
- **Notice**:
  ```text
  Copyright (c) 2017-2026 Cloudflare, Inc.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  ```

### 1.2 TypeScript Language Engine
- **Component**: `typescript` (bundled in `resources/lsp/node_modules/typescript`)
- **Publisher**: Microsoft Corporation
- **Repository**: [https://github.com/microsoft/TypeScript](https://github.com/microsoft/TypeScript)
- **License**: Apache License 2.0 ([Apache-2.0](#51-apache-license-version-20))
- **Notice**:
  ```text
  Copyright (c) Microsoft Corporation. All rights reserved.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  ```

### 1.3 typescript-language-server
- **Component**: `typescript-language-server` (bundled in `resources/lsp/node_modules/typescript-language-server`)
- **Publisher**: TypeFox and contributors
- **Repository**: [https://github.com/typescript-language-server/typescript-language-server](https://github.com/typescript-language-server/typescript-language-server)
- **License**: Apache License 2.0 ([Apache-2.0](#51-apache-license-version-20))
- **Notice**:
  ```text
  Copyright (C) 2017-2026 TypeFox and others.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  ```

### 1.4 Node.js (Portable Runtime)
- **Component**: Node.js (`node.exe`)
- **Version**: `v24.21.0` (Windows x64)
- **Publisher**: OpenJS Foundation / Node.js Project ([https://nodejs.org](https://nodejs.org))
- **License**: Node.js License (MIT with third-party components)
- **Notice**:
  ```text
  Copyright Node.js contributors. All rights reserved.
  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to
  deal in the Software without restriction, including without limitation the
  rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
  sell copies of the Software.
  ```

### 1.5 better-sqlite3 (Native SQLite Engine)
- **Component**: `better-sqlite3`
- **Author**: Joshua Wise
- **Repository**: [https://github.com/WiseLibs/better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- **License**: MIT License ([MIT](#52-mit-license))
- **Notice**:
  ```text
  Copyright (c) 2017-2026 Joshua Wise
  ```

### 1.6 Tauri Framework & Plugins
- **Components**: `tauri`, `tauri-plugin-dialog`, `tauri-plugin-single-instance`, `tauri-build`
- **Publisher**: The Tauri Programme in The Commons Conservancy
- **Repository**: [https://github.com/tauri-apps/tauri](https://github.com/tauri-apps/tauri)
- **License**: Apache-2.0 / MIT Dual License

---

## 2. Third-Party Code, Design & Documentation Attributions

The codebase was thoroughly audited for directly copied code and documentation:

1. **Keep a Changelog (`CHANGELOG.md`)**:
   - **Source**: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
   - **Author**: Olivier Lacan and contributors
   - **License**: Creative Commons Attribution 3.0 Unported ([CC BY 3.0](https://creativecommons.org/licenses/by/3.0/))
   - **Status**: Retained with attribution in `CHANGELOG.md`.

2. **Threat Model Methodology (`docs/THREAT_MODEL.md`)**:
   - **Source**: Microsoft STRIDE Threat Modeling Framework
   - **Author**: Loren Kohnfelder, Praerit Garg (Microsoft)
   - **Status**: Conceptual framework used for threat categorization; all scenario analysis is original.

3. **Copied Code Audit Statement**:
   - No external copyrighted source code has been copied directly into custom packages without attribution.
   - All external modules are managed as declared package dependencies or bundled unmodified with license preservation.

---

## 3. NPM / Node.js Transitive Dependencies License Manifest

Generated automatically from `pnpm licenses list --json`.

### (MIT OR CC0-1.0) (1 packages)

| Package | Versions | Description |
| :--- | :--- | :--- |
| `type-fest` | `0.20.2` | A collection of essential TypeScript types |

### Apache-2.0 (10 packages)

| Package | Versions | Description |
| :--- | :--- | :--- |
| `@humanwhocodes/config-array` | `0.13.0` | Glob-based configuration matching. |
| `@humanwhocodes/module-importer` | `1.0.1` | Universal module importer for Node.js |
| `baseline-browser-mapping` | `2.11.25` | A library for obtaining browser versions with their maximum supported Baseline f |
| `didyoumean` | `1.2.2` | Match human-quality input to potential matches by edit distance. |
| `doctrine` | `3.0.0` | JSDoc parser |
| `eslint-visitor-keys` | `3.4.3` | Constants and utilities about visitor keys to traverse AST. |
| `expect-type` | `1.4.0` |  |
| `ts-interface-checker` | `0.1.13` | Runtime library to validate data against TypeScript interfaces |
| `typescript` | `5.9.3` | TypeScript is a language for application scale JavaScript development |
| `typescript-language-server` | `6.0.0` | Language Server Protocol (LSP) implementation for TypeScript using tsserver |

### Apache-2.0 OR MIT (3 packages)

| Package | Versions | Description |
| :--- | :--- | :--- |
| `@tauri-apps/api` | `2.11.1` | Tauri API definitions |
| `@tauri-apps/cli` | `2.11.4` | Command line interface for building Tauri apps |
| `@tauri-apps/cli-win32-x64-msvc` | `2.11.4` | Command line interface for building Tauri apps |

### BSD-2-Clause (9 packages)

| Package | Versions | Description |
| :--- | :--- | :--- |
| `@typescript-eslint/parser` | `7.18.0` | An ESLint custom parser which leverages TypeScript ESTree |
| `@typescript-eslint/typescript-estree` | `7.18.0` | A parser that converts TypeScript source code into an ESTree compatible form |
| `eslint-scope` | `7.2.2` | ECMAScript scope analyzer for ESLint |
| `espree` | `9.6.1` | An Esprima-compatible JavaScript parser built on Acorn |
| `esrecurse` | `4.3.0` | ECMAScript AST recursive visitor |
| `estraverse` | `5.3.0` | ECMAScript JS AST traversal functions |
| `esutils` | `2.0.3` | utility box for ECMAScript language tools |
| `json-schema-typed` | `8.0.2` | JSON Schema TypeScript definitions with complete inline documentation. |
| `uri-js` | `4.4.1` | An RFC 3986/3987 compliant, scheme extendable URI/IRI parsing/validating/resolvi |

### BSD-3-Clause (8 packages)

| Package | Versions | Description |
| :--- | :--- | :--- |
| `@humanwhocodes/object-schema` | `2.0.3` | An object schema merger/validator |
| `esquery` | `1.7.0` | A query library for ECMAScript AST using a CSS selector like query language. |
| `fast-uri` | `3.1.8, 4.1.5` | Dependency-free RFC 3986 URI toolbox |
| `light-my-request` | `6.6.0` | Fake HTTP injection library |
| `qs` | `6.16.0` | A querystring parser that supports nesting and arrays, with a depth limit |
| `secure-json-parse` | `4.1.0` | JSON parse with prototype poisoning protection |
| `source-map` | `0.7.6` | Generates and consumes source maps |
| `source-map-js` | `1.2.1` | Generates and consumes source maps |

### BlueOak-1.0.0 (7 packages)

| Package | Versions | Description |
| :--- | :--- | :--- |
| `glob` | `13.0.6` | the most correct and second fastest glob implementation in JavaScript |
| `lru-cache` | `11.5.2` | A cache object that deletes the least-recently-used items. |
| `minimatch` | `10.2.6` | a glob matcher in javascript |
| `minipass` | `7.1.3` | minimal implementation of a PassThrough stream |
| `package-json-from-dist` | `1.0.1` | Load the local package.json from either src or dist folder |
| `path-scurry` | `2.0.2` | walk paths fast and efficiently |
| `rimraf` | `6.1.3` | A deep deletion module for node (like `rm -rf`) |

### CC-BY-4.0 (1 packages)

| Package | Versions | Description |
| :--- | :--- | :--- |
| `caniuse-lite` | `1.0.30001810` | A smaller version of caniuse-db, with only the essentials! |

### ISC (26 packages)

| Package | Versions | Description |
| :--- | :--- | :--- |
| `@ungap/structured-clone` | `1.4.0` | A structuredClone polyfill |
| `anymatch` | `3.1.3` | Matches strings against configurable strings, globs, regular expressions, and/or |
| `electron-to-chromium` | `1.5.433` | Provides a list of electron-to-chromium version mappings |
| `fastq` | `1.20.3` | Fast, in memory work queue |
| `flatted` | `3.4.4` | A super light and fast circular JSON parser. |
| `fs.realpath` | `1.0.0` | Use node's fs.realpath, but fall back to the JS implementation if the native one |
| `glob` | `7.2.3` | a little globber |
| `glob-parent` | `5.1.2, 6.0.2` | Extract the non-magic parent path from a glob string. |
| `inflight` | `1.0.6` | Add callbacks to requests in flight to avoid async duplication |
| `inherits` | `2.0.4` | Browser-friendly inheritance fully compatible with standard node.js inherits() |
| `isexe` | `2.0.0` | Minimal module to check if a file is executable. |
| `lru-cache` | `5.1.1` | A cache object that deletes the least-recently-used items. |
| `lucide-react` | `0.475.0` | A Lucide icon library package for React applications |
| `minimatch` | `3.1.5, 9.0.9` | a glob matcher in javascript |
| `once` | `1.4.0` | Run a function exactly one time |
| `picocolors` | `1.1.1` | The tiniest and the fastest library for terminal output formatting with ANSI col |
| `rimraf` | `3.0.2` | A deep deletion module for node (like `rm -rf`) |
| `semver` | `6.3.1, 7.8.5` | The semantic version parser used by npm. |
| `setprototypeof` | `1.2.0` | A small polyfill for Object.setprototypeof |
| `siginfo` | `2.0.0` | Utility module to print pretty messages on SIGINFO/SIGUSR1 |
| `split2` | `4.2.0` | split a Text Stream into a Line Stream, using Stream 3 |
| `which` | `2.0.2` | Like which(1) unix command. Find the first instance of an executable in the PATH |
| `wrappy` | `1.0.2` | Callback wrapping utility |
| `yallist` | `3.1.1` | Yet Another Linked List |
| `yaml` | `2.9.1` | JavaScript parser and stringifier for YAML |
| `zod-to-json-schema` | `3.25.2` | Converts Zod schemas to Json Schemas |

### MIT (368 packages)

| Package | Versions | Description |
| :--- | :--- | :--- |
| `@alloc/quick-lru` | `5.3.0` | Simple “Least Recently Used” (LRU) cache |
| `@babel/code-frame` | `7.29.7` | Generate errors that contain a code frame that point to source locations. |
| `@babel/compat-data` | `7.29.7` | The compat-data to determine required Babel plugins |
| `@babel/core` | `7.29.7` | Babel compiler core. |
| `@babel/generator` | `7.29.8` | Turns an AST into code. |
| `@babel/helper-compilation-targets` | `7.29.7` | Helper functions on Babel compilation targets |
| `@babel/helper-globals` | `7.29.7` | A collection of JavaScript globals for Babel internal usage |
| `@babel/helper-module-imports` | `7.29.7` | Babel helper functions for inserting module loads |
| `@babel/helper-module-transforms` | `7.29.7` | Babel helper functions for implementing ES6 module transformations |
| `@babel/helper-plugin-utils` | `7.29.7` | General utilities for plugins to use |
| `@babel/helper-string-parser` | `7.29.7` | A utility package to parse strings |
| `@babel/helper-validator-identifier` | `7.29.7` | Validate identifier/keywords name |
| `@babel/helper-validator-option` | `7.29.7` | Validate plugin/preset options |
| `@babel/helpers` | `7.29.7` | Collection of helper functions used by Babel transforms. |
| `@babel/parser` | `7.29.9` | A JavaScript parser |
| `@babel/plugin-transform-react-jsx-self` | `7.29.7` | Add a __self prop to all JSX Elements |
| `@babel/plugin-transform-react-jsx-source` | `7.29.7` | Add a __source prop to all JSX Elements |
| `@babel/template` | `7.29.7` | Generate an AST from a string template. |
| `@babel/traverse` | `7.29.8` | The Babel Traverse module maintains the overall tree state, and is responsible f |
| `@babel/types` | `7.29.8` | Babel Types is a Lodash-esque utility library for AST nodes |
| `@esbuild/win32-x64` | `0.25.12, 0.27.7, 0.28.2` | The Windows 64-bit binary for esbuild, a JavaScript bundler. |
| `@eslint-community/eslint-utils` | `4.10.1` | Utilities for ESLint plugins. |
| `@eslint-community/regexpp` | `4.12.2` | Regular expression parser for ECMAScript. |
| `@eslint/eslintrc` | `2.1.4` | The legacy ESLintRC config file format for ESLint |
| `@eslint/js` | `8.57.1` | ESLint JavaScript language implementation |
| `@fastify/ajv-compiler` | `4.0.6` | Build and manage the AJV instances for the fastify framework |
| `@fastify/cors` | `10.1.0` | Fastify CORS |
| `@fastify/error` | `4.2.0` | A small utility, used by Fastify itself, for generating consistent error objects |
| `@fastify/fast-json-stringify-compiler` | `5.1.0` | Build and manage the fast-json-stringify instances for the fastify framework |
| `@fastify/forwarded` | `3.0.2` | Parse HTTP X-Forwarded-For header |
| `@fastify/merge-json-schemas` | `0.2.1` | Builds a logical conjunction (AND) of multiple JSON schemas |
| `@fastify/proxy-addr` | `5.1.1` | Determine the address of a proxied request |
| `@fastify/websocket` | `11.3.0` | basic websocket support for fastify |
| `@hono/node-server` | `1.19.17` | Node.js Adapter for Hono |
| `@jridgewell/gen-mapping` | `0.3.13` | Generate source maps |
| `@jridgewell/remapping` | `2.3.5` | Remap sequential sourcemaps through transformations to point at the original sou |
| `@jridgewell/resolve-uri` | `3.1.2` | Resolve a URI relative to an optional base URI |
| `@jridgewell/sourcemap-codec` | `1.6.0` | Encode/decode sourcemap mappings |
| `@jridgewell/trace-mapping` | `0.3.31` | Trace the original position through a source map |
| `@modelcontextprotocol/client` | `2.0.0` | Model Context Protocol implementation for TypeScript - Client package |
| `@modelcontextprotocol/core` | `2.0.0` | Model Context Protocol for TypeScript — public Zod schemas (spec + OAuth/OpenID) |
| `@modelcontextprotocol/fastify` | `2.0.0` | Fastify adapters for the Model Context Protocol TypeScript server SDK - Fastify  |
| `@modelcontextprotocol/node` | `2.0.0` | Model Context Protocol implementation for TypeScript - Node.js middleware |
| `@modelcontextprotocol/sdk` | `1.30.0` | Model Context Protocol implementation for TypeScript |
| `@modelcontextprotocol/server` | `2.0.0` | Model Context Protocol implementation for TypeScript - Server package |
| `@nodelib/fs.scandir` | `2.1.5` | List files and directories inside the specified directory |
| `@nodelib/fs.stat` | `2.0.5` | Get the status of a file with some features |
| `@nodelib/fs.walk` | `1.2.8` | A library for efficiently walking a directory recursively |
| `@pinojs/redact` | `0.4.0` | Redact JS objects |
| `@rolldown/pluginutils` | `1.0.0-beta.27` |  |
| `@rollup/rollup-win32-x64-gnu` | `4.63.3` | Native bindings for Rollup |
| `@rollup/rollup-win32-x64-msvc` | `4.63.3` | Native bindings for Rollup |
| `@types/babel__core` | `7.20.5` | TypeScript definitions for @babel/core |
| `@types/babel__generator` | `7.27.0` | TypeScript definitions for @babel/generator |
| `@types/babel__template` | `7.4.4` | TypeScript definitions for @babel/template |
| `@types/babel__traverse` | `7.28.0` | TypeScript definitions for @babel/traverse |
| `@types/better-sqlite3` | `7.6.13` | TypeScript definitions for better-sqlite3 |
| `@types/chai` | `5.2.3` | TypeScript definitions for chai |
| `@types/deep-eql` | `4.0.2` | TypeScript definitions for deep-eql |
| `@types/estree` | `1.0.9` | TypeScript definitions for estree |
| `@types/node` | `22.20.3` | TypeScript definitions for node |
| `@types/prop-types` | `15.7.15` | TypeScript definitions for prop-types |
| `@types/react` | `18.3.31` | TypeScript definitions for react |
| `@types/react-dom` | `18.3.7` | TypeScript definitions for react-dom |
| `@types/ws` | `8.18.1` | TypeScript definitions for ws |
| `@typescript-eslint/eslint-plugin` | `7.18.0` | TypeScript plugin for ESLint |
| `@typescript-eslint/scope-manager` | `7.18.0` | TypeScript scope analyser for ESLint |
| `@typescript-eslint/type-utils` | `7.18.0` | Type utilities for working with TypeScript + ESLint together |
| `@typescript-eslint/types` | `7.18.0` | Types for the TypeScript-ESTree AST spec |
| `@typescript-eslint/utils` | `7.18.0` | Utilities for working with TypeScript + ESLint together |
| `@typescript-eslint/visitor-keys` | `7.18.0` | Visitor keys used to help traverse the TypeScript-ESTree AST |
| `@vitejs/plugin-react` | `4.7.0` | The default Vite plugin for React projects |
| `@vitest/expect` | `3.2.7` | Jest's expect matchers as a Chai plugin |
| `@vitest/mocker` | `3.2.7` | Vitest module mocker implementation |
| `@vitest/pretty-format` | `3.2.7` | Fork of pretty-format with support for ESM |
| `@vitest/runner` | `3.2.7` | Vitest test runner |
| `@vitest/snapshot` | `3.2.7` | Vitest snapshot manager |
| `@vitest/spy` | `3.2.7` | Lightweight Jest compatible spy implementation |
| `@vitest/utils` | `3.2.7` | Shared Vitest utility functions |
| `abstract-logging` | `2.0.1` | A noop logger that conforms to the Log4j interface for modules to stub out inter |
| `accepts` | `2.0.0` | Higher-level content negotiation |
| `acorn` | `8.18.0` | ECMAScript parser |
| `acorn-jsx` | `5.3.2` | Modern, fast React.js JSX parser |
| `ajv` | `6.15.0, 8.20.0` | Another JSON Schema Validator |
| `ajv-formats` | `3.0.1` | Format validation for Ajv v7+ |
| `ansi-regex` | `5.0.1` | Regular expression for matching ANSI escape codes |
| `ansi-styles` | `4.3.0` | ANSI escape codes for styling strings in the terminal |
| `any-promise` | `1.3.0` | Resolve any installed ES6 compatible promise |
| `arg` | `5.0.2` | Unopinionated, no-frills CLI argument parser |
| `array-union` | `2.1.0` | Create an array of unique values, in order, from the input arrays |
| `assertion-error` | `2.0.1` | Error constructor for test and validation frameworks that implements standardize |
| `atomic-sleep` | `1.0.0` | Zero CPU overhead, zero dependency, true event-loop blocking sleep |
| `autoprefixer` | `10.6.1` | Parse CSS and add vendor prefixes to CSS rules using values from the Can I Use w |
| `avvio` | `9.3.0` | Asynchronous bootstrapping of Node applications |
| `balanced-match` | `1.0.2, 4.0.4` | Match balanced character pairs, like "{" and "}" |
| `better-sqlite3` | `13.0.3` | The fastest and simplest library for SQLite in Node.js. |
| `binary-extensions` | `2.3.0` | List of binary file extensions |
| `body-parser` | `2.3.0` | Node.js body parsing middleware |
| `brace-expansion` | `1.1.21, 2.1.7, 5.0.12` | Brace expansion as known from sh/bash |
| `braces` | `3.0.3` | Bash-like brace expansion, implemented in JavaScript. Safer than other brace exp |
| `browserslist` | `4.29.0` | Share target browsers between different front-end tools, like Autoprefixer, Styl |
| `bundle-require` | `5.1.0` | bundle and require a file |
| `bytes` | `3.1.2` | Utility to parse a string bytes to bytes and vice-versa |
| `cac` | `6.7.14` | Simple yet powerful framework for building command-line apps. |
| `call-bind-apply-helpers` | `1.0.2` | Helper functions around Function call/apply/bind, for use in `call-bind` |
| `call-bound` | `1.0.4` | Robust call-bound JavaScript intrinsics, using `call-bind` and `get-intrinsic`. |
| `callsites` | `3.1.0` | Get callsites from the V8 stack trace API |
| `camelcase-css` | `2.0.1` | Convert a kebab-cased CSS property into a camelCased DOM property. |
| `chai` | `5.3.3` | BDD/TDD assertion library for node.js and the browser. Test framework agnostic. |
| `chalk` | `4.1.2` | Terminal string styling done right |
| `check-error` | `2.1.3` | Error comparison and information related utility for node and the browser |
| `chokidar` | `3.6.0, 4.0.3` | Minimal and efficient cross-platform file watching library |
| `color-convert` | `2.0.1` | Plain color conversion functions |
| `color-name` | `1.1.4` | A list of color names and its values |
| `colorette` | `2.0.20` | 🌈Easily set your terminal text color & styles. |
| `commander` | `4.1.1` | the complete solution for node.js command-line programs |
| `concat-map` | `0.0.1` | concatenative mapdashery |
| `confbox` | `0.1.8` | Compact and high quality YAML, TOML, JSONC and JSON5 parsers |
| `consola` | `3.4.2` | Elegant Console Wrapper |
| `content-disposition` | `1.1.0` | Create and parse Content-Disposition header |
| `content-type` | `1.0.5, 2.1.0` | Create and parse HTTP Content-Type header |
| `convert-source-map` | `2.0.0` | Converts a source-map from/to  different formats and allows adding/changing prop |
| `cookie` | `0.7.2, 1.1.1` | HTTP server cookie parsing and serialization |
| `cookie-signature` | `1.2.2` | Sign and unsign cookies |
| `cors` | `2.8.6` | Node.js CORS middleware |
| `cross-spawn` | `7.0.6` | Cross platform child_process#spawn and child_process#spawnSync |
| `cssesc` | `3.0.0` | A JavaScript library for escaping CSS strings and identifiers while generating t |
| `csstype` | `3.2.3` | Strict TypeScript and Flow types for style based on MDN data |
| `dateformat` | `4.6.3` | A node.js package for Steven Levithan's excellent dateFormat() function. |
| `debug` | `4.4.3` | Lightweight debugging utility for Node.js and the browser |
| `deep-eql` | `5.0.2` | Improved deep equality testing for Node.js and the browser. |
| `deep-is` | `0.1.4` | node's assert.deepEqual algorithm except for NaN being equal to NaN |
| `depd` | `2.0.0` | Deprecate all the things |
| `dequal` | `2.0.3` | A tiny (304B to 489B) utility for check for deep equality |
| `dir-glob` | `3.0.1` | Convert directories to glob compatible strings |
| `dlv` | `1.1.3` | Safely get a dot-notated property within an object. |
| `dunder-proto` | `1.0.1` | If available, the `Object.prototype.__proto__` accessor and mutator, call-bound |
| `duplexify` | `4.1.3` | Turn a writable and readable stream into a streams2 duplex stream with support f |
| `ee-first` | `1.1.1` | return the first event in a set of ee/event pairs |
| `encodeurl` | `2.0.0` | Encode a URL to a percent-encoded form, excluding already-encoded sequences |
| `end-of-stream` | `1.4.5` | Call a callback when a readable/writable/duplex stream has completed or failed. |
| `es-define-property` | `1.0.1` | `Object.defineProperty`, but not IE 8's broken one. |
| `es-errors` | `1.3.0` | A simple cache for a few of the JS Error constructors. |
| `es-module-lexer` | `1.7.0` | Lexes ES modules returning their import/export metadata |
| `es-object-atoms` | `1.1.2` | ES Object-related atoms: Object, ToObject, RequireObjectCoercible |
| `esbuild` | `0.25.12, 0.27.7, 0.28.2` | An extremely fast JavaScript and CSS bundler and minifier. |
| `escalade` | `3.2.0` | A tiny (183B to 210B) and fast utility to ascend parent directories |
| `escape-html` | `1.0.3` | Escape string for use in HTML |
| `escape-string-regexp` | `4.0.0` | Escape RegExp special characters |
| `eslint` | `8.57.1` | An AST-based pattern checker for JavaScript. |
| `eslint-plugin-react-hooks` | `4.6.2` | ESLint rules for React Hooks |
| `estree-walker` | `3.0.3` | Traverse an ESTree-compliant AST |
| `etag` | `1.8.1` | Create simple HTTP ETags |
| `eventsource` | `3.0.7` | WhatWG/W3C compliant EventSource client for Node.js and browsers |
| `eventsource-parser` | `3.1.1` | Streaming, source-agnostic EventSource/Server-Sent Events parser |
| `express` | `5.2.1` | Fast, unopinionated, minimalist web framework |
| `express-rate-limit` | `8.7.0` | Basic IP rate-limiting middleware for Express. Use to limit repeated requests to |
| `fast-copy` | `4.1.1` | A blazing fast deep object copier |
| `fast-decode-uri-component` | `1.0.1` | Fast and safe decodeURIComponent |
| `fast-deep-equal` | `3.1.3` | Fast deep equal |
| `fast-glob` | `3.3.3` | It's a very fast and efficient glob library for Node.js |
| `fast-json-stable-stringify` | `2.1.0` | deterministic `JSON.stringify()` - a faster version of substack's json-stable-st |
| `fast-json-stringify` | `7.0.1` | Stringify your JSON at max speed |
| `fast-levenshtein` | `2.0.6` | Efficient implementation of Levenshtein algorithm  with locale-specific collator |
| `fast-querystring` | `1.1.2` | A fast alternative to legacy querystring module |
| `fast-safe-stringify` | `2.1.1` | Safely and quickly serialize JavaScript objects |
| `fastify` | `5.12.5` | Fast and low overhead web framework, for Node.js |
| `fastify-plugin` | `5.1.0, 6.0.0` | Plugin helper for Fastify |
| `fdir` | `6.5.0` | The fastest directory crawler & globbing alternative to glob, fast-glob, & tiny- |
| `file-entry-cache` | `6.0.1` | Super simple cache for file metadata, useful for process that work o a given ser |
| `fill-range` | `7.1.1` | Fill in a range of numbers or letters, optionally passing an increment or `step` |
| `finalhandler` | `2.1.1` | Node.js final http responder |
| `find-my-way` | `9.9.0` | Crazy fast http radix based router |
| `find-up` | `5.0.0` | Find a file or directory by walking up parent directories |
| `fix-dts-default-cjs-exports` | `1.0.1` | Utility to fix TypeScript declarations when using default exports in CommonJS. |
| `flat-cache` | `3.2.0` | A stupidly simple key/value storage using files to persist some data |
| `forwarded` | `0.2.0` | Parse HTTP X-Forwarded-For header |
| `fraction.js` | `5.3.4` | The RAW rational numbers library |
| `fresh` | `2.0.0` | HTTP response freshness testing |
| `function-bind` | `1.1.2` | Implementation of Function.prototype.bind |
| `gensync` | `1.0.0-beta.2` | Allows users to use generators in order to write common functions that can be bo |
| `get-intrinsic` | `1.3.0` | Get and robustly cache all JS language-level intrinsics at first require time |
| `get-proto` | `1.0.1` | Robustly get the [[Prototype]] of an object |
| `globals` | `13.24.0` | Global identifiers from different JavaScript environments |
| `globby` | `11.1.0` | User-friendly glob matching |
| `gopd` | `1.2.0` | `Object.getOwnPropertyDescriptor`, but accounts for IE's broken implementation. |
| `graphemer` | `1.4.0` | A JavaScript library that breaks strings into their individual user-perceived ch |
| `has-flag` | `4.0.0` | Check if argv has a specific flag |
| `has-symbols` | `1.1.0` | Determine if the JS environment has Symbol support. Supports spec, or shams. |
| `hasown` | `2.0.4` | A robust, ES3 compatible, "has own property" predicate. |
| `help-me` | `5.0.0` | Help command for node, partner of minimist and commist |
| `hono` | `4.13.8` | Web framework built on Web Standards |
| `http-errors` | `2.0.1` | Create HTTP error objects |
| `iconv-lite` | `0.7.3` | Convert character encodings in pure javascript. |
| `ignore` | `5.3.2` | Ignore is a manager and filter for .gitignore rules, the one used by eslint, git |
| `import-fresh` | `3.3.1` | Import a module while bypassing the cache |
| `imurmurhash` | `0.1.4` | An incremental implementation of MurmurHash3 |
| `ip-address` | `10.7.2` | A library for parsing IPv4 and IPv6 IP addresses in node and the browser. |
| `ipaddr.js` | `1.9.1, 2.5.0` | A library for manipulating IPv4 and IPv6 addresses in JavaScript. |
| `is-binary-path` | `2.1.0` | Check if a file path is a binary file |
| `is-core-module` | `2.17.0` | Is this specifier a node.js core module? |
| `is-extglob` | `2.1.1` | Returns true if a string has an extglob. |
| `is-glob` | `4.0.3` | Returns `true` if the given string looks like a glob pattern or an extglob patte |
| `is-number` | `7.0.0` | Returns true if a number or string value is a finite number. Useful for regex ma |
| `is-path-inside` | `3.0.3` | Check if a path is inside another path |
| `is-promise` | `4.0.0` | Test whether an object looks like a promises-a+ promise |
| `jiti` | `1.21.7` | Runtime typescript and ESM support for Node.js |
| `jose` | `6.2.12` | JWA, JWS, JWE, JWT, JWK, JWKS for Node.js, Browser, Cloudflare Workers, Deno, Bu |
| `joycon` | `3.1.1` | Load config with ease. |
| `js-tokens` | `4.0.0, 9.0.1` | Tiny JavaScript tokenizer. |
| `js-yaml` | `4.3.2` | YAML 1.2 parser and serializer |
| `jsesc` | `3.1.0` | Given some data, jsesc returns the shortest possible stringified & ASCII-safe re |
| `json-buffer` | `3.0.1` | JSON parse & stringify that supports binary via bops & base64 |
| `json-schema-ref-resolver` | `3.0.0` | JSON schema reference resolver |
| `json-schema-traverse` | `0.4.1, 1.0.0` | Traverse JSON Schema passing each schema object to callback |
| `json-stable-stringify-without-jsonify` | `1.0.1` | deterministic JSON.stringify() with custom sorting to get deterministic hashes f |
| `json5` | `2.2.3` | JSON for Humans |
| `keyv` | `4.5.4` | Simple key-value storage with support for multiple backends |
| `levn` | `0.4.1` | Light ECMAScript (JavaScript) Value Notation - human written, concise, typed, fl |
| `lilconfig` | `3.1.3` | A zero-dependency alternative to cosmiconfig |
| `lines-and-columns` | `1.2.4` | Maps lines and columns to character offsets and back. |
| `load-tsconfig` | `0.2.5` | Load tsconfig.json |
| `locate-path` | `6.0.0` | Get the first path that exists on disk of multiple paths |
| `lodash.merge` | `4.6.2` | The Lodash method `_.merge` exported as a module. |
| `loose-envify` | `1.4.0` | Fast (and loose) selective `process.env` replacer using js-tokens instead of an  |
| `loupe` | `3.2.1` | Inspect utility for Node.js and browsers |
| `magic-string` | `0.30.21` | Modify strings, generate sourcemaps |
| `math-intrinsics` | `1.1.0` | ES Math-related intrinsics and helpers, robustly cached. |
| `media-typer` | `1.1.1` | Simple RFC 6838 media type parser and formatter |
| `merge-descriptors` | `2.0.0` | Merge objects using their property descriptors |
| `merge2` | `1.4.1` | Merge multiple streams into one stream in sequence or parallel. |
| `micromatch` | `4.0.8` | Glob matching for javascript/node.js. A replacement and faster alternative to mi |
| `mime-db` | `1.54.0` | Media Type Database |
| `mime-types` | `3.0.2` | The ultimate javascript content-type utility. |
| `minimist` | `1.2.8` | parse argument options |
| `mlly` | `1.8.2` | Missing ECMAScript module utils for Node.js |
| `mnemonist` | `0.40.0` | Curated collection of data structures for the JavaScript/TypeScript. |
| `ms` | `2.1.3` | Tiny millisecond conversion utility |
| `mz` | `2.7.0` | modernize node.js to current ECMAScript standards |
| `nanoid` | `3.3.19` | A tiny (116 bytes), secure URL-friendly unique string ID generator |
| `natural-compare` | `1.4.0` | Compare strings containing a mix of letters and numbers in the way a human being |
| `negotiator` | `1.1.0` | HTTP content negotiation |
| `node-addon-api` | `8.9.2` | Node.js API (Node-API) |
| `node-releases` | `2.0.56` | Node.js releases data |
| `normalize-path` | `3.0.0` | Normalize slashes in a file path to be posix/unix-like forward slashes. Also con |
| `object-assign` | `4.1.1` | ES2015 `Object.assign()` ponyfill |
| `object-hash` | `3.0.0` | Generate hashes from javascript objects in node and the browser. |
| `object-inspect` | `1.13.4` | string representations of objects in node and the browser |
| `obliterator` | `2.0.5` | Higher order iterator library for JavaScript/TypeScript. |
| `on-exit-leak-free` | `2.1.2` | Execute a function on exit without leaking memory, allowing all objects to be ga |
| `on-finished` | `2.4.1` | Execute a callback when a request closes, finishes, or errors |
| `optionator` | `0.9.4` | option parsing and help generation |
| `p-limit` | `3.1.0` | Run multiple promise-returning & async functions with limited concurrency |
| `p-locate` | `5.0.0` | Get the first fulfilled promise that satisfies the provided testing function |
| `parent-module` | `1.0.1` | Get the path of the parent module |
| `parseurl` | `1.3.3` | parse a url with memoization |
| `path-exists` | `4.0.0` | Check if a path exists |
| `path-is-absolute` | `1.0.1` | Node.js 0.12 path.isAbsolute() ponyfill |
| `path-key` | `3.1.1` | Get the PATH environment variable key cross-platform |
| `path-parse` | `1.0.7` | Node.js path.parse() ponyfill |
| `path-to-regexp` | `8.4.2` | Express style path to RegExp utility |
| `path-type` | `4.0.0` | Check if a path is a file, directory, or symlink |
| `pathe` | `2.0.3` | Universal filesystem path utils |
| `pathval` | `2.0.1` | Object value retrieval given a string path |
| `picomatch` | `2.3.2, 4.0.7` | Blazing fast and accurate glob matcher written in JavaScript, with no dependenci |
| `pino` | `9.14.0` | super fast, all natural json logger |
| `pino-abstract-transport` | `2.0.0, 3.0.0` | Write Pino transports easily |
| `pino-pretty` | `13.1.3` | Prettifier for Pino log lines |
| `pino-std-serializers` | `7.1.0` | A collection of standard object serializers for Pino |
| `pirates` | `4.0.7` | Properly hijack require, i.e., properly define require hooks and customizations |
| `pkce-challenge` | `5.0.1` | Generate or verify a Proof Key for Code Exchange (PKCE) challenge pair |
| `pkg-types` | `1.3.1` | Node.js utilities and TypeScript definitions for `package.json` and `tsconfig.js |
| `postcss` | `8.5.28` | Tool for transforming styles with JS plugins |
| `postcss-import` | `15.1.0` | PostCSS plugin to import CSS files |
| `postcss-js` | `4.1.0` | PostCSS for CSS-in-JS and styles in JS objects |
| `postcss-load-config` | `6.0.1` | Autoload Config for PostCSS |
| `postcss-nested` | `6.2.0` | PostCSS plugin to unwrap nested rules like how Sass does it |
| `postcss-selector-parser` | `6.1.4` | Selector parser with built in methods for working with selector strings. |
| `postcss-value-parser` | `4.2.0` | Transforms css values and at-rule params into the tree |
| `prelude-ls` | `1.2.1` | prelude.ls is a functionally oriented utility library. It is powerful and flexib |
| `process-warning` | `4.0.1, 5.1.0` | A small utility for creating warnings and emitting them. |
| `proxy-addr` | `2.0.8` | Determine address of proxied request |
| `pump` | `3.0.4` | pipe streams together and close all of them if one of them closes |
| `punycode` | `2.3.1` | A robust Punycode converter that fully complies to RFC 3492 and RFC 5891, and wo |
| `queue-microtask` | `1.2.3` | fast, tiny `queueMicrotask` shim for modern engines |
| `quick-format-unescaped` | `4.0.4` | Solves a problem with util.format |
| `range-parser` | `1.3.0` | Range header field string parser |
| `raw-body` | `3.0.2` | Get and validate the raw body of a readable stream. |
| `react` | `18.3.1` | React is a JavaScript library for building user interfaces. |
| `react-dom` | `18.3.1` | React package for working with the DOM. |
| `react-refresh` | `0.17.0` | React is a JavaScript library for building user interfaces. |
| `read-cache` | `1.0.2` | Reads and caches the entire contents of a file until it is modified |
| `readable-stream` | `3.6.2` | Streams3, a user-land copy of the stream library from Node.js |
| `readdirp` | `3.6.0, 4.1.2` | Recursive version of fs.readdir with small RAM & CPU footprint. |
| `real-require` | `0.2.0` | Keep require and import consistent after bundling or transpiling |
| `require-from-string` | `2.0.2` | Require module from string |
| `resolve` | `1.22.12` | resolve like require.resolve() on behalf of files asynchronously and synchronous |
| `resolve-from` | `4.0.0, 5.0.0` | Resolve the path of a module like `require.resolve()` but from a given path |
| `ret` | `0.5.0` | Tokenizes a string that represents a regular expression. |
| `reusify` | `1.1.0` | Reuse objects and functions with style |
| `rfdc` | `1.4.1` | Really Fast Deep Clone |
| `rollup` | `4.63.3` | Next-generation ES module bundler |
| `router` | `2.2.0` | Simple middleware-style router |
| `run-parallel` | `1.2.0` | Run an array of functions in parallel |
| `safe-buffer` | `5.2.1` | Safer Node.js Buffer API |
| `safe-regex2` | `5.1.1` | detect possibly catastrophic, exponential-time regular expressions |
| `safe-stable-stringify` | `2.5.0` | Deterministic and safely JSON.stringify to quickly serialize JavaScript objects |
| `safer-buffer` | `2.1.2` | Modern Buffer API polyfill without footguns |
| `scheduler` | `0.23.2` | Cooperative scheduler for the browser environment. |
| `send` | `1.2.1` | Better streaming static file server with Range and conditional-GET support |
| `serve-static` | `2.2.1` | Serve static files |
| `set-cookie-parser` | `2.7.2` | Parses set-cookie headers into objects |
| `shebang-command` | `2.0.0` | Get the command from a shebang |
| `shebang-regex` | `3.0.0` | Regular expression for matching a shebang line |
| `side-channel` | `1.1.1` | Store information about any JS value in a side channel. Uses WeakMap if availabl |
| `side-channel-list` | `1.0.1` | Store information about any JS value in a side channel, using a linked list |
| `side-channel-map` | `1.0.1` | Store information about any JS value in a side channel, using a Map |
| `side-channel-weakmap` | `1.0.2` | Store information about any JS value in a side channel. Uses WeakMap if availabl |
| `slash` | `3.0.0` | Convert Windows backslash paths to slash paths |
| `sonic-boom` | `4.2.1` | Extremely fast utf8 only stream implementation |
| `stackback` | `0.0.2` | return list of CallSite objects from a captured stacktrace |
| `statuses` | `2.0.2` | HTTP status utility |
| `std-env` | `3.10.0` | Runtime agnostic JS utils |
| `stream-shift` | `1.0.3` | Returns the next buffer/object in a stream's readable queue |
| `string_decoder` | `1.3.0` | The string_decoder module from Node core |
| `strip-ansi` | `6.0.1` | Strip ANSI escape codes from a string |
| `strip-json-comments` | `3.1.1, 5.0.3` | Strip comments from JSON. Lets you use comments in your JSON files! |
| `strip-literal` | `3.1.0` | Strip comments and string literals from JavaScript code |
| `sucrase` | `3.35.1` | Super-fast alternative to Babel for when you can target modern JS runtimes |
| `supports-color` | `7.2.0` | Detect whether a terminal supports color |
| `supports-preserve-symlinks-flag` | `1.0.0` | Determine if the current node version supports the `--preserve-symlinks` flag. |
| `tailwindcss` | `3.4.19` | A utility-first CSS framework for rapidly building custom user interfaces. |
| `text-table` | `0.2.0` | borderless text tables with alignment |
| `thenify` | `3.3.1` | Promisify a callback-based function |
| `thenify-all` | `1.6.0` | Promisifies all the selected functions in an object |
| `thread-stream` | `3.2.0` | A streaming way to send data to a Node.js Worker Thread |
| `tinybench` | `2.9.0` |  |
| `tinyexec` | `0.3.2` | A minimal library for executing processes in Node |
| `tinyglobby` | `0.2.17` | A fast and minimal alternative to globby and fast-glob |
| `tinypool` | `1.1.1` | A minimal and tiny Node.js Worker Thread Pool implementation, a fork of piscina, |
| `tinyrainbow` | `2.0.0` | A small library to print colourful messages. |
| `tinyspy` | `4.0.6` | A minimal fork of nanospy, with more features |
| `to-regex-range` | `5.0.1` | Pass two numbers, get a regex-compatible source string for matching ranges. Vali |
| `toad-cache` | `3.7.4` | LRU and FIFO caches for Client or Server |
| `toidentifier` | `1.0.1` | Convert a string of words to a JavaScript identifier |
| `tree-kill` | `1.2.2` | kill trees of processes |
| `ts-api-utils` | `1.4.3` | Utility functions for working with TypeScript's API. Successor to the wonderful  |
| `tsup` | `8.5.1` | Bundle your TypeScript library with no config, powered by esbuild |
| `tsx` | `4.23.13` | TypeScript Execute (tsx): Node.js enhanced with esbuild to run TypeScript & ESM  |
| `type-check` | `0.4.0` | type-check allows you to check the types of JavaScript values at runtime with a  |
| `type-is` | `2.1.0` | Infer the content-type of a request. |
| `ufo` | `1.6.4` | URL utils for humans |
| `undici-types` | `6.21.0` | A stand-alone types package for Undici |
| `unpipe` | `1.0.0` | Unpipe a stream from all destinations |
| `update-browserslist-db` | `1.3.3` | CLI tool to update caniuse-lite to refresh target browsers from Browserslist con |
| `util-deprecate` | `1.0.2` | The Node.js `util.deprecate()` function with browser support |
| `vary` | `1.1.2` | Manipulate the HTTP Vary header |
| `vite` | `6.4.3, 7.3.6` | Native-ESM powered web dev build tool |
| `vite-node` | `3.2.4` | Vite as Node.js runtime |
| `vitest` | `3.2.7` | Next generation testing framework powered by Vite |
| `vscode-jsonrpc` | `5.0.1, 9.0.2` | A json rpc implementation over streams |
| `vscode-languageserver-protocol` | `3.18.3` | VSCode Language Server Protocol implementation |
| `vscode-languageserver-types` | `3.18.3` | Types used by the Language server for node |
| `why-is-node-running` | `2.3.0` | Node is running but you don't know why? why-is-node-running is here to help you. |
| `word-wrap` | `1.2.5` | Wrap words to a specified length. |
| `ws` | `8.21.3` | Simple to use, blazing fast and thoroughly tested websocket client and server fo |
| `yocto-queue` | `0.1.0` | Tiny queue data structure |
| `zod` | `3.25.76, 4.6.5` | TypeScript-first schema declaration and validation library with static type infe |

### MIT OR Apache-2.0 (1 packages)

| Package | Versions | Description |
| :--- | :--- | :--- |
| `@tauri-apps/plugin-dialog` | `2.7.3` |  |

### Python-2.0 (1 packages)

| Package | Versions | Description |
| :--- | :--- | :--- |
| `argparse` | `2.0.1` | CLI arguments parser. Native port of python's argparse. |

---

## 4. Rust / Cargo Transitive Dependencies License Manifest

Generated automatically from Cargo metadata for the desktop application (`apps/desktop/src-tauri`).

### (MIT OR Apache-2.0) AND Unicode-3.0 (1 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `unicode-ident` | `1.0.26` | Determine whether characters have the XID_Start or XID_Continue properties accor |

### 0BSD OR MIT OR Apache-2.0 (1 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `adler2` | `2.0.1` | A simple clean-room implementation of the Adler-32 checksum |

### Apache-2.0 (2 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `sync_wrapper` | `1.0.2` | A tool for enlisting the compiler's help in proving the absence of concurrency |
| `tao` | `0.35.3` | Cross-platform window manager library. |

### Apache-2.0 / MIT (1 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `fnv` | `1.0.7` | Fowler–Noll–Vo hash function |

### Apache-2.0 AND MIT (1 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `dpi` | `0.1.2` | Types for handling UI scaling |

### Apache-2.0 OR MIT (50 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `async-channel` | `2.5.0` | Async multi-producer multi-consumer channel |
| `async-executor` | `1.14.0` | Async executor |
| `async-io` | `2.6.0` | Async I/O and timers |
| `async-lock` | `3.4.2` | Async synchronization primitives |
| `async-process` | `2.5.0` | Async interface for working with processes |
| `async-signal` | `0.2.14` | Async signal handling |
| `async-task` | `4.7.1` | Task abstraction for building executors |
| `atomic-waker` | `1.1.2` | A synchronization primitive for task wakeup |
| `autocfg` | `1.5.1` | Automatic cfg for Rust compiler features |
| `bit-set` | `0.8.0` | A set of bits |
| `bit-vec` | `0.8.0` | A vector of bits |
| `blocking` | `1.7.0` | A thread pool for isolating blocking I/O in async programs |
| `cargo_toml` | `0.22.3` | `Cargo.toml` struct definitions for parsing with Serde |
| `concurrent-queue` | `2.5.0` | Concurrent multi-producer multi-consumer queue |
| `ctor` | `0.8.0` | __attribute__((constructor)) for Rust |
| `ctor-proc-macro` | `0.0.7` | proc-macro support for the ctor crate |
| `dtor` | `0.3.0` | __attribute__((destructor)) for Rust |
| `dtor-proc-macro` | `0.0.6` | proc-macro support for the dtor crate |
| `equivalent` | `1.0.2` | Traits for key comparison in maps. |
| `event-listener` | `5.4.2` | Notify async tasks or threads |
| `event-listener-strategy` | `0.5.4` | Block or poll on event_listener easily |
| `fastrand` | `2.5.0` | A simple and fast random number generator |
| `futures-lite` | `2.6.1` | Futures, streams, and async I/O combinators |
| `idna_adapter` | `1.2.2` | Back end adapter for idna |
| `indexmap` | `1.9.3` | A hash table with consistent order and fast iteration. |
| `indexmap` | `2.14.2` | A hash table with consistent order and fast iteration. |
| `libappindicator` | `0.9.0` | Rust safe bindings for libappindicator |
| `libappindicator-sys` | `0.9.0` | Rust sys bindings for libappindicator |
| `muda` | `0.19.3` | Menu Utilities for Desktop Applications |
| `parking` | `2.2.1` | Thread parking and unparking |
| `pin-project-lite` | `0.2.17` | A lightweight version of pin-project written with declarative macros.
 |
| `polling` | `3.11.0` | Portable interface to epoll, kqueue, event ports, and IOCP |
| `portable-atomic` | `1.15.0` | Portable atomic types including support for 128-bit atomics, atomic float, etc.
 |
| `portable-atomic-util` | `0.2.8` | Synchronization primitives built with portable-atomic.
 |
| `rustc-hash` | `2.1.3` | A speedy, non-cryptographic hashing algorithm used by rustc |
| `tauri` | `2.11.5` | Make tiny, secure apps for all desktop platforms with Tauri |
| `tauri-build` | `2.6.3` | build time code to pair with https://crates.io/crates/tauri |
| `tauri-codegen` | `2.6.3` | code generation meant to be consumed inside of `tauri` through `tauri-build` or  |
| `tauri-macros` | `2.6.3` | Macros for the tauri crate. |
| `tauri-plugin` | `2.6.3` | Build script and runtime Tauri plugin definitions |
| `tauri-plugin-dialog` | `2.7.3` | Native system dialogs for opening and saving files along with message dialogs on |
| `tauri-plugin-fs` | `2.5.2` | Access the file system. |
| `tauri-plugin-single-instance` | `2.4.4` | Ensure a single instance of your tauri app is running. |
| `tauri-runtime` | `2.11.3` | Runtime for Tauri applications |
| `tauri-runtime-wry` | `2.11.4` | Wry bindings to the Tauri runtime |
| `tauri-utils` | `2.9.3` | Utilities for Tauri |
| `utf8_iter` | `1.0.4` | Iterator by char over potentially-invalid UTF-8 in &[u8] |
| `uuid` | `1.26.1` | A library to generate and parse UUIDs. |
| `window-vibrancy` | `0.6.0` | Make your windows vibrant. |
| `wry` | `0.55.1` | Cross-platform WebView rendering library |

### Apache-2.0 WITH LLVM-exception (1 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `target-lexicon` | `0.12.16` | Targeting utilities for compilers and related tools |

### Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT (5 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `linux-raw-sys` | `0.12.1` | Generated bindings for Linux's userspace API |
| `rustix` | `1.1.5` | Safe Rust bindings to POSIX/Unix/Linux/Winsock-like syscalls |
| `wasi` | `0.11.1+wasi-snapshot-preview1` | Experimental WASI API bindings for Rust |
| `wasip2` | `1.0.4+wasi-0.2.12` | WASIp2 API bindings for Rust |
| `wit-bindgen` | `0.57.1` | Rust bindings generator and runtime support for WIT and the component model.
Use |

### Apache-2.0/MIT (3 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `cesu8` | `1.1.0` | Convert to and from CESU-8 encoding (similar to UTF-8) |
| `dbus` | `0.9.12` | Bindings to D-Bus, which is a bus commonly used on Linux for inter-process commu |
| `libdbus-sys` | `0.2.7` | FFI bindings to libdbus. |

### BSD-3-Clause (2 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `alloc-no-stdlib` | `2.0.4` | A dynamic allocator that may be used with or without the stdlib. This allows a p |
| `alloc-stdlib` | `0.2.4` | A dynamic allocator example that may be used with the stdlib |

### BSD-3-Clause AND MIT (1 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `brotli` | `8.0.4` | A brotli compressor and decompressor that with an interface avoiding the rust st |

### BSD-3-Clause OR Apache-2.0 (2 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `moxcms` | `0.8.1` | Simple Color Management in Rust |
| `pxfm` | `0.1.30` | Fast and accurate math |

### BSD-3-Clause OR MIT OR Apache-2.0 (2 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `num_enum` | `0.7.6` | Procedural macros to make inter-operation between primitives and enums easier. |
| `num_enum_derive` | `0.7.6` | Internal implementation details for ::num_enum (Procedural macros to make inter- |

### BSD-3-Clause/MIT (1 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `brotli-decompressor` | `5.0.3` | A brotli decompressor that with an interface avoiding the rust stdlib. This make |

### CC0-1.0 OR MIT-0 OR Apache-2.0 (1 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `dunce` | `1.0.5` | Normalize Windows paths to the most compatible format, avoiding UNC where possib |

### ISC (1 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `libloading` | `0.7.4` | Bindings around the platform's dynamic library loading primitives with greatly i |

### MIT (110 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `atk` | `0.18.2` | UNMAINTAINED Rust bindings for the ATK library |
| `atk-sys` | `0.18.2` | UNMAINTAINED FFI bindings to libatk-1 |
| `block2` | `0.6.2` | Apple's C language extension of blocks |
| `bytes` | `1.12.1` | Types and traits for working with bytes |
| `cairo-rs` | `0.18.5` | Rust bindings for the Cairo library |
| `cairo-sys-rs` | `0.18.2` | FFI bindings to libcairo |
| `cargo_metadata` | `0.19.2` | structured access to the output of `cargo metadata` |
| `cfb` | `0.7.3` | Read/write Compound File Binary (structured storage) files |
| `combine` | `4.6.8` | Fast parser combinators on arbitrary streams with zero-copy support. |
| `darling` | `0.24.1` | A proc-macro library for reading attributes into structs when
implementing custo |
| `darling_core` | `0.24.1` | Helper crate for proc-macro library for reading attributes into structs when
imp |
| `darling_macro` | `0.24.1` | Internal support for a proc-macro library for reading attributes into structs wh |
| `derive_more` | `2.1.1` | Adds #[derive(x)] macros for more traits |
| `derive_more-impl` | `2.1.1` | Internal implementation of `derive_more` crate |
| `dlopen2` | `0.8.2` | Library for opening and operating on dynamic link libraries (also known as share |
| `dlopen2_derive` | `0.4.3` | Derive macros for the dlopen2 crate. |
| `dom_query` | `0.27.0` | HTML querying and manipulation with CSS selectors |
| `embed-resource` | `3.0.11` | A Cargo library to handle compilation and inclusion of Windows resources in the  |
| `endi` | `1.1.1` | A simple endian-handling library |
| `gdk` | `0.18.2` | UNMAINTAINED Rust bindings for the GDK 3 library (use gdk4 instead) |
| `gdk-pixbuf` | `0.18.5` | Rust bindings for the GdkPixbuf library |
| `gdk-pixbuf-sys` | `0.18.0` | FFI bindings to libgdk_pixbuf-2.0 |
| `gdk-sys` | `0.18.2` | UNMAINTAINED FFI bindings to libgdk-3 (use gdk4-sys instead) |
| `gdkwayland-sys` | `0.18.2` | UNMAINTAINED FFI bindings to libgdk-3-wayland (use gdk4-wayland-sys instead) |
| `gdkx11` | `0.18.2` | UNMAINTAINED Rust bindings for the GDK X11 library (use gdk4-x11 instead) |
| `gdkx11-sys` | `0.18.2` | UNMAINTAINED FFI binding for libgdkx11 (use gdk4-x11-sys instead) |
| `generic-array` | `0.14.7` | Generic types implementing functionality of arrays |
| `gio` | `0.18.4` | Rust bindings for the Gio library |
| `gio-sys` | `0.18.1` | FFI bindings to libgio-2.0 |
| `glib` | `0.18.5` | Rust bindings for the GLib library |
| `glib-macros` | `0.18.5` | Rust bindings for the GLib library, proc macros crate |
| `glib-sys` | `0.18.1` | FFI bindings to libglib-2.0 |
| `gobject-sys` | `0.18.0` | FFI bindings to libgobject-2.0 |
| `gtk` | `0.18.2` | UNMAINTAINED Rust bindings for the GTK+ 3 library (use gtk4 instead) |
| `gtk-sys` | `0.18.2` | UNMAINTAINED FFI bindings to libgtk-3 (use gtk4-sys instead) |
| `gtk3-macros` | `0.18.2` | UNMAINTAINED Rust bindings for the GTK 3 library (use gtk4-macros instead) |
| `http-body` | `1.1.0` | Trait representing an asynchronous, streaming, HTTP request or response body.
 |
| `http-body-util` | `0.1.5` | Combinators and adapters for HTTP request or response bodies.
 |
| `hyper` | `1.11.1` | A protective and efficient HTTP library for all. |
| `hyper-util` | `0.1.20` | hyper utilities |
| `ico` | `0.5.0` | A library for encoding/decoding ICO image files |
| `infer` | `0.19.0` | Small crate to infer file type based on magic number signatures |
| `javascriptcore-rs` | `1.1.2` | Rust bindings for the javacriptcore library |
| `javascriptcore-rs-sys` | `1.1.1` | Sys functions for the Rust bindings of the javacriptcore library |
| `libredox` | `0.1.24` | Redox stable ABI |
| `memoffset` | `0.9.1` | offset_of functionality for Rust structs. |
| `mio` | `1.2.3` | Lightweight non-blocking I/O. |
| `new_debug_unreachable` | `1.0.6` | panic in debug, intrinsics::unreachable() in release (fork of debug_unreachable) |
| `objc2` | `0.6.4` | Objective-C interface and runtime bindings |
| `objc2-encode` | `4.1.0` | Objective-C type-encoding representation and parsing |
| `objc2-foundation` | `0.3.2` | Bindings to the Foundation framework |
| `pango` | `0.18.3` | Rust bindings for the Pango library |
| `pango-sys` | `0.18.0` | FFI bindings to libpango-1.0 |
| `phf` | `0.13.1` | Runtime support for perfect hash function data structures |
| `phf_codegen` | `0.13.1` | Codegen library for PHF types |
| `phf_generator` | `0.13.1` | PHF generation logic |
| `phf_macros` | `0.13.1` | Macros to generate types in the phf crate |
| `phf_shared` | `0.13.1` | Support code shared by PHF libraries |
| `plist` | `1.10.1` | A rusty plist parser. Supports Serde serialization. |
| `precomputed-hash` | `0.1.1` | A library intending to be a base dependency to expose a precomputed hash |
| `quick-xml` | `0.42.0` | High performance xml reader and writer |
| `redox_syscall` | `0.5.18` | A Rust library to access raw Redox system calls |
| `redox_users` | `0.5.3` | A Rust library to access Redox users and groups functionality |
| `rfd` | `0.16.0` | Rusty File Dialog |
| `schemars` | `0.8.22` | Generate JSON Schemas from Rust code |
| `schemars` | `0.9.0` | Generate JSON Schemas from Rust code |
| `schemars` | `1.2.2` | Generate JSON Schemas from Rust code |
| `schemars_derive` | `0.8.22` | Macros for #[derive(JsonSchema)], for use with schemars |
| `simd-adler32` | `0.3.10` | A SIMD-accelerated Adler-32 hash algorithm implementation. |
| `slab` | `0.4.12` | Pre-allocated storage for a uniform data type |
| `soup3` | `0.5.0` | Soup crate for Rust |
| `soup3-sys` | `0.5.0` | Sys functions for the Rust bindings of the javacriptcore library |
| `strsim` | `0.11.1` | Implementations of string similarity metrics. Includes Hamming, Levenshtein,
OSA |
| `synstructure` | `0.14.0` | Helper methods and macros for custom derives |
| `tauri-winres` | `0.3.6` | Create and set windows icons and metadata for executables |
| `tokio` | `1.53.1` | An event-driven, non-blocking I/O platform for writing asynchronous I/O
backed a |
| `tokio-util` | `0.7.19` | Additional utilities for working with Tokio.
 |
| `tower` | `0.5.3` | Tower is a library of modular and reusable components for building robust
client |
| `tower-http` | `0.6.11` | Tower middleware and utilities for HTTP clients and servers |
| `tower-layer` | `0.3.3` | Decorates a `Service` to allow easy composition between `Service`s.
 |
| `tower-service` | `0.3.3` | Trait representing an asynchronous, request / response based, client or server.
 |
| `tracing` | `0.1.44` | Application-level tracing for Rust.
 |
| `tracing-attributes` | `0.1.31` | Procedural macro attributes for automatically instrumenting functions.
 |
| `tracing-core` | `0.1.36` | Core primitives for application-level tracing.
 |
| `try-lock` | `0.2.5` | A lightweight atomic lock. |
| `uds_windows` | `1.2.1` | Unix Domain Sockets for Windows! |
| `urlpattern` | `0.3.0` | rust-urlpattern is a Rust implementation of the URLPattern standard |
| `version-compare` | `0.2.1` | Rust library to easily compare version numbers with no specific format, and test |
| `vswhom` | `0.1.0` | FFI to Jon Blow's VS discovery script |
| `vswhom-sys` | `0.1.3` | Pure FFI to Jon Blow's VS discovery script |
| `want` | `0.3.1` | Detect when another Future wants a result. |
| `webkit2gtk` | `2.0.2` | Rust bindings for webkit-gtk library |
| `webkit2gtk-sys` | `2.0.2` | Rust binding for webkit-gtk library |
| `webview2-com` | `0.38.2` | Rust bindings for the WebView2 COM APIs |
| `webview2-com-macros` | `0.8.1` | Macros which generate callback implementations for WebView2 COM APIs |
| `webview2-com-sys` | `0.38.2` | Bindings generated with the windows crate for the WebView2 COM APIs |
| `winnow` | `0.5.40` | A byte-oriented, zero-copy, parser combinators library |
| `winnow` | `0.7.15` | A byte-oriented, zero-copy, parser combinators library |
| `winnow` | `1.0.4` | A byte-oriented, zero-copy, parser combinators library |
| `winreg` | `0.55.0` | Rust bindings to MS Windows Registry API |
| `x11` | `2.21.0` | X11 library bindings for Rust |
| `x11-dl` | `2.21.0` | X11 library bindings for Rust |
| `zbus` | `5.19.0` | API for D-Bus communication |
| `zbus_macros` | `5.19.0` | proc-macros for zbus |
| `zbus_names` | `4.3.4` | A collection of D-Bus bus names types |
| `zcheapstr` | `1.1.0` | An immutable, cheaply cloneable string type with borrowed, static and shared var |
| `zmij` | `1.0.23` | A double-to-string conversion algorithm based on Schubfach and xjb |
| `zvariant` | `5.15.0` | D-Bus & GVariant encoding & decoding |
| `zvariant_derive` | `5.15.0` | D-Bus & GVariant encoding & decoding |
| `zvariant_utils` | `4.2.0` | Various utilities used internally by the zvariant crate. |

### MIT OR Apache-2.0 (223 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `android_system_properties` | `0.1.6` | Minimal Android system properties wrapper |
| `anyhow` | `1.0.104` | Flexible concrete Error type built on std::error::Error |
| `async-broadcast` | `0.7.2` | Async broadcast channels |
| `async-recursion` | `1.1.1` | Recursion for async functions |
| `async-trait` | `0.1.92` | Type erasure for async trait methods |
| `base64` | `0.21.7` | encodes and decodes base64 as bytes or utf8 |
| `base64` | `0.22.1` | encodes and decodes base64 as bytes or utf8 |
| `base64` | `0.23.1` | encodes and decodes base64 as bytes or utf8 |
| `bitflags` | `2.13.2` | A macro to generate structures which behave like bitflags.
 |
| `block-buffer` | `0.10.4` | Buffer type for block processing of data |
| `bumpalo` | `3.20.3` | A fast bump allocation arena for Rust. |
| `camino` | `1.2.6` | UTF-8 paths |
| `cargo-platform` | `0.1.9` | Cargo's representation of a target platform. |
| `cc` | `1.4.7` | A build-time dependency for Cargo build scripts to assist in invoking the native |
| `cfg-expr` | `0.15.8` | A parser and evaluator for Rust `cfg()` expressions. |
| `cfg-if` | `1.0.5` | A macro to ergonomically define an item depending on a large number of #[cfg]
pa |
| `chrono` | `0.4.45` | Date and time library for Rust |
| `cookie` | `0.18.2` | HTTP cookie parsing and cookie jar management. Supports signed and private
(encr |
| `core-foundation` | `0.10.1` | Bindings to Core Foundation for macOS |
| `core-foundation-sys` | `0.8.7` | Bindings to Core Foundation for macOS |
| `core-graphics` | `0.25.0` | Bindings to Core Graphics for macOS |
| `core-graphics-types` | `0.2.0` | Bindings for some fundamental Core Graphics types |
| `cpufeatures` | `0.2.17` | Lightweight runtime CPU feature detection for aarch64, loongarch64, and x86/x86_ |
| `crc32fast` | `1.5.2` | Fast, SIMD-accelerated CRC32 (IEEE) checksum computation |
| `crossbeam-channel` | `0.5.17` | Multi-producer multi-consumer channels for message passing |
| `crossbeam-utils` | `0.8.23` | Utilities for concurrent programming |
| `crypto-common` | `0.1.7` | Common cryptographic traits |
| `defmt` | `1.1.1` | A highly efficient logging framework that targets resource-constrained devices,  |
| `defmt-macros` | `1.1.1` | defmt macros |
| `defmt-parser` | `1.0.0` | Parsing library for defmt format strings |
| `deranged` | `0.5.8` | Ranged integers |
| `digest` | `0.10.7` | Traits for cryptographic hash functions and message authentication codes |
| `dirs` | `6.0.0` | A tiny low-level library that provides platform-specific standard locations of d |
| `dirs-sys` | `0.5.0` | System-level helper functions for the dirs and directories crates. |
| `displaydoc` | `0.2.7` | A derive macro for implementing the display Trait via a doc comment and string i |
| `dtoa` | `1.0.11` | Fast floating point primitive to string conversion |
| `dyn-clone` | `1.0.20` | Clone trait that is dyn-compatible |
| `embed_plist` | `1.2.2` | Embed property list files like Info.plist directly in your executable binary. |
| `enumflags2` | `0.7.12` | Enum-based bit flags |
| `enumflags2_derive` | `0.7.12` | Do not use directly, use the reexport in the `enumflags2` crate. This allows for |
| `erased-serde` | `0.4.10` | Type-erased Serialize and Serializer traits |
| `errno` | `0.3.14` | Cross-platform interface to the `errno` variable. |
| `fdeflate` | `0.3.7` | Fast specialized deflate implementation |
| `field-offset` | `0.3.6` | Safe pointer-to-member implementation |
| `find-msvc-tools` | `0.1.13` | Find windows-specific tools, read MSVC versions from the registry and from COM i |
| `flate2` | `1.1.10` | DEFLATE compression and decompression exposed as Read/BufRead/Write streams.
Sup |
| `form_urlencoded` | `1.2.2` | Parser and serializer for the application/x-www-form-urlencoded syntax, as used  |
| `futures-channel` | `0.3.34` | Channels for asynchronous communication using futures-rs.
 |
| `futures-core` | `0.3.34` | The core traits and types in for the `futures` library.
 |
| `futures-executor` | `0.3.34` | Executors for asynchronous tasks based on the futures-rs library.
 |
| `futures-io` | `0.3.34` | The `AsyncRead`, `AsyncWrite`, `AsyncSeek`, and `AsyncBufRead` traits for the fu |
| `futures-macro` | `0.3.34` | The futures-rs procedural macro implementations.
 |
| `futures-sink` | `0.3.34` | The asynchronous `Sink` trait for the futures-rs library.
 |
| `futures-task` | `0.3.34` | Tools for working with tasks.
 |
| `futures-util` | `0.3.34` | Common utilities and extension traits for the futures-rs library.
 |
| `getrandom` | `0.3.4` | A small cross-platform library for retrieving random data from system source |
| `getrandom` | `0.4.3` | A small cross-platform library for retrieving random data from system source |
| `glob` | `0.3.4` | Support for matching file paths against Unix shell style patterns.
 |
| `hashbrown` | `0.12.3` | A Rust port of Google's SwissTable hash map |
| `hashbrown` | `0.17.1` | A Rust port of Google's SwissTable hash map |
| `heck` | `0.4.1` | heck is a case conversion library. |
| `heck` | `0.5.0` | heck is a case conversion library. |
| `hermit-abi` | `0.5.3` | Hermit system calls definitions. |
| `hex` | `0.4.3` | Encoding and decoding data into/from hexadecimal representation. |
| `html5ever` | `0.38.0` | High-performance browser-grade HTML5 parser |
| `http` | `1.5.0` | A set of types for representing HTTP requests and responses.
 |
| `httparse` | `1.10.1` | A tiny, safe, speedy, zero-copy HTTP/1.x parser. |
| `iana-time-zone` | `0.1.65` | get the IANA time zone for the current system |
| `iana-time-zone-haiku` | `0.1.2` | iana-time-zone support crate for Haiku OS |
| `idna` | `1.1.0` | IDNA (Internationalizing Domain Names in Applications) and Punycode. |
| `image` | `0.25.10` | Imaging library. Provides basic image processing and encoders/decoders for commo |
| `ipnet` | `2.12.2` | Provides types and useful methods for working with IPv4 and IPv6 network address |
| `itoa` | `1.0.18` | Fast integer primitive to string conversion |
| `jni-sys` | `0.3.1` | Rust definitions corresponding to jni.h |
| `jni-sys` | `0.4.1` | Rust definitions corresponding to jni.h |
| `jni-sys-macros` | `0.4.1` | Macros for jni-sys crate |
| `js-sys` | `0.3.105` | Bindings for all JS global objects and functions in all JS environments like
Nod |
| `jsonptr` | `0.6.3` | Data structures and logic for resolving, assigning, and deleting by JSON Pointer |
| `keyboard-types` | `0.7.0` | Contains types to define keyboard related events. |
| `libc` | `0.2.189` | Raw FFI bindings to platform libraries like libc. |
| `lock_api` | `0.4.14` | Wrappers to create fully-featured Mutex and RwLock types. Compatible with no_std |
| `log` | `0.4.34` | A lightweight logging facade for Rust
 |
| `markup5ever` | `0.38.0` | Common code for xml5ever and html5ever |
| `mime` | `0.3.17` | Strongly Typed Mimes |
| `ndk` | `0.9.0` | Safe Rust bindings to the Android NDK |
| `ndk-sys` | `0.6.0+11769913` | FFI bindings for the Android NDK |
| `num-conv` | `0.2.2` | `num_conv` is a crate to convert between integer types without using `as` casts. |
| `num-traits` | `0.2.19` | Numeric traits for generic mathematics |
| `once_cell` | `1.21.4` | Single assignment cells and lazy values. |
| `ordered-stream` | `0.2.0` | Streams that are ordered relative to external events |
| `parking_lot` | `0.12.5` | More compact and efficient implementations of the standard synchronization primi |
| `parking_lot_core` | `0.9.12` | An advanced API for creating custom synchronization primitives. |
| `percent-encoding` | `2.3.2` | Percent encoding and decoding |
| `piper` | `0.2.5` | An asynchronous single-consumer single-producer pipe for bytes. |
| `pkg-config` | `0.3.34` | A library to run the pkg-config system tool at build time in order to be used in |
| `png` | `0.17.16` | PNG decoding and encoding library in pure Rust |
| `png` | `0.18.1` | PNG decoding and encoding library in pure Rust |
| `powerfmt` | `0.2.0` |     `powerfmt` is a library that provides utilities for formatting values. This  |
| `proc-macro-crate` | `1.3.1` | Replacement for crate (macro_rules keyword) in proc-macros
 |
| `proc-macro-crate` | `2.0.2` | Replacement for crate (macro_rules keyword) in proc-macros
 |
| `proc-macro-crate` | `3.5.0` | Replacement for crate (macro_rules keyword) in proc-macros
 |
| `proc-macro-error` | `1.0.4` | Almost drop-in replacement to panics in proc-macros |
| `proc-macro-error-attr` | `1.0.4` | Attribute macro for proc-macro-error crate |
| `proc-macro2` | `1.0.107` | A substitute implementation of the compiler's `proc_macro` API to decouple token |
| `quote` | `1.0.47` | Quasi-quoting macro quote!(...) |
| `ref-cast` | `1.0.27` | Safely cast &T to &U where the struct U contains a single field of type T. |
| `ref-cast-impl` | `1.0.27` | Derive implementation for ref_cast::RefCast. |
| `regex` | `1.13.1` | An implementation of regular expressions for Rust. This implementation uses
fini |
| `regex-automata` | `0.4.18` | Automata construction and matching using regular expressions. |
| `regex-syntax` | `0.8.11` | A regular expression parser. |
| `reqwest` | `0.13.5` | higher level HTTP client library |
| `rustc_version` | `0.4.1` | A library for querying the version of a installed rustc compiler |
| `rustversion` | `1.0.23` | Conditional compilation according to rustc compiler version |
| `scopeguard` | `1.2.0` | A RAII scope guard that will run a given closure when it goes out of scope,
even |
| `semver` | `1.0.28` | Parser and evaluator for Cargo's flavor of Semantic Versioning |
| `serde` | `1.0.229` | A generic serialization/deserialization framework |
| `serde_core` | `1.0.229` | Serde traits only, with no support for derive -- use the `serde` crate instead |
| `serde_derive` | `1.0.229` | Macros 1.1 implementation of #[derive(Serialize, Deserialize)] |
| `serde_derive_internals` | `0.29.1` | AST representation used by Serde derive macros. Unstable. |
| `serde_json` | `1.0.151` | A JSON serialization file format |
| `serde_repr` | `0.1.21` | Derive Serialize and Deserialize that delegates to the underlying repr of a C-li |
| `serde_spanned` | `0.6.9` | Serde-compatible spanned Value |
| `serde_spanned` | `1.1.1` | Serde-compatible spanned Value |
| `serde_with` | `3.23.0` | Custom de/serialization functions for Rust's serde |
| `serde_with_macros` | `3.23.0` | proc-macro library for serde_with |
| `serde-untagged` | `0.1.9` | Serde `Visitor` implementation for deserializing untagged enums |
| `serialize-to-javascript` | `0.1.2` | Serialize a serde::Serialize item to a JavaScript literal template using serde_j |
| `serialize-to-javascript-impl` | `0.1.2` | Implementation detail of `serialize-to-javascript` |
| `servo_arc` | `0.4.3` | A fork of std::sync::Arc with some extra functionality and without weak referenc |
| `sha2` | `0.10.9` | Pure Rust implementation of the SHA-2 hash function family
including SHA-224, SH |
| `shlex` | `2.0.1` | Split a string into shell words, like Python's shlex. |
| `signal-hook-registry` | `1.4.8` | Backend crate for signal-hook |
| `smallvec` | `1.16.1` | 'Small vector' optimization: store up to a small number of items on the stack |
| `socket2` | `0.6.5` | Utilities for handling networking sockets with a maximal amount of configuration |
| `softbuffer` | `0.4.8` | Cross-platform software buffer |
| `stable_deref_trait` | `1.2.1` | An unsafe marker trait for types like Box and Rc that dereference to a stable ad |
| `string_cache` | `0.9.0` | A string interning library for Rust, developed as part of the Servo project. |
| `string_cache_codegen` | `0.6.1` | A codegen library for string-cache, developed as part of the Servo project. |
| `swift-rs` | `1.0.8` | Call Swift from Rust with ease! |
| `syn` | `1.0.109` | Parser for Rust source code |
| `syn` | `2.0.119` | Parser for Rust source code |
| `syn` | `3.0.6` | Parser for Rust source code |
| `system-deps` | `6.2.2` | Discover and configure system dependencies from declarative dependencies in Carg |
| `tao-macros` | `0.1.4` | Proc macros for tao |
| `tempfile` | `3.27.0` | A library for managing temporary files and directories. |
| `tendril` | `0.5.1` | Compact buffer/string type for zero-copy parsing |
| `thiserror` | `1.0.69` | derive(Error) |
| `thiserror` | `2.0.20` | derive(Error) |
| `thiserror-impl` | `1.0.69` | Implementation detail of the `thiserror` crate |
| `thiserror-impl` | `2.0.20` | Implementation detail of the `thiserror` crate |
| `time` | `0.3.55` | Date and time library. Fully interoperable with the standard library. Mostly com |
| `time-core` | `0.1.9` | This crate is an implementation detail and should not be relied upon directly. |
| `time-macros` | `0.2.32` |     Procedural macros for the time crate.
    This crate is an implementation de |
| `toml` | `0.8.2` | A native Rust encoder and decoder of TOML-formatted files and streams. Provides
 |
| `toml` | `0.9.12+spec-1.1.0` | A native Rust encoder and decoder of TOML-formatted files and streams. Provides
 |
| `toml` | `1.1.6+spec-1.1.0` | A native Rust encoder and decoder of TOML-formatted files and streams. Provides
 |
| `toml_datetime` | `0.6.3` | A TOML-compatible datetime type |
| `toml_datetime` | `0.7.5+spec-1.1.0` | A TOML-compatible datetime type |
| `toml_datetime` | `1.1.1+spec-1.1.0` | A TOML-compatible datetime type |
| `toml_edit` | `0.19.15` | Yet another format-preserving TOML parser. |
| `toml_edit` | `0.20.2` | Yet another format-preserving TOML parser. |
| `toml_edit` | `0.25.15+spec-1.1.0` | Yet another format-preserving TOML parser. |
| `toml_parser` | `1.1.3+spec-1.1.0` | Yet another format-preserving TOML parser. |
| `toml_writer` | `1.1.2+spec-1.1.0` | A low-level interface for writing out TOML
 |
| `tray-icon` | `0.24.2` | Create tray icons for desktop applications |
| `typeid` | `1.0.3` | Const TypeId and non-'static TypeId |
| `typenum` | `1.20.1` | Typenum is a Rust library for type-level numbers evaluated at
    compile time.  |
| `unicode-segmentation` | `1.13.3` | This crate provides Grapheme Cluster, Word and Sentence boundaries
according to  |
| `url` | `2.5.8` | URL library for Rust, based on the WHATWG URL Standard |
| `wasm-bindgen` | `0.2.128` | Easy support for interacting between JS and Rust.
 |
| `wasm-bindgen-futures` | `0.4.78` | Bridging the gap between Rust Futures and JavaScript Promises |
| `wasm-bindgen-macro` | `0.2.128` | Definition of the `#[wasm_bindgen]` attribute, an internal dependency
 |
| `wasm-bindgen-macro-support` | `0.2.128` | Implementation APIs for the `#[wasm_bindgen]` attribute |
| `wasm-bindgen-shared` | `0.2.128` | Shared support between wasm-bindgen and wasm-bindgen cli, an internal
dependency |
| `wasm-streams` | `0.5.0` | Bridging between web streams and Rust streams using WebAssembly
 |
| `web_atoms` | `0.2.6` | Atoms for xml5ever and html5ever |
| `web-sys` | `0.3.105` | Bindings for all Web APIs, a procedurally generated crate from WebIDL
 |
| `windows` | `0.61.3` | Rust for Windows |
| `windows_aarch64_gnullvm` | `0.42.2` | Import lib for Windows |
| `windows_aarch64_gnullvm` | `0.52.6` | Import lib for Windows |
| `windows_aarch64_gnullvm` | `0.53.1` | Import lib for Windows |
| `windows_aarch64_msvc` | `0.42.2` | Import lib for Windows |
| `windows_aarch64_msvc` | `0.52.6` | Import lib for Windows |
| `windows_aarch64_msvc` | `0.53.1` | Import lib for Windows |
| `windows_i686_gnu` | `0.42.2` | Import lib for Windows |
| `windows_i686_gnu` | `0.52.6` | Import lib for Windows |
| `windows_i686_gnu` | `0.53.1` | Import lib for Windows |
| `windows_i686_gnullvm` | `0.52.6` | Import lib for Windows |
| `windows_i686_gnullvm` | `0.53.1` | Import lib for Windows |
| `windows_i686_msvc` | `0.42.2` | Import lib for Windows |
| `windows_i686_msvc` | `0.52.6` | Import lib for Windows |
| `windows_i686_msvc` | `0.53.1` | Import lib for Windows |
| `windows_x86_64_gnu` | `0.42.2` | Import lib for Windows |
| `windows_x86_64_gnu` | `0.52.6` | Import lib for Windows |
| `windows_x86_64_gnu` | `0.53.1` | Import lib for Windows |
| `windows_x86_64_gnullvm` | `0.42.2` | Import lib for Windows |
| `windows_x86_64_gnullvm` | `0.52.6` | Import lib for Windows |
| `windows_x86_64_gnullvm` | `0.53.1` | Import lib for Windows |
| `windows_x86_64_msvc` | `0.42.2` | Import lib for Windows |
| `windows_x86_64_msvc` | `0.52.6` | Import lib for Windows |
| `windows_x86_64_msvc` | `0.53.1` | Import lib for Windows |
| `windows-collections` | `0.2.0` | Windows collection types |
| `windows-core` | `0.61.2` | Core type support for COM and Windows |
| `windows-core` | `0.62.2` | Core type support for COM and Windows |
| `windows-future` | `0.2.1` | Windows async types |
| `windows-implement` | `0.60.2` | The implement macro for the Windows crates |
| `windows-interface` | `0.59.3` | The interface macro for the Windows crates |
| `windows-link` | `0.1.3` | Linking for Windows |
| `windows-link` | `0.2.1` | Linking for Windows |
| `windows-numerics` | `0.2.0` | Windows numeric types |
| `windows-result` | `0.3.4` | Windows error handling |
| `windows-result` | `0.4.1` | Windows error handling |
| `windows-strings` | `0.4.2` | Windows string types |
| `windows-strings` | `0.5.1` | Windows string types |
| `windows-sys` | `0.45.0` | Rust for Windows |
| `windows-sys` | `0.59.0` | Rust for Windows |
| `windows-sys` | `0.60.2` | Rust for Windows |
| `windows-sys` | `0.61.2` | Rust for Windows |
| `windows-targets` | `0.42.2` | Import libs for Windows |
| `windows-targets` | `0.52.6` | Import libs for Windows |
| `windows-targets` | `0.53.5` | Import libs for Windows |
| `windows-threading` | `0.1.0` | Windows threading |
| `windows-version` | `0.1.7` | Windows version information |

### MIT OR Apache-2.0 OR LGPL-2.1-or-later (2 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `r-efi` | `5.3.0` | UEFI Reference Specification Protocol Constants and Definitions |
| `r-efi` | `6.0.0` | UEFI Reference Specification Protocol Constants and Definitions |

### MIT OR Apache-2.0 OR Zlib (1 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `raw-window-handle` | `0.6.2` | Interoperability library for Rust Windowing applications. |

### MIT OR Zlib OR Apache-2.0 (2 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `miniz_oxide` | `0.8.9` | DEFLATE compression and decompression library rewritten in Rust based on miniz |
| `miniz_oxide` | `0.9.1` | DEFLATE compression and decompression library rewritten in Rust based on miniz |

### MIT/Apache-2.0 (18 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `bitflags` | `1.3.2` | A macro to generate structures which behave like bitflags.
 |
| `bs58` | `0.5.1` | Another Base58 codec implementation. |
| `foreign-types` | `0.5.0` | A framework for Rust wrappers over C APIs |
| `foreign-types-macros` | `0.2.4` | An internal crate used by foreign-types |
| `foreign-types-shared` | `0.3.1` | An internal crate used by foreign-types |
| `ident_case` | `1.0.1` | Utility for applying case rules to Rust identifiers. |
| `jni` | `0.21.1` | Rust bindings to the JNI |
| `json-patch` | `3.0.1` | RFC 6902, JavaScript Object Notation (JSON) Patch |
| `siphasher` | `1.0.3` | SipHash-2-4, SipHash-1-3 and 128-bit variants in pure Rust |
| `unic-char-property` | `0.9.0` | UNIC — Unicode Character Tools — Character Property taxonomy, contracts and buil |
| `unic-char-range` | `0.9.0` | UNIC — Unicode Character Tools — Character Range and Iteration |
| `unic-common` | `0.9.0` | UNIC — Common Utilities |
| `unic-ucd-ident` | `0.9.0` | UNIC — Unicode Character Database — Identifier Properties |
| `unic-ucd-version` | `0.9.0` | UNIC — Unicode Character Database — Version |
| `version_check` | `0.9.5` | Tiny crate to check the version of the installed/running rustc. |
| `winapi` | `0.3.9` | Raw FFI bindings for all of Windows API. |
| `winapi-i686-pc-windows-gnu` | `0.4.0` | Import libraries for the i686-pc-windows-gnu target. Please don't use this crate |
| `winapi-x86_64-pc-windows-gnu` | `0.4.0` | Import libraries for the x86_64-pc-windows-gnu target. Please don't use this cra |

### MPL-2.0 (5 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `cssparser` | `0.36.0` | Rust implementation of CSS Syntax Level 3 |
| `cssparser-macros` | `0.6.1` | Procedural macros for cssparser |
| `dtoa-short` | `0.3.5` | Serialize float number and truncate to certain precision |
| `option-ext` | `0.2.0` | Extends `Option` with additional operations |
| `selectors` | `0.36.1` | CSS Selectors matching for Rust |

### Unicode-3.0 (18 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `icu_collections` | `2.3.0` | Collection of API for use in ICU libraries. |
| `icu_locale_core` | `2.3.0` | API for managing Unicode Language and Locale Identifiers |
| `icu_normalizer` | `2.3.0` | API for normalizing text into Unicode Normalization Forms |
| `icu_normalizer_data` | `2.3.0` | Data for the icu_normalizer crate |
| `icu_properties` | `2.3.0` | Definitions for Unicode properties |
| `icu_properties_data` | `2.3.0` | Data for the icu_properties crate |
| `icu_provider` | `2.3.1` | Trait and struct definitions for the ICU data provider |
| `litemap` | `0.8.3` | A key-value Map implementation based on a flat, sorted Vec. |
| `potential_utf` | `0.1.6` | Unvalidated string and character types |
| `tinystr` | `0.8.4` | A small ASCII-only bounded length string representation. |
| `writeable` | `0.6.4` | A more efficient alternative to fmt::Display |
| `yoke` | `0.8.3` | Abstraction allowing borrowed data to be carried along with the backing data it  |
| `yoke-derive` | `0.8.3` | Custom derive for the yoke crate |
| `zerofrom` | `0.1.8` | ZeroFrom trait for constructing |
| `zerofrom-derive` | `0.1.8` | Custom derive for the zerofrom crate |
| `zerotrie` | `0.2.5` | A data structure that efficiently maps strings to integers |
| `zerovec` | `0.11.8` | Zero-copy vector backed by a byte array |
| `zerovec-derive` | `0.11.6` | Custom derive for the zerovec crate |

### Unlicense OR MIT (10 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `aho-corasick` | `1.1.5` | Fast multiple substring searching. |
| `byteorder` | `1.5.0` | Library for reading/writing numbers in big-endian and little-endian. |
| `byteorder-lite` | `0.1.0` | Library for reading/writing numbers in big-endian and little-endian. |
| `jiff` | `0.2.37` | A date-time library that encourages you to jump into the pit of success.

This l |
| `jiff-core` | `0.1.1` | Low level datetime primitives for the Jiff library. |
| `jiff-static` | `0.2.37` | Create static TimeZone values for Jiff (useful in core-only environments). |
| `jiff-tzdb` | `0.1.8` | The entire Time Zone Database embedded into your binary. |
| `jiff-tzdb-platform` | `0.1.3` | The entire Time Zone Database embedded into your binary for specific platforms.
 |
| `memchr` | `2.8.3` | Provides extremely fast (uses SIMD on x86_64, aarch64 and wasm32) routines for
1 |
| `winapi-util` | `0.1.11` | A dumping ground for high level safe wrappers over windows-sys. |

### Unlicense/MIT (2 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `same-file` | `1.0.6` | A simple crate for determining whether two file paths point to the same file.
 |
| `walkdir` | `2.5.0` | Recursively walk a directory. |

### Zlib (2 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `foldhash` | `0.2.0` | A fast, non-cryptographic, minimally DoS-resistant hashing algorithm. |
| `zlib-rs` | `0.6.8` | A memory-safe zlib implementation written in rust |

### Zlib OR Apache-2.0 OR MIT (17 crates)

| Crate | Version | Description |
| :--- | :--- | :--- |
| `bytemuck` | `1.25.2` | A crate for mucking around with piles of bytes. |
| `dispatch2` | `0.3.1` | Bindings and wrappers for Apple's Grand Central Dispatch (GCD) |
| `objc2-app-kit` | `0.3.2` | Bindings to the AppKit framework |
| `objc2-cloud-kit` | `0.3.2` | Bindings to the CloudKit framework |
| `objc2-core-data` | `0.3.2` | Bindings to the CoreData framework |
| `objc2-core-foundation` | `0.3.2` | Bindings to the CoreFoundation framework |
| `objc2-core-graphics` | `0.3.2` | Bindings to the CoreGraphics framework |
| `objc2-core-image` | `0.3.2` | Bindings to the CoreImage framework |
| `objc2-core-location` | `0.3.2` | Bindings to the CoreLocation framework |
| `objc2-core-text` | `0.3.2` | Bindings to the CoreText framework |
| `objc2-exception-helper` | `0.1.1` | External helper function for catching Objective-C exceptions |
| `objc2-io-surface` | `0.3.2` | Bindings to the IOSurface framework |
| `objc2-quartz-core` | `0.3.2` | Bindings to the QuartzCore/CoreAnimation framework |
| `objc2-ui-kit` | `0.3.2` | Bindings to the UIKit framework |
| `objc2-user-notifications` | `0.3.2` | Bindings to the UserNotifications framework |
| `objc2-web-kit` | `0.3.2` | Bindings to the WebKit framework |
| `tinyvec` | `1.13.3` | `tinyvec` provides 100% safe vec-like data structures. |

---

## 5. Standard License Texts

### 5.1 Apache License Version 2.0
```text
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work.

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner.

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work.
```

### 5.2 MIT License
```text
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 5.3 ISC License
```text
Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

### 5.4 3-Clause BSD License
```text
Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### 5.5 Blue Oak Model License 1.0.0
```text
Version 1.0.0 — https://blueoakcouncil.org/license/1.0.0

Purpose: This license gives everyone as much permission to work with this software
as possible, while protecting contributors from liability.

Agreement: In order to receive this license, you have to agree to its rules.
The rules of this license are both obligations under that agreement and conditions to
your license. You must not do anything with this software that triggers a rule you
cannot or will not follow.

Notices: Make sure everyone who gets a copy of any part of this software from you,
with or without changes, also gets the text of this license and the contributor notices.

Copyleft: None.

No Warranty: The software is provided "as is", without warranty of any kind.
Contributors won't be liable to anyone for any damages related to this software or this license.
```
