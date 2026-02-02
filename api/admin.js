import { createRequire } from "node:module";
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// lib/cors.ts
var ALLOWED_ORIGINS = [
  "https://apply.mihas.edu.zm",
  "https://mihas.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000"
];
function getCorsHeaders(origin) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400"
  };
}
function handleCors(req, res) {
  const origin = req.headers.origin;
  const headers = getCorsHeaders(origin);
  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

// lib/db.ts
var DatabaseErrorCode = {
  CONNECTION_ERROR: "CONNECTION_ERROR",
  QUERY_ERROR: "QUERY_ERROR",
  TRANSACTION_ERROR: "TRANSACTION_ERROR",
  SCHEMA_ERROR: "SCHEMA_ERROR",
  CONFIG_ERROR: "CONFIG_ERROR",
  TIMEOUT_ERROR: "TIMEOUT_ERROR",
  CONSTRAINT_VIOLATION: "CONSTRAINT_VIOLATION",
  NOT_FOUND: "NOT_FOUND"
};

class DatabaseError extends Error {
  code;
  query;
  originalError;
  constructor(message, code = DatabaseErrorCode.QUERY_ERROR, options) {
    super(message);
    this.name = "DatabaseError";
    this.code = code;
    this.query = options?.query ? sanitizeQueryForLogging(options.query) : undefined;
    this.originalError = options?.originalError;
  }
}
function getDatabaseConfig() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new DatabaseError("DATABASE_URL not configured. Set the Neon connection string.", DatabaseErrorCode.CONFIG_ERROR);
  }
  return { url };
}
function sanitizeQueryForLogging(query) {
  return query.replace(/'[^']*'/g, "'[REDACTED]'").replace(/"[^"]*"/g, '"[REDACTED]"');
}
function extractCommand(query) {
  const trimmed = query.trim().toUpperCase();
  const commands = ["SELECT", "INSERT", "UPDATE", "DELETE", "BEGIN", "COMMIT", "ROLLBACK", "CREATE", "ALTER", "DROP"];
  for (const cmd of commands) {
    if (trimmed.startsWith(cmd)) {
      return cmd;
    }
  }
  return "UNKNOWN";
}
async function executeNeonQuery(queryText, params) {
  const command = extractCommand(queryText);
  try {
    const { neon } = await import("@neondatabase/serverless");
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new DatabaseError("DATABASE_URL not configured for Neon", DatabaseErrorCode.CONFIG_ERROR);
    }
    const sql = neon(connectionString);
    let rows;
    if (params && params.length > 0) {
      rows = await sql.query(queryText, params);
    } else {
      rows = await sql.query(queryText);
    }
    const resultRows = Array.isArray(rows) ? rows : [];
    return {
      rows: resultRows,
      rowCount: resultRows.length,
      command
    };
  } catch (error) {
    if (error instanceof DatabaseError)
      throw error;
    const errorMessage = error.message || "Unknown error";
    if (errorMessage.includes("duplicate key")) {
      throw new DatabaseError("Duplicate key violation", DatabaseErrorCode.CONSTRAINT_VIOLATION, { query: queryText, originalError: error });
    }
    if (errorMessage.includes("foreign key")) {
      throw new DatabaseError("Foreign key violation", DatabaseErrorCode.CONSTRAINT_VIOLATION, { query: queryText, originalError: error });
    }
    if (errorMessage.includes("timeout") || errorMessage.includes("ETIMEDOUT")) {
      throw new DatabaseError("Database query timeout", DatabaseErrorCode.TIMEOUT_ERROR, { query: queryText, originalError: error });
    }
    throw new DatabaseError(`Neon query execution failed: ${errorMessage}`, DatabaseErrorCode.QUERY_ERROR, { query: queryText, originalError: error });
  }
}
async function query(queryText, params) {
  getDatabaseConfig();
  return executeNeonQuery(queryText, params);
}

// lib/storage.ts
import { createHmac, createHash } from "crypto";
var R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
var R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
var R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
var R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "mihasapplication";
var R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
var R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || `https://a3ba1959935abd8777e64caee46d1de1.r2.cloudflarestorage.com/${R2_BUCKET_NAME}`;

class AwsV4Signer {
  accessKeyId;
  secretAccessKey;
  region;
  service;
  constructor(accessKeyId, secretAccessKey, region = "auto", service = "s3") {
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.region = region;
    this.service = service;
  }
  sign(method, url, headers, body) {
    const parsedUrl = new URL(url);
    const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const date = datetime.substring(0, 8);
    headers["x-amz-date"] = datetime;
    headers["x-amz-content-sha256"] = body ? createHash("sha256").update(body).digest("hex") : "UNSIGNED-PAYLOAD";
    headers["host"] = parsedUrl.host;
    const signedHeaders = Object.keys(headers).map((k) => k.toLowerCase()).sort().join(";");
    const canonicalHeaders = Object.keys(headers).map((k) => `${k.toLowerCase()}:${headers[k].trim()}`).sort().join(`
`);
    const canonicalRequest = [
      method,
      parsedUrl.pathname,
      parsedUrl.search.substring(1),
      canonicalHeaders + `
`,
      signedHeaders,
      headers["x-amz-content-sha256"]
    ].join(`
`);
    const credentialScope = `${date}/${this.region}/${this.service}/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      datetime,
      credentialScope,
      createHash("sha256").update(canonicalRequest).digest("hex")
    ].join(`
`);
    const kDate = createHmac("sha256", `AWS4${this.secretAccessKey}`).update(date).digest();
    const kRegion = createHmac("sha256", kDate).update(this.region).digest();
    const kService = createHmac("sha256", kRegion).update(this.service).digest();
    const kSigning = createHmac("sha256", kService).update("aws4_request").digest();
    const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
    headers["Authorization"] = [
      `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`
    ].join(", ");
    return headers;
  }
  getSignedUrl(method, url, expiresIn = 3600) {
    const parsedUrl = new URL(url);
    const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const date = datetime.substring(0, 8);
    const credentialScope = `${date}/${this.region}/${this.service}/aws4_request`;
    const params = new URLSearchParams(parsedUrl.search);
    params.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
    params.set("X-Amz-Credential", `${this.accessKeyId}/${credentialScope}`);
    params.set("X-Amz-Date", datetime);
    params.set("X-Amz-Expires", String(expiresIn));
    params.set("X-Amz-SignedHeaders", "host");
    const sortedParams = new URLSearchParams([...params.entries()].sort());
    parsedUrl.search = sortedParams.toString();
    const canonicalRequest = [
      method,
      parsedUrl.pathname,
      sortedParams.toString(),
      `host:${parsedUrl.host}
`,
      "host",
      "UNSIGNED-PAYLOAD"
    ].join(`
`);
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      datetime,
      credentialScope,
      createHash("sha256").update(canonicalRequest).digest("hex")
    ].join(`
`);
    const kDate = createHmac("sha256", `AWS4${this.secretAccessKey}`).update(date).digest();
    const kRegion = createHmac("sha256", kDate).update(this.region).digest();
    const kService = createHmac("sha256", kRegion).update(this.service).digest();
    const kSigning = createHmac("sha256", kService).update("aws4_request").digest();
    const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
    sortedParams.set("X-Amz-Signature", signature);
    parsedUrl.search = sortedParams.toString();
    return parsedUrl.toString();
  }
}

class R2StorageAdapter {
  signer;
  bucketName;
  endpoint;
  publicUrl;
  constructor() {
    if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
      console.warn("[R2Storage] Missing R2 credentials - storage operations will fail");
    }
    this.signer = new AwsV4Signer(R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY);
    this.bucketName = R2_BUCKET_NAME;
    this.endpoint = R2_ENDPOINT;
    this.publicUrl = R2_PUBLIC_URL;
  }
  isConfigured() {
    return !!(R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_ACCOUNT_ID);
  }
  async upload(path, data, contentType = "application/octet-stream") {
    if (!this.isConfigured()) {
      return { success: false, error: "R2 storage not configured" };
    }
    const url = `${this.endpoint}/${this.bucketName}/${path}`;
    const headers = {
      "Content-Type": contentType,
      "Content-Length": String(data.length)
    };
    try {
      const signedHeaders = this.signer.sign("PUT", url, headers, data);
      const response = await fetch(url, {
        method: "PUT",
        headers: signedHeaders,
        body: data
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error("[R2Storage] Upload failed:", response.status, errorText);
        return { success: false, error: `Upload failed: ${response.status}` };
      }
      console.log("[R2Storage] File uploaded:", path);
      return {
        success: true,
        path,
        url: `${this.publicUrl}/${path}`,
        size: data.length,
        contentType
      };
    } catch (error) {
      console.error("[R2Storage] Upload error:", error);
      return { success: false, error: error.message };
    }
  }
  async download(path) {
    if (!this.isConfigured()) {
      console.error("[R2Storage] R2 storage not configured");
      return null;
    }
    const url = `${this.endpoint}/${this.bucketName}/${path}`;
    const headers = {};
    try {
      const signedHeaders = this.signer.sign("GET", url, headers);
      const response = await fetch(url, {
        method: "GET",
        headers: signedHeaders
      });
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        console.error("[R2Storage] Download failed:", response.status);
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error("[R2Storage] Download error:", error);
      return null;
    }
  }
  async delete(path) {
    if (!this.isConfigured()) {
      console.error("[R2Storage] R2 storage not configured");
      return false;
    }
    const url = `${this.endpoint}/${this.bucketName}/${path}`;
    const headers = {};
    try {
      const signedHeaders = this.signer.sign("DELETE", url, headers);
      const response = await fetch(url, {
        method: "DELETE",
        headers: signedHeaders
      });
      if (!response.ok && response.status !== 204) {
        console.error("[R2Storage] Delete failed:", response.status);
        return false;
      }
      console.log("[R2Storage] File deleted:", path);
      return true;
    } catch (error) {
      console.error("[R2Storage] Delete error:", error);
      return false;
    }
  }
  getSignedUrl(path, expiresIn = 3600) {
    const url = `${this.endpoint}/${this.bucketName}/${path}`;
    return this.signer.getSignedUrl("GET", url, expiresIn);
  }
  getPublicUrl(path) {
    return `${this.publicUrl}/${path}`;
  }
  async exists(path) {
    if (!this.isConfigured()) {
      return false;
    }
    const url = `${this.endpoint}/${this.bucketName}/${path}`;
    const headers = {};
    try {
      const signedHeaders = this.signer.sign("HEAD", url, headers);
      const response = await fetch(url, {
        method: "HEAD",
        headers: signedHeaders
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  async getMetadata(path) {
    if (!this.isConfigured()) {
      return null;
    }
    const url = `${this.endpoint}/${this.bucketName}/${path}`;
    const headers = {};
    try {
      const signedHeaders = this.signer.sign("HEAD", url, headers);
      const response = await fetch(url, {
        method: "HEAD",
        headers: signedHeaders
      });
      if (!response.ok) {
        return null;
      }
      return {
        path,
        size: parseInt(response.headers.get("content-length") || "0", 10),
        contentType: response.headers.get("content-type") || "application/octet-stream",
        lastModified: new Date(response.headers.get("last-modified") || Date.now()),
        etag: response.headers.get("etag") || undefined
      };
    } catch {
      return null;
    }
  }
  async list(prefix = "", maxKeys = 1000) {
    if (!this.isConfigured()) {
      return [];
    }
    const url = new URL(`${this.endpoint}/${this.bucketName}`);
    if (prefix) {
      url.searchParams.set("prefix", prefix);
    }
    url.searchParams.set("max-keys", String(maxKeys));
    const headers = {};
    try {
      const signedHeaders = this.signer.sign("GET", url.toString(), headers);
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: signedHeaders
      });
      if (!response.ok) {
        console.error("[R2Storage] List failed:", response.status);
        return [];
      }
      const xml = await response.text();
      const keys = [];
      const keyMatches = xml.matchAll(/<Key>([^<]+)<\/Key>/g);
      for (const match of keyMatches) {
        keys.push(match[1]);
      }
      return keys;
    } catch (error) {
      console.error("[R2Storage] List error:", error);
      return [];
    }
  }
}
var r2Instance = null;
function getR2Storage() {
  if (!r2Instance) {
    r2Instance = new R2StorageAdapter;
  }
  return r2Instance;
}

// lib/supabaseClient.ts
class MockQueryBuilder {
  table;
  operation = "select";
  selectColumns = "*";
  filters = [];
  orderByColumn;
  orderAsc = true;
  limitCount;
  offsetCount;
  insertData;
  updateData;
  upsertConflict;
  countOnly = false;
  headOnly = false;
  constructor(table) {
    this.table = table;
  }
  select(columns = "*", options) {
    this.operation = "select";
    this.selectColumns = columns;
    if (options?.count === "exact") {
      this.countOnly = true;
    }
    if (options?.head) {
      this.headOnly = true;
    }
    return this;
  }
  insert(data) {
    this.operation = "insert";
    this.insertData = data;
    return this;
  }
  update(data) {
    this.operation = "update";
    this.updateData = data;
    return this;
  }
  upsert(data, options) {
    this.operation = "upsert";
    this.insertData = data;
    this.upsertConflict = options?.onConflict || "id";
    return this;
  }
  delete() {
    this.operation = "delete";
    return this;
  }
  eq(column, value) {
    this.filters.push({ column, op: "=", value });
    return this;
  }
  neq(column, value) {
    this.filters.push({ column, op: "!=", value });
    return this;
  }
  gt(column, value) {
    this.filters.push({ column, op: ">", value });
    return this;
  }
  gte(column, value) {
    this.filters.push({ column, op: ">=", value });
    return this;
  }
  lt(column, value) {
    this.filters.push({ column, op: "<", value });
    return this;
  }
  lte(column, value) {
    this.filters.push({ column, op: "<=", value });
    return this;
  }
  like(column, value) {
    this.filters.push({ column, op: "LIKE", value });
    return this;
  }
  ilike(column, value) {
    this.filters.push({ column, op: "ILIKE", value });
    return this;
  }
  in(column, values) {
    this.filters.push({ column, op: "IN", value: values });
    return this;
  }
  is(column, value) {
    this.filters.push({ column, op: "IS", value });
    return this;
  }
  order(column, options) {
    this.orderByColumn = column;
    this.orderAsc = options?.ascending ?? true;
    return this;
  }
  limit(count) {
    this.limitCount = count;
    return this;
  }
  range(from, to) {
    this.offsetCount = from;
    this.limitCount = to - from + 1;
    return this;
  }
  async single() {
    this.limitCount = 1;
    const result = await this.execute();
    if (result.error) {
      return { data: null, error: result.error, code: result.error.code };
    }
    if (!result.data || result.data.length === 0) {
      return { data: null, error: new Error("No rows returned"), code: "PGRST116" };
    }
    return { data: result.data[0], error: null };
  }
  async maybeSingle() {
    this.limitCount = 1;
    const result = await this.execute();
    return {
      data: result.data?.[0] || null,
      error: result.error
    };
  }
  buildWhereClause() {
    if (this.filters.length === 0) {
      return { sql: "", params: [], nextIndex: 1 };
    }
    const conditions = [];
    const params = [];
    let paramIndex = 1;
    for (const filter of this.filters) {
      if (filter.op === "IN" && Array.isArray(filter.value)) {
        const placeholders = filter.value.map(() => `$${paramIndex++}`).join(", ");
        conditions.push(`${filter.column} IN (${placeholders})`);
        params.push(...filter.value);
      } else if (filter.op === "IS") {
        conditions.push(`${filter.column} IS ${filter.value === null ? "NULL" : "NOT NULL"}`);
      } else {
        conditions.push(`${filter.column} ${filter.op} $${paramIndex++}`);
        params.push(filter.value);
      }
    }
    return { sql: ` WHERE ${conditions.join(" AND ")}`, params, nextIndex: paramIndex };
  }
  async executeSelect() {
    try {
      const { sql: whereClause, params } = this.buildWhereClause();
      if (this.countOnly && this.headOnly) {
        const countQuery = `SELECT COUNT(*) as count FROM ${this.table}${whereClause}`;
        const result2 = await query(countQuery, params);
        const count2 = parseInt(result2.rows[0]?.count || "0", 10);
        return { data: null, error: null, count: count2 };
      }
      let sqlQuery = `SELECT ${this.selectColumns} FROM ${this.table}${whereClause}`;
      if (this.orderByColumn) {
        sqlQuery += ` ORDER BY ${this.orderByColumn} ${this.orderAsc ? "ASC" : "DESC"}`;
      }
      if (this.limitCount !== undefined) {
        sqlQuery += ` LIMIT ${this.limitCount}`;
      }
      if (this.offsetCount !== undefined) {
        sqlQuery += ` OFFSET ${this.offsetCount}`;
      }
      const result = await query(sqlQuery, params);
      let count;
      if (this.countOnly) {
        const countQuery = `SELECT COUNT(*) as count FROM ${this.table}${whereClause}`;
        const countResult = await query(countQuery, params);
        count = parseInt(countResult.rows[0]?.count || "0", 10);
      }
      return { data: result.rows, error: null, count };
    } catch (error) {
      return { data: null, error };
    }
  }
  async executeInsert() {
    try {
      const rows = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
      const results = [];
      for (const row of rows) {
        if (!row)
          continue;
        const columns = Object.keys(row);
        const values = Object.values(row);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
        const sqlQuery = `INSERT INTO ${this.table} (${columns.join(", ")}) VALUES (${placeholders}) RETURNING *`;
        const result = await query(sqlQuery, values);
        if (result.rows[0]) {
          results.push(result.rows[0]);
        }
      }
      return { data: results, error: null };
    } catch (error) {
      const err = error;
      return { data: null, error: err };
    }
  }
  async executeUpdate() {
    try {
      if (!this.updateData) {
        return { data: [], error: null };
      }
      const { sql: whereClause, params: whereParams, nextIndex } = this.buildWhereClause();
      const columns = Object.keys(this.updateData);
      const values = Object.values(this.updateData);
      const setClause = columns.map((col, i) => `${col} = $${nextIndex + i}`).join(", ");
      const sqlQuery = `UPDATE ${this.table} SET ${setClause}${whereClause} RETURNING *`;
      const result = await query(sqlQuery, [...whereParams, ...values]);
      return { data: result.rows, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }
  async executeDelete() {
    try {
      const { sql: whereClause, params } = this.buildWhereClause();
      const sqlQuery = `DELETE FROM ${this.table}${whereClause} RETURNING *`;
      const result = await query(sqlQuery, params);
      return { data: result.rows, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }
  async executeUpsert() {
    try {
      const rows = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
      const results = [];
      for (const row of rows) {
        if (!row)
          continue;
        const columns = Object.keys(row);
        const values = Object.values(row);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
        const updateClause = columns.filter((col) => col !== this.upsertConflict).map((col, i) => `${col} = EXCLUDED.${col}`).join(", ");
        const sqlQuery = `INSERT INTO ${this.table} (${columns.join(", ")}) VALUES (${placeholders}) 
                          ON CONFLICT (${this.upsertConflict}) DO UPDATE SET ${updateClause} RETURNING *`;
        const result = await query(sqlQuery, values);
        if (result.rows[0]) {
          results.push(result.rows[0]);
        }
      }
      return { data: results, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }
  async execute() {
    switch (this.operation) {
      case "insert":
        return this.executeInsert();
      case "update":
        return this.executeUpdate();
      case "delete":
        return this.executeDelete();
      case "upsert":
        return this.executeUpsert();
      case "select":
      default:
        return this.executeSelect();
    }
  }
  async then(onfulfilled, onrejected) {
    try {
      const result = await this.execute();
      return onfulfilled ? onfulfilled(result) : result;
    } catch (error) {
      if (onrejected) {
        return onrejected(error);
      }
      throw error;
    }
  }
}
var mockStorage = {
  from: (bucket) => {
    const r2 = getR2Storage();
    return {
      async upload(path, file, options) {
        const buffer = file instanceof Blob ? Buffer.from(await file.arrayBuffer()) : file;
        const result = await r2.upload(`${bucket}/${path}`, buffer, options?.contentType);
        if (result.success) {
          return { data: { path: result.path }, error: null };
        }
        return { data: null, error: new Error(result.error) };
      },
      async download(path) {
        const data = await r2.download(`${bucket}/${path}`);
        if (data) {
          return { data, error: null };
        }
        return { data: null, error: new Error("File not found") };
      },
      getPublicUrl(path) {
        return { data: { publicUrl: r2.getPublicUrl(`${bucket}/${path}`) } };
      },
      async createSignedUrl(path, expiresIn) {
        const url = r2.getSignedUrl(`${bucket}/${path}`, expiresIn);
        return { data: { signedUrl: url }, error: null };
      },
      async remove(paths) {
        const errors = [];
        for (const path of paths) {
          const success = await r2.delete(`${bucket}/${path}`);
          if (!success) {
            errors.push(path);
          }
        }
        if (errors.length > 0) {
          return { data: null, error: new Error(`Failed to delete: ${errors.join(", ")}`) };
        }
        return { data: { message: "Deleted" }, error: null };
      },
      async list(prefix, options) {
        const files = await r2.list(prefix ? `${bucket}/${prefix}` : bucket, options?.limit);
        return { data: files.map((f) => ({ name: f })), error: null };
      }
    };
  }
};
async function mockRpc(fn, _params) {
  console.warn(`[DEPRECATED] supabaseAdmin.rpc('${fn}') is deprecated. Use direct SQL queries instead.`);
  return { data: null, error: new Error(`RPC function '${fn}' not supported. Use direct SQL.`) };
}
var supabaseAdmin = {
  from: (table) => new MockQueryBuilder(table),
  storage: mockStorage,
  rpc: mockRpc
};

// lib/errorHandler.ts
var HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};
var ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_INPUT: "INVALID_INPUT",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
  AUTHENTICATION_ERROR: "AUTHENTICATION_ERROR",
  AUTHENTICATION_REQUIRED: "AUTHENTICATION_REQUIRED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  INVALID_TOKEN: "INVALID_TOKEN",
  AUTHORIZATION_ERROR: "AUTHORIZATION_ERROR",
  INSUFFICIENT_PERMISSIONS: "INSUFFICIENT_PERMISSIONS",
  SECURITY_VIOLATION: "SECURITY_VIOLATION",
  NOT_FOUND: "NOT_FOUND",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  DATABASE_ERROR: "DATABASE_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE"
};

class AuthError extends Error {
  code;
  statusCode;
  isOperational;
  constructor(message, code = ErrorCode.INTERNAL_ERROR, statusCode = HttpStatus.BAD_REQUEST, isOperational = true) {
    super(sanitizeError(message));
    this.name = "AuthError";
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuthError);
    }
  }
  static validation(message) {
    return new AuthError(message, ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST);
  }
  static authentication(message = "Authentication required") {
    return new AuthError(message, ErrorCode.AUTHENTICATION_ERROR, HttpStatus.UNAUTHORIZED);
  }
  static invalidCredentials() {
    return new AuthError("Invalid email or password", ErrorCode.INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
  }
  static tokenExpired() {
    return new AuthError("Token has expired", ErrorCode.TOKEN_EXPIRED, HttpStatus.UNAUTHORIZED);
  }
  static invalidToken() {
    return new AuthError("Invalid token", ErrorCode.INVALID_TOKEN, HttpStatus.UNAUTHORIZED);
  }
  static forbidden(message = "Access denied") {
    return new AuthError(message, ErrorCode.AUTHORIZATION_ERROR, HttpStatus.FORBIDDEN);
  }
  static insufficientPermissions() {
    return new AuthError("Insufficient permissions", ErrorCode.INSUFFICIENT_PERMISSIONS, HttpStatus.FORBIDDEN);
  }
  static securityViolation() {
    return new AuthError("Request blocked by security policy", ErrorCode.SECURITY_VIOLATION, HttpStatus.FORBIDDEN);
  }
  static rateLimited() {
    return new AuthError("Too many requests. Please try again later.", ErrorCode.RATE_LIMITED, HttpStatus.TOO_MANY_REQUESTS);
  }
  static notFound(resource = "Resource") {
    return new AuthError(`${resource} not found`, ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
  }
  static internal() {
    return new AuthError("An unexpected error occurred", ErrorCode.INTERNAL_ERROR, HttpStatus.INTERNAL_SERVER_ERROR, false);
  }
  static serviceUnavailable() {
    return new AuthError("Service temporarily unavailable", ErrorCode.SERVICE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE);
  }
  static database() {
    return new AuthError("Database operation failed", ErrorCode.DATABASE_ERROR, HttpStatus.INTERNAL_SERVER_ERROR, false);
  }
  toJSON() {
    return {
      success: false,
      error: this.message,
      code: this.code
    };
  }
}
function sanitizeError(message) {
  if (!message || typeof message !== "string") {
    return "An error occurred";
  }
  let sanitized = message;
  sanitized = sanitized.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[ID]");
  sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]");
  sanitized = sanitized.replace(/eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, "[TOKEN]");
  sanitized = sanitized.replace(/(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|mssql):\/\/[^\s"']+/gi, "[CONNECTION_STRING]");
  sanitized = sanitized.replace(/https?:\/\/[a-z0-9-]+\.supabase\.co[^\s"']*/gi, "[SUPABASE_URL]");
  sanitized = sanitized.replace(/https?:\/\/[a-z0-9-]+\.neon\.tech[^\s"']*/gi, "[NEON_URL]");
  sanitized = sanitized.replace(/(?:api[_-]?key|secret|password|token|auth|bearer)[=:]\s*["']?[a-zA-Z0-9_\-./+=]{16,}["']?/gi, "[CREDENTIAL]");
  sanitized = sanitized.replace(/eyJ[a-zA-Z0-9_-]{100,}/g, "[SERVICE_KEY]");
  sanitized = sanitized.replace(/\$2[aby]?\$\d{1,2}\$[./A-Za-z0-9]{53}/g, "[HASH]");
  sanitized = sanitized.replace(/\b[a-f0-9]{64}\b/gi, "[HASH]");
  sanitized = sanitized.replace(/(?:\/(?:home|var|usr|etc|tmp|app|opt|srv)[^\s"']*|[A-Z]:\\[^\s"']*)/gi, "[PATH]");
  sanitized = sanitized.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[IP]");
  sanitized = sanitized.replace(/:\d{4,5}(?=\s|$|\/)/g, ":[PORT]");
  sanitized = sanitized.replace(/\+?\d{1,4}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g, "[PHONE]");
  sanitized = sanitized.replace(/(?:user|profile|account)\s+['"]?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?['"]?/gi, "[USER]");
  return sanitized;
}
function logError(context, error) {
  const message = error instanceof Error ? error.message : String(error);
  const sanitized = sanitizeError(message);
  if (error instanceof AuthError) {
    console.error(`[${context}] Error (${error.code}):`, sanitized);
  } else {
    console.error(`[${context}] Error:`, sanitized);
  }
}
function handleError(res, error, context = "API") {
  logError(context, error);
  res.setHeader("Content-Type", "application/json");
  if (error instanceof AuthError) {
    return res.status(error.statusCode).json(error.toJSON());
  }
  let status = HttpStatus.INTERNAL_SERVER_ERROR;
  let message = "An unexpected error occurred";
  let code = ErrorCode.INTERNAL_ERROR;
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();
    if (errorMessage.includes("unauthorized") || errorMessage.includes("no authorization") || errorMessage.includes("authentication")) {
      status = HttpStatus.UNAUTHORIZED;
      message = "Authentication required";
      code = ErrorCode.AUTHENTICATION_ERROR;
    } else if (errorMessage.includes("forbidden") || errorMessage.includes("access denied") || errorMessage.includes("permission") || errorMessage.includes("insufficient")) {
      status = HttpStatus.FORBIDDEN;
      message = "Access denied";
      code = ErrorCode.AUTHORIZATION_ERROR;
    } else if (errorMessage.includes("not found")) {
      status = HttpStatus.NOT_FOUND;
      message = "Resource not found";
      code = ErrorCode.NOT_FOUND;
    } else if (errorMessage.includes("validation") || errorMessage.includes("invalid")) {
      status = HttpStatus.BAD_REQUEST;
      message = sanitizeError(error.message);
      code = ErrorCode.VALIDATION_ERROR;
    } else if (errorMessage.includes("rate limit") || errorMessage.includes("too many")) {
      status = HttpStatus.TOO_MANY_REQUESTS;
      message = "Too many requests. Please try again later.";
      code = ErrorCode.RATE_LIMITED;
    } else if (errorMessage.includes("unavailable") || errorMessage.includes("timeout")) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      message = "Service temporarily unavailable";
      code = ErrorCode.SERVICE_UNAVAILABLE;
    } else if (errorMessage.includes("expired")) {
      status = HttpStatus.UNAUTHORIZED;
      message = "Token has expired";
      code = ErrorCode.TOKEN_EXPIRED;
    }
  }
  const response = {
    success: false,
    error: message,
    code
  };
  return res.status(status).json(response);
}
function sendSuccess(res, data, status = HttpStatus.OK) {
  res.setHeader("Content-Type", "application/json");
  const response = {
    success: true,
    data
  };
  return res.status(status).json(response);
}
function sendError(res, message, status = HttpStatus.BAD_REQUEST, code = ErrorCode.VALIDATION_ERROR) {
  res.setHeader("Content-Type", "application/json");
  const response = {
    success: false,
    error: sanitizeError(message),
    code
  };
  return res.status(status).json(response);
}

// lib/arcjet.ts
import arcjet, { shield, detectBot, fixedWindow } from "@arcjet/node";
var ARCJET_KEY = process.env.ARCJET_KEY;
if (!ARCJET_KEY) {
  console.error("[ARCJET] FATAL: ARCJET_KEY environment variable not set");
  console.error("[ARCJET] Security layer DISABLED - set ARCJET_KEY immediately");
}
var rateLimitConfigs = {
  auth: { window: "5m", max: 5 },
  session: { window: "10m", max: 30 },
  admin: { window: "10m", max: 20 },
  notification: { window: "10m", max: 50 },
  general: { window: "10m", max: 100 }
};
function getBlockReasonType(decision) {
  if (decision.reason.isRateLimit()) {
    return "RATE_LIMIT";
  }
  if (decision.reason.isBot()) {
    return "BOT_DETECTED";
  }
  if (decision.reason.isShield()) {
    return "SHIELD_BLOCK";
  }
  return "POLICY_VIOLATION";
}
function handleArcjetDecision(decision, res) {
  if (decision.isDenied()) {
    const reasonType = getBlockReasonType(decision);
    console.log("[ARCJET] BLOCKED: reason=" + reasonType + ", id=" + decision.id);
    res.status(403).json({
      success: false,
      error: "Request blocked by security policy",
      code: "SECURITY_VIOLATION"
    });
    return true;
  }
  return false;
}
function createProtectedArcjet(routeType) {
  const config = rateLimitConfigs[routeType];
  return arcjet({
    key: ARCJET_KEY,
    characteristics: ["ip.src"],
    rules: [
      shield({ mode: "LIVE" }),
      detectBot({
        mode: "LIVE",
        allow: ["CATEGORY:SEARCH_ENGINE"]
      }),
      fixedWindow({
        mode: "LIVE",
        window: config.window,
        max: config.max
      })
    ]
  });
}
function withArcjetProtection(handler, routeType = "general") {
  return async (req, res) => {
    if (!ARCJET_KEY) {
      console.warn("[ARCJET] WARNING: Running without Arcjet protection");
      return handler(req, res);
    }
    try {
      const protectedAj = createProtectedArcjet(routeType);
      const decision = await protectedAj.protect(req);
      if (handleArcjetDecision(decision, res)) {
        return;
      }
      return handler(req, res);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("[ARCJET] Service error: " + errorMsg);
      res.status(503).json({
        success: false,
        error: "Security service unavailable",
        code: "SECURITY_SERVICE_ERROR"
      });
    }
  };
}
var aj = ARCJET_KEY ? arcjet({
  key: ARCJET_KEY,
  characteristics: ["ip.src"],
  rules: [
    shield({ mode: "LIVE" }),
    detectBot({
      mode: "LIVE",
      allow: ["CATEGORY:SEARCH_ENGINE"]
    })
  ]
}) : null;

// lib/auth/jwt.ts
import { SignJWT, jwtVerify } from "jose";
var TOKEN_ISSUER = "mihas-auth";
var TOKEN_AUDIENCE = "mihas-app";
var ALGORITHM = "HS256";
function getAccessTokenSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not configured");
  }
  return new TextEncoder().encode(secret);
}
async function verifyAccessToken(token) {
  if (!token || token.trim().length === 0) {
    throw new Error("Token is required for verification");
  }
  try {
    const secret = getAccessTokenSecret();
    const { payload } = await jwtVerify(token, secret, {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
      algorithms: [ALGORITHM]
    });
    if (payload.type !== "access") {
      throw new Error("Invalid token type: expected access token");
    }
    if (!payload.sub) {
      throw new Error("Token missing required subject claim");
    }
    if (!payload.email || typeof payload.email !== "string") {
      throw new Error("Token missing required email claim");
    }
    if (!payload.role || typeof payload.role !== "string") {
      throw new Error("Token missing required role claim");
    }
    const accessPayload = {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
      type: "access",
      iat: payload.iat,
      exp: payload.exp,
      iss: payload.iss,
      aud: typeof payload.aud === "string" ? payload.aud : payload.aud?.[0]
    };
    return accessPayload;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    if (errorMessage.includes("expired")) {
      throw new Error("Access token has expired");
    }
    if (errorMessage.includes("signature")) {
      throw new Error("Invalid token signature");
    }
    if (errorMessage.includes("issuer")) {
      throw new Error("Invalid token issuer");
    }
    if (errorMessage.includes("audience")) {
      throw new Error("Invalid token audience");
    }
    if (errorMessage.includes("token type")) {
      throw new Error(errorMessage);
    }
    if (errorMessage.includes("missing required")) {
      throw new Error(errorMessage);
    }
    throw new Error("Access token verification failed");
  }
}

// lib/auth/cookies.ts
var ACCESS_TOKEN_COOKIE = "access_token";
function parseCookies(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return {};
  }
  const cookies = {};
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const equalsIndex = pair.indexOf("=");
    if (equalsIndex > 0) {
      const name = pair.substring(0, equalsIndex).trim();
      const value = pair.substring(equalsIndex + 1);
      cookies[name] = value;
    }
  }
  return cookies;
}
function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return null;
  }
  const bearerPrefix = "Bearer ";
  if (!authHeader.startsWith(bearerPrefix)) {
    return null;
  }
  const token = authHeader.substring(bearerPrefix.length).trim();
  if (token.length === 0) {
    return null;
  }
  return token;
}
function extractAccessTokenFromCookie(req) {
  const cookies = parseCookies(req);
  const token = cookies[ACCESS_TOKEN_COOKIE];
  if (!token || token.length === 0) {
    return null;
  }
  return token;
}

// lib/auth/middleware.ts
class AuthenticationError extends Error {
  statusCode;
  code;
  constructor(message, code = "AUTHENTICATION_REQUIRED", statusCode = 401) {
    super(message);
    this.name = "AuthenticationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

class AuthorizationError extends Error {
  statusCode;
  code;
  constructor(message, code = "INSUFFICIENT_PERMISSIONS", statusCode = 403) {
    super(message);
    this.name = "AuthorizationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
function extractToken(req) {
  const cookieToken = extractAccessTokenFromCookie(req);
  if (cookieToken) {
    return cookieToken;
  }
  const bearerToken = extractBearerToken(req);
  if (bearerToken) {
    return bearerToken;
  }
  return null;
}
async function requireAuth(req) {
  const token = extractToken(req);
  if (!token) {
    throw new AuthenticationError("Authentication required", "AUTHENTICATION_REQUIRED", 401);
  }
  try {
    const payload = await verifyAccessToken(token);
    return mapPayloadToAuthContext(payload);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.log("[AUTH] Token verification failed:", errorMessage);
    if (errorMessage.includes("expired")) {
      throw new AuthenticationError("Access token has expired", "TOKEN_EXPIRED", 401);
    }
    if (errorMessage.includes("signature")) {
      throw new AuthenticationError("Invalid token", "INVALID_TOKEN", 401);
    }
    throw new AuthenticationError("Authentication failed", "AUTHENTICATION_FAILED", 401);
  }
}
async function requireRole(req, roles) {
  const user = await requireAuth(req);
  if (!roles.includes(user.role)) {
    console.log("[AUTH] Authorization failed: user role", user.role, "not in required roles", roles.join(", "));
    throw new AuthorizationError("Insufficient permissions", "INSUFFICIENT_PERMISSIONS", 403);
  }
  return user;
}
function mapPayloadToAuthContext(payload) {
  return {
    userId: payload.sub,
    email: payload.email,
    role: payload.role,
    permissions: payload.permissions || []
  };
}

// lib/auth/password.ts
import bcrypt from "bcryptjs";
var BCRYPT_ROUNDS = 12;
async function hashPassword(password) {
  if (!password || password.length === 0) {
    throw new Error("Password cannot be empty");
  }
  try {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    return hash;
  } catch (error) {
    console.error("[PASSWORD] Hashing operation failed");
    throw new Error("Password hashing failed");
  }
}

// lib/queries.ts
var AuditQueries = {
  log: (input) => ({
    text: `
      INSERT INTO audit_logs (
        actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id, created_at
    `,
    values: [
      input.actor_id,
      input.action,
      input.entity_type,
      input.entity_id,
      input.changes ? JSON.stringify(input.changes) : null,
      input.ip_address || null,
      input.user_agent || null
    ]
  }),
  logAuthEvent: (actorId, action, success, ipAddress, userAgent, additionalInfo) => ({
    text: `
      INSERT INTO audit_logs (
        actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      )
      VALUES ($1, $2, 'user', $1, $3, $4, $5, NOW())
      RETURNING id, created_at
    `,
    values: [
      actorId,
      action,
      JSON.stringify({ success, ...additionalInfo }),
      ipAddress,
      userAgent
    ]
  }),
  logAuthorizationFailure: (actorId, attemptedAction, entityType, entityId, requiredPermission, ipAddress, userAgent) => ({
    text: `
      INSERT INTO audit_logs (
        actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      )
      VALUES ($1, 'authorization_failure', $2, $3, $4, $5, $6, NOW())
      RETURNING id, created_at
    `,
    values: [
      actorId,
      entityType,
      entityId,
      JSON.stringify({
        attempted_action: attemptedAction,
        required_permission: requiredPermission
      }),
      ipAddress,
      userAgent
    ]
  }),
  logSessionEvent: (actorId, action, sessionId, ipAddress, userAgent, additionalInfo) => ({
    text: `
      INSERT INTO audit_logs (
        actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      )
      VALUES ($1, $2, 'session', $3, $4, $5, $6, NOW())
      RETURNING id, created_at
    `,
    values: [
      actorId,
      action,
      sessionId,
      additionalInfo ? JSON.stringify(additionalInfo) : null,
      ipAddress,
      userAgent
    ]
  }),
  findById: (id) => ({
    text: `
      SELECT 
        id, actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      FROM audit_logs
      WHERE id = $1
      LIMIT 1
    `,
    values: [id]
  }),
  getForEntity: (entityType, entityId, limit = 50) => ({
    text: `
      SELECT 
        id, actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      FROM audit_logs
      WHERE entity_type = $1 AND entity_id = $2
      ORDER BY created_at DESC
      LIMIT $3
    `,
    values: [entityType, entityId, limit]
  }),
  getByActor: (actorId, limit = 50) => ({
    text: `
      SELECT 
        id, actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      FROM audit_logs
      WHERE actor_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    values: [actorId, limit]
  }),
  getByAction: (action, limit = 50) => ({
    text: `
      SELECT 
        id, actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      FROM audit_logs
      WHERE action = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    values: [action, limit]
  }),
  getRecent: (limit, offset) => ({
    text: `
      SELECT 
        id, actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      FROM audit_logs
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `,
    values: [limit, offset]
  }),
  getByDateRange: (startDate, endDate, limit = 100) => ({
    text: `
      SELECT 
        id, actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      FROM audit_logs
      WHERE created_at >= $1 AND created_at <= $2
      ORDER BY created_at DESC
      LIMIT $3
    `,
    values: [startDate, endDate, limit]
  }),
  countByAction: (action) => ({
    text: `
      SELECT COUNT(*) as count
      FROM audit_logs
      WHERE action = $1
    `,
    values: [action]
  }),
  countFailedAuthInWindow: (windowMinutes) => ({
    text: `
      SELECT COUNT(*) as count
      FROM audit_logs
      WHERE action = 'auth_failure'
        AND created_at > NOW() - INTERVAL '1 minute' * $1
    `,
    values: [windowMinutes]
  }),
  deleteOlderThan: (daysOld) => ({
    text: `
      DELETE FROM audit_logs
      WHERE created_at < NOW() - INTERVAL '1 day' * $1
      RETURNING id
    `,
    values: [daysOld]
  })
};

// lib/auditLogger.ts
async function executeQuery(config) {
  const result = await query(config.text, config.values);
  return result.rows;
}
var SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /key/i,
  /credential/i,
  /auth/i,
  /hash/i,
  /salt/i,
  /bearer/i,
  /cookie/i,
  /session_id/i,
  /refresh/i,
  /access/i
];
var PII_PATTERNS = [
  /email/i,
  /phone/i,
  /address/i,
  /name/i,
  /ssn/i,
  /national_id/i,
  /passport/i,
  /birth/i
];
function isSensitiveField(fieldName) {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(fieldName));
}
function isPIIField(fieldName) {
  return PII_PATTERNS.some((pattern) => pattern.test(fieldName));
}
function sanitizeValue(value) {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return sanitizeError(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (typeof value === "object") {
    return sanitizeContext(value);
  }
  return value;
}
function sanitizeContext(context) {
  if (!context || typeof context !== "object") {
    return null;
  }
  const sanitized = {};
  for (const [key, value] of Object.entries(context)) {
    if (isSensitiveField(key)) {
      sanitized[key] = "[REDACTED]";
      continue;
    }
    if (isPIIField(key)) {
      sanitized[key] = "[PII_REDACTED]";
      continue;
    }
    sanitized[key] = sanitizeValue(value);
  }
  return sanitized;
}
async function logAuditEvent(input) {
  try {
    const sanitizedInput = {
      ...input,
      changes: input.changes ? sanitizeContext(input.changes) || undefined : undefined
    };
    await executeQuery(AuditQueries.log(sanitizedInput));
  } catch (error) {
    console.error("[AuditLogger] Failed to log audit event:", sanitizeError(error instanceof Error ? error.message : String(error)));
  }
}

// api-src/admin.ts
async function handler(req, res) {
  if (handleCors(req, res))
    return;
  if (req.method === "HEAD") {
    res.status(200).end();
    return;
  }
  const action = req.query.action || "dashboard";
  try {
    const auth = await requireRole(req, ["admin", "super_admin"]);
    switch (action) {
      case "dashboard":
        if (req.method !== "GET") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleDashboard(res);
        return;
      case "users":
        if (req.method !== "GET") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleUsers(req, res);
        return;
      case "settings":
        await handleSettings(req, res, auth);
        return;
      case "register":
        if (req.method !== "POST") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleRegisterUser(req, res, auth);
        return;
      case "stats":
        if (req.method !== "GET") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleDashboardStats(res);
        return;
      case "errors":
        if (req.method !== "GET") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleErrorStatistics(res);
        return;
      case "migrate":
        if (req.method !== "POST") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleMigrate(req, res);
        return;
      case "set-password":
        if (req.method !== "POST") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleSetPassword(req, res, auth);
        return;
      default:
        sendError(res, "Invalid action. Valid actions: dashboard, users, settings, register, migrate, stats, errors, set-password", HttpStatus.BAD_REQUEST);
        return;
    }
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendError(res, error.message, error.statusCode, error.code);
      return;
    }
    if (error instanceof AuthorizationError) {
      sendError(res, error.message, error.statusCode, error.code);
      return;
    }
    handleError(res, error, "admin");
  }
}
var admin_default = withArcjetProtection(handler, "admin");
async function handleSettings(req, res, auth) {
  const method = req.method;
  switch (method) {
    case "GET":
      await handleGetSettings(res);
      return;
    case "POST":
      await handleCreateSetting(req, res, auth);
      return;
    case "PUT":
      await handleUpdateSetting(req, res, auth);
      return;
    case "DELETE":
      await handleDeleteSetting(req, res);
      return;
    default:
      sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
      return;
  }
}
async function handleGetSettings(res) {
  const { data, error } = await supabaseAdmin.from("system_settings").select("*").order("setting_key", { ascending: true });
  if (error) {
    sendError(res, error.message, HttpStatus.BAD_REQUEST);
    return;
  }
  sendSuccess(res, { settings: data || [] });
}
async function handleCreateSetting(req, res, auth) {
  const body = req.body;
  if (!body.setting_key || typeof body.setting_key !== "string") {
    sendError(res, "setting_key is required and must be a string", HttpStatus.BAD_REQUEST);
    return;
  }
  if (body.setting_value === undefined || body.setting_value === null) {
    sendError(res, "setting_value is required", HttpStatus.BAD_REQUEST);
    return;
  }
  const settingData = {
    setting_key: body.setting_key.trim(),
    setting_value: String(body.setting_value),
    setting_type: body.setting_type || "string",
    description: body.description || null,
    is_public: body.is_public ?? false,
    updated_by: auth.userId
  };
  const { data, error } = await supabaseAdmin.from("system_settings").insert(settingData).select().single();
  if (error) {
    if ("code" in error && error.code === "23505") {
      sendError(res, `Setting with key '${body.setting_key}' already exists`, HttpStatus.CONFLICT);
      return;
    }
    sendError(res, error.message, HttpStatus.BAD_REQUEST);
    return;
  }
  sendSuccess(res, { setting: data }, HttpStatus.CREATED);
}
async function handleUpdateSetting(req, res, auth) {
  const body = req.body;
  if (!body.id && !body.setting_key) {
    sendError(res, "Either id or setting_key is required to update a setting", HttpStatus.BAD_REQUEST);
    return;
  }
  const updateData = {
    updated_by: auth.userId,
    updated_at: new Date().toISOString()
  };
  if (body.setting_value !== undefined) {
    updateData.setting_value = String(body.setting_value);
  }
  if (body.setting_type !== undefined) {
    updateData.setting_type = body.setting_type;
  }
  if (body.description !== undefined) {
    updateData.description = body.description;
  }
  if (body.is_public !== undefined) {
    updateData.is_public = body.is_public;
  }
  let query2 = supabaseAdmin.from("system_settings").update(updateData);
  if (body.id) {
    query2 = query2.eq("id", body.id);
  } else {
    query2 = query2.eq("setting_key", body.setting_key);
  }
  const { data, error } = await query2.select().single();
  if (error) {
    if (error.code === "PGRST116") {
      sendError(res, "Setting not found", HttpStatus.NOT_FOUND);
      return;
    }
    sendError(res, error.message, HttpStatus.BAD_REQUEST);
    return;
  }
  sendSuccess(res, { setting: data });
}
async function handleDeleteSetting(req, res) {
  const body = req.body;
  const queryId = req.query.id;
  const queryKey = req.query.setting_key;
  const id = body.id || queryId;
  const settingKey = body.setting_key || queryKey;
  if (!id && !settingKey) {
    sendError(res, "Either id or setting_key is required to delete a setting", HttpStatus.BAD_REQUEST);
    return;
  }
  let query2 = supabaseAdmin.from("system_settings").delete();
  if (id) {
    query2 = query2.eq("id", id);
  } else {
    query2 = query2.eq("setting_key", settingKey);
  }
  const { error } = await query2;
  if (error) {
    sendError(res, error.message, HttpStatus.BAD_REQUEST);
    return;
  }
  sendSuccess(res, { deleted: true });
}
async function handleDashboard(res) {
  const now = new Date;
  const today = now.toISOString().split("T")[0];
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = tomorrowDate.toISOString().split("T")[0];
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [
    recentApps,
    totalResult,
    draftResult,
    submittedResult,
    underReviewResult,
    approvedResult,
    rejectedResult,
    todayResult,
    weekResult,
    monthResult
  ] = await Promise.all([
    supabaseAdmin.from("applications").select("id, application_number, full_name, status, program, created_at").order("created_at", { ascending: false }).limit(5),
    supabaseAdmin.from("applications").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("applications").select("*", { count: "exact", head: true }).eq("status", "draft"),
    supabaseAdmin.from("applications").select("*", { count: "exact", head: true }).eq("status", "submitted"),
    supabaseAdmin.from("applications").select("*", { count: "exact", head: true }).eq("status", "under_review"),
    supabaseAdmin.from("applications").select("*", { count: "exact", head: true }).eq("status", "approved"),
    supabaseAdmin.from("applications").select("*", { count: "exact", head: true }).eq("status", "rejected"),
    supabaseAdmin.from("applications").select("*", { count: "exact", head: true }).gte("created_at", today).lt("created_at", tomorrow),
    supabaseAdmin.from("applications").select("*", { count: "exact", head: true }).gte("created_at", weekAgo),
    supabaseAdmin.from("applications").select("*", { count: "exact", head: true }).gte("created_at", monthAgo)
  ]);
  const totalCount = totalResult.count || 0;
  const draftCount = draftResult.count || 0;
  const submittedCount = submittedResult.count || 0;
  const underReviewCount = underReviewResult.count || 0;
  const approvedCount = approvedResult.count || 0;
  const rejectedCount = rejectedResult.count || 0;
  const todayCount = todayResult.count || 0;
  const weekCount = weekResult.count || 0;
  const monthCount = monthResult.count || 0;
  const pendingCount = submittedCount + underReviewCount;
  const recentActivity = (recentApps.data || []).map((app) => ({
    id: app.id,
    type: "application",
    message: `New application from ${app.full_name} for ${app.program}`,
    timestamp: app.created_at,
    user: app.full_name,
    status: app.status
  }));
  res.setHeader("Cache-Control", "public, max-age=30");
  sendSuccess(res, {
    stats: {
      totalApplications: totalCount,
      pendingApplications: pendingCount,
      approvedApplications: approvedCount,
      rejectedApplications: rejectedCount,
      todayApplications: todayCount,
      weekApplications: weekCount,
      monthApplications: monthCount,
      systemHealth: pendingCount > 100 ? "critical" : pendingCount > 50 ? "warning" : "good"
    },
    recentActivity,
    statusBreakdown: { draft: draftCount, submitted: submittedCount, under_review: underReviewCount, approved: approvedCount, rejected: rejectedCount },
    periodTotals: { today: todayCount, week: weekCount, month: monthCount },
    generatedAt: now.toISOString()
  });
}
async function handleUsers(req, res) {
  let page = parseInt(req.query.page || "1", 10);
  let limit = parseInt(req.query.limit || "50", 10);
  if (isNaN(page) || page < 1)
    page = 1;
  if (isNaN(limit) || limit < 1)
    limit = 50;
  if (limit > 100)
    limit = 100;
  const offset = (page - 1) * limit;
  const { data, count, error } = await supabaseAdmin.from("profiles").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) {
    sendError(res, error.message, HttpStatus.BAD_REQUEST);
    return;
  }
  const users = (data || []).map((user) => ({ ...user, user_id: user.id }));
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  sendSuccess(res, {
    data: users,
    meta: { page, limit, total: count || 0, total_pages: Math.ceil((count || 0) / limit) }
  });
}
async function handleRegisterUser(req, res, auth) {
  const { email, password, firstName, lastName, role } = req.body;
  if (!email || !password || !firstName || !lastName) {
    sendError(res, "Email, password, firstName, and lastName are required", HttpStatus.BAD_REQUEST);
    return;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    sendError(res, "Invalid email format", HttpStatus.BAD_REQUEST);
    return;
  }
  if (password.length < 8) {
    sendError(res, "Password must be at least 8 characters", HttpStatus.BAD_REQUEST);
    return;
  }
  const allowedRoles = ["student", "reviewer"];
  if (auth.role === "super_admin") {
    allowedRoles.push("admin");
  }
  const userRole = role && allowedRoles.includes(role) ? role : "student";
  try {
    const { data: existingUser } = await supabaseAdmin.from("profiles").select("id").eq("email", email.toLowerCase()).single();
    if (existingUser) {
      sendError(res, "Email already registered", HttpStatus.CONFLICT);
      return;
    }
    const passwordHash = await hashPassword(password);
    const { data: newUser, error } = await supabaseAdmin.from("profiles").insert({
      email: email.toLowerCase(),
      password_hash: passwordHash,
      first_name: firstName,
      last_name: lastName,
      role: userRole,
      email_verified: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).select("id, email, first_name, last_name, role, created_at").single();
    if (error) {
      console.error("[ADMIN] User creation failed:", error.message);
      sendError(res, "Failed to create user", HttpStatus.INTERNAL_SERVER_ERROR);
      return;
    }
    await logAuditEvent({
      actor_id: auth.userId,
      action: "user_created",
      entity_type: "user",
      entity_id: newUser.id,
      changes: {
        role: userRole,
        created_by_admin: true
      }
    });
    sendSuccess(res, {
      user: newUser,
      message: "User created successfully"
    }, HttpStatus.CREATED);
  } catch (error) {
    console.error("[ADMIN] Registration error:", error instanceof Error ? error.message : "Unknown error");
    sendError(res, "Registration failed", HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
async function handleDashboardStats(res) {
  try {
    const [
      totalAppsResult,
      statusCountsResult,
      programCountsResult,
      recentAppsResult,
      userCountsResult
    ] = await Promise.all([
      query("SELECT COUNT(*) as count FROM applications"),
      query(`SELECT status, COUNT(*) as count FROM applications GROUP BY status`),
      query(`SELECT program, COUNT(*) as count FROM applications GROUP BY program ORDER BY count DESC LIMIT 10`),
      query(`SELECT id, application_number, full_name, status, created_at 
         FROM applications 
         ORDER BY created_at DESC 
         LIMIT 5`),
      query(`SELECT role, COUNT(*) as count FROM profiles GROUP BY role`)
    ]);
    const totalApplications = parseInt(totalAppsResult.rows[0]?.count || "0", 10);
    const statusBreakdown = {};
    for (const row of statusCountsResult.rows) {
      statusBreakdown[row.status] = parseInt(row.count, 10);
    }
    const programBreakdown = {};
    for (const row of programCountsResult.rows) {
      programBreakdown[row.program] = parseInt(row.count, 10);
    }
    const userBreakdown = {};
    for (const row of userCountsResult.rows) {
      userBreakdown[row.role] = parseInt(row.count, 10);
    }
    const pendingCount = (statusBreakdown["submitted"] || 0) + (statusBreakdown["under_review"] || 0);
    res.setHeader("Cache-Control", "public, max-age=60");
    sendSuccess(res, {
      totalApplications,
      pendingApplications: pendingCount,
      approvedApplications: statusBreakdown["approved"] || 0,
      rejectedApplications: statusBreakdown["rejected"] || 0,
      statusBreakdown,
      programBreakdown,
      userBreakdown,
      recentApplications: recentAppsResult.rows,
      systemHealth: pendingCount > 100 ? "critical" : pendingCount > 50 ? "warning" : "good",
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("[ADMIN] Stats error:", error instanceof Error ? error.message : "Unknown error");
    sendError(res, "Failed to fetch dashboard stats", HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
async function handleErrorStatistics(res) {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [
      errorCountsResult,
      recentErrorsResult,
      errorsByDayResult
    ] = await Promise.all([
      query(`SELECT action, COUNT(*) as count 
         FROM audit_logs 
         WHERE action LIKE '%error%' OR action LIKE '%fail%'
         AND created_at > $1
         GROUP BY action`, [weekAgo]),
      query(`SELECT id, action, entity_type, created_at 
         FROM audit_logs 
         WHERE action LIKE '%error%' OR action LIKE '%fail%'
         ORDER BY created_at DESC 
         LIMIT 20`),
      query(`SELECT DATE(created_at) as day, COUNT(*) as count 
         FROM audit_logs 
         WHERE (action LIKE '%error%' OR action LIKE '%fail%')
         AND created_at > $1
         GROUP BY DATE(created_at)
         ORDER BY day DESC`, [weekAgo])
    ]);
    const errorsByType = {};
    for (const row of errorCountsResult.rows) {
      errorsByType[row.action] = parseInt(row.count, 10);
    }
    const errorsByDay = {};
    for (const row of errorsByDayResult.rows) {
      errorsByDay[row.day] = parseInt(row.count, 10);
    }
    const totalErrors = Object.values(errorsByType).reduce((sum, count) => sum + count, 0);
    res.setHeader("Cache-Control", "public, max-age=60");
    sendSuccess(res, {
      totalErrors,
      errorsByType,
      errorsByDay,
      recentErrors: recentErrorsResult.rows,
      period: "7 days",
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("[ADMIN] Error stats error:", error instanceof Error ? error.message : "Unknown error");
    sendError(res, "Failed to fetch error statistics", HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
async function handleSetPassword(req, res, auth) {
  if (auth.role !== "super_admin") {
    sendError(res, "Only super_admin can set passwords for other users", HttpStatus.FORBIDDEN);
    return;
  }
  const { email, password } = req.body;
  if (!email || !password) {
    sendError(res, "Email and password are required", HttpStatus.BAD_REQUEST);
    return;
  }
  if (password.length < 8) {
    sendError(res, "Password must be at least 8 characters", HttpStatus.BAD_REQUEST);
    return;
  }
  try {
    const { data: user, error: findError } = await supabaseAdmin.from("profiles").select("id, email, first_name, last_name, role").eq("email", email.toLowerCase()).single();
    if (findError || !user) {
      sendError(res, "User not found", HttpStatus.NOT_FOUND);
      return;
    }
    const passwordHash = await hashPassword(password);
    const { error: updateError } = await supabaseAdmin.from("profiles").update({
      password_hash: passwordHash,
      updated_at: new Date().toISOString()
    }).eq("id", user.id);
    if (updateError) {
      console.error("[ADMIN] Password update failed:", updateError.message);
      sendError(res, "Failed to update password", HttpStatus.INTERNAL_SERVER_ERROR);
      return;
    }
    await logAuditEvent({
      actor_id: auth.userId,
      action: "password_set_by_admin",
      entity_type: "user",
      entity_id: user.id,
      changes: {
        password_updated: true,
        updated_by_admin: true
      }
    });
    sendSuccess(res, {
      message: "Password set successfully",
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role
      }
    });
  } catch (error) {
    console.error("[ADMIN] Set password error:", error instanceof Error ? error.message : "Unknown error");
    sendError(res, "Failed to set password", HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
async function handleMigrate(req, res) {
  const MIGRATE_SECRET = process.env.MIGRATE_SECRET;
  const { secret } = req.body || {};
  if (MIGRATE_SECRET && secret !== MIGRATE_SECRET) {
    sendError(res, "Invalid migration secret", HttpStatus.UNAUTHORIZED);
    return;
  }
  const migrations = [];
  const errors = [];
  try {
    await query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash TEXT`);
    migrations.push("Added password_hash column");
  } catch (e) {
    errors.push(`password_hash: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    await query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS refresh_token_hash TEXT`);
    migrations.push("Added refresh_token_hash column");
  } catch (e) {
    errors.push(`refresh_token_hash: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    await query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'student'`);
    migrations.push("Added role column");
  } catch (e) {
    errors.push(`role: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    await query(`CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email)`);
    migrations.push("Created idx_profiles_email index");
  } catch (e) {
    errors.push(`idx_profiles_email: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    await query(`CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role)`);
    migrations.push("Created idx_profiles_role index");
  } catch (e) {
    errors.push(`idx_profiles_role: ${e instanceof Error ? e.message : String(e)}`);
  }
  sendSuccess(res, {
    migrations,
    errors: errors.length > 0 ? errors : undefined,
    message: errors.length > 0 ? "Some migrations failed" : "All migrations completed successfully"
  });
}
export {
  admin_default as default
};
