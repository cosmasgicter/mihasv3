# Zero-Unclassified-Route Report — Admissions V2 task 0.3

Total backend endpoints enumerated: **185**  
Classified: **185**  
Unclassified: **0**  
Zero-unclassified invariant: **PASS**

Every enumerated endpoint is assigned exactly one authority class by the deterministic classifier in `scripts/inventory_admissions_v2.py` (`classify_endpoint`). The classifier is total: an endpoint that matched no rule would be reported as `unclassified` and fail this gate.

## Classification breakdown

| Authority class | Count | Kind |
| --- | --- | --- |
| `api_docs` | 3 | infra/meta |
| `api_root` | 1 | infra/meta |
| `authenticated` | 60 | weak bucket — authority-matrix assignment pending (task 2.1) |
| `django_admin` | 1 | infra/meta |
| `health` | 3 | infra/meta |
| `internal_callback` | 5 | design §5.2 target-7 |
| `owner` | 12 | design §5.2 target-7 |
| `platform_capability` | 19 | design §5.2 target-7 |
| `public` | 18 | design §5.2 target-7 |
| `tenant_capability` | 63 | design §5.2 target-7 |

- Endpoints in a design §5.2 target authority class: **117**
- Endpoints in the weak `authenticated` bucket (need explicit authority-matrix assignment in task 2.1): **60**
- Infra/meta endpoints (health, docs, admin, root): **8**

## Unclassified endpoints

None. Every endpoint is classified.

## Authority-risk summary (feeds AUTH-02)

Endpoints whose authority is decided by a raw role string rather than the capability service, and mutations without idempotency, are flagged in `backend_routes.json` under `risk_flags`. Aggregate counts:

| Risk flag | Endpoint count |
| --- | --- |
| `admin_authority_raw_role` | 35 |
| `admissions_ai_touchpoint` | 2 |
| `authority_matrix_pending` | 60 |
| `mutation_authority_raw_role` | 36 |
| `mutation_without_idempotency` | 106 |
| `unauthenticated_write` | 7 |

