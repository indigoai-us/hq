---
title: "Ophis pflag-to-JSON-Schema Type Mapping"
category: agent-tooling
tags: ["cli", "schema", "mcp", "go", "agent-orchestration"]
source: "https://github.com/njayp/ophis, https://github.com/njayp/ophis/blob/main/docs/schema.md"
confidence: 0.8
created_at: "2026-03-25T00:00:00Z"
updated_at: "2026-03-25T00:00:00Z"
---

Ophis maps pflag flag types to JSON Schema via an explicit type-switch — it does not introspect the Value interface.

## Primitive Mappings

| pflag type | JSON Schema type |
|------------|-----------------|
| `bool` | `boolean` |
| `int`, `int64`, `uint32`, … | `integer` |
| `float32`, `float64` | `number` |
| `string` | `string` |

## Collection Mappings

| pflag type | JSON Schema |
|------------|-------------|
| `stringSlice`, `stringArray` | `array` of `string` |
| `intSlice`, `int64Slice` | `array` of `integer` |
| `float32Slice`, `float64Slice` | `array` of `number` |
| `boolSlice` | `array` of `boolean` |
| `stringToString` | `object` with `string` values |
| `stringToInt`, `stringToInt64` | `object` with `integer` values |

## Custom / Network Types

These receive `string` type with regex pattern validation and descriptions:

- **`duration`** — string with Go duration pattern (`^-?([0-9]+...)+$`)
- **`ip`** — string with IPv4/IPv6 pattern
- **`ipNet`** — string with CIDR notation pattern
- **`bytesHex`** / **`bytesBase64`** — string with hex/base64 patterns

## Unknown Types — String Fallback

Any pflag type not in the explicit map falls back to `"string"` with a debug log (`slog`) noting the unmapped type. Ophis does **not** introspect the `pflag.Value` interface at runtime.

## Custom Schema Override via Annotations

For complex custom types, developers can bypass the type-switch entirely by attaching a `jsonschema` annotation to the flag:

1. Define a Go struct for the custom object
2. Generate its JSON Schema with `jsonschema.For[T]()`
3. Marshal and assign it to `flag.Annotations["jsonschema"]`

When this annotation is present, Ophis uses the provided schema verbatim instead of inferring from the pflag type string.

## Default Value Conversion

Ophis parses pflag string defaults into typed JSON values (via `strconv.Parse*` + `json.Marshal`). Arrays use `[item1,item2]` syntax; objects use `[key1=val1,key2=val2]`. Quoted strings containing commas are not supported; invalid elements produce `slog.Warn` rather than errors.
