import { createRequire } from "node:module";
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// api-src/health.ts
async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  const action = req.query.action;
  if (action === "ping") {
    return res.status(200).json({
      success: true,
      message: "pong",
      timestamp: new Date().toISOString()
    });
  }
  if (action === "db") {
    return handleDatabaseHealth(res);
  }
  if (action === "env") {
    return handleEnvCheck(res);
  }
  return res.status(200).json({
    success: true,
    data: {
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: process.env.VERCEL_ENV || "development",
      version: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7),
      databaseType: "neon"
    }
  });
}
async function handleDatabaseHealth(res) {
  const startTime = Date.now();
  const checks = {};
  try {
    const { neon } = await import("@neondatabase/serverless");
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      res.status(503).json({
        success: false,
        data: {
          status: "unhealthy",
          error: "DATABASE_URL not configured",
          timestamp: new Date().toISOString()
        }
      });
      return;
    }
    const sql = neon(connectionString);
    try {
      const connectStart = Date.now();
      await sql`SELECT 1 as test`;
      checks.connectivity = {
        status: "ok",
        latency: Date.now() - connectStart
      };
    } catch (error) {
      checks.connectivity = {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
    try {
      const tableStart = Date.now();
      await sql`SELECT COUNT(*) FROM profiles LIMIT 1`;
      checks.profiles_table = {
        status: "ok",
        latency: Date.now() - tableStart
      };
    } catch (error) {
      checks.profiles_table = {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
    const totalLatency = Date.now() - startTime;
    const allOk = Object.values(checks).every((c) => c.status === "ok");
    const hasErrors = Object.values(checks).some((c) => c.status === "error");
    const overallStatus = hasErrors ? "unhealthy" : allOk ? "healthy" : "degraded";
    res.status(hasErrors ? 503 : 200).json({
      success: !hasErrors,
      data: {
        status: overallStatus,
        databaseType: "neon",
        checks,
        totalLatency,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      data: {
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      }
    });
  }
}
function handleEnvCheck(res) {
  const requiredVars = [
    "DATABASE_URL",
    "JWT_SECRET",
    "JWT_REFRESH_SECRET",
    "ARCJET_KEY"
  ];
  const envStatus = {};
  const missing = [];
  for (const varName of requiredVars) {
    const isSet = !!process.env[varName];
    envStatus[varName] = isSet;
    if (!isSet) {
      missing.push(varName);
    }
  }
  const allRequired = missing.length === 0;
  res.status(allRequired ? 200 : 503).json({
    success: allRequired,
    data: {
      status: allRequired ? "ok" : "missing_env_vars",
      environment: process.env.VERCEL_ENV || "development",
      envStatus,
      missing: missing.length > 0 ? missing : undefined,
      timestamp: new Date().toISOString()
    }
  });
}
export {
  handler as default
};
