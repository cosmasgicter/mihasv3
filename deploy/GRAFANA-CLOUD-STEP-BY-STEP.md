# Step-by-Step: Connect the server to Grafana Cloud (beginner guide)

You will do 3 things:
**A.** Copy 6 values from the Grafana website.
**B.** Paste them into one file on your server.
**C.** Run one command to start it.

Total time ~15 minutes. You do **not** need to understand the config files —
just copy/paste exactly. Lines starting with `#` are comments; don't type those.

> Throughout, replace `<ELASTIC_IP>` with your server's IP address (the same
> one you SSH into normally).

---

## PART A — Get your 6 values from Grafana Cloud

You need these 6 things. Keep a notepad open and paste each one as you find it:

```
1. GCLOUD_API_KEY     = (a long secret token)
2. GCLOUD_PROM_URL    = (ends with /api/prom/push)
3. GCLOUD_PROM_USER   = (a number, e.g. 1234567)
4. GCLOUD_LOKI_URL    = (ends with /loki/api/v1/push)
5. GCLOUD_LOKI_USER   = (a different number, e.g. 987654)
6. (the API key from #1 is reused for Loki — no separate Loki key)
```

### A1. Log in
Go to **https://grafana.com** → **My Account** → click your stack
(e.g. `yourname.grafana.net`).

### A2. Find the Prometheus URL + username (values 2 and 3)
1. On the stack page, find the **Prometheus** box → click **Details** (or
   **Send Metrics**).
2. You'll see a block like this:
   ```
   Remote Write Endpoint: https://prometheus-prod-XX-prod-REGION.grafana.net/api/prom/push
   Username / Instance ID: 1234567
   ```
3. Copy the endpoint → that's **GCLOUD_PROM_URL** (value 2).
   Copy the username number → that's **GCLOUD_PROM_USER** (value 3).

### A3. Find the Loki URL + username (values 4 and 5)
1. Back on the stack page, find the **Loki** box → click **Details**
   (or **Send Logs**).
2. You'll see:
   ```
   URL: https://logs-prod-XXX.grafana.net/loki/api/v1/push
   User: 987654
   ```
3. Copy the URL → **GCLOUD_LOKI_URL** (value 4).
   Copy the user number → **GCLOUD_LOKI_USER** (value 5).

### A4. Create the secret token (value 1)
1. In the left menu, search for **Access Policies** (under Security /
   Administration). Click **Create access policy**.
2. Name it `mihas-server`. Under **scopes**, tick **metrics: write** and
   **logs: write**. Save.
3. Click the new policy → **Add token** → name it `mihas-server-token` →
   **Create**.
4. **Copy the token now** (it's only shown once) → that's **GCLOUD_API_KEY**
   (value 1). If you lose it, just make another token.

> Stuck finding a box? In the left nav use **Connections → Add new connection**
> and search "Prometheus" / "Loki" — Grafana walks you through and shows the
> same URL + username + token in one place.

### A5. Turn on 2FA (locks the dashboards to you)
**https://grafana.com** → profile → **Security** → enable two-factor auth.
This is what makes your dashboard URL private to you.

You now have all 6 values written down. On to the server.

---

## PART B — Put the files and values on the server

### B1. SSH into the server
On your laptop, open a terminal and run (replace the IP):
```bash
ssh ubuntu@<ELASTIC_IP>
```
You're now "on the server". Everything below runs there until it says otherwise.

### B2. Go to the app folder
```bash
cd ~/mihas
```

### B3. Add your 6 values to the .env file
Open the file:
```bash
nano .env
```
Use the arrow keys to scroll to the **bottom**, then paste this block and
**fill in your real values** after each `=` (no spaces, no quotes):
```
MONITOR_HOSTNAME=mihas-ec2
GCLOUD_API_KEY=PASTE_VALUE_1_HERE
GCLOUD_PROM_URL=PASTE_VALUE_2_HERE
GCLOUD_PROM_USER=PASTE_VALUE_3_HERE
GCLOUD_LOKI_URL=PASTE_VALUE_4_HERE
GCLOUD_LOKI_USER=PASTE_VALUE_5_HERE
```
Save and exit nano: press **Ctrl+O** then **Enter** (saves), then **Ctrl+X**
(exits).

### B4. Create the Alloy config file
Make a folder:
```bash
mkdir -p ~/mihas/alloy
```
Now create the file by pasting this **entire block** in one go (it starts with
`cat` and ends with `EOF` — copy all of it, paste, press Enter):
```bash
cat > ~/mihas/alloy/config.alloy <<'EOF'
prometheus.remote_write "gcloud" {
  endpoint {
    url = sys.env("GCLOUD_PROM_URL")
    basic_auth {
      username = sys.env("GCLOUD_PROM_USER")
      password = sys.env("GCLOUD_API_KEY")
    }
  }
}

loki.write "gcloud" {
  endpoint {
    url = sys.env("GCLOUD_LOKI_URL")
    basic_auth {
      username = sys.env("GCLOUD_LOKI_USER")
      password = sys.env("GCLOUD_API_KEY")
    }
  }
}

prometheus.exporter.unix "host" {
  rootfs_path = "/rootfs"
  procfs_path = "/host/proc"
  sysfs_path  = "/host/sys"
}

prometheus.scrape "host" {
  targets         = prometheus.exporter.unix.host.targets
  forward_to      = [prometheus.relabel.host.receiver]
  scrape_interval = "60s"
}

prometheus.relabel "host" {
  forward_to = [prometheus.remote_write.gcloud.receiver]
  rule {
    target_label = "instance"
    replacement  = sys.env("HOSTNAME")
  }
}

prometheus.exporter.cadvisor "containers" {
  docker_host      = "unix:///var/run/docker.sock"
  storage_duration = "5m"
}

prometheus.scrape "containers" {
  targets         = prometheus.exporter.cadvisor.containers.targets
  forward_to      = [prometheus.remote_write.gcloud.receiver]
  scrape_interval = "60s"
}

discovery.docker "containers" {
  host = "unix:///var/run/docker.sock"
}

discovery.relabel "containers" {
  targets = discovery.docker.containers.targets
  rule {
    source_labels = ["__meta_docker_container_name"]
    regex         = "/(.*)"
    target_label  = "container"
  }
  rule {
    target_label = "host"
    replacement  = sys.env("HOSTNAME")
  }
}

loki.source.docker "containers" {
  host       = "unix:///var/run/docker.sock"
  targets    = discovery.relabel.containers.output
  labels     = { job = "docker" }
  forward_to = [loki.write.gcloud.receiver]
}
EOF
```
Confirm it was written (should print the file):
```bash
cat ~/mihas/alloy/config.alloy | head -5
```

### B5. Create the compose file
Paste this **entire block** in one go:
```bash
cat > ~/mihas/docker-compose.grafana-cloud.yml <<'EOF'
services:
  alloy:
    image: grafana/alloy:latest
    container_name: alloy
    restart: unless-stopped
    env_file:
      - .env
    environment:
      HOSTNAME: ${MONITOR_HOSTNAME:-mihas-ec2}
    command:
      - run
      - /etc/alloy/config.alloy
      - --storage.path=/var/lib/alloy/data
    volumes:
      - ./alloy/config.alloy:/etc/alloy/config.alloy:ro
      - alloy-data:/var/lib/alloy/data
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /:/rootfs:ro
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
    mem_limit: 200m

volumes:
  alloy-data:
EOF
```

---

## PART C — Start it and check it works

### C1. Start the agent
```bash
cd ~/mihas
docker compose -f docker-compose.prod.yml -f docker-compose.grafana-cloud.yml --env-file .env up -d alloy
```

### C2. Watch the logs for ~30 seconds
```bash
docker compose -f docker-compose.prod.yml -f docker-compose.grafana-cloud.yml logs -f alloy
```
- **Good:** lines scroll by with no red `error` / `401` / `403` / `unauthorized`.
- **Bad:** if you see `401`/`unauthorized`, a value in `.env` is wrong — redo
  PART B3 (most often the token or a username number). Then:
  ```bash
  docker compose -f docker-compose.prod.yml -f docker-compose.grafana-cloud.yml --env-file .env up -d alloy
  ```
Press **Ctrl+C** to stop watching the logs (this does NOT stop the agent).

### C3. See your data in Grafana (2–3 minutes later)
On your laptop browser, go to your stack `https://yourname.grafana.net`:
- **Metrics:** left menu → **Drilldown → Metrics** (or **Explore** →
  pick the Prometheus data source) → search `node_` — you should see host
  stats. Your server is labelled `instance="mihas-ec2"`.
- **Logs:** left menu → **Drilldown → Logs** (or **Explore** → pick the Loki
  data source) → type `{job="docker"}` → you'll see live logs from all your
  containers. Filter one service with `{job="docker", container="web"}`.

### C4. (Recommended) one ready-made dashboard
1. In Grafana: left menu → **Dashboards → New → Import**.
2. Type dashboard ID **1860**, click **Load**, pick your Prometheus data
   source, **Import**. That's the full "Node Exporter" host dashboard.

### C5. (Recommended) alerts so you get emailed before things break
Grafana → **Alerting → Alert rules → New alert rule**. Create these three
(route them to your email under **Alerting → Contact points**):
- RAM used > 90% for 5 minutes
- Disk used > 80%
- A container stops reporting for 5 minutes

(Exact alert expressions are in the "Grafana Cloud" tips on the
[Grafana docs](https://grafana.com/docs/grafana-cloud/alerting-and-irm/) — or
ask and I'll write the exact queries.)

---

## Done. Everyday use
- **See dashboards/logs:** just open `https://yourname.grafana.net` in any
  browser (gated by your login + 2FA — nobody else can reach it).
- **Nothing is exposed on your server.** The agent only sends data out.
- **Stop monitoring** (the app keeps running): `cd ~/mihas && docker compose -f docker-compose.grafana-cloud.yml down`
- **Start it again:** the PART C1 command.

## If you get stuck
Copy the output of this and send it to me:
```bash
cd ~/mihas
docker compose -f docker-compose.prod.yml -f docker-compose.grafana-cloud.yml logs --tail 40 alloy
```
