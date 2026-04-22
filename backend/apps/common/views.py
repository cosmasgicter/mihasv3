"""Common views."""

from django.http import HttpResponse
from django.views import View


class APIHomeView(View):
    """Public landing page for the deployed API domain."""

    def get(self, request):
        return HttpResponse(
            """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>MIHAS Admissions API</title>
    <style>
      :root {
        --bg: #f4efe5;
        --panel: rgba(255, 255, 255, 0.82);
        --ink: #1d2a33;
        --muted: #5c6b74;
        --accent: #bb4d00;
        --accent-soft: #ffe0c7;
        --line: rgba(29, 42, 51, 0.12);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Georgia", "Times New Roman", serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(187, 77, 0, 0.14), transparent 36%),
          radial-gradient(circle at bottom right, rgba(12, 96, 140, 0.14), transparent 28%),
          linear-gradient(135deg, #f7f3eb 0%, #efe7d8 100%);
      }
      main {
        max-width: 1100px;
        margin: 0 auto;
        padding: 56px 24px 72px;
      }
      .hero {
        display: grid;
        gap: 24px;
        margin-bottom: 28px;
      }
      .eyebrow {
        display: inline-block;
        padding: 6px 12px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font: 700 12px/1.2 Arial, sans-serif;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0;
        font-size: clamp(2.5rem, 5vw, 4.8rem);
        line-height: 0.95;
        letter-spacing: -0.04em;
      }
      .lede {
        max-width: 760px;
        font-size: 1.15rem;
        line-height: 1.7;
        color: var(--muted);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 16px;
        margin-top: 28px;
      }
      .meta {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin-top: 8px;
      }
      .meta-item {
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.6);
      }
      .meta-label {
        margin: 0 0 6px;
        color: var(--muted);
        font: 700 0.74rem/1.2 Arial, sans-serif;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .meta-value {
        margin: 0;
        font: 700 1rem/1.4 "Courier New", monospace;
        word-break: break-word;
      }
      .card {
        padding: 20px;
        border: 1px solid var(--line);
        border-radius: 20px;
        background: var(--panel);
        backdrop-filter: blur(8px);
        box-shadow: 0 10px 30px rgba(29, 42, 51, 0.06);
      }
      .card h2 {
        margin: 0 0 10px;
        font: 700 1rem/1.3 Arial, sans-serif;
        letter-spacing: 0.02em;
      }
      .card p {
        margin: 0 0 16px;
        color: var(--muted);
        line-height: 1.6;
      }
      a {
        color: var(--accent);
        text-decoration: none;
        font-weight: 700;
      }
      .quickstart {
        margin-top: 28px;
        padding: 24px;
        border: 1px solid var(--line);
        border-radius: 24px;
        background: rgba(29, 42, 51, 0.94);
        color: #f7f3eb;
        box-shadow: 0 20px 40px rgba(29, 42, 51, 0.14);
      }
      .quickstart h2 {
        margin: 0 0 12px;
        font: 700 1.05rem/1.3 Arial, sans-serif;
        letter-spacing: 0.02em;
      }
      .quickstart p {
        margin: 0 0 14px;
        color: rgba(247, 243, 235, 0.82);
        line-height: 1.6;
      }
      pre {
        margin: 0;
        overflow-x: auto;
        padding: 16px 18px;
        border-radius: 18px;
        background: rgba(7, 12, 16, 0.78);
        color: #f6d4bc;
        font: 500 0.92rem/1.6 "Courier New", monospace;
      }
      .footer {
        margin-top: 32px;
        color: var(--muted);
        font-size: 0.95rem;
      }
      @media (max-width: 700px) {
        main {
          padding-top: 40px;
          padding-bottom: 56px;
        }
        .quickstart {
          padding: 20px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <span class="eyebrow">Live Platform Surface</span>
        <h1>MIHAS Admissions API</h1>
        <p class="lede">
          This API powers a design-led admissions platform shaped for institutions that need
          trust, speed, and operational clarity. It reflects a builder who treats software as
          both infrastructure and experience: disciplined backend systems, sharp product flow,
          and documentation that is meant to be used, not ignored.
        </p>
        <div class="meta">
          <div class="meta-item">
            <p class="meta-label">Base URL</p>
            <p class="meta-value">api.mihas.edu.zm</p>
          </div>
          <div class="meta-item">
            <p class="meta-label">Frontend Surface</p>
            <p class="meta-value">apply.mihas.edu.zm</p>
          </div>
          <div class="meta-item">
            <p class="meta-label">Runtime</p>
            <p class="meta-value">Django ASGI on Uvicorn</p>
          </div>
          <div class="meta-item">
            <p class="meta-label">Auth Model</p>
            <p class="meta-value">JWT bearer or secure cookie</p>
          </div>
        </div>
      </section>
      <section class="grid">
        <article class="card">
          <h2>Swagger UI</h2>
          <p>Interactive reference for auth, applications, catalog, documents, payments, and admin workflows.</p>
          <a href="/api/v1/docs/">Open Swagger</a>
        </article>
        <article class="card">
          <h2>ReDoc</h2>
          <p>Readable long-form API documentation for teams reviewing contracts and integration details.</p>
          <a href="/api/v1/redoc/">Open ReDoc</a>
        </article>
        <article class="card">
          <h2>OpenAPI Schema</h2>
          <p>Machine-readable OpenAPI schema for client generation, audits, and contract validation.</p>
          <a href="/api/v1/schema/">View Schema</a>
        </article>
        <article class="card">
          <h2>Health Endpoints</h2>
          <p>Operational readiness and liveness probes for deployment verification and platform monitoring.</p>
          <a href="/health/ready/">Check Readiness</a>
        </article>
      </section>
      <section class="quickstart">
        <h2>Quickstart</h2>
        <p>
          Start with the schema if you are generating clients, or Swagger if you are testing flows
          manually. Protected endpoints accept either a bearer access token or the secure session
          cookie issued by the login endpoint.
        </p>
<pre>GET  /health/ready/
GET  /health/redis/
POST /api/v1/auth/login/
GET  /api/v1/applications/
GET  /api/v1/catalog/programs/</pre>
      </section>
      <p class="footer">
        Built for reliable admissions operations across MIHAS, KATC, Beanola-linked brands, and adjacent institutional platforms.
      </p>
    </main>
  </body>
</html>
""",
            content_type="text/html; charset=utf-8",
        )
