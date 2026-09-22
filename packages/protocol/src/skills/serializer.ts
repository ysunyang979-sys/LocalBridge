import YAML from "yaml";
import { SkillYamlSchema, type SkillYamlInput } from "./schema.js";

export interface SkillManifestRoundTripResult {
  valid: boolean;
  yaml: string;
  data?: SkillYamlInput;
  errors: string[];
}

/**
 * Safely serialize a SkillDefinition / SkillYamlInput object to YAML using the official YAML serializer.
 * NEVER manually concatenate strings or use template literals.
 */
export function serializeSkillManifest(input: SkillYamlInput): string {
  return YAML.stringify(input, {
    indent: 2,
    lineWidth: 0,
    defaultStringType: "PLAIN",
    defaultKeyType: "PLAIN",
  });
}

/**
 * Round-trip validation:
 * Object -> Schema Validate -> YAML Serialize -> YAML Parse -> Re-Validate against SkillYamlSchema.
 * All stages must PASS for round-trip to be valid.
 */
export function validateSkillManifestRoundTrip(input: unknown): SkillManifestRoundTripResult {
  const errors: string[] = [];

  // Stage 1: Schema validate input object
  const schemaRes1 = SkillYamlSchema.safeParse(input);
  if (!schemaRes1.success) {
    for (const issue of schemaRes1.error.issues) {
      errors.push(`[Schema Input] ${issue.path.join(".")}: ${issue.message}`);
    }
    return {
      valid: false,
      yaml: "",
      errors,
    };
  }

  // Stage 2: YAML Serialize
  let yamlStr = "";
  try {
    yamlStr = serializeSkillManifest(schemaRes1.data);
  } catch (err: any) {
    errors.push(`[Serialization Error] Failed to serialize manifest to YAML: ${err.message}`);
    return {
      valid: false,
      yaml: "",
      errors,
    };
  }

  // Stage 3: YAML Parse
  let parsedBack: unknown;
  try {
    parsedBack = YAML.parse(yamlStr);
  } catch (err: any) {
    errors.push(`[YAML Parse Error] Round-trip parse failed: ${err.message}`);
    return {
      valid: false,
      yaml: yamlStr,
      errors,
    };
  }

  // Stage 4: Re-validate parsed YAML against Schema
  const schemaRes2 = SkillYamlSchema.safeParse(parsedBack);
  if (!schemaRes2.success) {
    for (const issue of schemaRes2.error.issues) {
      errors.push(`[Schema RoundTrip] ${issue.path.join(".")}: ${issue.message}`);
    }
    return {
      valid: false,
      yaml: yamlStr,
      errors,
    };
  }

  return {
    valid: true,
    yaml: yamlStr,
    data: schemaRes2.data,
    errors: [],
  };
}
