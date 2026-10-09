# M3 cluster A — every regenerated golden field, attributed before regeneration

The goldens print *"(re-run with `PERF_BASELINE_UPDATE=1` only if this contract
change is intended)"*. This file is the "is it intended" answer, taken field by
field from the **full** divergence list in
[`40-cluster-A-golden-divergences-before.txt`](40-cluster-A-golden-divergences-before.txt)
rather than from the cluster summary. A field with no source below was not
regenerated silently — see §4.

**A correction to the earlier map.** 13.6 §18.1 and the earlier cluster notes say
*"the admin dashboard and notifications contracts changed deliberately in task
9.2"*. Half of that is wrong: **task 9.2 never touched notifications.** Its
README contains zero occurrences of "notification". All 35 notification
divergences belong to **task 10.1** (R13.4 / R13.8, finding **STU-14**), whose
own evidence states the new payload in one sentence —
`docs/v2-evidence/10.1/slice-1-backend.md:293`: *"It now publishes, per message:
`category`, `kind`, `audience`, and per channel `{state, attempts,
last_attempt_at, can_retry}`."* Attributing them to 9.2 would have meant looking
for them in a README that does not mention them.

---

## 1. `admin_dashboard` — 15 divergences

| # | field | change | intended by | where it is stated |
|--:|---|---|---|---|
| 1 | `data.metrics` | added | **9.2** | §1.2 — the metric registry (`APPLICATION_METRIC_COUNTERS`, `_ACCOUNT_METRICS`); 16 metrics, each `{key, value, state, definition, scope, source}` |
| 2 | `data.health` | added | **9.2** | §4 *"The health grade is measured or absent"* — `operational` / `degraded`, derived, never defaulted to `'good'` |
| 3 | `data.sources` | added | **9.2** | §3.2 per-source isolation — exactly the three sources `applications`, `accounts`, `activity`, each with `{state, reason}` |
| 4 | `data.activity_state` | added | **9.2** | §3.2 / §10 — the `activity` source's own state, so a failed activity read does not take the counters down |
| 5 | `data.freshness` | added | **9.2** | §1 *"states, freshness, and source failure isolation"*; `STALE_AFTER_SECONDS` is the published `stale_after_seconds` |
| 6 | `data.scope` | added | **9.2** | §5 *"Every number states what it counts, and **who** it counts"* — `{kind, institution_id, all_access, institution_count}` |
| 7 | `data.windows` | added | **9.2** | §1.2 payload + §13 — `review_sla_days`, `deadline_pressure_hours`, `next_deadline_at`, `last_activity_at`, `by_status` |
| 8 | `data.needs_attention.overdue_reviews` | added | **9.2** | §2 *"The three counters that were rendered but never computed"* |
| 9 | `data.needs_attention.deadline_pressure` | added | **9.2** | §2, same list |
| 10 | `data.needs_attention.payment_review` | added | **9.2** | §2 — the counter that replaces `pending_payments`, with a definition saying it counts applications whose payment is marked for review |
| 11 | `data.needs_attention.pending_payments` | **removed** | **9.2** | §2 — replaced by (10). Nothing reads the payload key: `apps/admissions/src/services/admin/dashboard.ts:691` already projects the legacy name **from** `metricValue('payment_review')` |
| 12 | `data.users.enabled` | added | **9.2** | §8 *"Enabled accounts are called enabled accounts"* (MAINT-02) |
| 13 | `data.users.active` | **removed** | **9.2** | §8 — the key claimed to count *users currently online* and never measured presence. Deliberately **not** re-published under an alias, because an alias re-publishes the claim |
| 14 | `data.applications.today_created` | **removed** | **not stated by 9.2** | §4 below |
| 15 | `data.applications.today_submitted` | **removed** | **not stated by 9.2** | §4 below |

## 2. `notifications` — 20 divergences = 5 fields × 4 rows

## 3. `notifications_cursor` — 15 divergences = the same 5 fields × 3 rows

| field | change | intended by | where it is stated |
|---|---|---|---|
| `data.results[n].category` | added | **10.1** | slice-1-backend.md:293; §3 the published category vocabulary |
| `data.results[n].kind` | added | **10.1** | :293; §4 `mandatory` vs `optional` |
| `data.results[n].audience` | added | **10.1** | :293, :216 *"audience decides the channel set"*, :634 *"`audience` added to `NotificationItemSerializer`"* |
| `data.results[n].channels` | added | **10.1** | :293 — per channel `{channel, state, attempts, last_attempt_at, can_retry}`; §2 publishes a classified state instead of provider text |
| `data.results[n].can_retry` | added | **10.1** | :293 + the new `CommunicationRetryView`; retry as an authorized audited command |

**Zero removals on either notification fixture**, and no value of a surviving
field changed. Every divergence is an addition described by one sentence of
10.1's own evidence.

---

## 4. The two fields 9.2's evidence does **not** state, and what was done about them

`data.applications.today_created` and `data.applications.today_submitted`
disappeared from the legacy compatibility block **while their source was
healthy**. That is not the omission rule 9.2 documents ("a key whose source
failed is omitted rather than written as `0`"), so 9.2's intent does not cover
them and they were **not** absorbed as though it did.

Measured rather than assumed:

* **Consumers: zero.** `grep -rn "today_created\|today_submitted"` over
  `apps/admissions/src` and `backend/apps` returns nothing. No frontend field,
  no serializer, no generated client type, no test outside the golden.
* **Superseded, not lost.** 9.2's registry publishes `today_activity` —
  *"Created, updated, or submitted since midnight in the platform timezone"* —
  which subsumes both, states what it counts, and is verified against
  hand-written SQL by `TestEachNumberEqualsAnIndependentCount`. The legacy block
  publishes the same number under both `today` and `today_activity`.

So the removal is safe, but it was **undeclared**, and an undeclared narrowing is
the thing that lets the next reader mistake a regression for a cleanup. It is now
declared in the same place the API documents itself:
`AdminDashboardApplicationStatsSerializer` names the keys the block publishes and
does not name these two, and
`test_legacy_blocks_agree_with_the_declared_serializer` fails if the response and
the declaration disagree in **either** direction.

---

## 5. What was fixed instead of regenerated — 8 divergences that were not contract changes

| divergence | count | verdict |
|---|--:|---|
| `data.results[n].channels[0].last_attempt_at` value differs by microseconds between two captures of the same behaviour | **7** (4 page-mode + 3 cursor-mode) | **fixture instability.** A wall-clock timestamp published by 10.1 after `DEFAULT_VOLATILE_KEYS` was last extended. Added to that set, where its own docstring already says "timestamps" |
| `data.freshness.generated_at` likewise | **1** | **fixture instability.** 9.2's read timestamp, same class |
| `uq_payments_transaction_reference_present` collision on the literal `REF-PAID` | 1 error inside `test_endpoint_output_is_stable_run_to_run[application_list]` | **fixture defect.** The fixture is built twice in one test; `receipt_number` was already uniquified and `transaction_reference` was not. Uniquified in all three files that carry the literal. The field is already volatile, so nothing about the comparison changes |

None of these was baked into a golden. Widening the volatile set does not stop
the fields being compared — they are compared as `<volatile>` against
`<volatile>`, so a field going missing or changing type is still a divergence.

---

## 6. The one divergence that was neither

`tests/contract/test_serializer_response_contract.py` reported
`{'label': 'dashboard.users', 'missing': ['active']}`. That is **not** a stale
golden: it is a live contract drift 9.2 left behind. `AdminDashboardSerializer` —
the view's own `serializer_class`, and therefore what drf-spectacular publishes —
still declared `users.active` and `needs_attention.pending_payments` months after
the view stopped returning them. The response was right and the **declaration**
was wrong, so the fix is in `apps/accounts/admin_serializers.py`, not in a
baseline. See §1 rows 11–13 and §4.
