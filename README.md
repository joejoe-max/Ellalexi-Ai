# EllaLexi AI

**Understand Before You Agree.**

EllaLexi AI is a Nigerian legal document intelligence application designed to help people understand the documents they are considering signing. It explains document language, surfaces evidence-backed questions and helps users identify matters that may need qualified legal review. It is not a law firm and does not replace a Nigerian legal practitioner.

## Stack

- React + Vite (JavaScript)
- Tailwind CSS
- Vercel hosting and serverless functions
- Gemini 2.5 Flash (server-side integration, introduced in a later stage)
- Gemini File Search for an approved Nigerian legal knowledge base (later stage)

## Development

Requirements: Node.js 20.19+ or 22.12+, npm.

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## Project status

Stage 1 — Foundation and project setup.

## Product principles

- No user accounts in the MVP.
- Uploaded user documents are processed temporarily; they are not added to the persistent legal knowledge base.
- API keys and privileged operations stay server-side.
- Findings must be grounded in source text and clearly distinguish document wording, legal sources, inference and uncertainty.
- The product explains; it does not tell users whether to sign.
- Important or uncertain matters should be reviewed by a qualified Nigerian legal practitioner.

## Privacy and security

Do not commit API keys, uploaded legal documents, personal data, local environment files or deployment credentials. Copy `.env.example` to `.env.local` for local configuration when later stages introduce server-side integrations.
