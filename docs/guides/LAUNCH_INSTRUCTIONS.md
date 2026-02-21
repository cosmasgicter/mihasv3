# 🚀 Final Launch Instructions

## ✅ What's Already Done

1. ✅ All critical security issues fixed
2. ✅ Database migrations applied (Neon Postgres)
3. ✅ Custom JWT auth system deployed
4. ✅ Arcjet security perimeter configured
5. ✅ Test checklist created

---

## 🎯 What YOU Need to Do (30 minutes)

### Step 1: Verify Environment Variables (5 minutes)

1. Go to Vercel dashboard → Select project
2. Settings → Environment Variables → Production
3. Verify these are set:
   - `DATABASE_URL` — Neon Postgres connection string
   - `JWT_SECRET` — 32+ char secret for access tokens
   - `JWT_REFRESH_SECRET` — 32+ char secret for refresh tokens
   - `ARCJET_KEY` — Arcjet API key
   - `RESEND_API_KEY` — Resend email key
   - `EMAIL_FROM` — noreply@mihas.edu.zm

### Step 2: Deploy (1 minute)

```bash
git pull
git push
```

Vercel will automatically build and deploy.

### Step 3: Verify Health Endpoints (2 minutes)

```bash
# Check system is alive
curl https://apply.mihas.edu.zm/api/health?action=ping

# Check database connectivity
curl https://apply.mihas.edu.zm/api/health?action=db

# Check environment variables
curl https://apply.mihas.edu.zm/api/health?action=env
```

---

### Step 4: Set Up UptimeRobot (5 minutes)

1. Go to https://uptimerobot.com/
2. Sign up (free account)
3. Click "Add New Monitor"
4. Fill in:
   - Monitor Type: HTTP(s)
   - Friendly Name: "MIHAS Application System"
   - URL: `https://apply.mihas.edu.zm`
   - Monitoring Interval: 5 minutes
5. Add Alert Contact:
   - Email: `admin@mihas.edu.zm`
6. Click "Create Monitor"

**Done!** You'll get email alerts if site goes down.

---

### Step 5: Run Critical Tests (15 minutes)

Open `CRITICAL_USER_FLOWS_TEST.md` and test:

**MUST TEST** (Critical):
1. ✅ Student Registration & Login
2. ✅ Application Submission (full flow)
3. ✅ Payment Verification (admin)
4. ✅ Application Approval (admin)
5. ✅ Security - Try accessing admin as student

**Expected Results**:
- All flows work end-to-end
- Emails sent correctly
- Payment required before approval
- Security blocks unauthorized access

---

### Step 6: Verify Monitoring (2 minutes)

1. **Check Vercel Logs**:
   - Go to Vercel dashboard → Logs
   - Trigger a test request
   - Verify logs appear

2. **Check UptimeRobot**:
   - Pause monitor
   - Wait 5 minutes
   - Verify you receive email alert
   - Resume monitor

---

## 🎉 Launch Checklist

- [ ] Environment variables set in Vercel
- [ ] Code deployed to production
- [ ] Health endpoints returning OK
- [ ] UptimeRobot monitor created
- [ ] Critical tests passed (5/5 minimum)
- [ ] Monitoring verified
- [ ] Admin credentials working
- [ ] Email notifications working
- [ ] Backup plan documented

---

## 🚨 If Something Goes Wrong

### Rollback Plan:
```bash
# Revert to previous deployment
git revert HEAD
git push
```

Or use Vercel dashboard → Deployments → Promote a previous deployment.

### Emergency Contacts:
- **Technical**: cosmas@beanola.com
- **Vercel Support**: https://vercel.com/support
- **Neon Support**: https://neon.tech/docs/introduction/support

### Common Issues:

**Issue**: Application not loading
- **Fix**: Check Vercel deployment logs
- **Fix**: Check Neon Postgres database is running (`/api/health?action=db`)
- **Fix**: Rollback to previous version

**Issue**: UptimeRobot not alerting
- **Fix**: Check email address is verified
- **Fix**: Check monitor is not paused

**Issue**: Auth not working
- **Fix**: Verify `JWT_SECRET` and `JWT_REFRESH_SECRET` are set in Vercel env vars
- **Fix**: Check `/api/auth?action=session` returns valid response

---

## 📊 Post-Launch Monitoring (First 24 Hours)

### Hour 1:
- [ ] Check Vercel logs for errors
- [ ] Verify UptimeRobot shows "Up"
- [ ] Test 1 complete application flow
- [ ] Check health endpoints

### Hour 6:
- [ ] Review Vercel function logs
- [ ] Check application performance
- [ ] Verify emails being sent
- [ ] Review user feedback

### Hour 24:
- [ ] Full system health check
- [ ] Review Vercel analytics
- [ ] Document any issues found
- [ ] Plan fixes for next sprint

---

## 🎯 Success Metrics

**Day 1 Targets**:
- Uptime: >99%
- Error rate: <1%
- Response time: <2s
- Successful applications: >0

**Week 1 Targets**:
- 50+ applications submitted
- 90%+ approval rate
- <5 critical bugs
- Positive user feedback

---

## 📝 Next Steps After Launch

1. **Week 1**: Monitor closely, fix critical bugs
2. **Week 2**: Address warnings from security audit
3. **Month 1**: Optimize performance, add features
4. **Month 3**: Review and improve based on usage data

---

## ✅ You're Ready!

**Estimated Time**: 30 minutes total
- Environment verification: 5 minutes
- UptimeRobot: 5 minutes
- Testing: 15 minutes
- Verification: 5 minutes

**Current Status**: All code ready, just need final checks

---

**Good luck with the launch! 🚀**

Questions? Check:
- `CRITICAL_USER_FLOWS_TEST.md` - Test scenarios
- `PRODUCTION_READINESS_REPORT.md` - Full assessment
- `SECURITY_AUDIT_REPORT.md` - Security details
