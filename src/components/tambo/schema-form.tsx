"use client";

import { useMemo, useState } from "react";
import { z } from "zod";
import { cn } from "@/lib/utils";
import {
  getSchemaVersionInfo,
  LEGACY_SCHEMA_VERSION,
  SUPPORTED_SCHEMA_MAJOR_VERSIONS,
} from "@/lib/schema-version";
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

const layoutTypeEnum = z.enum(["section", "stack", "row", "columns", "group"]);
const gapEnum = z.enum(["sm", "md", "lg"]).optional();

type Gap = z.infer<typeof gapEnum>;

const fieldNodeSchema = z.object({
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
});

type FieldNode = z.infer<typeof fieldNodeSchema>;

type SectionNode = {
  type: typeof layoutTypeEnum.Enum.section;
  id?: string;
  title?: string;
  description?: string;
  children: SchemaNode[];
  gap?: Gap;
};

type StackNode = {
  type: typeof layoutTypeEnum.Enum.stack;
  id?: string;
  children: SchemaNode[];
  gap?: Gap;
};

type RowNode = {
  type: typeof layoutTypeEnum.Enum.row;
  id?: string;
  columns?: number;
  children: SchemaNode[];
  gap?: Gap;
};

type ColumnsNode = {
  type: typeof layoutTypeEnum.Enum.columns;
  id?: string;
  columns: Array<{ id?: string; children: SchemaNode[] }>;
  gap?: Gap;
};

type GroupNode = {
  type: typeof layoutTypeEnum.Enum.group;
  id?: string;
  title?: string;
  description?: string;
  children: SchemaNode[];
  gap?: Gap;
};

type SchemaNode = FieldNode | SectionNode | StackNode | RowNode | ColumnsNode | GroupNode;

const schemaNodeSchema: z.ZodType<SchemaNode> = z.lazy(() =>
  z.union([
    fieldNodeSchema,
    z.object({
      type: z.literal(layoutTypeEnum.Enum.section),
      id: z.string().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      children: z.array(schemaNodeSchema).min(1),
      gap: gapEnum,
    }),
    z.object({
      type: z.literal(layoutTypeEnum.Enum.stack),
      id: z.string().optional(),
      children: z.array(schemaNodeSchema).min(1),
      gap: gapEnum,
    }),
    z.object({
      type: z.literal(layoutTypeEnum.Enum.row),
      id: z.string().optional(),
      columns: z.number().int().min(1).max(6).optional(),
      children: z.array(schemaNodeSchema).min(1),
      gap: gapEnum,
    }),
    z.object({
      type: z.literal(layoutTypeEnum.Enum.columns),
      id: z.string().optional(),
      columns: z
        .array(
          z.object({
            id: z.string().optional(),
            children: z.array(schemaNodeSchema).min(1),
          }),
        )
        .min(2)
        .max(6),
      gap: gapEnum,
    }),
    z.object({
      type: z.literal(layoutTypeEnum.Enum.group),
      id: z.string().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      children: z.array(schemaNodeSchema).min(1),
      gap: gapEnum,
    }),
  ]) as unknown as z.ZodType<SchemaNode>,
);

const fieldTypeSet = new Set<string>(fieldTypeEnum.options);

function isFieldNode(node: SchemaNode): node is FieldNode {
  return fieldTypeSet.has(node.type);
}

const actionSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: actionTypeEnum,
  style: actionStyleEnum,
});

const baseUiSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  actions: z.array(actionSchema).optional(),
});

const uiSchemaWithLayoutAndFields = baseUiSchema.extend({
  fields: z.array(fieldNodeSchema).min(1),
  layout: z.array(schemaNodeSchema).min(1),
});

const uiSchemaWithLayoutOnly = baseUiSchema.extend({
  layout: z.array(schemaNodeSchema).min(1),
  fields: z.undefined().optional(),
});

const uiSchemaWithFieldsOnly = baseUiSchema.extend({
  fields: z.array(fieldNodeSchema).min(1),
  layout: z.undefined().optional(),
});

const schemaVersionFieldSchema = z
  .string()
  .trim()
  .min(1)
  .describe(
    "Schema version. Recommended: '1'. If omitted, the renderer falls back to legacy mode (version '0'). Compatibility is validated by the renderer at runtime.",
  )
  .optional()
  .default(LEGACY_SCHEMA_VERSION);

export const schemaFormSchema = z.object({
  version: schemaVersionFieldSchema,
  uiSchema: z.union([uiSchemaWithLayoutAndFields, uiSchemaWithLayoutOnly, uiSchemaWithFieldsOnly]),
});

type SchemaFormProps = z.infer<typeof schemaFormSchema>;

const buildDefaults = (fields: FieldNode[]) => {
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

const getGapClass = (gap: Gap | undefined) => {
  switch (gap) {
    case "sm":
      return "gap-3";
    case "lg":
      return "gap-8";
    case "md":
    default:
      return "gap-6";
  }
};

function collectFieldNodes(nodes: SchemaNode[]): FieldNode[] {
  const fields: FieldNode[] = [];

  const visit = (node: SchemaNode) => {
    if (isFieldNode(node)) {
      fields.push(node);
      return;
    }

    if (node.type === "columns") {
      const columns = Array.isArray(node.columns) ? node.columns : [];
      columns.forEach((col) => {
        if (!Array.isArray(col.children)) return;
        col.children.forEach(visit);
      });
      return;
    }

    const children = Array.isArray(node.children) ? node.children : [];
    children.forEach(visit);
  };

  nodes.forEach(visit);
  return fields;
}

function getNodeKey(node: SchemaNode, fallback: string) {
  if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (typeof record.id === "string" && record.id.trim()) {
      return record.id;
    }
  }

  return fallback;
}

export function SchemaForm({ version, uiSchema }: SchemaFormProps) {
  const effectiveVersion = version?.trim() ? version : LEGACY_SCHEMA_VERSION;
  const versionInfo = getSchemaVersionInfo(effectiveVersion);
  const recommendedMajor = SUPPORTED_SCHEMA_MAJOR_VERSIONS[0];
  const showLegacyWarning =
    versionInfo.status === "legacy" && process.env.NODE_ENV !== "production";

  if (versionInfo.status === "invalid") {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Invalid schema version</CardTitle>
          <CardDescription>
            Expected a dot-separated numeric version (for example: 1 or 1.0.0).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-600 dark:text-red-400">
            Received version: <span className="font-mono">{JSON.stringify(versionInfo.raw)}</span>
          </p>
        </CardContent>
      </Card>
    );
  }

  if (versionInfo.status === "unsupported") {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Unsupported schema version</CardTitle>
          <CardDescription>
            This renderer supports major version{SUPPORTED_SCHEMA_MAJOR_VERSIONS.length === 1 ? "" : "s"} {SUPPORTED_SCHEMA_MAJOR_VERSIONS.join(", ")}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-600 dark:text-red-400">
            Received version: <span className="font-mono">{JSON.stringify(versionInfo.raw)}</span>
          </p>
        </CardContent>
      </Card>
    );
  }

  const nodes = useMemo<SchemaNode[]>(() => {
    if (uiSchema.layout?.length) {
      return uiSchema.layout;
    }

    if (uiSchema.fields?.length) {
      return [
        {
          type: "stack",
          id: "__implicit-stack__",
          children: uiSchema.fields,
          gap: "md",
        },
      ];
    }

    return [];
  }, [uiSchema.layout, uiSchema.fields]);

  if (nodes.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Schema error</CardTitle>
          <CardDescription>
            The UI schema does not define any renderable fields or layout nodes.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const fields = useMemo(() => collectFieldNodes(nodes), [nodes]);
  const defaultValues = useMemo(() => buildDefaults(fields), [fields]);
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

    fields.forEach((field) => {
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

  const renderNode = (node: SchemaNode, nodeIndex: number): React.ReactNode => {
    if (isFieldNode(node)) {
      const field = node;
      const error = errors[field.id];
      const value = formData[field.id];

      return (
        <div key={getNodeKey(node, `field-${nodeIndex}`)} className="space-y-2">
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
    }

    const nodeType = node.type;

    if (nodeType === "section") {
      const section = node as SectionNode;

      return (
        <section
          key={getNodeKey(node, `section-${nodeIndex}`)}
          className={cn("flex flex-col", getGapClass(section.gap))}
        >
          {(section.title || section.description) && (
            <div className="space-y-1">
              {section.title && <h3 className="text-sm font-semibold">{section.title}</h3>}
              {section.description && (
                <p className="text-xs text-muted-foreground">{section.description}</p>
              )}
            </div>
          )}
          <div className={cn("flex flex-col", getGapClass(section.gap))}>
            {section.children.map((child, childIndex) => renderNode(child, childIndex))}
          </div>
        </section>
      );
    }

    if (nodeType === "stack") {
      const stack = node as StackNode;

      return (
        <div
          key={getNodeKey(node, `stack-${nodeIndex}`)}
          className={cn("flex flex-col", getGapClass(stack.gap))}
        >
          {stack.children.map((child, childIndex) => renderNode(child, childIndex))}
        </div>
      );
    }

    if (nodeType === "row") {
      const row = node as RowNode;

      const childCount = row.children.length;
      const requestedColumns =
        typeof row.columns === "number" && row.columns > 0
          ? row.columns
          : Math.min(childCount || 1, 2);
      const columnCount = Math.min(requestedColumns, Math.max(childCount, 1));

      const rowKey = getNodeKey(node, `row-${nodeIndex}`);

      return (
        <div
          key={rowKey}
          className={cn("grid", getGapClass(row.gap))}
          style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
        >
          {row.children.map((child, childIndex) => (
            <div key={getNodeKey(child, `${rowKey}-child-${childIndex}`)}>
              {renderNode(child, childIndex)}
            </div>
          ))}
        </div>
      );
    }

    if (nodeType === "columns") {
      const columnsNode = node as ColumnsNode;

      const columnCount = columnsNode.columns.length;

      const columnsKey = getNodeKey(node, `columns-${nodeIndex}`);

      return (
        <div
          key={columnsKey}
          className={cn("grid", getGapClass(columnsNode.gap))}
          style={{ gridTemplateColumns: `repeat(${Math.max(columnCount, 1)}, minmax(0, 1fr))` }}
        >
          {columnsNode.columns.map((col, colIndex) => (
            <div
              key={col.id ?? `${columnsKey}-col-${colIndex}`}
              className={cn("flex flex-col", getGapClass(columnsNode.gap))}
            >
              {col.children.map((child, childIndex) => renderNode(child, childIndex))}
            </div>
          ))}
        </div>
      );
    }

    if (nodeType === "group") {
      const group = node as GroupNode;

      return (
        <div
          key={getNodeKey(node, `group-${nodeIndex}`)}
          className={cn(
            "rounded-lg border bg-muted/10 p-4 flex flex-col",
            getGapClass(group.gap),
          )}
        >
          {(group.title || group.description) && (
            <div className="space-y-1">
              {group.title && <h3 className="text-sm font-semibold">{group.title}</h3>}
              {group.description && (
                <p className="text-xs text-muted-foreground">{group.description}</p>
              )}
            </div>
          )}
          <div className={cn("flex flex-col", getGapClass(group.gap))}>
            {group.children.map((child, childIndex) => renderNode(child, childIndex))}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{uiSchema.title}</CardTitle>
        {uiSchema.description && (
          <CardDescription>{uiSchema.description}</CardDescription>
        )}
        {showLegacyWarning && (
          <CardDescription className="text-amber-700 dark:text-amber-400">
            Rendering in legacy schema mode (version <span className="font-mono">{effectiveVersion}</span>). To
            opt in to the current behavior, add a <span className="font-mono">"version"</span> field (for
            example: <span className="font-mono">"{recommendedMajor}"</span>).
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex flex-col gap-6">
            {nodes.map((node, nodeIndex) => renderNode(node, nodeIndex))}
          </div>

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
