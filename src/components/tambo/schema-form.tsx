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
import { useTamboThread } from "@tambo-ai/react";

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
  submitToAssistant: z.boolean().optional().default(true),
  submitMessage: z
    .string()
    .describe(
      "Optional message template sent to the assistant when the form is submitted successfully. Use {{json}} as a placeholder for the submitted JSON payload.",
    )
    .optional(),
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
          minLength: z.number().int().positive().optional(),
          maxLength: z.number().int().positive().optional(),
          pattern: z.string().optional(),
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

type FieldSuggestion = string | number | boolean;

type FieldValidation = {
  message: string;
  suggestions?: FieldSuggestion[];
};

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

const formatPath = (path: (string | number)[]) => {
  if (!path.length) return "(root)";

  return path
    .map((segment) => (typeof segment === "number" ? `[${segment}]` : segment))
    .join(".")
    .replace(/\.\[/g, "[");
};

const levenshtein = (a: string, b: string) => {
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
};

const closestOption = (value: unknown, options: readonly string[]) => {
  if (typeof value !== "string" || options.length === 0) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const ranked = options
    .map((option) => ({ option, score: levenshtein(normalized, option.toLowerCase()) }))
    .sort((a, b) => a.score - b.score);

  const best = ranked[0];
  if (!best) return null;

  // Heuristic: don't suggest if it's wildly different.
  if (best.score > Math.max(3, Math.floor(normalized.length / 2))) {
    return null;
  }

  return best.option;
};

const normalizeSubmissionValue = (field: Field, value: unknown) => {
  if (field.type === "checkbox") {
    return Boolean(value);
  }

  if (field.type === "number") {
    if (value === "" || value === undefined || value === null) return undefined;
    if (typeof value === "number" && !Number.isNaN(value)) return value;
    if (typeof value === "string") {
      const numeric = Number(value);
      return Number.isNaN(numeric) ? undefined : numeric;
    }
    return undefined;
  }

  const asString =
    typeof value === "string"
      ? value
      : value === undefined || value === null
        ? ""
        : String(value);
  const trimmed = asString.trim();
  if (trimmed === "") return undefined;
  return trimmed;
};

const validateFieldValue = (field: Field, value: unknown): FieldValidation | null => {
  const required = Boolean(field.required);
  const asTyped = value as string | number | boolean | undefined;

  if (required && isEmpty(asTyped)) {
    if (field.type === "select" && field.options?.length) {
      return { message: `${field.label} is required`, suggestions: field.options };
    }
    return { message: `${field.label} is required` };
  }

  if (!required && isEmpty(asTyped)) {
    return null;
  }

  if (field.type === "email") {
    const email = String(value ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return {
        message: `${field.label} must be a valid email address`,
        suggestions: ["name@example.com"],
      };
    }
  }

  if (field.type === "number") {
    const numeric = typeof value === "number" ? value : Number(String(value));
    if (Number.isNaN(numeric)) {
      const suggestions: FieldSuggestion[] = [];
      if (field.min !== undefined) suggestions.push(field.min);
      if (field.max !== undefined && field.max !== field.min) suggestions.push(field.max);
      return {
        message: `${field.label} must be a valid number`,
        suggestions: suggestions.length ? suggestions : undefined,
      };
    }
    if (field.min !== undefined && numeric < field.min) {
      return { message: `${field.label} must be at least ${field.min}`, suggestions: [field.min] };
    }
    if (field.max !== undefined && numeric > field.max) {
      return { message: `${field.label} must be at most ${field.max}`, suggestions: [field.max] };
    }
  }

  if (field.type === "select") {
    if (!field.options || field.options.length === 0) {
      return {
        message: `${field.label} is misconfigured: missing options[] for a select field`,
      };
    }
    const selection = String(value ?? "");
    if (!field.options.includes(selection)) {
      return {
        message: `${field.label} must be one of the available options`,
        suggestions: field.options,
      };
    }
  }

  if (field.type === "text" || field.type === "textarea" || field.type === "email") {
    const text = String(value ?? "");

    if (field.minLength !== undefined && text.length < field.minLength) {
      return { message: `${field.label} must be at least ${field.minLength} characters` };
    }

    if (field.maxLength !== undefined && text.length > field.maxLength) {
      return { message: `${field.label} must be at most ${field.maxLength} characters` };
    }

    if (field.pattern) {
      try {
        const regex = new RegExp(field.pattern);
        if (!regex.test(text)) {
          return { message: `${field.label} does not match the expected format` };
        }
      } catch {
        // Ignore invalid regex patterns.
      }
    }
  }

  return null;
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

export function SchemaForm(props: unknown) {
  const parsed = schemaFormSchema.safeParse(props);
  const { sendThreadMessage } = useTamboThread();

  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 8);
    const hasMore = parsed.error.issues.length > issues.length;

    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Schema error</CardTitle>
          <CardDescription>
            The schema for this form is invalid. Ask the assistant to adjust the schema and try again.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p className="font-medium">What went wrong</p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              {issues.map((issue, index) => {
                const path = formatPath(issue.path);
                const allowedRaw =
                  issue.code === z.ZodIssueCode.invalid_enum_value
                    ? (issue as z.ZodInvalidEnumValueIssue).options
                    : undefined;
                const allowed = allowedRaw?.map((option) => String(option));
                const received =
                  issue.code === z.ZodIssueCode.invalid_enum_value
                    ? (issue as z.ZodInvalidEnumValueIssue).received
                    : undefined;
                const suggestion = allowed ? closestOption(received, allowed) : null;
                const extra = allowed?.length ? ` (allowed: ${allowed.join(", ")})` : "";
                const hint = suggestion ? ` Try: ${suggestion}.` : "";

                return (
                  <li key={`${path}-${issue.code}-${index}`}>
                    <span className="font-mono text-xs">{path}</span>: {issue.message}
                    {extra}
                    {hint}
                  </li>
                );
              })}
            </ul>
            {hasMore && (
              <p className="mt-2 text-xs text-muted-foreground">
                Showing {issues.length} of {parsed.error.issues.length} issues.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const { uiSchema, submitToAssistant, submitMessage } = parsed.data;

  const defaultValues = useMemo(() => buildDefaults(uiSchema.fields), [uiSchema.fields]);
  const [formData, setFormData] = useState(defaultValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<Record<string, FieldSuggestion[]>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

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

    if (suggestions[id]) {
      setSuggestions((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    const nextSuggestions: Record<string, FieldSuggestion[]> = {};

    uiSchema.fields.forEach((field) => {
      const visibility = resolveVisibility(field.condition, field.fallback, evalContext);
      // `required` is enforced only when the field is visible and enabled.
      if (!visibility.shouldRender || visibility.disabled) return;

      const validation = validateFieldValue(field, formData[field.id]);
      if (!validation) return;

      nextErrors[field.id] = validation.message;
      if (validation.suggestions?.length) {
        nextSuggestions[field.id] = validation.suggestions;
      }
    });

    setErrors(nextErrors);
    setSuggestions(nextSuggestions);
    return Object.keys(nextErrors).length === 0;
  };

  const reset = () => {
    setFormData(defaultValues);
    setErrors({});
    setSuggestions({});
    setSubmitted(false);
    setSubmitStatus("idle");
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    setSubmitted(true);
    setSubmitStatus("idle");

    if (!submitToAssistant) return;

    const payload: Record<string, unknown> = {};
    uiSchema.fields.forEach((field) => {
      const visibility = resolveVisibility(field.condition, field.fallback, evalContext);
      if (!visibility.shouldRender || visibility.disabled) return;
      const normalized = normalizeSubmissionValue(field, formData[field.id]);
      if (normalized !== undefined) {
        payload[field.id] = normalized;
      }
    });

    const payloadJson = JSON.stringify(payload, null, 2);
    const defaultMessage = `Form submission (${uiSchema.title}):\n\n\`\`\`json\n${payloadJson}\n\`\`\``;
    const message = submitMessage?.includes("{{json}}")
      ? submitMessage.replace("{{json}}", payloadJson)
      : submitMessage ?? defaultMessage;

    setSubmitStatus("sending");
    Promise.resolve()
      .then(() => sendThreadMessage(message))
      .then(() => setSubmitStatus("sent"))
      .catch((error) => {
        console.warn("Failed to send form submission to assistant", error);
        setSubmitStatus("error");
      });
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
                    minLength={field.minLength}
                    maxLength={field.maxLength}
                    pattern={field.pattern}
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
                    minLength={field.minLength}
                    maxLength={field.maxLength}
                    pattern={field.pattern}
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
                    minLength={field.minLength}
                    maxLength={field.maxLength}
                    className={error ? "border-red-500" : ""}
                  />
                )}

                {field.type === "select" && (
                  <Select
                    id={field.id}
                    value={String(value ?? "")}
                    onChange={(event) => updateValue(field.id, event.target.value)}
                    disabled={disabled || !field.options?.length}
                    className={error ? "border-red-500" : ""}
                  >
                    <SelectValue placeholder={field.placeholder ?? `Select ${field.label.toLowerCase()}`} />
                    {field.options?.map((option, optionIndex) => (
                      <SelectItem key={`${field.id}-${option}-${optionIndex}`} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </Select>
                )}

                {field.type === "select" && (!field.options || field.options.length === 0) && (
                  <p className="text-xs text-red-500">
                    Schema error: select fields require an <span className="font-mono">options</span> array.
                  </p>
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

                {error && !disabled && (
                  <div className="space-y-2">
                    <p className="text-sm text-red-500">{error}</p>
                    {suggestions[field.id]?.length ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs text-muted-foreground">Try:</p>
                        {suggestions[field.id].map((suggestion, suggestionIndex) => (
                          <Button
                            key={`${field.id}-suggestion-${String(suggestion)}-${suggestionIndex}`}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => updateValue(field.id, suggestion)}
                          >
                            {String(suggestion)}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
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
              {submitToAssistant && submitStatus !== "idle" && (
                <p
                  className={
                    submitStatus === "sent"
                      ? "text-xs text-emerald-700"
                      : submitStatus === "sending"
                        ? "text-xs text-muted-foreground"
                        : "text-xs text-red-600"
                  }
                >
                  {submitStatus === "sending"
                    ? "Sending to assistant…"
                    : submitStatus === "sent"
                      ? "Sent to assistant."
                      : "Could not send to assistant (check console logs)."}
                </p>
              )}
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
