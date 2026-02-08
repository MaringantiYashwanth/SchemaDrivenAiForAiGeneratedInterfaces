"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useDebounce } from "use-debounce";
import { SchemaForm, schemaFormSchema } from "@/components/tambo/schema-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  isSupportedSchemaUrl,
  loadAndValidateJson,
  SchemaLoadError,
  type SchemaLoadErrorKind,
} from "@/lib/runtime-schema";

export const runtimeSchemaFormSchema = z.object({
  schemaUrl: z
    .string()
    .min(1)
    .refine(isSupportedSchemaUrl, {
      message: "schemaUrl must start with /, http://, or https://",
    })
    .describe(
      "URL to a JSON schema payload. Supports relative paths (e.g. /schemas/user-profile.json) and remote https:// endpoints. The response can be either a `uiSchema` object or `{ uiSchema: ... }`.",
    ),
});

type RuntimeSchemaFormProps = z.infer<typeof runtimeSchemaFormSchema>;
type SchemaFormProps = z.infer<typeof schemaFormSchema>;

type LoadState =
  | { status: "idle" }
  | { status: "loading"; url: string }
  | { status: "success"; url: string; data: SchemaFormProps }
  | {
      status: "error";
      url: string;
      kind?: SchemaLoadErrorKind;
      message: string;
      details?: string;
    };

const schemaFormRuntimePayloadSchema: z.ZodType<SchemaFormProps, z.ZodTypeDef, unknown> =
  z.preprocess((value) => {
    if (value && typeof value === "object" && "uiSchema" in value) {
      return value;
    }

    return { uiSchema: value };
  }, schemaFormSchema);

export function RuntimeSchemaForm(props: RuntimeSchemaFormProps) {
  const rawUrl = props.schemaUrl;
  const [debouncedUrl] = useDebounce(rawUrl, 250);
  const url = useMemo(() => debouncedUrl.trim(), [debouncedUrl]);

  const [state, setState] = useState<LoadState>(() => ({ status: "idle" }));
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!url) {
      setState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    setState({ status: "loading", url });

    loadAndValidateJson(url, schemaFormRuntimePayloadSchema, controller.signal)
      .then((data) => {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setState({ status: "success", url, data });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        if (error instanceof SchemaLoadError && error.kind === "aborted") {
          return;
        }

        if (requestId !== requestIdRef.current) {
          return;
        }

        const message =
          error instanceof SchemaLoadError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unknown error";
        const kind = error instanceof SchemaLoadError ? error.kind : undefined;
        const details = error instanceof SchemaLoadError ? error.details : undefined;

        if (process.env.NODE_ENV !== "production") {
          console.error("Failed to load schema", { url, error });
        }

        setState({ status: "error", url, kind, message, details });
      });

    return () => {
      controller.abort();
    };
  }, [url]);

  if (state.status === "idle") {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Schema loader</CardTitle>
          <CardDescription>Waiting for `schemaUrl`.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (state.status === "loading") {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Loading schema</CardTitle>
          <CardDescription className="break-words">{state.url}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (state.status === "error") {
    const showDetails = process.env.NODE_ENV !== "production" && state.details;

    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>
            {state.kind === "invalid-url" ? "Unsupported schema URL" : "Schema load failed"}
          </CardTitle>
          <CardDescription className="break-words">{state.url}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-red-600 dark:text-red-400">{state.message}</p>
          {showDetails && (
            <pre className="rounded-md bg-slate-900 p-3 text-xs text-slate-100 overflow-x-auto whitespace-pre-wrap">
              {state.details}
            </pre>
          )}
        </CardContent>
      </Card>
    );
  }

  return <SchemaForm uiSchema={state.data.uiSchema} />;
}
