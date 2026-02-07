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
        }),
      )
      .optional(),
  }),
});

type SchemaFormProps = z.infer<typeof schemaFormSchema>;

type Field = SchemaFormProps["uiSchema"]["fields"][number];

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

  const actions = uiSchema.actions?.length
    ? uiSchema.actions
    : [
        { id: "submit", label: "Submit", type: "submit", style: "primary" as const },
        { id: "reset", label: "Reset", type: "reset", style: "secondary" as const },
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
            const error = errors[field.id];
            const value = formData[field.id];

            return (
              <div key={field.id ?? `field-${fieldIndex}`} className="space-y-2">
                <Label htmlFor={field.id}>
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </Label>

                {field.type === "text" && (
                  <Input
                    id={field.id}
                    type="text"
                    value={String(value ?? "")}
                    placeholder={field.placeholder}
                    onChange={(event) => updateValue(field.id, event.target.value)}
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
                    className={error ? "border-red-500" : ""}
                  />
                )}

                {field.type === "select" && field.options && (
                  <Select
                    id={field.id}
                    value={String(value ?? "")}
                    onChange={(event) => updateValue(field.id, event.target.value)}
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
                    />
                    <label htmlFor={field.id} className="text-sm cursor-pointer text-muted-foreground">
                      {field.placeholder ?? "Check to confirm"}
                    </label>
                  </div>
                )}

                {error && <p className="text-sm text-red-500">{error}</p>}
              </div>
            );
          })}

          <div className="flex flex-wrap gap-2">
            {actions.map((action, actionIndex) => {
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
                  >
                    {action.label}
                  </Button>
                );
              }

              if (action.type === "button") {
                return (
                  <Button key={action.id ?? `action-${actionIndex}`} type="button" variant={variant}>
                    {action.label}
                  </Button>
                );
              }

              return (
                <Button key={action.id ?? `action-${actionIndex}`} type="submit" variant={variant}>
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
