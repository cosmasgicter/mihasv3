# Grafana — dashboards + email alerts (AI prompts + fallback)

Your stack: `https://<yourstack>.grafana.net` (gb-south-1).
Data already arriving:
- **Host metrics** (Prometheus, node_exporter) — label `instance="mihas-ec2"`.
- **Container metrics** (Prometheus, cAdvisor) — label `name="mihas-web-1"` etc.
- **Logs** (Loki) — selector `{job="docker"}`, per service `{job="docker", container="mihas-web-1"}`.

Containers: `mihas-web-1`, `mihas-celery-1`, `mihas-beat-1`, `mihas-postgres-1`,
`mihas-redis-1`, `mihas-caddy-1`, `alloy`.

Notification email: **alexisstar8@gmail.com**

---

## A. Open the AI assistant

In Grafana, top-right, click the **sparkle / "Ask AI"** (Grafana Assistant)
icon. Paste the prompts below one at a time. If you don't see an AI icon, your
plan doesn't expose it — use the **Fallback** sections instead (just as good).

---

## PROMPT 1 — Build the main dashboard

> Create a new Grafana dashboard called "MIHAS Production — Overview" using my
> Prometheus data source. Use the label `instance="mihas-ec2"` for host panels
> and the cAdvisor `name` label for container panels. Add these panels:
>
> 1. Stat panel "CPU usage %" =
>    `100 - (avg(rate(node_cpu_seconds_total{instance="mihas-ec2",mode="idle"}[5m])) * 100)`
>    thresholds green<70, yellow 70–90, red>90.
> 2. Stat panel "Memory used %" =
>    `(1 - (node_memory_MemAvailable_bytes{instance="mihas-ec2"} / node_memory_MemTotal_bytes{instance="mihas-ec2"})) * 100`
>    thresholds green<75, yellow 75–90, red>90.
> 3. Stat panel "Disk used % (root)" =
>    `(1 - (node_filesystem_avail_bytes{instance="mihas-ec2",mountpoint="/rootfs"} / node_filesystem_size_bytes{instance="mihas-ec2",mountpoint="/rootfs"})) * 100`
>    thresholds green<70, yellow 70–85, red>85.
> 4. Stat panel "Swap used %" =
>    `(1 - (node_memory_SwapFree_bytes{instance="mihas-ec2"} / node_memory_SwapTotal_bytes{instance="mihas-ec2"})) * 100`.
> 5. Time series "Memory per container" =
>    `container_memory_working_set_bytes{name=~"mihas-.*|alloy"}` legend by `name`, unit bytes.
> 6. Time series "CPU per container" =
>    `rate(container_cpu_usage_seconds_total{name=~"mihas-.*|alloy"}[5m])` legend by `name`.
> 7. Time series "System load (1m)" = `node_load1{instance="mihas-ec2"}`.
> 8. Time series "Network in/out" =
>    `rate(node_network_receive_bytes_total{instance="mihas-ec2"}[5m])` and
>    `rate(node_network_transmit_bytes_total{instance="mihas-ec2"}[5m])`, unit bytes/sec.
>
> Set the dashboard refresh to 30s and time range to last 6 hours. Save it.

## PROMPT 2 — Add a logs panel

> On the "MIHAS Production — Overview" dashboard add a Logs panel using my Loki
> data source with query `{job="docker"}`. Add a dashboard variable named
> `container` that lists the values of the `container` label from `{job="docker"}`,
> and change the logs query to `{job="docker", container="$container"}` so I can
> filter logs by service. Save the dashboard.

## PROMPT 3 — Create the 3 alert rules + email

> Create 3 Grafana-managed alert rules in a folder "MIHAS Alerts", evaluated
> every 1m, each pending for 5m, all notifying a contact point that emails
> alexisstar8@gmail.com:
>
> 1. "High memory" — fires when
>    `(1 - (node_memory_MemAvailable_bytes{instance="mihas-ec2"} / node_memory_MemTotal_bytes{instance="mihas-ec2"})) * 100 > 90`.
> 2. "Disk almost full" — fires when
>    `(1 - (node_filesystem_avail_bytes{instance="mihas-ec2",mountpoint="/rootfs"} / node_filesystem_size_bytes{instance="mihas-ec2",mountpoint="/rootfs"})) * 100 > 85`.
> 3. "Container down" — fires when
>    `count(rate(container_last_seen{name=~"mihas-.*"}[2m])) < 6`
>    (there are 6 mihas-* containers; fewer means one stopped reporting).
>
> First create an email contact point named "Email me" with address
> alexisstar8@gmail.com, then attach all three rules to it via a notification
> policy.

---

## FALLBACK (no AI, 100% reliable)

### F1. Import ready-made dashboards (2 min)
1. Left menu → **Dashboards** → **New** → **Import**.
2. Enter ID **1860** → **Load** → pick your **Prometheus** data source → **Import**.
   (Node Exporter Full — every host metric.)
3. Repeat Import with ID **19792** (cAdvisor / container metrics) → Prometheus
   source → **Import**.
   These show host + container CPU/RAM/disk/network out of the box.

### F2. Logs (1 min)
Left menu → **Drilldown → Logs** (or **Explore** → Loki source) → query
`{job="docker"}`. Filter a service with `{job="docker", container="mihas-web-1"}`.

### F3. Email contact point (2 min)
1. Left menu → **Alerting** → **Contact points** → **Add contact point**.
2. Name: `Email me`. Integration: **Email**. Addresses: `alexisstar8@gmail.com`.
3. **Test** (you'll get a test email — check spam) → **Save**.
4. **Alerting → Notification policies** → edit **Default policy** → set default
   contact point to **Email me** → Save. (Now every alert emails you.)

### F4. Three alert rules (manual, ~5 min each)
**Alerting → Alert rules → New alert rule** for each:

**Rule 1 — High memory**
- Section 1 query (Prometheus, code mode):
  `(1 - (node_memory_MemAvailable_bytes{instance="mihas-ec2"} / node_memory_MemTotal_bytes{instance="mihas-ec2"})) * 100`
- Section 3: condition **IS ABOVE `90`**.
- Section 4: evaluate every `1m`, pending period `5m`, folder `MIHAS Alerts`.
- Section 5: contact point **Email me**. Save.

**Rule 2 — Disk almost full**
- Query: `(1 - (node_filesystem_avail_bytes{instance="mihas-ec2",mountpoint="/rootfs"} / node_filesystem_size_bytes{instance="mihas-ec2",mountpoint="/rootfs"})) * 100`
- Condition: IS ABOVE `85`. Same eval/contact as above.

**Rule 3 — Container down**
- Query: `count(rate(container_last_seen{name=~"mihas-.*"}[2m]))`
- Condition: IS BELOW `6`. Same eval/contact as above.

---

## Verify alerts actually email you
**Alerting → Contact points → Email me → Test** → check `alexisstar8@gmail.com`
(including spam; add `grafana.net` / `grafana.com` to safe senders).

## Tip
If a panel shows "No data", open it → Edit → confirm the **data source** is your
Prometheus/Loki (not a default), and that the metric name matches (type
`node_` or `container_` in the query box to autocomplete).
