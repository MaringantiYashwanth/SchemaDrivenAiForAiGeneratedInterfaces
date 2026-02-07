# Schema-Driven UI for AI-Generated Interfaces

A full‑stack Next.js + Tambo application that turns natural language into schema‑driven interfaces. The assistant generates JSON schemas, and the UI renders them instantly as interactive forms.

## Highlights
- Schema‑driven form rendering with Zod validation.
- Tambo LLM chat + rendered component panel on the same page.
- Dark mode with persistent toggle.
- Clean, minimal project surface focused on schema UI.

## Architecture
- Tambo handles the LLM conversation and renders `SchemaForm`.
- `SchemaForm` consumes a JSON schema and produces UI.
- The latest generated component is surfaced in a right‑side panel.

## Quick Start
1. Install deps:
   ```bash
   npm install

2. Create .env.local and add your Tambo API key:
   ```bash
   NEXT_PUBLIC_TAMBO_API_KEY=your_key_here
3. Run the dev server:
   ```bash
   npm run dev
4. Open http://localhost:3000.

5. Environment Variables
NEXT_PUBLIC_TAMBO_API_KEY required.

NEXT_PUBLIC_TAMBO_URL optional if you host Tambo server yourself.

How To Use
Open /.

Ask the assistant to generate a schema‑driven form.

The rendered UI appears on the right.
 ## Example Prompt
   Create a schema-driven form for a user profile. Include name, email, age (18-99), gender select, and a newsletter checkbox. Add submit and reset actions.
```bash

Schema Shape
The renderer expects:
   {
  "uiSchema": {
    "title": "User Profile Form",
    "description": "Schema-driven UI for collecting user details",
    "fields": [
      {
        "id": "name",
        "label": "Full Name",
        "type": "text",
        "placeholder": "Enter your name",
        "required": true
      }
    ],
    "actions": [
      {
        "id": "submit",
        "label": "Submit",
        "type": "button",
        "style": "primary"
      }
    ]
  }
}
Key Files
src/components/tambo/schema-form.tsx schema renderer

src/lib/tambo.ts component registration

src/app/(protected)/page.tsx main UI page

src/components/theme-toggle.tsx dark mode toggle

Auth Status
Authentication is currently disabled (temporarily stubbed). The app loads directly on /.

Troubleshooting
If you see Turbopack alias errors, ensure aliases are set in next.config.ts.

If you want to disable Turbopack:
   ```bash
   NEXT_DISABLE_TURBOPACK=1 npm run dev
License
MIT
