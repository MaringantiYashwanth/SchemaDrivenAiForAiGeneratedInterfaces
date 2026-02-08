/**
 * @file tambo.ts
 * @description Central configuration file for Tambo components and tools
 *
 * This file serves as the central place to register your Tambo components and tools.
 * It exports arrays that will be used by the TamboProvider.
 *
 * Read more about Tambo at https://tambo.co/docs
 */

import { SchemaForm, schemaFormSchema } from "@/components/tambo/schema-form";
import {
  RuntimeSchemaForm,
  runtimeSchemaFormSchema,
} from "@/components/tambo/runtime-schema-form";
import type { TamboComponent } from "@tambo-ai/react";
import { TamboTool } from "@tambo-ai/react";

/**
 * tools
 *
 * This array contains all the Tambo tools that are registered for use within the application.
 * Each tool is defined with its name, description, and expected props. The tools
 * can be controlled by AI to dynamically fetch data based on user interactions.
 */

export const tools: TamboTool[] = [];

/**
 * components
 *
 * This array contains all the Tambo components that are registered for use within the application.
 * Each component is defined with its name, description, and expected props. The components
 * can be controlled by AI to dynamically render UI elements based on user interactions.
 */
export const components: TamboComponent[] = [
  {
    name: "SchemaForm",
    description:
      "Schema-driven form renderer. Use this to generate full forms from JSON schema definitions.",
    component: SchemaForm,
    propsSchema: schemaFormSchema,
  },
  {
    name: "RuntimeSchemaForm",
    description:
      "Loads a schema JSON payload at runtime (URL) and validates it before rendering SchemaForm.",
    component: RuntimeSchemaForm,
    propsSchema: runtimeSchemaFormSchema,
  },
];
