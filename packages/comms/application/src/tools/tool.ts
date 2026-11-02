import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import type { RuntimeTool, ToolOutcome } from '../ports/agent-runtime.outbound.port.js';

/** What a tool's work produces: its output for the model, and whether the turn pauses. */
export interface ToolResult {
  readonly output: Schema.Json;
  readonly pause?: boolean;
}

/** A refusal the model reads as a tool error, such as input that breaks a rule. */
export class ToolRefusal extends Data.TaggedError('ToolRefusal')<{
  readonly message: string;
}> {}

const isObject = (value: unknown): value is Schema.JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const enumOf = (property: unknown): ReadonlyArray<Schema.Json> =>
  isObject(property) && Array.isArray(property['enum']) ? property['enum'] : [];

/** Object schemas as one object: every property, the enums of a shared one joined. */
const mergeObjects = (variants: ReadonlyArray<Schema.JsonObject>): Schema.JsonObject => {
  const properties: Record<string, Schema.Json> = {};
  for (const variant of variants)
    for (const [key, property] of Object.entries(
      isObject(variant['properties']) ? variant['properties'] : {},
    )) {
      const seen = properties[key];
      const joined = [...new Set([...enumOf(seen), ...enumOf(property)])];
      properties[key] =
        seen !== undefined && isObject(seen) && joined.length > 0
          ? { ...seen, enum: joined }
          : (seen ?? property);
    }
  const requiredOf = (variant: Schema.JsonObject) =>
    Array.isArray(variant['required']) ? variant['required'] : [];
  const required = requiredOf(variants[0] ?? {}).filter((key) =>
    variants.every((variant) => requiredOf(variant).includes(key)),
  );
  return { type: 'object', properties, ...(required.length > 0 ? { required } : {}) };
};

/**
 * The parameters as every provider accepts them: an object schema with no union, enum or negation
 * at the top. An empty struct becomes an object without properties, and a union of objects one
 * object with all their properties; the tool still decodes its input with the exact schema.
 */
const asToolObject = (
  schema: Schema.JsonObject,
  definitions: Schema.JsonObject,
): Schema.JsonObject => {
  if (schema['type'] === 'object') return schema;
  const ref = schema['$ref'];
  if (typeof ref === 'string') {
    const definition = definitions[ref.replace('#/$defs/', '')];
    if (isObject(definition)) return asToolObject(definition, definitions);
  }
  // Effect writes a struct without fields as "anything but null".
  const not = schema['not'];
  if (isObject(not) && not['type'] === 'null' && Object.keys(schema).length === 1)
    return { type: 'object', properties: {} };
  const variants = schema['anyOf'] ?? schema['oneOf'];
  if (
    Array.isArray(variants) &&
    variants.every((variant) => isObject(variant) && variant['type'] === 'object')
  )
    return mergeObjects(variants.filter(isObject));
  throw new Error(`A tool's parameters must be an object schema: ${JSON.stringify(schema)}`);
};

/** The JSON Schema of a tool's parameters, its shared definitions inlined under `$defs`. */
const parametersOf = (schema: Schema.Top): Schema.JsonObject => {
  const document = Schema.toJsonSchemaDocument(schema);
  const definitions = document.definitions as Schema.JsonObject;
  return {
    ...asToolObject(document.schema as Schema.JsonObject, definitions),
    ...(Object.keys(definitions).length > 0 ? { $defs: definitions } : {}),
  };
};

/**
 * Defines a tool of the agent runtime. The input is decoded with `parameters`; an input that does not decode and
 * every `ToolRefusal` become a tool error the model can correct. Other failures are defects.
 */
export const defineTool = <S extends Schema.Top & { readonly DecodingServices: never }>(options: {
  readonly name: string;
  readonly description: string;
  readonly parameters: S;
  readonly run: (input: S['Type']) => Effect.Effect<ToolResult, ToolRefusal>;
}): RuntimeTool => ({
  name: options.name,
  description: options.description,
  parameters: parametersOf(options.parameters),
  run: (input) =>
    // Some models send no input at all for a tool without parameters.
    Schema.decodeUnknownEffect(options.parameters)(input ?? {}, { errors: 'all' }).pipe(
      Effect.mapError((error) => new ToolRefusal({ message: error.message })),
      Effect.flatMap(options.run),
      Effect.map(
        (result): ToolOutcome => ({
          output: result.output,
          isError: false,
          pause: result.pause ?? false,
        }),
      ),
      Effect.catchTag('ToolRefusal', (refusal) =>
        Effect.succeed<ToolOutcome>({ output: refusal.message, isError: true, pause: false }),
      ),
    ),
});
