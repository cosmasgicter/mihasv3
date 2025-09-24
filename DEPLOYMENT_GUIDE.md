# MIHAS Application System V2 - Deployment Guide

## 🚀 Quick Deployment to Netlify

### Prerequisites
- Netlify account
- Access to MIHAS Supabase project
- Environment variables provided

### Step 1: Upload to Netlify
1. Zip the entire `mihas-application-v2` directory
2. Go to [Netlify](https://app.netlify.com)
3. Drag and drop the zip file or connect GitHub repository

### Step 2: Configure Build Settings
```
Build command: npm run build:prod
Publish directory: dist
```

### Step 3: Set Environment Variables
In Netlify Dashboard → Site Settings → Environment Variables, add:

```
VITE_SUPABASE_URL=https://mylgegkqoddcrxtwcclb.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwODMsImV4cCI6MjA3MzA4ODA4M30.7f-TwYz7E6Pp07oH5Lkkfw9c8d8JkeE81EXJqpCWiLw
VITE_API_BASE_URL=https://application.mihas.edu.zm
VITE_APP_BASE_URL=https://application.mihas.edu.zm
VITE_TURNSTILE_SITE_KEY=0x4AAAAAABzNXd6hf1VUxD3X
VITE_ANALYTICS_BASE_URL=https://cloud.umami.is
VITE_ANALYTICS_SITE_ID=a6f829ab-c066-457f-aaa7-bf6ce4cc8ed4
VITE_ANALYTICS_SHARE_TOKEN=api_4EXvHonSvmleHIuNPSelVgFQugvYMZNr
VITE_ENABLE_OCR=true
VITE_ENABLE_SMART_MATCHING=true
VITE_AUTO_SAVE_INTERVAL=30000
VITE_API_CACHE_TTL=300000
VITE_ENABLE_PERFORMANCE_MONITORING=true
VITE_ENABLE_DRAFT_MANAGEMENT=true
```

### Step 4: Deploy
1. Click "Deploy site"
2. Wait for build to complete
3. Visit your deployed application

## 🌐 CloudFront CDN Deployment

The `infra/cdn` Terraform stack provisions an Amazon S3 bucket to host the built frontend assets and an Amazon CloudFront
distribution that sits in front of it. The setup improves global performance, offers cache controls, and integrates with the
updated `deploy.sh` script for automated uploads and invalidations.

### What the stack creates
- Private S3 bucket for the `dist/` build output with versioning and encryption enabled
- CloudFront origin access identity locked to the bucket
- CloudFront distribution with SPA-friendly routing, compression, and optional logging
- Optional Route53 `A`/`AAAA` alias records when DNS is hosted in AWS

### Prerequisites
- Terraform `>= 1.6`
- AWS CLI configured with credentials that may create S3, CloudFront, and Route53 resources
- A public ACM certificate in `us-east-1` that covers your production domain
- (Optional) Route53 hosted zone for the domain if you want Terraform to manage DNS aliases

### Step 1: Deploy the CDN stack
```bash
cd infra/cdn
terraform init
terraform apply \
  -var="project=mihas" \
  -var="bucket_name=<unique-s3-bucket-name>" \
  -var="domain_name=application.mihas.edu.zm" \
  -var="hosted_zone_id=<route53-zone-id-or-empty>" \
  -var="certificate_arn=<acm-certificate-arn>"
```

**Important:** S3 bucket names must be globally unique. If Route53 is not managing your DNS, leave `hosted_zone_id` blank and
manually create a `CNAME`/`A` record pointing to the `cdn_domain_name` Terraform output.

### Step 2: Update DNS
- If Terraform managed DNS: confirm the `A`/`AAAA` alias records were created in Route53 and propagated.
- Otherwise: create a `CNAME` (or `A` ALIAS if supported) that points your desired hostname to the
  `cdn_domain_name` output (e.g. `d123example.cloudfront.net`).
- Allow up to one hour for TTLs to expire before testing from production clients.

### Step 3: Build and publish the site
```bash
export CDN_BUCKET_NAME=<same-s3-bucket-name>
export CDN_DISTRIBUTION_ID=<terraform-output-cdn_distribution_id>
# optional tuning
export CDN_INVALIDATION_PATHS="/*"
export CDN_DEFAULT_CACHE_CONTROL="public,max-age=31536000,immutable"
export CDN_HTML_CACHE_CONTROL="public,max-age=300,must-revalidate"

./deploy.sh
```

The script will:
1. Build the production bundle
2. Sync hashed assets to S3 with long-lived cache headers
3. Upload `index.html`/`404.html` with shorter TTLs
4. Trigger a CloudFront invalidation for the specified paths

### Step 4: Verify the deployment
- Visit `https://<your-domain>` and confirm the new build is visible
- Use `aws cloudfront get-distribution --id $CDN_DISTRIBUTION_ID` to ensure the status is `Deployed`
- Test from multiple regions with `curl` by resolving through different DNS resolvers, for example:
  ```bash
  dig +short @1.1.1.1 <your-domain>
  curl -I https://<your-domain>
  ```
- Review the CloudFront cache headers (`Cache-Control`, `Age`) to confirm caching behaviour

### Cache purge operations
- **Automated**: rerun `./deploy.sh` after a build to publish artifacts and invalidate the default path set.
- **Manual**: execute `aws cloudfront create-invalidation --distribution-id $CDN_DISTRIBUTION_ID --paths '/*'` when a hotfix
  needs to purge the cache without a full deploy.
- **Selective**: adjust `CDN_INVALIDATION_PATHS` (space-delimited) to target specific assets, e.g. `"/index.html /assets/app.js"`.

### Regional testing tips
- Use the [CloudFront Check tool](https://cloudfront.github.io/healthcheck/cloudfront/) or `dig` from geographically diverse
  endpoints to verify edge propagation.
- From Linux/macOS, you can route a request through a specific CloudFront edge by resolving the domain to the POP IP returned by
  `nslookup <your-domain>`. Use `curl --resolve <your-domain>:443:<edge-ip> https://<your-domain>` to validate the cache hit.
- Monitor CloudFront logs (enable via `log_bucket_name` variable) for cache hit ratios across regions.

## ⚙️ Autoscaling Infrastructure (Serverless + Container Workers)

The `infra/` directory contains a Terraform stack that provisions the autoscaling backbone for Netlify functions and the complementary containerized notifications worker.

### Prerequisites
- Terraform >= 1.6
- AWS account with permissions for SQS, Lambda, CloudWatch, IAM, and Application Auto Scaling
- Container image published to ECR for the background worker that drains `email_notifications`

### Deploying the stack
```bash
cd infra
terraform init
terraform plan -out=tfplan \
  -var="project=mihas" \
  -var="worker_image_uri=<aws_account_id>.dkr.ecr.<region>.amazonaws.com/mihas-notifications:latest"
terraform apply tfplan
```

Key outputs:
- `notifications_dispatch_queue_url` – SQS queue that feeds the AWS Lambda worker
- `notifications_scaling_metrics_queue_url` – queue used by Netlify functions to stream metrics to the controller
- `netlify_environment_variables` – helper map of values to copy into Netlify environment variables (`SCALING_METRICS_QUEUE_URL`, `NOTIFICATIONS_QUEUE_URL`, `AWS_REGION`)

Add the following sensitive values to Netlify → Site settings → Environment variables:
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` tied to an IAM user or role that may write to the metrics queue
- `SCALING_METRICS_QUEUE_URL` and `AWS_REGION` from Terraform outputs so instrumentation can publish metrics

### Tuning concurrency & schedules
- **Baseline concurrency:** `notifications_worker_min_concurrency` in `infra/variables.tf`
- **Peak concurrency:** `notifications_worker_peak_min_concurrency` and `notifications_worker_peak_max_concurrency`
- **Queue-driven scaling:** Adjust `notifications_queue_target_depth` to define acceptable backlog size; the stack scales provisioned concurrency up/down based on SQS depth.
- **Scheduled scaling:** Update `notifications_scale_out_schedule` and `notifications_scale_in_schedule` with cron expressions that reflect peak admission windows. Times are evaluated in UTC by AWS; adjust for the MIHAS timezone (Africa/Lusaka).
- **Alarms:** `notifications_queue_alarm_threshold` controls the CloudWatch alarm that fires when the backlog grows beyond expectations.

After editing variables, re-run `terraform plan` and `terraform apply` to push changes.

### Validating autoscaling
1. **Seed load:** use the existing notification test harness to enqueue traffic.
   ```bash
   npm run test:notification-system
   ```
2. **Monitor queues:** in AWS CloudWatch → Metrics → SQS, watch `ApproximateNumberOfMessagesVisible` for the dispatch queue and `ApproximateAgeOfOldestMessage` to ensure lag remains low.
3. **Check concurrency:** open the generated CloudWatch dashboard (`mihas-autoscaling`) to verify provisioned concurrency scales in/out during the run.
4. **Verify Netlify metrics:** inspect the `SCALING_METRICS_QUEUE_URL` queue in SQS to confirm functions publish execution duration and queue depth telemetry.
5. **Load-test iterations:** adjust `notifications_worker_peak_*` or `notifications_queue_target_depth` and repeat until desired throughput/latency is achieved.

If needed, you can temporarily disable autoscaling by setting `notifications_worker_max_concurrency` equal to `notifications_worker_min_concurrency` and running `terraform apply` again.

## 🔧 Manual Deployment (Alternative)

### Local Build
```bash
# Navigate to project directory
cd mihas-application-v2

# Install dependencies
npm install

# Build for production
npm run build:prod

# The dist/ folder contains deployable files
```

### Upload dist/ folder to any static hosting service:
- Netlify
- Vercel
- AWS S3 + CloudFront
- Azure Static Web Apps

## 🎯 V2 Features Included

### Performance Improvements
- ✅ Enhanced loading components
- ✅ API response caching
- ✅ Image compression
- ✅ Database optimization utilities

### Mobile Enhancements  
- ✅ Touch-optimized navigation
- ✅ 44px minimum touch targets
- ✅ Mobile-first design improvements
- ✅ Enhanced mobile buttons

### File Upload Improvements
- ✅ Drag & drop support
- ✅ Client-side image compression
- ✅ Progress tracking
- ✅ Enhanced validation

### Auto-Save & Draft Management
- ✅ Auto-save every 30 seconds
- ✅ Session recovery
- ✅ Draft warnings
- ✅ Timeout handling

### Smart Features
- ✅ OCR auto-fill capability
- ✅ Duplicate detection
- ✅ Smart matching algorithms
- ✅ Grade calculator

### Admin Tools
- ✅ Bulk operations
- ✅ Enhanced filtering
- ✅ Improved export functionality
- ✅ Performance dashboard

## 🛠️ Troubleshooting

### Build Issues
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Check TypeScript errors
npm run type-check

# Build with verbose output
npm run build:prod -- --verbose
```

### Environment Variable Issues
- Ensure all VITE_ prefixed variables are set
- Check for typos in variable names
- Verify Supabase URLs and keys are correct

### Performance Issues
- Enable performance monitoring: `VITE_ENABLE_PERFORMANCE_MONITORING=true`
- Check network connectivity to Supabase
- Monitor Core Web Vitals in browser dev tools

## 📞 Support
- Check browser console for errors
- Verify environment variables in Netlify
- Test API endpoints manually
- Contact support with error logs if needed

---

**Status**: ✅ Ready for Production Deployment
**Version**: V2 with all improvements integrated