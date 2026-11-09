import Ajv from "ajv";
import addFormats from "ajv-formats";
import { createRequire } from "node:module";
import type { Pet3DManifest, ValidationError } from "./types.js";

const require = createRequire(import.meta.url);
const schema = require("../schemas/pet-3d.schema.json");

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);

const validateSchema = ajv.compile<Pet3DManifest>(schema);

export function validatePet3DManifest(data: unknown): {
  valid: boolean;
  errors: ValidationError[];
} {
  const valid = validateSchema(data);
  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors: ValidationError[] = (validateSchema.errors ?? []).map((err) => {
    let path = err.instancePath || "";
    if (err.keyword === "required" && err.params?.missingProperty) {
      path = path ? `${path}/${err.params.missingProperty}` : `/${err.params.missingProperty}`;
    } else if (err.keyword === "additionalProperties" && err.params?.additionalProperty) {
      path = path ? `${path}/${err.params.additionalProperty}` : `/${err.params.additionalProperty}`;
    }
    return {
      path,
      code: err.keyword,
      message: err.message ?? "validation error",
    };
  });

  return { valid: false, errors };
}