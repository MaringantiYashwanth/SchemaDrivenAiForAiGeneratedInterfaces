"use client";

import { useMemo, useState } from "react";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectItem, SelectValue } from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { Button } from "../ui/button";

const fieldTypeEnum = z.enum(["text", "email", "number", "select", "checkbox", "textarea"]);
const actionTypeEnum = z.enum(["button", "submit", "reset"]);
const actionStyleEnum = z.enum(["primary", "secondary", "outline"]).optional();
const fallbackBehaviorEnum = z.enum(["hidden", "disabled"]);

type ConditionValue = string | number | boolean | null;

type Condition =
  | boolean
  | { op: "equals"; ref: string; value: ConditionValue }
  | { op: "notEquals"; ref: string; value: ConditionValue }
  | { op: "in"; ref: string; values: ConditionValue[] }
  | { op: "notIn"; ref: string; values: ConditionValue[] }
  | { op: "exists"; ref: string }
  | { op: "truthy"; ref: string }
  | { op: "falsy"; ref: string }
  | { op: "and"; conditions: Condition[] }
  | { op: "or"; conditions: Condition[] }
  | { op: "not"; condition: Condition };

type FallbackBehavior = z.infer<typeof fallbackBehaviorEnum>;

const conditionValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const conditionRefSchema = z
  .string()
  .describe("Reference to a form field id, or a context value like context.submitted")
  .refine((ref) => ref.startsWith("context.") || !ref.includes("."), {
    message: "Refs must be either a field id or start with context.",
  });

const conditionSchema: z.ZodType<Condition> = z.lazy(
  () =>
    z.union([
      z.boolean(),
      z.object({ op: z.literal("equals"), ref: conditionRefSchema, value: conditionValueSchema }),
      z.object({ op: z.literal("notEquals"), ref: conditionRefSchema, value: conditionValueSchema }),
      z.object({ op: z.literal("in"), ref: conditionRefSchema, values: z.array(conditionValueSchema).min(1) }),
      z.object({ op: z.literal("notIn"), ref: conditionRefSchema, values: z.array(conditionValueSchema).min(1) }),
      z.object({ op: z.literal("exists"), ref: conditionRefSchema }),
      z.object({ op: z.literal("truthy"), ref: conditionRefSchema }),
      z.object({ op: z.literal("falsy"), ref: conditionRefSchema }),
      z.object({ op: z.literal("and"), conditions: z.array(conditionSchema).min(1) }),
      z.object({ op: z.literal("or"), conditions: z.array(conditionSchema).min(1) }),
      z.object({ op: z.literal("not"), condition: conditionSchema }),
    ]),
);

export const schemaFormSchema = z.object({
  uiSchema: z.object({
    title: z.string(),
    description: z.string().optional(),
    fields: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          type: fieldTypeEnum,
          placeholder: z.string().optional(),
          required: z.boolean().optional(),
          options: z.array(z.string()).optional(),
          min: z.number().optional(),
          max: z.number().optional(),
          default: z.union([z.string(), z.number(), z.boolean()]).optional(),
          rows: z.number().optional(),
          condition: conditionSchema.optional(),
          fallback: fallbackBehaviorEnum.optional(),
        }),
      )
      .min(1),
    actions: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          type: actionTypeEnum,
          style: actionStyleEnum,
          condition: conditionSchema.optional(),
          fallback: fallbackBehaviorEnum.optional(),
        }),
      )
      .optional(),
  }),
});

type SchemaFormProps = z.infer<typeof schemaFormSchema>;

type Field = SchemaFormProps["uiSchema"]["fields"][number];
type Action = NonNullable<SchemaFormProps["uiSchema"]["actions"]>[number];

const buildDefaults = (fields: Field[]) => {
  const initial: Record<string, string | number | boolean> = {};
  fields.forEach((field) => {
    if (field.default !== undefined) {
      initial[field.id] = field.default;
      return;
    }

    if (field.type === "checkbox") {
      initial[field.id] = false;
      return;
    }

    initial[field.id] = "";
  });
  return initial;
};

const isEmpty = (value: string | number | boolean | undefined) => {
  if (value === undefined || value === null) return true;
  if (typeof value === "boolean") return !value;
  if (typeof value === "number") return Number.isNaN(value);
  return value.trim() === "";
};

type ConditionEvalContext = {
  values: Record<string, unknown>;
  context: Record<string, unknown>;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getRefValue = (ref: string, evalContext: ConditionEvalContext) => {
  if (ref.startsWith("context.")) {
    const key = ref.slice("context.".length);
    if (!(key in evalContext.context)) {
      console.warn(`Unknown context ref: ${ref}`);
    }
    return evalContext.context[key];
  }

  if (ref.includes(".")) {
    console.warn(
      `Unsupported nested ref: ${ref}; only field ids or context.* refs are supported.`,
    );
    return undefined;
  }

  if (!(ref in evalContext.values)) {
    console.warn(`Unknown field ref: ${ref}`);
  }

  return evalContext.values[ref];
};

const isDefinedForCondition = (value: unknown) => {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
};

const evaluateCondition = (condition: unknown, evalContext: ConditionEvalContext): boolean => {
  if (condition === undefined) return true;
  if (typeof condition === "boolean") return condition;

  if (!isPlainObject(condition)) {
    console.warn("Unsupported condition type; rendering element.", condition);
    return true;
  }

  const op = condition.op;
  if (typeof op !== "string") {
    console.warn("Condition missing op; rendering element.", condition);
    return true;
  }

  try {
    if (op === "equals") {
      if (typeof condition.ref !== "string" || condition.ref.trim() === "") {
        console.warn('Condition op "equals" requires a non-empty string ref; rendering element.', condition);
        return true;
      }
      return getRefValue(condition.ref, evalContext) === condition.value;
    }

    if (op === "notEquals") {
      if (typeof condition.ref !== "string" || condition.ref.trim() === "") {
        console.warn(
          'Condition op "notEquals" requires a non-empty string ref; rendering element.',
          condition,
        );
        return true;
      }
      return getRefValue(condition.ref, evalContext) !== condition.value;
    }

    if (op === "in") {
      if (typeof condition.ref !== "string" || condition.ref.trim() === "") {
        console.warn('Condition op "in" requires a non-empty string ref; rendering element.', condition);
        return true;
      }
      if (!Array.isArray(condition.values) || condition.values.length === 0) {
        console.warn('Condition op "in" requires a non-empty values array; rendering element.', condition);
        return true;
      }

      return condition.values.includes(getRefValue(condition.ref, evalContext));
    }

    if (op === "notIn") {
      if (typeof condition.ref !== "string" || condition.ref.trim() === "") {
        console.warn('Condition op "notIn" requires a non-empty string ref; rendering element.', condition);
        return true;
      }
      if (!Array.isArray(condition.values) || condition.values.length === 0) {
        console.warn('Condition op "notIn" requires a non-empty values array; rendering element.', condition);
        return true;
      }

      return !condition.values.includes(getRefValue(condition.ref, evalContext));
    }

    if (op === "exists") {
      if (typeof condition.ref !== "string" || condition.ref.trim() === "") {
        console.warn('Condition op "exists" requires a non-empty string ref; rendering element.', condition);
        return true;
      }
      return isDefinedForCondition(getRefValue(condition.ref, evalContext));
    }

    if (op === "truthy") {
      if (typeof condition.ref !== "string" || condition.ref.trim() === "") {
        console.warn('Condition op "truthy" requires a non-empty string ref; rendering element.', condition);
        return true;
      }
      return Boolean(getRefValue(condition.ref, evalContext));
    }

    if (op === "falsy") {
      if (typeof condition.ref !== "string" || condition.ref.trim() === "") {
        console.warn('Condition op "falsy" requires a non-empty string ref; rendering element.', condition);
        return true;
      }
      return !Boolean(getRefValue(condition.ref, evalContext));
    }

    if (op === "and") {
      if (!Array.isArray(condition.conditions) || condition.conditions.length === 0) {
        console.warn(
          'Condition op "and" requires a non-empty conditions array; rendering element.',
          condition,
        );
        return true;
      }

      return condition.conditions.every((child) => evaluateCondition(child, evalContext));
    }

    if (op === "or") {
      if (!Array.isArray(condition.conditions) || condition.conditions.length === 0) {
        console.warn(
          'Condition op "or" requires a non-empty conditions array; rendering element.',
          condition,
        );
        return true;
      }

      return condition.conditions.some((child) => evaluateCondition(child, evalContext));
    }

    if (op === "not") {
      if (condition.condition === undefined) {
        console.warn('Condition op "not" requires a nested condition; rendering element.', condition);
        return true;
      }

      return !evaluateCondition(condition.condition, evalContext);
    }

    console.warn(`Unsupported condition op: ${op}; rendering element.`, condition);
    return true;
  } catch (error) {
    console.warn("Failed to evaluate condition; rendering element.", { condition, error });
    return true;
  }
};

const resolveVisibility = (
  condition: Condition | undefined,
  fallback: FallbackBehavior | undefined,
  evalContext: ConditionEvalContext,
) => {
  const conditionMet = evaluateCondition(condition, evalContext);

  if (conditionMet) {
    return { shouldRender: true, disabled: false };
  }

  const fallbackBehavior: FallbackBehavior = fallback ?? "hidden";
  if (fallbackBehavior === "disabled") {
    return { shouldRender: true, disabled: true };
  }

  return { shouldRender: false, disabled: false };
};

export function SchemaForm({ uiSchema }: SchemaFormProps) {
  if (!uiSchema || !Array.isArray(uiSchema.fields)) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Schema error</CardTitle>
          <CardDescription>
            The UI schema is missing or invalid. Ask the assistant to generate a valid schema.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const defaultValues = useMemo(() => buildDefaults(uiSchema.fields), [uiSchema.fields]);
  const [formData, setFormData] = useState(defaultValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const evalContext = useMemo<ConditionEvalContext>(
    () => ({ values: formData, context: { submitted } }),
    [formData, submitted],
  );

  const updateValue = (id: string, value: string | number | boolean) => {
    setFormData((prev) => ({ ...prev, [id]: value }));
    if (errors[id]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const validate = () => {
    const nextErrors: Record<string, string> = {};

    uiSchema.fields.forEach((field) => {
      const visibility = resolveVisibility(field.condition, field.fallback, evalContext);
      // `required` is enforced only when the field is visible and enabled.
      if (!visibility.shouldRender || visibility.disabled) return;
      if (!field.required) return;
      if (isEmpty(formData[field.id])) {
        nextErrors[field.id] = `${field.label} is required`;
      }
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const reset = () => {
    setFormData(defaultValues);
    setErrors({});
    setSubmitted(false);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (validate()) {
      setSubmitted(true);
    }
  };

  const actions: Action[] = uiSchema.actions?.length
    ? uiSchema.actions
    : [
        { id: "submit", label: "Submit", type: "submit", style: "primary" },
        { id: "reset", label: "Reset", type: "reset", style: "secondary" },
      ];

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{uiSchema.title}</CardTitle>
        {uiSchema.description && (
          <CardDescription>{uiSchema.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {uiSchema.fields.map((field, fieldIndex) => {
            const visibility = resolveVisibility(field.condition, field.fallback, evalContext);
            if (!visibility.shouldRender) return null;

            const error = errors[field.id];
            const value = formData[field.id];
            const disabled = visibility.disabled;

            return (
              <div key={field.id ?? `field-${fieldIndex}`} className="space-y-2">
                <Label htmlFor={field.id}>
                  {field.label}
                  {field.required && !disabled && <span className="text-red-500 ml-1">*</span>}
                </Label>

                {field.type === "text" && (
                  <Input
                    id={field.id}
                    type="text"
                    value={String(value ?? "")}
                    placeholder={field.placeholder}
                    onChange={(event) => updateValue(field.id, event.target.value)}
                    disabled={disabled}
                    className={error ? "border-red-500" : ""}
                  />
                )}

                {field.type === "email" && (
                  <Input
                    id={field.id}
                    type="email"
                    value={String(value ?? "")}
                    placeholder={field.placeholder}
                    onChange={(event) => updateValue(field.id, event.target.value)}
                    disabled={disabled}
                    className={error ? "border-red-500" : ""}
                  />
                )}

                {field.type === "number" && (
                  <Input
                    id={field.id}
                    type="number"
                    value={String(value ?? "")}
                    placeholder={field.placeholder}
                    min={field.min}
                    max={field.max}
                    onChange={(event) =>
                      updateValue(field.id, event.target.value === "" ? "" : Number(event.target.value))
                    }
                    disabled={disabled}
                    className={error ? "border-red-500" : ""}
                  />
                )}

                {field.type === "textarea" && (
                  <Textarea
                    id={field.id}
                    value={String(value ?? "")}
                    placeholder={field.placeholder}
                    rows={field.rows ?? 4}
                    onChange={(event) => updateValue(field.id, event.target.value)}
                    disabled={disabled}
                    className={error ? "border-red-500" : ""}
                  />
                )}

                {field.type === "select" && field.options && (
                  <Select
                    id={field.id}
                    value={String(value ?? "")}
                    onChange={(event) => updateValue(field.id, event.target.value)}
                    disabled={disabled}
                    className={error ? "border-red-500" : ""}
                  >
                    <SelectValue placeholder={field.placeholder ?? `Select ${field.label.toLowerCase()}`} />
                    {field.options.map((option, optionIndex) => (
                      <SelectItem key={`${field.id}-${option}-${optionIndex}`} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </Select>
                )}

                {field.type === "checkbox" && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={field.id}
                      checked={Boolean(value)}
                      onChange={(event) => updateValue(field.id, event.target.checked)}
                      disabled={disabled}
                    />
                    <label htmlFor={field.id} className="text-sm cursor-pointer text-muted-foreground">
                      {field.placeholder ?? "Check to confirm"}
                    </label>
                  </div>
                )}

                {error && !disabled && <p className="text-sm text-red-500">{error}</p>}
              </div>
            );
          })}

          <div className="flex flex-wrap gap-2">
            {actions.map((action, actionIndex) => {
              const visibility = resolveVisibility(action.condition, action.fallback, evalContext);
              if (!visibility.shouldRender) return null;

              const variant =
                action.style === "secondary"
                  ? "secondary"
                  : action.style === "outline"
                  ? "outline"
                  : "default";

              if (action.type === "reset") {
                return (
                  <Button
                    key={action.id ?? `action-${actionIndex}`}
                    type="button"
                    variant={variant}
                    onClick={reset}
                    disabled={visibility.disabled}
                  >
                    {action.label}
                  </Button>
                );
              }

              if (action.type === "button") {
                return (
                  <Button
                    key={action.id ?? `action-${actionIndex}`}
                    type="button"
                    variant={variant}
                    disabled={visibility.disabled}
                  >
                    {action.label}
                  </Button>
                );
              }

              return (
                <Button
                  key={action.id ?? `action-${actionIndex}`}
                  type="submit"
                  variant={variant}
                  disabled={visibility.disabled}
                >
                  {action.label}
                </Button>
              );
            })}
          </div>
        </form>

        {submitted && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-emerald-600">Submission captured</p>
              <p className="text-xs text-muted-foreground">Review the collected data below.</p>
            </div>
            <pre className="rounded-md bg-background p-3 text-xs overflow-x-auto">
              {JSON.stringify(formData, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
