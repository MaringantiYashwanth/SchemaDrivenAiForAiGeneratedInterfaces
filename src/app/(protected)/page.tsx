"use client";

import { MessageThreadFull } from "@/components/tambo/message-thread-full";
import { useMcpServers } from "@/components/tambo/mcp-config-modal";
import { components, tools } from "@/lib/tambo";
import { TamboProvider, useTambo } from "@tambo-ai/react";

function RenderedComponentPanel() {
  const { thread } = useTambo();
  const latest = thread?.messages[thread.messages.length - 1]?.renderedComponent;

  if (!latest) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
        Ask Tambo to generate a schema-driven form. The rendered UI will appear here.
      </div>
    );
  }

  return <div className="rounded-xl border p-6 bg-white shadow-sm dark:bg-slate-900">{latest}</div>;
}

export default function Home() {
  const mcpServers = useMcpServers();

  return (
    <TamboProvider
      apiKey={process.env.NEXT_PUBLIC_TAMBO_API_KEY!}
      components={components}
      tools={tools}
      tamboUrl={process.env.NEXT_PUBLIC_TAMBO_URL}
      mcpServers={mcpServers}
    >
      <div className="min-h-[calc(100vh-72px)] bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10">
          <header className="space-y-3">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Schema-driven UI
            </p>
            <h1 className="text-4xl font-semibold">
              Generate interfaces from JSON schemas using Tambo
            </h1>
            <p className="max-w-2xl text-slate-600 dark:text-slate-300">
              Prompt the assistant to create or refine a UI schema. The generated
              form will render instantly below.
            </p>
          </header>

          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-xl border bg-white shadow-sm dark:bg-slate-900">
              <MessageThreadFull className="min-h-[520px]" />
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border bg-white p-5 shadow-sm dark:bg-slate-900">
                <h2 className="text-lg font-semibold">Try this prompt</h2>
                <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-900 p-4 text-xs text-slate-100">
{`Create a schema-driven form for a user profile. Include name, email, age (18-99), gender select, and a newsletter checkbox. Add submit and reset actions.`}
                </pre>
              </div>
              <RenderedComponentPanel />
            </div>
          </section>
        </div>
      </div>
    </TamboProvider>
  );
}
