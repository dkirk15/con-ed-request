---
name: OpenAPI integer query validation
description: Preserve integer-only runtime validation when OpenAPI query parameters are generated into Zod schemas.
---

For query parameters declared as OpenAPI integers, include `multipleOf: 1` when the generated Zod schema must reject fractional input. Orval emits `.multipleOf(1)` from that constraint; `type: integer` and `format: int32` alone may still generate only `zod.number()`.

**Why:** The API generator's TypeScript type remains `number`, and its default Zod output can accept fractional values unless an explicit numeric constraint is present. Those values can reach date and range calculations.

**How to apply:** Add the constraint in the OpenAPI source, regenerate all clients, and verify the generated Zod schema includes `.multipleOf(1)` rather than editing generated files by hand.