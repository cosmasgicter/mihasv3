/**
 * MIHAS Full Flow Test - 2 New Applications
 * Tests: Login → Catalog → Submit 2 Apps (with programs) → List → Admin Review → Interview
 */

const BASE = 'https://apply.mihas.edu.zm';
const STUDENT_EMAIL = 'cosmaskanchepa8@gmail.com';
const ADMIN_EMAIL = 'cosmas@beanola.com';
const PASSWORD = 'Beanola2025';

let studentToken = null;
let adminToken = null;
let results = [];
let createdAppIds = [];

function log(label, status, detail) {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} ${label}: ${detail}`);
  results.push({ label, status, detail });
}

async function api(path, opts = {}) {
  const { method = 'GET', body, token } = opts;
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Origin': 'https://apply.mihas.edu.zm',
    'Referer': 'https://apply.mihas.edu.zm/',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const fetchOpts = { method, headers };
  if (body) fetchOpts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, fetchOpts);
  const setCookies = res.headers.getSetCookie?.() || [];
  let data;
  try { data = await res.json(); } catch { data = { parseError: true, status: res.status }; }
  return { status: res.status, data, setCookies, ok: res.ok };
}

function extractToken(cookies) {
  for (const c of cookies) {
    if (c.startsWith('access_token=')) return c.split('=')[1].split(';')[0];
  }
  return null;
}

async function main() {
  console.log('='.repeat(60));
  console.log('MIHAS Full Application Flow Test');
  console.log(`Target: ${BASE}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  // ── 1. Health Check ──
  console.log('\n--- 1. HEALTH CHECK ---');
  const health = await api('/api/health');
  if (health.ok && health.data?.success) {
    log('Health', 'PASS', `status=${health.data.data?.status}`);
  } else {
    log('Health', 'FAIL', JSON.stringify(health.data));
  }

  // ── 2. Student Login ──
  console.log('\n--- 2. STUDENT LOGIN ---');
  const sLogin = await api('/api/auth?action=login', {
    method: 'POST', body: { email: STUDENT_EMAIL, password: PASSWORD }
  });
  if (sLogin.ok && sLogin.data?.success) {
    const user = sLogin.data.data?.user;
    studentToken = extractToken(sLogin.setCookies);
    log('Student Login', 'PASS', `role=${user?.role}, name=${user?.full_name}`);
  } else {
    log('Student Login', 'FAIL', `status=${sLogin.status}, ${JSON.stringify(sLogin.data).slice(0, 200)}`);
    console.log('\n❌ Cannot continue without student login');
    return printSummary();
  }

  // ── 3. Admin Login ──
  console.log('\n--- 3. ADMIN LOGIN ---');
  const aLogin = await api('/api/auth?action=login', {
    method: 'POST', body: { email: ADMIN_EMAIL, password: PASSWORD }
  });
  if (aLogin.ok && aLogin.data?.success) {
    const user = aLogin.data.data?.user;
    adminToken = extractToken(aLogin.setCookies);
    log('Admin Login', 'PASS', `role=${user?.role}, name=${user?.full_name}`);
  } else {
    log('Admin Login', 'FAIL', `status=${aLogin.status}, ${JSON.stringify(aLogin.data).slice(0, 200)}`);
  }

  // ── 4. Fetch Catalog (Programs, Intakes, Subjects) ──
  console.log('\n--- 4. CATALOG ---');
  const progRes = await api('/api/catalog?type=programs');
  const intakeRes = await api('/api/catalog?type=intakes');
  const subjectRes = await api('/api/catalog?type=subjects');

  const programs = progRes.data?.data?.programs || [];
  const intakes = intakeRes.data?.data?.intakes || [];
  const subjects = subjectRes.data?.data?.subjects || [];

  if (programs.length > 0) {
    log('Programs', 'PASS', `count=${programs.length} → ${programs.map(p => p.code).join(', ')}`);
  } else {
    log('Programs', 'FAIL', 'No programs returned');
    return printSummary();
  }

  if (intakes.length > 0) {
    log('Intakes', 'PASS', `count=${intakes.length} → ${intakes.map(i => i.name).join(', ')}`);
  } else {
    log('Intakes', 'FAIL', 'No intakes returned');
    return printSummary();
  }

  log('Subjects', subjects.length > 0 ? 'PASS' : 'WARN', `count=${subjects.length}`);

  // ── 5. Submit Application 1: MIHAS - Diploma in Registered Nursing ──
  console.log('\n--- 5. SUBMIT APPLICATION 1 (MIHAS - Diploma in Registered Nursing) ---');
  const prog1 = programs.find(p => p.code === 'DRN') || programs[0];
  const intake1 = intakes[0];
  const appNum1 = `MIHAS${Date.now().toString().slice(-6)}A`;

  const grades1 = subjects.slice(0, 6).map((s, i) => ({
    subject_id: s.id,
    grade: [1, 2, 2, 3, 1, 4][i] || 2,
  }));

  const app1Body = {
    application_number: appNum1,
    full_name: 'Mwamba Chisanga',
    date_of_birth: '2001-03-15',
    sex: 'Male',
    phone: '+260977100001',
    email: 'mwamba.chisanga@example.com',
    residence_town: 'Lusaka',
    nrc_number: '456789/12/1',
    nationality: 'Zambian',
    next_of_kin_name: 'Grace Chisanga',
    next_of_kin_phone: '+260966200001',
    program: prog1.name,
    intake: intake1.name,
    institution: 'MIHAS',
    status: 'submitted',
    grades: grades1,
  };

  console.log(`   Institution: MIHAS`);
  console.log(`   Program: ${prog1.name} (${prog1.code})`);
  console.log(`   Intake: ${intake1.name}`);
  console.log(`   App Number: ${appNum1}`);

  const sub1 = await api('/api/applications', {
    method: 'POST', token: studentToken, body: app1Body
  });

  if (sub1.ok && sub1.data?.success) {
    const created = sub1.data.data;
    const appId = created?.id;
    createdAppIds.push(appId);
    log('Application 1 Created', 'PASS', `id=${appId}, program=${created?.program}, status=${created?.status}`);
  } else {
    log('Application 1 Created', 'FAIL', `status=${sub1.status}, ${JSON.stringify(sub1.data).slice(0, 300)}`);
  }

  // ── 6. Submit Application 2: KATC - Diploma in Clinical Medicine ──
  console.log('\n--- 6. SUBMIT APPLICATION 2 (KATC - Diploma in Clinical Medicine) ---');
  const prog2 = programs.find(p => p.code === 'DCM') || programs[Math.min(1, programs.length - 1)];
  const intake2 = intakes.length > 1 ? intakes[1] : intakes[0];
  const appNum2 = `KATC${Date.now().toString().slice(-6)}B`;

  const grades2 = subjects.slice(0, 6).map((s, i) => ({
    subject_id: s.id,
    grade: [2, 1, 3, 2, 2, 1][i] || 2,
  }));

  const app2Body = {
    application_number: appNum2,
    full_name: 'Natasha Banda',
    date_of_birth: '2000-08-22',
    sex: 'Female',
    phone: '+260955300002',
    email: 'natasha.banda@example.com',
    residence_town: 'Kitwe',
    nrc_number: '567890/23/1',
    nationality: 'Zambian',
    next_of_kin_name: 'Joseph Banda',
    next_of_kin_phone: '+260977400002',
    program: prog2.name,
    intake: intake2.name,
    institution: 'KATC',
    status: 'submitted',
    grades: grades2,
  };

  console.log(`   Institution: KATC`);
  console.log(`   Program: ${prog2.name} (${prog2.code})`);
  console.log(`   Intake: ${intake2.name}`);
  console.log(`   App Number: ${appNum2}`);

  const sub2 = await api('/api/applications', {
    method: 'POST', token: studentToken, body: app2Body
  });

  if (sub2.ok && sub2.data?.success) {
    const created = sub2.data.data;
    const appId = created?.id;
    createdAppIds.push(appId);
    log('Application 2 Created', 'PASS', `id=${appId}, program=${created?.program}, status=${created?.status}`);
  } else {
    log('Application 2 Created', 'FAIL', `status=${sub2.status}, ${JSON.stringify(sub2.data).slice(0, 300)}`);
  }

  // ── 7. Student: List My Applications ──
  console.log('\n--- 7. STUDENT LIST APPLICATIONS ---');
  const myApps = await api('/api/applications', { token: studentToken });
  if (myApps.ok && myApps.data?.success) {
    const list = myApps.data.data?.applications || [];
    log('Student Apps', 'PASS', `total=${list.length}`);
    for (const a of list.slice(0, 10)) {
      const marker = createdAppIds.includes(a.id) ? ' ← NEW' : '';
      console.log(`   - ${a.application_number}: status=${a.status}, program=${a.program}${marker}`);
    }
  } else {
    log('Student Apps', 'FAIL', JSON.stringify(myApps.data).slice(0, 200));
  }

  // ── 8. Admin: List All Applications ──
  console.log('\n--- 8. ADMIN LIST ALL APPLICATIONS ---');
  if (!adminToken) { log('Admin List', 'SKIP', 'No admin token'); } else {
    const adminApps = await api('/api/applications?action=list&page=1&pageSize=20', { token: adminToken });
    if (adminApps.ok && adminApps.data?.success) {
      const d = adminApps.data.data;
      const list = d?.applications || [];
      log('Admin List Apps', 'PASS', `showing=${list.length}, total=${d?.totalCount}`);
      // Show our new apps
      const newApps = list.filter(a => createdAppIds.includes(a.id));
      for (const a of newApps) {
        console.log(`   ★ ${a.application_number}: status=${a.status}, program=${a.program}, name=${a.full_name}`);
      }
    } else {
      log('Admin List Apps', 'FAIL', `status=${adminApps.status}, ${JSON.stringify(adminApps.data).slice(0, 200)}`);
    }
  }

  // ── 9. Admin: Approve Application 1 ──
  console.log('\n--- 9. ADMIN APPROVE APPLICATION 1 ---');
  if (!adminToken || createdAppIds.length < 1) {
    log('Approve App 1', 'SKIP', 'No admin token or no app created');
  } else {
    const r = await api('/api/applications?action=review', {
      method: 'POST', token: adminToken,
      body: { application_id: createdAppIds[0], status: 'approved', notes: 'Meets all entry requirements. Approved for enrollment.' }
    });
    if (r.ok && r.data?.success) {
      const app = r.data.data?.application || r.data.data;
      log('Approve App 1', 'PASS', `id=${createdAppIds[0]}, new_status=${app?.status}`);
    } else {
      log('Approve App 1', 'FAIL', `status=${r.status}, ${JSON.stringify(r.data).slice(0, 200)}`);
    }
  }

  // ── 10. Admin: Schedule Interview for Application 2 ──
  console.log('\n--- 10. ADMIN SCHEDULE INTERVIEW FOR APP 2 ---');
  if (!adminToken || createdAppIds.length < 2) {
    log('Schedule Interview', 'SKIP', 'No admin token or no app 2');
  } else {
    const interviewDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const r = await api('/api/applications?action=schedule-interview', {
      method: 'POST', token: adminToken,
      body: {
        applicationId: createdAppIds[1],
        scheduled_at: interviewDate,
        mode: 'in-person',
        location: 'MIHAS Main Campus, Interview Room A',
        notes: 'Bring original certificates and NRC',
      }
    });
    if (r.ok && r.data?.success) {
      const interview = r.data.data?.interview;
      log('Schedule Interview', 'PASS', `interview_id=${interview?.id}, date=${interview?.scheduled_at}`);
    } else {
      log('Schedule Interview', 'FAIL', `status=${r.status}, ${JSON.stringify(r.data).slice(0, 200)}`);
    }
  }

  // ── 11. Student: Check Interviews ──
  console.log('\n--- 11. STUDENT CHECK INTERVIEWS ---');
  const interviews = await api('/api/applications?action=interviews', { token: studentToken });
  if (interviews.ok && interviews.data?.success) {
    const list = interviews.data.data?.interviews || [];
    log('Student Interviews', 'PASS', `count=${list.length}`);
    for (const i of list.slice(-3)) {
      console.log(`   - app=${i.application_number}, date=${i.scheduled_at}, mode=${i.mode}, status=${i.status}`);
    }
  } else {
    log('Student Interviews', 'FAIL', `status=${interviews.status}, ${JSON.stringify(interviews.data).slice(0, 200)}`);
  }

  // ── 12. Application Tracking (Public) ──
  console.log('\n--- 12. PUBLIC TRACKING ---');
  if (appNum1) {
    const track = await api(`/api/applications?action=track&code=${appNum1}`);
    if (track.ok && track.data?.success) {
      const t = track.data.data?.application;
      log('Track App 1', 'PASS', `number=${t?.application_number}, status=${t?.status}, program=${t?.program_name}`);
    } else if (track.status === 404) {
      log('Track App 1', 'WARN', 'Not found (may need public_tracking_code set)');
    } else {
      log('Track App 1', 'FAIL', `status=${track.status}, ${JSON.stringify(track.data).slice(0, 200)}`);
    }
  }

  // ── 12b. Verify Institution-Program Mapping ──
  console.log('\n--- 12b. VERIFY INSTITUTION-PROGRAM MAPPING ---');
  if (!adminToken) { log('Inst-Prog Map', 'SKIP', 'No admin token'); } else {
    const allApps = await api('/api/applications?action=list&page=1&pageSize=200', { token: adminToken });
    if (allApps.ok && allApps.data?.success) {
      const apps = allApps.data.data?.applications || [];
      
      // Expected mapping: MIHAS = Nursing + Counselling, KATC = Clinical Medicine + Environmental Health
      const mihasPrograms = ['Diploma in Registered Nursing', 'DRN', 'Certificate In Psychosocial Counselling', 'CPC'];
      const katcPrograms = ['Diploma in Clinical Medicine', 'DCM', 'Diploma in Environmental Health', 'DEH'];
      
      let mismatches = [];
      for (const a of apps) {
        if (a.institution === 'MIHAS' && katcPrograms.includes(a.program) && !mihasPrograms.includes(a.program)) {
          mismatches.push(`${a.application_number}: MIHAS has KATC program "${a.program}"`);
        }
        if (a.institution === 'KATC' && mihasPrograms.includes(a.program) && !katcPrograms.includes(a.program)) {
          mismatches.push(`${a.application_number}: KATC has MIHAS program "${a.program}"`);
        }
      }
      
      // Count by institution
      const instMap = {};
      for (const a of apps) {
        const key = `${a.institution} → ${a.program}`;
        instMap[key] = (instMap[key] || 0) + 1;
      }
      
      console.log('   Current institution-program distribution:');
      for (const [key, count] of Object.entries(instMap).sort()) {
        console.log(`   ${key}: ${count} applications`);
      }
      
      if (mismatches.length > 0) {
        log('Inst-Prog Map', 'WARN', `${mismatches.length} mismatches found (legacy data)`);
        for (const m of mismatches.slice(0, 5)) {
          console.log(`   ⚠️ ${m}`);
        }
      } else {
        log('Inst-Prog Map', 'PASS', 'All applications match expected institution-program mapping');
      }
    }
  }

  // ── 13. Admin Dashboard & Stats ──
  console.log('\n--- 13. ADMIN DASHBOARD ---');
  if (!adminToken) { log('Dashboard', 'SKIP', 'No admin token'); } else {
    const dash = await api('/api/admin?action=dashboard', { token: adminToken });
    if (dash.ok && dash.data?.success) {
      const d = dash.data.data;
      log('Dashboard', 'PASS', `keys=${Object.keys(d || {}).join(',')}`);
    } else {
      log('Dashboard', 'FAIL', `status=${dash.status}, ${JSON.stringify(dash.data).slice(0, 200)}`);
    }
  }

  // ── 14. Notifications ──
  console.log('\n--- 14. NOTIFICATIONS ---');
  const notifs = await api('/api/notifications?action=preferences', { token: studentToken });
  if (notifs.ok || notifs.status === 200) {
    log('Notification Prefs', 'PASS', JSON.stringify(notifs.data?.data || notifs.data).slice(0, 150));
  } else {
    log('Notification Prefs', 'FAIL', `status=${notifs.status}`);
  }

  // ── 15. Sessions ──
  console.log('\n--- 15. SESSIONS ---');
  const sess = await api('/api/sessions?action=list', { token: studentToken });
  if (sess.ok && sess.data?.success) {
    const list = sess.data.data?.sessions || sess.data.data || [];
    log('Sessions', 'PASS', `count=${Array.isArray(list) ? list.length : 0}`);
  } else {
    log('Sessions', 'FAIL', `status=${sess.status}`);
  }

  // ── 16. Audit Trail ──
  console.log('\n--- 16. AUDIT TRAIL ---');
  if (!adminToken) { log('Audit', 'SKIP', 'No admin token'); } else {
    const audit = await api('/api/admin?action=audit-log', { token: adminToken });
    if (audit.ok && audit.data?.success) {
      const entries = audit.data.data?.entries || audit.data.data?.logs || audit.data.data || [];
      log('Audit Trail', 'PASS', `count=${Array.isArray(entries) ? entries.length : 0}`);
    } else {
      log('Audit Trail', 'FAIL', `status=${audit.status}`);
    }
  }

  printSummary();
}

function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const warn = results.filter(r => r.status === 'WARN').length;
  const skip = results.filter(r => r.status === 'SKIP').length;
  console.log(`PASS: ${pass} | FAIL: ${fail} | WARN: ${warn} | SKIP: ${skip}`);

  if (fail > 0) {
    console.log('\nFAILED TESTS:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ❌ ${r.label}: ${r.detail}`);
    });
  }

  if (createdAppIds.length > 0) {
    console.log(`\nCreated Application IDs: ${createdAppIds.join(', ')}`);
  }
}

main().catch(err => {
  console.error('\n💥 FATAL:', err.message);
  console.error(err.stack);
});
