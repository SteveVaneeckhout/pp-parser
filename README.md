# pp-parser

> Parse and analyze HTTP `Permissions-Policy` headers: one function call, ESM, no runtime dependencies.

`pp-parser` takes a raw `Permissions-Policy` header value. It returns the features with the allowlist a browser would end up with, plus lists of errors and warnings. It does not fetch URLs or enforce policies. It is a static analyzer for CI checks, devtools panels and security review scripts.
Made with Claude.ai

## Install

```bash
npm install pp-parser
```

Requires Node.js **26.13** or newer (ESM only).

## Quick start

```ts
import { parse } from "pp-parser";

const { features, ignoredByBrowsers, errors, warnings } = parse(
  'camera=(), geolocation=(self "https://maps.example.com"), fullscreen=*, interest-cohort=()',
);

console.log(features.map((f) => [f.name, f.allowlist, f.self, f.origins]));
// [
//   ["camera", "none", false, []],
//   ["geolocation", "list", true, ["https://maps.example.com"]],
//   ["fullscreen", "all", false, []],
//   ["interest-cohort", "none", false, []],
// ]

console.log(ignoredByBrowsers); // false
console.log(warnings.map((w) => w.code)); // ["obsolete-feature"]
```

## The header format

`Permissions-Policy` is an [RFC 9651](https://www.rfc-editor.org/rfc/rfc9651) Structured Field **dictionary**. Each member is a feature name, `=`, and an allowlist:

| Allowlist                    | Means                              |
| ---------------------------- | ---------------------------------- |
| `()`                         | Disabled everywhere                |
| `self` or `(self)`           | This origin only                   |
| `*` or `(*)`                 | Every origin                       |
| `(self "https://a.example")` | This origin and the listed origins |
| `("https://*.example.com")`  | Any subdomain of example.com       |

Features are separated by `,`. Origins are strings in double quotes. `self` and `*` are tokens without quotes. A feature can carry a `report-to` parameter that names a reporting endpoint: `camera=();report-to=main`.

If the value is not a valid dictionary, browsers **ignore the whole header**. A single `'self'` in quotes, a `;` between features or a missing comma is enough. `parse()` reports this as `syntax-error` and sets `ignoredByBrowsers: true`. It then parses each member on its own, so the result still lists the features and explains each mistake.

If a response carries more than one `Permissions-Policy` header, join their values with `", "` before calling `parse()`, as HTTP does.

## API

### `parse(input: string): ParseResult`

```ts
interface ParseResult {
  readonly features: readonly ParsedFeature[]; // header order; a repeated feature takes its last value
  readonly ignoredByBrowsers: boolean; // true when the header isn't a valid Structured Field dictionary
  readonly errors: readonly Issue[];
  readonly warnings: readonly Issue[];
}

interface ParsedFeature {
  readonly name: string;
  readonly status:
    | "standard"
    | "proposed"
    | "experimental"
    | "client-hint"
    | "obsolete"
    | "unknown";
  readonly raw: string; // the member as written
  readonly position: number; // offset into the input
  readonly allowlist: "none" | "all" | "list"; // what a browser ends up with
  readonly self: boolean;
  readonly origins: readonly string[]; // serialized origins besides self, e.g. "https://*.example.com"
  readonly members: readonly ParsedAllowlistMember[];
  readonly reportTo?: string; // the report-to parameter
}

interface ParsedAllowlistMember {
  readonly raw: string;
  readonly kind: "all" | "self" | "src" | "origin" | "invalid";
  readonly origin?: string; // when kind === "origin"
  readonly wildcard?: boolean; // when kind === "origin" and it is "https://*.example.com"
}

interface Issue {
  readonly code: IssueCode;
  readonly level: "error" | "warning";
  readonly message: string;
  readonly feature?: string;
  readonly member?: string;
  readonly position?: number; // offset into the input
}
```

`errors` are things browsers reject or ignore: the whole header, a feature or an allowlist member. `warnings` are things that work but probably don't do what was meant.

## Issue reference

### Errors

| Code                       | Trigger                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `empty-input`              | The header is empty or whitespace-only.                                                                                                                                         |
| `invalid-characters`       | The header contains non-ASCII or control characters (a line break gets its own message).                                                                                        |
| `syntax-error`             | The value is not a valid Structured Field dictionary, so browsers ignore the whole header. It includes the position and reason.                                                 |
| `unknown-feature`          | The feature name is not known. Browsers skip it. The message suggests the probable name (`camara` → `camera`, `xr_spatial_tracking` → `xr-spatial-tracking`, `dpr` → `ch-dpr`). |
| `semicolon-separator`      | A `;` separates features. When the header still parses, the feature after the `;` is silently read as a parameter (`camera=(); microphone=*`).                                  |
| `invalid-allowlist-member` | A token other than `*`, `self` or `src` (such as `none`), or a number or Boolean.                                                                                               |
| `invalid-origin`           | A string that is not an origin: no scheme, an opaque origin (`data:`), a misplaced wildcard, or a keyword in quotes (`"self"`).                                                 |
| `src-in-header`            | `src` only means something in an iframe `allow` attribute.                                                                                                                      |

When the header fails to parse, these errors explain why. Each one points at a member:

| Code                       | Trigger                                                                      |
| -------------------------- | ---------------------------------------------------------------------------- |
| `feature-policy-syntax`    | Feature-Policy syntax: `camera 'none'; microphone 'none'`.                   |
| `quoted-keyword`           | `'self'`, `'none'`, `'src'` or `'*'` in single quotes.                       |
| `unquoted-origin`          | An origin without quotes, or in single quotes.                               |
| `missing-comma`            | Two features separated by whitespace only.                                   |
| `missing-parentheses`      | Several allowlist members without `( )`: `camera=self "https://a"`.          |
| `missing-equals`           | `camera()` instead of `camera=()`.                                           |
| `whitespace-around-equals` | `camera =()` or `camera= ()`.                                                |
| `invalid-feature-name`     | Uppercase or other characters that a key can't have (`Camera`, `Sec-CH-UA`). |
| `empty-member`             | A `,` with nothing before or after it.                                       |
| `header-name-in-value`     | The value starts with `Permissions-Policy:`.                                 |
| `quoted-value`             | The whole value is wrapped in double quotes.                                 |

### Warnings

| Code                         | Trigger                                                                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `obsolete-feature`           | The feature was renamed (`vr`, `wake-lock`, `window-placement` …) or removed (`interest-cohort`, `document-domain`, the Privacy Sandbox features …). |
| `duplicate-feature`          | A feature appears more than once. The last occurrence wins (unlike CSP, where the first wins).                                                       |
| `missing-allowlist`          | A bare `camera` reads as the Boolean `true`, which leaves an empty allowlist: the feature is disabled.                                               |
| `wildcard-allowlist`         | `*` on a powerful feature (camera, microphone, geolocation, payment, usb …), so any embedded frame can ask for it.                                   |
| `redundant-allowlist-member` | `*` next to other members, or a member listed twice.                                                                                                 |
| `origin-has-path`            | An origin with a path, query or fragment. Only the origin is used.                                                                                   |
| `insecure-origin`            | An `http://` origin.                                                                                                                                 |
| `unknown-parameter`          | A parameter other than `report-to`, or any parameter on an allowlist member.                                                                         |
| `invalid-report-to`          | `report-to` is not a token or string.                                                                                                                |

## Examples

A well-formed policy:

```ts
parse('camera=(), microphone=(), geolocation=(self "https://maps.example.com")');
// → no errors, no warnings
```

A policy that browsers ignore:

```ts
const result = parse("camera=(), geolocation=('self'), microphone=()");
// result.ignoredByBrowsers → true
// errors: syntax-error, quoted-keyword
// features: camera, microphone (recovered; geolocation can't be read)
```

## What the parser does _not_ do

- It does **not** parse the legacy `Feature-Policy` header or the iframe `allow` attribute. Feature-Policy syntax inside a Permissions-Policy header is detected and reported.
- It does **not** check that a `report-to` endpoint is defined in a `Reporting-Endpoints` header.
- It does **not** know the page's own origin, so it can't tell when a listed origin equals `self`.
- The feature list is hand-curated in `src/vocabulary.ts`, from the W3C registry and Chromium's feature list. New features may need a vocabulary update.

## Development

```bash
npm run typecheck      # tsc --noEmit
npm run test           # vitest run
npm run test:coverage  # vitest run --coverage (100% required)
npm run build          # tsc
npm run fmt            # oxfmt
npm run lint           # oxlint
```

## License

MIT
