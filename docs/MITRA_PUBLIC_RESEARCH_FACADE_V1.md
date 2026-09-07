# Mitra Public Research Facade v1

**Status:** candidate contract  
**Frontend:** `apps/mitra-public`  
**Public route:** `POST /v1/mitra/public/search`  
**Persistence:** forbidden  
**Private client database access:** forbidden

## Purpose

Provide the browser-facing Mitra Public experience with a single read-only legal-research endpoint without exposing operational bearers, private-office routes, client context, or upstream credentials.

## Browser contract

Request:

```json
{
  "query": "responsabilidade civil médica",
  "limit": 8
}
```

Response:

```json
{
  "ok": true,
  "source": "Mitra Public Research",
  "results": [
    {
      "title": "string",
      "summary": "string",
      "source": "string",
      "source_url": "https://...",
      "citation": "string",
      "date": "string"
    }
  ],
  "confidence": "media",
  "legal_warning": "Pesquisa pública auxiliar; revisar profissionalmente.",
  "queried_at": "ISO-8601"
}
```

## Trust boundary

The public browser must never receive or send:

- Peterle Ops bearer;
- orchestrator bearer;
- DataJud API key;
- private client identifiers as an implicit context;
- private memory, documents, matters or client search results;
- cookies from the Mitra Office/private workspace.

The frontend request uses `credentials: omit` and sends only JSON content headers.

## Server-side upstream allowlist

A future gateway implementation may use only explicitly reviewed public/read-only capabilities, including:

1. `homosapiens-id/porta-juridica-publica` public legal-search routes, after HTTPS/readiness verification;
2. Peterle Ops jurimetrics as a server-side read-only dependency, with its bearer retained exclusively server-side.

Private routes such as client resolution, assistant private search, memory save and client runtime endpoints are outside this facade.

## Required server behavior

- HTTPS only outside localhost;
- strict query length and result limit;
- server-side timeout and controlled upstream errors;
- rate limiting before public activation;
- allowlisted CORS origins;
- source URL/citation normalization;
- no database writes;
- no persistence;
- no client creation;
- no memory save;
- no final legal conclusion;
- human/professional review warning retained;
- no secret material in logs or responses.

## Public origins to review

Preview:

`https://preview-apidevelopers.apidevelopers.digital`

Future production candidate:

`https://mitra.apidevelopers.digital`

Origin enablement remains a separate deployment/configuration action and is not authorized by this contract.

## Frontend configuration

`apps/mitra-public` reads:

```text
VITE_MITRA_PUBLIC_API_BASE_URL
```

When absent, the UI remains usable as a preview and explicitly reports that the server-side research integration is not active.

No bearer or secret is a valid Vite/browser environment variable for this feature.

## Acceptance gates

Before a live public connection:

1. facade implementation reviewed;
2. upstream HTTPS health verified;
3. CORS origin reviewed;
4. rate limit verified;
5. timeout/error behavior tested;
6. no-auth-header browser test green;
7. source/citation output inspected;
8. preview tested;
9. explicit approval before deployment/promotion.
