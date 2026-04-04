var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/index.ts
import { serve } from "@hono/node-server";
import { Hono as Hono10 } from "hono";
import { cors } from "hono/cors";

// src/middleware/auth.ts
import { getCookie } from "hono/cookie";

// src/lib/session.ts
import { EncryptJWT, jwtDecrypt, base64url } from "jose";
async function encryptJWE(payload, expirationTime, secret = process.env.JWE_SECRET) {
  if (!secret) {
    throw new Error("Missing JWE secret");
  }
  return new EncryptJWT(payload).setExpirationTime(expirationTime).setProtectedHeader({ alg: "dir", enc: "A256GCM" }).encrypt(base64url.decode(secret));
}
async function decryptJWE(cyphertext, secret = process.env.JWE_SECRET) {
  if (!secret) {
    throw new Error("Missing JWE secret");
  }
  if (typeof cyphertext !== "string") return;
  try {
    const { payload } = await jwtDecrypt(cyphertext, base64url.decode(secret));
    const decoded = payload;
    if (typeof decoded === "object" && decoded !== null) {
      delete decoded.iat;
      delete decoded.exp;
    }
    return decoded;
  } catch {
  }
}

// src/middleware/auth.ts
var SESSION_COOKIE_NAME = "nex_session";
async function authMiddleware(c, next) {
  const sessionCookie = getCookie(c, SESSION_COOKIE_NAME);
  if (sessionCookie) {
    try {
      const session = await decryptJWE(sessionCookie);
      c.set("session", session);
    } catch (e) {
    }
  }
  await next();
}
function requireAuth(c) {
  const session = c.get("session");
  if (!session?.user?.id) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return null;
}

// src/routes/auth.ts
import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";

// src/db/client.ts
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";

// src/db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  accounts: () => accounts,
  connectors: () => connectors,
  keys: () => keys,
  localCredentials: () => localCredentials,
  settings: () => settings,
  taskMessages: () => taskMessages,
  tasks: () => tasks,
  userResources: () => userResources,
  users: () => users
});
import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
var now = () => Date.now();
var users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    // 'github' | 'local'
    externalId: text("external_id").notNull(),
    accessToken: text("access_token").notNull().default(""),
    refreshToken: text("refresh_token"),
    scope: text("scope"),
    username: text("username").notNull(),
    email: text("email"),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
    lastLoginAt: integer("last_login_at").notNull().$defaultFn(now)
  },
  (table) => ({
    providerExternalIdUnique: uniqueIndex("users_provider_external_id_idx").on(table.provider, table.externalId)
  })
);
var localCredentials = sqliteTable("local_credentials", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now)
});
var tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull(),
  title: text("title"),
  repoUrl: text("repo_url"),
  selectedAgent: text("selected_agent").default("claude"),
  selectedModel: text("selected_model"),
  installDependencies: integer("install_dependencies", { mode: "boolean" }).default(false),
  maxDuration: integer("max_duration").default(parseInt(process.env.MAX_SANDBOX_DURATION || "300", 10)),
  keepAlive: integer("keep_alive", { mode: "boolean" }).default(false),
  enableBrowser: integer("enable_browser", { mode: "boolean" }).default(false),
  status: text("status").notNull().default("pending"),
  progress: integer("progress").default(0),
  logs: text("logs"),
  // JSON string of LogEntry[]
  error: text("error"),
  branchName: text("branch_name"),
  sandboxId: text("sandbox_id"),
  agentSessionId: text("agent_session_id"),
  sandboxUrl: text("sandbox_url"),
  previewUrl: text("preview_url"),
  prUrl: text("pr_url"),
  prNumber: integer("pr_number"),
  prStatus: text("pr_status"),
  prMergeCommitSha: text("pr_merge_commit_sha"),
  mcpServerIds: text("mcp_server_ids"),
  // JSON string of string[]
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
  completedAt: integer("completed_at"),
  deletedAt: integer("deleted_at")
});
var taskMessages = sqliteTable("task_messages", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  // 'user' | 'agent'
  content: text("content").notNull(),
  createdAt: integer("created_at").notNull().$defaultFn(now)
});
var connectors = sqliteTable("connectors", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull().default("remote"),
  // 'local' | 'remote'
  baseUrl: text("base_url"),
  oauthClientId: text("oauth_client_id"),
  oauthClientSecret: text("oauth_client_secret"),
  command: text("command"),
  env: text("env"),
  status: text("status").notNull().default("disconnected"),
  // 'connected' | 'disconnected'
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now)
});
var accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("github"),
    // 'github'
    externalUserId: text("external_user_id").notNull(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiresAt: integer("expires_at"),
    scope: text("scope"),
    username: text("username").notNull(),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now)
  },
  (table) => ({
    userIdProviderUnique: uniqueIndex("accounts_user_id_provider_idx").on(table.userId, table.provider)
  })
);
var keys = sqliteTable(
  "keys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    // 'anthropic' | 'openai' | 'cursor' | 'gemini' | 'aigateway'
    value: text("value").notNull(),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now)
  },
  (table) => ({
    userIdProviderUnique: uniqueIndex("keys_user_id_provider_idx").on(table.userId, table.provider)
  })
);
var userResources = sqliteTable("user_resources", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  envId: text("env_id"),
  camUsername: text("cam_username"),
  camSecretId: text("cam_secret_id"),
  camSecretKey: text("cam_secret_key"),
  policyId: integer("policy_id"),
  failStep: text("fail_step"),
  failReason: text("fail_reason"),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now)
});
var settings = sqliteTable(
  "settings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now)
  },
  (table) => ({
    userIdKeyUnique: uniqueIndex("settings_user_id_key_idx").on(table.userId, table.key)
  })
);

// src/db/client.ts
import path from "path";
import { mkdirSync } from "fs";
var DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "app.db");
mkdirSync(path.dirname(DB_PATH), { recursive: true });
var sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
var db = drizzle(sqlite, { schema: schema_exports });

// src/routes/auth.ts
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

// src/cloudbase/provision.ts
import tencentcloud from "tencentcloud-sdk-nodejs";
var CamClient = tencentcloud.cam.v20190116.Client;
var TcbClient = tencentcloud.tcb.v20180608.Client;
function getClients() {
  const credential = {
    secretId: process.env.TCB_SECRET_ID || process.env.TENCENT_SECRET_ID || "",
    secretKey: process.env.TCB_SECRET_KEY || process.env.TENCENT_SECRET_KEY || ""
  };
  const camClient = new CamClient({
    credential,
    region: "",
    profile: { httpProfile: { endpoint: "cam.tencentcloudapi.com" } }
  });
  const tcbClient = new TcbClient({
    credential,
    region: "ap-shanghai",
    profile: { httpProfile: { endpoint: "tcb.tencentcloudapi.com" } }
  });
  return { camClient, tcbClient };
}
function generatePassword(length = 16) {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "!@#$%^&*()-_=+";
  const all = upper + lower + digits + special;
  const password = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)]
  ];
  for (let i = password.length; i < length; i++) {
    password.push(all[Math.floor(Math.random() * all.length)]);
  }
  for (let i = password.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [password[i], password[j]] = [password[j], password[i]];
  }
  return password.join("");
}
async function provisionUserResources(userId, username) {
  const { camClient, tcbClient } = getClients();
  const camUsername = `oc_${userId.substring(0, 20)}`;
  let subAccountUin;
  let password;
  try {
    const getUserResp = await camClient.GetUser({ Name: camUsername });
    subAccountUin = getUserResp.Uin;
    password = generatePassword();
    try {
      await camClient.UpdateUser({
        Name: camUsername,
        ConsoleLogin: 1,
        Password: password,
        NeedResetPassword: 0
      });
    } catch {
      password = void 0;
    }
  } catch {
    password = generatePassword();
    const addUserResp = await camClient.AddUser({
      Name: camUsername,
      Remark: `coder user: ${username}`,
      ConsoleLogin: 1,
      Password: password,
      NeedResetPassword: 0,
      UseApi: 0
    });
    subAccountUin = addUserResp.Uin;
  }
  let camSecretId;
  let camSecretKey;
  const listKeysResp = await camClient.ListAccessKeys({ TargetUin: subAccountUin });
  const existingKeys = listKeysResp.AccessKeys || [];
  const activeKey = existingKeys.find((k) => k.Status === "Active");
  if (activeKey) {
    camSecretId = activeKey.AccessKeyId;
  } else {
    const createKeyResp = await camClient.CreateAccessKey({ TargetUin: subAccountUin });
    camSecretId = createKeyResp.AccessKey.AccessKeyId;
    camSecretKey = createKeyResp.AccessKey.SecretAccessKey;
  }
  const envAlias = `coder-${userId.substring(0, 14)}`;
  let envId;
  try {
    const descResp = await tcbClient.DescribeEnvs({});
    const found = (descResp.EnvList || []).find((e) => e.Alias === envAlias);
    if (found) envId = found.EnvId;
  } catch {
  }
  if (!envId) {
    const createEnvResp = await tcbClient.CreateEnv({
      Alias: envAlias,
      PackageId: "baas_personal",
      Resources: ["flexdb", "storage", "function"]
    });
    envId = createEnvResp.EnvId;
  }
  const policyName = `coder_policy_${envId}`;
  let policyId;
  try {
    const listResp = await camClient.ListPolicies({ Keyword: policyName, Scope: "Local" });
    const found = (listResp.List || []).find((p) => p.PolicyName === policyName);
    if (found) policyId = found.PolicyId;
  } catch {
  }
  if (!policyId) {
    const policyDocument = JSON.stringify({
      version: "2.0",
      statement: [
        {
          action: [
            "tcb:DescribeEnvs",
            "tcb:DescribePackages",
            "tcb:CheckTcbService",
            "tcb:DescribeBillingInfo",
            "tcb:DescribeEnvLimit",
            "tcb:GetUserKeyList",
            "tcb:DescribeMonitorMetric",
            "tcb:ListTables"
          ],
          effect: "allow",
          resource: ["*"]
        },
        {
          action: ["tcb:*"],
          effect: "allow",
          resource: [`qcs::tcb:::env/${envId}`]
        },
        {
          action: ["cos:*"],
          effect: "allow",
          resource: ["*"]
        },
        {
          action: ["scf:*"],
          effect: "allow",
          resource: ["*"]
        },
        {
          action: ["sts:GetFederationToken"],
          effect: "allow",
          resource: ["*"]
        }
      ]
    });
    const createPolicyResp = await camClient.CreatePolicy({
      PolicyName: policyName,
      PolicyDocument: policyDocument,
      Description: `Coder env ${envId} access`
    });
    policyId = createPolicyResp.PolicyId;
  }
  await camClient.AttachUserPolicy({
    AttachUin: subAccountUin,
    PolicyId: policyId
  });
  return {
    envId,
    camUsername,
    camSecretId,
    camSecretKey,
    policyId
  };
}

// src/routes/auth.ts
var SESSION_COOKIE_NAME2 = "nex_session";
var COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
var auth = new Hono();
auth.post("/register", async (c) => {
  try {
    const body = await c.req.json();
    const { username, password } = body;
    if (!username || !password || typeof username !== "string" || typeof password !== "string") {
      return c.json({ error: "Username and password are required" }, 400);
    }
    const trimmedUsername = username.trim().toLowerCase();
    if (trimmedUsername.length < 3) {
      return c.json({ error: "Username must be at least 3 characters" }, 400);
    }
    if (password.length < 6) {
      return c.json({ error: "Password must be at least 6 characters" }, 400);
    }
    const existing = await db.select({ id: users.id }).from(users).where(and(eq(users.provider, "local"), eq(users.externalId, trimmedUsername))).limit(1);
    if (existing.length > 0) {
      return c.json({ error: "Username already taken" }, 409);
    }
    const userId = nanoid();
    const now2 = Date.now();
    const passwordHash = await bcrypt.hash(password, 12);
    await db.insert(users).values({
      id: userId,
      provider: "local",
      externalId: trimmedUsername,
      accessToken: "",
      username: trimmedUsername,
      createdAt: now2,
      updatedAt: now2,
      lastLoginAt: now2
    });
    await db.insert(localCredentials).values({
      userId,
      passwordHash,
      createdAt: now2,
      updatedAt: now2
    });
    const session = {
      created: now2,
      authProvider: "github",
      user: {
        id: userId,
        username: trimmedUsername,
        email: void 0,
        name: trimmedUsername,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(trimmedUsername)}&background=6366f1&color=fff`
      }
    };
    const sessionValue = await encryptJWE(session, "1y");
    const provisionMode = process.env.TCB_PROVISION_MODE || "shared";
    if (process.env.TCB_SECRET_ID && process.env.TCB_SECRET_KEY) {
      const resourceId = nanoid();
      if (provisionMode === "isolated") {
        await db.insert(userResources).values({
          id: resourceId,
          userId,
          status: "processing",
          createdAt: now2,
          updatedAt: now2
        });
        provisionUserResources(userId, trimmedUsername).then(async (result) => {
          await db.update(userResources).set({
            status: "success",
            envId: result.envId,
            camUsername: result.camUsername,
            camSecretId: result.camSecretId,
            camSecretKey: result.camSecretKey || null,
            policyId: result.policyId,
            updatedAt: Date.now()
          }).where(eq(userResources.id, resourceId));
          console.log(`[provision] User ${trimmedUsername} env ready: ${result.envId}`);
        }).catch(async (err) => {
          await db.update(userResources).set({ status: "failed", failReason: err.message, updatedAt: Date.now() }).where(eq(userResources.id, resourceId));
          console.error(`[provision] User ${trimmedUsername} failed:`, err.message);
        });
      } else {
        await db.insert(userResources).values({
          id: resourceId,
          userId,
          status: "success",
          envId: process.env.TCB_ENV_ID || null,
          camSecretId: process.env.TCB_SECRET_ID || null,
          camSecretKey: process.env.TCB_SECRET_KEY || null,
          createdAt: now2,
          updatedAt: now2
        });
        console.log(`[provision] User ${trimmedUsername} shared env: ${process.env.TCB_ENV_ID}`);
      }
    }
    setCookie(c, SESSION_COOKIE_NAME2, sessionValue, {
      path: "/",
      maxAge: COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: "Lax"
    });
    return c.json({ success: true, username: trimmedUsername });
  } catch (error) {
    console.error("Error registering local user:", error);
    return c.json({ error: "Registration failed" }, 500);
  }
});
auth.post("/login", async (c) => {
  try {
    const body = await c.req.json();
    const { username, password } = body;
    if (!username || !password || typeof username !== "string" || typeof password !== "string") {
      return c.json({ error: "Username and password are required" }, 400);
    }
    const trimmedUsername = username.trim().toLowerCase();
    const [user] = await db.select().from(users).where(and(eq(users.provider, "local"), eq(users.externalId, trimmedUsername))).limit(1);
    if (!user) {
      return c.json({ error: "Invalid username or password" }, 401);
    }
    const [cred] = await db.select().from(localCredentials).where(eq(localCredentials.userId, user.id)).limit(1);
    if (!cred) {
      return c.json({ error: "Invalid username or password" }, 401);
    }
    const valid = await bcrypt.compare(password, cred.passwordHash);
    if (!valid) {
      return c.json({ error: "Invalid username or password" }, 401);
    }
    await db.update(users).set({ lastLoginAt: Date.now(), updatedAt: Date.now() }).where(eq(users.id, user.id));
    const session = {
      created: Date.now(),
      authProvider: "github",
      user: {
        id: user.id,
        username: user.username,
        email: user.email || void 0,
        name: user.name || user.username,
        avatar: user.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=6366f1&color=fff`
      }
    };
    const sessionValue = await encryptJWE(session, "1y");
    setCookie(c, SESSION_COOKIE_NAME2, sessionValue, {
      path: "/",
      maxAge: COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: "Lax"
    });
    return c.json({ success: true });
  } catch (error) {
    console.error("Error logging in local user:", error);
    return c.json({ error: "Login failed" }, 500);
  }
});
auth.post("/signout", async (c) => {
  deleteCookie(c, SESSION_COOKIE_NAME2, { path: "/" });
  return c.json({ success: true });
});
auth.get("/me", async (c) => {
  const session = c.get("session");
  if (!session) {
    return c.json({ user: void 0 });
  }
  return c.json({ user: session.user, authProvider: session.authProvider });
});
auth.get("/provision-status", async (c) => {
  const session = c.get("session");
  if (!session?.user?.id) return c.json({ error: "Unauthorized" }, 401);
  const [resource] = await db.select().from(userResources).where(eq(userResources.userId, session.user.id)).limit(1);
  if (!resource) return c.json({ status: "not_started" });
  return c.json({
    status: resource.status,
    envId: resource.envId,
    camUsername: resource.camUsername,
    camSecretId: resource.camSecretId,
    failReason: resource.failReason,
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt
  });
});
auth.get("/rate-limit", async (c) => {
  const session = c.get("session");
  if (!session?.user?.id) return c.json({ error: "Unauthorized" }, 401);
  return c.json({
    allowed: true,
    remaining: 100,
    used: 0,
    total: 100,
    resetAt: new Date(Date.now() + 864e5).toISOString()
  });
});
var auth_default = auth;

// src/routes/acp.ts
import { Hono as Hono2 } from "hono";
import { streamSSE } from "hono/streaming";
import { v4 as uuidv43 } from "uuid";
import {
  ACP_PROTOCOL_VERSION,
  NEX_AGENT_INFO,
  JSON_RPC_ERRORS
} from "@coder/shared";

// src/agent/cloudbase-agent.service.ts
import { mkdirSync as mkdirSync2 } from "fs";
import path4 from "path";
import { fileURLToPath } from "url";
import { query, ExecutionError } from "@tencent-ai/agent-sdk";
import { z as z2 } from "zod";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { v4 as uuidv42 } from "uuid";

// src/config/store.ts
import fs from "fs";
import path2 from "path";
import os from "os";
var CONFIG_DIR = path2.join(os.homedir(), ".coder");
var CONFIG_FILE = path2.join(CONFIG_DIR, "config.json");
function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}
function loadConfig() {
  ensureDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// src/agent/persistence.service.ts
import * as fs2 from "fs/promises";
import * as path3 from "path";
import { v4 as uuidv4 } from "uuid";
import CloudBase from "@cloudbase/node-sdk";
import { AuthSupervisor } from "@cloudbase/toolbox";
import { AGENT_ID } from "@coder/shared";
var COLLECTION_NAME = "coder_agent_messages";
function getHomeDir() {
  return process.env.HOME || process.env.USERPROFILE || "";
}
function getProjectHash(cwd) {
  return cwd.replace(/[/\\:]/g, "-").replace(/^-+/, "").replace(/-+$/, "").replace(/-+/g, "-");
}
function getLocalMessageFilePath(sessionId, cwd) {
  const projectDirName = getProjectHash(cwd);
  const coderProjectsDir = path3.join(getHomeDir(), ".coder", "projects");
  return path3.join(coderProjectsDir, projectDirName, `${sessionId}.jsonl`);
}
var PersistenceService = class {
  async getCloudBaseApp() {
    const config = loadConfig();
    const envId = process.env.TCB_ENV_ID || config.cloudbase?.envId;
    if (!envId) {
      throw new Error("\u672A\u7ED1\u5B9A CloudBase \u73AF\u5883\uFF0C\u8BF7\u8BBE\u7F6E TCB_ENV_ID \u73AF\u5883\u53D8\u91CF");
    }
    const secretId = process.env.TCB_SECRET_ID;
    const secretKey = process.env.TCB_SECRET_KEY;
    const token = process.env.TCB_TOKEN || void 0;
    if (secretId && secretKey) {
      return CloudBase.init({
        envId,
        secretId,
        secretKey,
        ...token ? { token } : {}
      });
    }
    const auth3 = AuthSupervisor.getInstance({});
    const loginState = await auth3.getLoginState();
    if (!loginState) {
      throw new Error("\u672A\u767B\u5F55 CloudBase\uFF0C\u8BF7\u8BBE\u7F6E TCB_SECRET_ID \u548C TCB_SECRET_KEY \u73AF\u5883\u53D8\u91CF");
    }
    return CloudBase.init({
      envId,
      secretId: loginState.secretId,
      secretKey: loginState.secretKey,
      token: loginState.token
    });
  }
  async getCollection() {
    const app3 = await this.getCloudBaseApp();
    return app3.database().collection(COLLECTION_NAME);
  }
  // ========== Message Conversion ==========
  transformDBMessagesToCodeBuddyMessages(records, sessionId) {
    const messages = [];
    for (const record of records) {
      const timestamp = record.createTime || Date.now();
      if (record.role === "user") {
        this.restoreUserRecord(record, timestamp, sessionId, messages);
      } else if (record.role === "assistant") {
        this.restoreAssistantRecord(record, timestamp, sessionId, messages);
      }
    }
    this.fixSelfReferencingParentIds(messages);
    return messages;
  }
  fixSelfReferencingParentIds(messages) {
    const idSet = /* @__PURE__ */ new Set();
    const idTypeMap = /* @__PURE__ */ new Map();
    for (const msg of messages) {
      if (msg.id) {
        idSet.add(msg.id);
        idTypeMap.set(msg.id, msg.type);
      }
    }
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      let needsFix = false;
      if (msg.parentId && msg.parentId === msg.id) {
        needsFix = true;
      } else if (msg.parentId) {
        const parentType = idTypeMap.get(msg.parentId);
        if (!parentType || parentType === "file-history-snapshot") {
          needsFix = true;
        }
      } else if (msg.type === "function_call" || msg.type === "function_call_result") {
        needsFix = true;
      }
      if (needsFix) {
        if (i === 0) {
          msg.parentId = void 0;
        } else {
          for (let j = i - 1; j >= 0; j--) {
            const prevMsg = messages[j];
            if (prevMsg.id && prevMsg.type !== "file-history-snapshot" && prevMsg.id !== prevMsg.parentId) {
              msg.parentId = prevMsg.id;
              break;
            }
          }
        }
      }
    }
  }
  restoreUserRecord(record, _timestamp, _sessionId, messages) {
    for (const part of record.parts || []) {
      const msg = this.restorePartToMessage(part);
      if (msg) messages.push(msg);
    }
  }
  restoreAssistantRecord(record, _timestamp, _sessionId, messages) {
    const pendingMessages = [];
    let messagePartMsg = null;
    for (const part of record.parts || []) {
      if (part.contentType === "text") {
        messagePartMsg = this.restorePartToMessage(part);
      } else {
        const msg = this.restorePartToMessage(part);
        if (msg) pendingMessages.push(msg);
      }
    }
    messages.push(...pendingMessages);
    if (messagePartMsg) messages.push(messagePartMsg);
  }
  restorePartToMessage(part) {
    const metadata = part.metadata;
    if (!metadata) return null;
    if (part.contentType === "text") {
      const { contentBlocks, ...rest } = metadata;
      if (contentBlocks) {
        return { ...rest, content: contentBlocks };
      }
      const blockType = rest.role === "assistant" ? "output_text" : "input_text";
      return {
        ...rest,
        content: [{ type: blockType, text: part.content || "" }]
      };
    }
    if (part.contentType === "tool_call") {
      const { toolCallName, ...rest } = metadata;
      return {
        ...rest,
        name: toolCallName,
        callId: part.toolCallId,
        arguments: part.content
      };
    }
    if (part.contentType === "tool_result") {
      let output = part.content || "";
      try {
        const parsed = JSON.parse(output);
        if (typeof parsed === "object" && parsed !== null) output = parsed;
      } catch {
      }
      return { ...metadata, callId: part.toolCallId, output };
    }
    if (part.contentType === "reasoning") {
      return {
        ...metadata,
        type: "reasoning"
      };
    }
    return { ...metadata };
  }
  // ========== Local File Operations ==========
  async writeLocalMessageFile(filePath, messages) {
    const dir = path3.dirname(filePath);
    await fs2.mkdir(dir, { recursive: true });
    const content = messages.map((m) => JSON.stringify(m)).join("\n");
    await fs2.writeFile(filePath, content + "\n", "utf-8");
  }
  async readLocalMessageFile(filePath) {
    try {
      const content = await fs2.readFile(filePath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      return lines.map((line) => JSON.parse(line));
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }
  async cleanupLocalFile(filePath) {
    try {
      await fs2.unlink(filePath);
    } catch {
    }
  }
  // ========== Database Operations ==========
  async loadDBMessages(conversationId, ownerUin, envId, userId, limit = 20) {
    try {
      const collection = await this.getCollection();
      const app3 = await this.getCloudBaseApp();
      const _ = app3.database().command;
      const { data } = await collection.where({
        conversationId: _.eq(conversationId),
        envId: _.eq(envId),
        ownerUin: _.eq(ownerUin),
        userId: _.eq(userId),
        agentId: _.eq(AGENT_ID),
        status: _.eq("done")
      }).orderBy("createTime", "desc").limit(limit).get();
      const records = data.reverse();
      return records.map((r) => ({
        recordId: r.recordId,
        conversationId: r.conversationId,
        replyTo: r.replyTo,
        role: r.role,
        status: r.status,
        envId: r.envId,
        ownerUin: r.ownerUin,
        userId: r.userId,
        agentId: r.agentId,
        content: r.content,
        parts: r.parts || [],
        createTime: r.createTime || Date.now()
      }));
    } catch {
      return [];
    }
  }
  async saveRecordToDB(record) {
    const collection = await this.getCollection();
    const now2 = Date.now();
    const doc = {
      ...record,
      createTime: record.createTime || now2,
      updateTime: now2
    };
    await collection.add(doc);
    return {
      ...doc,
      createTime: doc.createTime
    };
  }
  async updateRecordStatus(recordId, status) {
    const collection = await this.getCollection();
    const app3 = await this.getCloudBaseApp();
    const _ = app3.database().command;
    await collection.where({ recordId: _.eq(recordId) }).update({ status, updateTime: Date.now() });
  }
  async appendPartsToRecord(recordId, parts) {
    if (parts.length === 0) return;
    const collection = await this.getCollection();
    const app3 = await this.getCloudBaseApp();
    const _ = app3.database().command;
    const { data } = await collection.where({ recordId: _.eq(recordId) }).get();
    if (!data || data.length === 0) return;
    const existingRecord = data[0];
    const existingParts = existingRecord.parts || [];
    const updatedParts = [...existingParts, ...parts];
    await collection.where({ recordId: _.eq(recordId) }).update({ parts: updatedParts, updateTime: Date.now() });
  }
  async replacePartsInRecord(recordId, parts) {
    const collection = await this.getCollection();
    const app3 = await this.getCloudBaseApp();
    const _ = app3.database().command;
    await collection.where({ recordId: _.eq(recordId) }).update({ parts, updateTime: Date.now() });
  }
  // ========== Message Grouping ==========
  groupMessages(messages) {
    const groups = [];
    let currentGroup = [];
    for (const msg of messages) {
      if (msg.type !== "message") {
        currentGroup.push(msg);
        continue;
      }
      const isRealUserInput = msg.role === "user" && this.isUserTextMessage(msg);
      if (isRealUserInput) {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
          currentGroup = [];
        }
        groups.push([msg]);
      } else {
        currentGroup.push(msg);
      }
    }
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    return groups;
  }
  isUserTextMessage(msg) {
    if (!msg.content || msg.content.length === 0) return false;
    const hasInputText = msg.content.some((b) => b.type === "input_text");
    const onlyToolResult = msg.content.every((b) => b.type === "tool_result");
    return hasInputText && !onlyToolResult;
  }
  isToolResultMessage(msg) {
    if (msg.type === "file-history-snapshot") return false;
    if (!msg.content || msg.content.length === 0) return false;
    return msg.content.every((b) => b.type === "tool_result");
  }
  extractPartsFromMessage(msg) {
    if (msg.type === "message") {
      const { content: contentBlocks, ...messageMeta } = msg;
      const blocks = contentBlocks || [];
      const textBlocks = blocks.filter((b) => b.type === "input_text" || b.type === "output_text");
      const plainText = textBlocks.map((b) => b.text || "").join("\n");
      const isSimple = blocks.length === 1 && textBlocks.length === 1 && Object.keys(blocks[0]).filter((k) => k !== "type" && k !== "text").length === 0;
      const metadata = { ...messageMeta };
      if (!isSimple) {
        metadata.contentBlocks = blocks;
      }
      return [
        {
          partId: uuidv4(),
          contentType: "text",
          content: plainText,
          metadata
        }
      ];
    }
    if (msg.type === "function_call") {
      const { arguments: _args, callId: _callId, name: _name, ...rest } = msg;
      return [
        {
          partId: uuidv4(),
          contentType: "tool_call",
          toolCallId: _callId,
          content: _args,
          metadata: { ...rest, toolCallName: _name }
        }
      ];
    }
    if (msg.type === "function_call_result") {
      const { output: _output, callId: _callId, ...rest } = msg;
      return [
        {
          partId: uuidv4(),
          contentType: "tool_result",
          toolCallId: _callId,
          content: typeof _output === "string" ? _output : JSON.stringify(_output),
          metadata: rest
        }
      ];
    }
    if (msg.type === "reasoning") {
      const rawContent = msg.rawContent || [];
      const reasoningText = rawContent.filter((block) => block.type === "reasoning_text" && block.text).map((block) => block.text || "").join("");
      return [
        {
          partId: uuidv4(),
          contentType: "reasoning",
          content: reasoningText,
          metadata: { ...msg }
        }
      ];
    }
    return [
      {
        partId: uuidv4(),
        contentType: "raw",
        metadata: { ...msg }
      }
    ];
  }
  // ========== Public API ==========
  async restoreMessages(conversationId, ownerUin, envId, userId, cwd) {
    try {
      const dbRecords = await this.loadDBMessages(conversationId, ownerUin, envId, userId);
      const lastRecordId = dbRecords.length > 0 ? dbRecords[dbRecords.length - 1].recordId : null;
      const lastAssistantRecord = [...dbRecords].reverse().find((r) => r.role === "assistant");
      const lastAssistantRecordId = lastAssistantRecord?.recordId ?? null;
      if (dbRecords.length === 0) {
        return { messages: [], lastRecordId: null, lastAssistantRecordId: null };
      }
      const messages = this.transformDBMessagesToCodeBuddyMessages(dbRecords, conversationId);
      const localFilePath = getLocalMessageFilePath(conversationId, cwd);
      await this.writeLocalMessageFile(localFilePath, messages);
      return { messages, lastRecordId, lastAssistantRecordId };
    } catch {
      return { messages: [], lastRecordId: null, lastAssistantRecordId: null };
    }
  }
  async syncMessages(conversationId, ownerUin, envId, userId, historicalMessages, lastRecordId, cwd, assistantRecordId, isResumeFromInterrupt, preSavedUserRecordId) {
    const localFilePath = getLocalMessageFilePath(conversationId, cwd);
    try {
      const allMessages = await this.readLocalMessageFile(localFilePath);
      if (allMessages.length === 0) return;
      const historicalIds = new Set(historicalMessages.map((m) => m.id));
      let newMessages = allMessages.filter((m) => !historicalIds.has(m.id));
      const map = {};
      newMessages = newMessages.reduce((list, item) => {
        if (item.type === "function_call") {
          if (!map[item.callId || ""]) {
            map[item.callId || ""] = true;
            list.push(item);
          }
        } else {
          list.push(item);
        }
        return list;
      }, []);
      if (isResumeFromInterrupt && newMessages.length > 0) {
        const firstUserMsgIndex = newMessages.findIndex((m) => m.type === "message" && m.role === "user");
        if (firstUserMsgIndex === 0) {
          const removedMsg = newMessages[0];
          const removedParentId = removedMsg.parentId;
          for (let i = 1; i < newMessages.length; i++) {
            if (newMessages[i].parentId === removedMsg.id) {
              newMessages[i] = { ...newMessages[i], parentId: removedParentId };
            }
          }
          newMessages = newMessages.slice(1);
        }
      }
      if (newMessages.length === 0) return;
      await this.appendMessagesToDB(
        conversationId,
        ownerUin,
        envId,
        userId,
        newMessages,
        lastRecordId,
        assistantRecordId,
        isResumeFromInterrupt,
        preSavedUserRecordId
      );
    } finally {
      await this.cleanupLocalFile(localFilePath);
    }
  }
  async appendMessagesToDB(conversationId, ownerUin, envId, userId, newMessages, lastRecordId, assistantRecordId, isResumeFromInterrupt, preSavedUserRecordId) {
    const groups = this.groupMessages(newMessages);
    let prevRecordId = lastRecordId;
    let firstAssistantGroupHandled = false;
    let preSavedUserRecordHandled = false;
    for (const group of groups) {
      if (group.length === 0) continue;
      const firstMsg = group.find((m) => !this.isToolResultMessage(m)) || group[0];
      const role = firstMsg.role || "assistant";
      const primaryMsg = group.find((m) => m.type === "message");
      const recordId = role === "assistant" && assistantRecordId ? assistantRecordId : primaryMsg?.id || uuidv4();
      const parts = [];
      for (const msg of group) {
        parts.push(...this.extractPartsFromMessage(msg));
      }
      if (parts.length === 0) continue;
      if ((isResumeFromInterrupt || !!assistantRecordId) && role === "assistant" && assistantRecordId && !firstAssistantGroupHandled) {
        await this.appendPartsToRecord(assistantRecordId, parts);
        await this.updateRecordStatus(assistantRecordId, "done");
        firstAssistantGroupHandled = true;
        continue;
      }
      if (preSavedUserRecordId && role === "user" && !preSavedUserRecordHandled) {
        await this.replacePartsInRecord(preSavedUserRecordId, parts);
        await this.updateRecordStatus(preSavedUserRecordId, "done");
        preSavedUserRecordHandled = true;
        prevRecordId = preSavedUserRecordId;
        continue;
      }
      const record = await this.saveRecordToDB({
        recordId,
        conversationId,
        envId,
        ownerUin,
        userId,
        agentId: AGENT_ID,
        role,
        replyTo: role === "assistant" ? prevRecordId ?? void 0 : void 0,
        status: "done",
        parts
      });
      if (role === "user") {
        prevRecordId = record.recordId;
      }
    }
  }
  async preSavePendingRecords(params) {
    const { conversationId, ownerUin, envId, userId, prompt, prevRecordId } = params;
    const assistantRecordId = params.assistantRecordId || uuidv4();
    const userRecordId = uuidv4();
    const userParts = [
      {
        partId: uuidv4(),
        contentType: "text",
        content: prompt,
        metadata: {
          id: userRecordId,
          type: "message",
          role: "user",
          sessionId: conversationId,
          timestamp: Date.now()
        }
      }
    ];
    await this.saveRecordToDB({
      recordId: userRecordId,
      conversationId,
      envId,
      ownerUin,
      userId,
      agentId: AGENT_ID,
      role: "user",
      replyTo: prevRecordId || void 0,
      status: "done",
      parts: userParts
    });
    await this.saveRecordToDB({
      recordId: assistantRecordId,
      conversationId,
      envId,
      ownerUin,
      userId,
      agentId: AGENT_ID,
      role: "assistant",
      replyTo: userRecordId,
      status: "pending",
      parts: []
    });
    return { userRecordId, assistantRecordId };
  }
  async getLatestRecordStatus(conversationId, ownerUin, envId) {
    try {
      const collection = await this.getCollection();
      const app3 = await this.getCloudBaseApp();
      const _ = app3.database().command;
      const { data } = await collection.where({
        conversationId: _.eq(conversationId),
        envId: _.eq(envId),
        ownerUin: _.eq(ownerUin),
        role: _.eq("assistant")
      }).orderBy("createTime", "desc").limit(1).get();
      if (!data || data.length === 0) return null;
      return {
        recordId: data[0].recordId,
        status: data[0].status || "done"
      };
    } catch {
      return null;
    }
  }
  async conversationExists(conversationId, ownerUin, envId) {
    try {
      const collection = await this.getCollection();
      const app3 = await this.getCloudBaseApp();
      const _ = app3.database().command;
      const { data } = await collection.where({
        conversationId: _.eq(conversationId),
        envId: _.eq(envId),
        ownerUin: _.eq(ownerUin)
      }).limit(1).get();
      return data.length > 0;
    } catch {
      return false;
    }
  }
  async finalizePendingRecords(assistantRecordId, status) {
    await this.updateRecordStatus(assistantRecordId, status);
  }
};
var persistenceService = new PersistenceService();

// src/sandbox/scf-sandbox-manager.ts
import CloudBase2 from "@cloudbase/manager-node";
import { sign } from "@cloudbase/signature-nodejs";
var SandboxInstance = class _SandboxInstance {
  constructor(deps, ctx) {
    this.deps = deps;
    this.functionName = ctx.functionName;
    this.conversationId = ctx.conversationId;
    this.envId = ctx.envId;
    this.sandboxEnvId = this.deps.sandboxEnvId;
    this.baseUrl = `https://${this.deps.sandboxEnvId}.api.tcloudbasegateway.com/v1/functions/${ctx.functionName}`;
    this.status = ctx.status;
    this.mode = ctx.mode;
    this.mcpConfig = ctx.mcpConfig;
  }
  deps;
  functionName;
  conversationId;
  envId;
  sandboxEnvId;
  baseUrl;
  status;
  mode;
  mcpConfig;
  async getAccessToken() {
    return this.deps.getAccessToken();
  }
  static buildAuthHeaders(accessToken, sessionId) {
    return {
      Authorization: `Bearer ${accessToken}`,
      "X-Cloudbase-Session-Id": sessionId,
      "X-Tcb-Webfn": "true"
    };
  }
  async getAuthHeaders() {
    const accessToken = await this.getAccessToken();
    return _SandboxInstance.buildAuthHeaders(accessToken, this.conversationId);
  }
  async getToolOverrideConfig() {
    return {
      url: this.baseUrl,
      headers: await this.getAuthHeaders()
    };
  }
  async request(path5, options = {}) {
    return fetch(`${this.baseUrl}${path5}`, {
      ...options,
      headers: {
        ...await this.getAuthHeaders(),
        ...options.headers
      }
    });
  }
};
var ScfSandboxManager = class {
  config = {
    timeoutMs: 30 * 60 * 1e3,
    maxCacheSize: 50,
    functionPrefix: "sandbox",
    runtime: "Nodejs16.13",
    memory: 3072,
    timeout: 900
  };
  cachedAccessToken = null;
  getEnvConfig() {
    return {
      envId: process.env.SCF_SANDBOX_ENV_ID || process.env.TCB_ENV_ID || "",
      secretId: process.env.TCB_SECRET_ID || "",
      secretKey: process.env.TCB_SECRET_KEY || "",
      token: process.env.TCB_TOKEN || "",
      functionPrefix: process.env.SCF_SANDBOX_FUNCTION_PREFIX || "sandbox",
      imageConfig: {
        ImageType: process.env.SCF_SANDBOX_IMAGE_TYPE || "personal",
        ImageUri: process.env.SCF_SANDBOX_IMAGE_URI || "",
        ContainerImageAccelerate: process.env.SCF_SANDBOX_IMAGE_ACCELERATE === "true",
        ImagePort: parseInt(process.env.SCF_SANDBOX_IMAGE_PORT || "9000", 10)
      }
    };
  }
  async getAdminAccessToken() {
    if (this.cachedAccessToken && Date.now() < this.cachedAccessToken.expiry) {
      return this.cachedAccessToken.token;
    }
    const envConfig = this.getEnvConfig();
    const { secretId, secretKey, token, envId } = envConfig;
    if (!secretId || !secretKey || !envId) {
      throw new Error("Missing TCB_SECRET_ID, TCB_SECRET_KEY or TCB_ENV_ID");
    }
    const host = `${envId}.api.tcloudbasegateway.com`;
    const url = `https://${host}/auth/v1/token/clientCredential`;
    const method = "POST";
    const headers = {
      "Content-Type": "application/json",
      Host: host
    };
    const data = { grant_type: "client_credentials" };
    const { authorization, timestamp } = sign({
      secretId,
      secretKey,
      method,
      url,
      headers,
      params: data,
      timestamp: Math.floor(Date.now() / 1e3) - 1,
      withSignedParams: false,
      isCloudApi: true
    });
    headers["Authorization"] = `${authorization}, Timestamp=${timestamp}${token ? `, Token=${token}` : ""}`;
    headers["X-Signature-Expires"] = "600";
    headers["X-Timestamp"] = String(timestamp);
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(data)
      });
      const body = await res.json();
      const accessToken = body?.access_token;
      const expiresIn = body?.expires_in || 0;
      if (!accessToken) {
        throw new Error("clientCredential response missing access_token");
      }
      if (expiresIn) {
        this.cachedAccessToken = {
          token: accessToken,
          expiry: Date.now() + expiresIn * 1e3 / 2
        };
      } else {
        this.cachedAccessToken = {
          token: accessToken,
          expiry: Date.now() + 3600 * 1e3
        };
      }
      console.log("[ScfSandbox] Got admin access token, expires_in:", expiresIn);
      return accessToken;
    } catch (err) {
      console.error("[ScfSandbox] getAdminAccessToken failed:", err.message);
      throw err;
    }
  }
  async buildInstanceDeps() {
    const envConfig = this.getEnvConfig();
    return {
      sandboxEnvId: envConfig.envId,
      getAccessToken: () => this.getAdminAccessToken()
    };
  }
  async buildSandboxMcpConfig(functionName, conversationId, sandboxEnvId) {
    const accessToken = await this.getAdminAccessToken();
    const url = `https://${sandboxEnvId}.api.tcloudbasegateway.com/v1/functions/${functionName}/mcp`;
    return {
      type: "http",
      url,
      headers: SandboxInstance.buildAuthHeaders(accessToken, conversationId)
    };
  }
  async getOrCreate(conversationId, envId, options, onProgress) {
    const progress = onProgress || (() => {
    });
    const mode = options?.mode || "per-conversation";
    const envConfig = this.getEnvConfig();
    const functionPrefix = envConfig.functionPrefix || this.config.functionPrefix;
    const functionKey = mode === "shared" ? "shared" : conversationId;
    const functionName = this.generateFunctionName(functionKey, functionPrefix);
    const { exists: functionExists } = await this.checkFunctionExists(functionName);
    if (functionExists) {
      await this.waitForFunctionReady(functionName);
      const instanceDeps = await this.buildInstanceDeps();
      const mcpConfig = await this.buildSandboxMcpConfig(functionName, conversationId, instanceDeps.sandboxEnvId);
      return new SandboxInstance(instanceDeps, {
        functionName,
        conversationId,
        envId,
        status: "ready",
        mode,
        mcpConfig
      });
    }
    return this.createNewFunction(functionName, conversationId, envId, mode, options, progress);
  }
  async createNewFunction(functionName, conversationId, envId, mode, options, onProgress) {
    const progress = onProgress || (() => {
    });
    try {
      progress({ phase: "create", message: "\u6B63\u5728\u521B\u5EFA\u5DE5\u4F5C\u7A7A\u95F4...\n" });
      await this.createFunction(functionName);
      try {
        await Promise.all([this.waitForFunctionReady(functionName), this.createGatewayApi(functionName)]);
      } catch (networkError) {
        console.error(`[ScfSandbox] Network setup failed, rolling back: ${networkError.message}`);
        await this.deleteFunction(functionName).catch((delErr) => {
          console.warn(`[ScfSandbox] Failed to delete function during rollback: ${delErr.message}`);
        });
        throw new Error(`\u7F51\u7EDC\u914D\u7F6E\u5931\u8D25: ${networkError.message}`);
      }
      const instanceDeps = await this.buildInstanceDeps();
      const mcpConfig = await this.buildSandboxMcpConfig(functionName, conversationId, instanceDeps.sandboxEnvId);
      return new SandboxInstance(instanceDeps, {
        functionName,
        conversationId,
        envId,
        status: "ready",
        mode,
        mcpConfig
      });
    } catch (error) {
      console.error(`[ScfSandbox] Creation failed: ${functionName}`);
      progress({ phase: "error", message: `\u5DE5\u4F5C\u7A7A\u95F4\u521B\u5EFA\u5931\u8D25: ${error.message}
` });
      throw new Error(`\u521B\u5EFA\u5DE5\u4F5C\u7A7A\u95F4\u5931\u8D25: ${error.message}`);
    }
  }
  generateFunctionName(cacheKey, prefix) {
    const sanitized = cacheKey.replace(/[^a-zA-Z0-9_-]/g, "-");
    return `${prefix || this.config.functionPrefix}-${sanitized}`.substring(0, 60);
  }
  async createFunction(functionName) {
    const envConfig = this.getEnvConfig();
    console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>envConfig", envConfig);
    try {
      const app3 = new CloudBase2({
        secretId: envConfig.secretId,
        secretKey: envConfig.secretKey,
        token: envConfig.token,
        envId: envConfig.envId
      });
      const createParams = {
        FunctionName: functionName,
        Namespace: envConfig.envId,
        Stamp: "MINI_QCBASE",
        Role: "TCB_QcsRole",
        Code: {
          ImageConfig: envConfig.imageConfig
        },
        Type: "HTTP",
        ProtocolType: "WS",
        ProtocolParams: {
          WSParams: {
            IdleTimeOut: 7200
          }
        },
        MemorySize: this.config.memory,
        DiskSize: 1024,
        Timeout: this.config.timeout,
        InitTimeout: 90,
        InstanceConcurrencyConfig: {
          MaxConcurrency: 100,
          DynamicEnabled: "FALSE",
          InstanceIsolationEnabled: "TRUE",
          Type: "Session-Based",
          SessionConfig: {
            SessionSource: "HEADER",
            SessionName: "X-Cloudbase-Session-Id",
            MaximumConcurrencySessionPerInstance: 1,
            MaximumTTLInSeconds: 21600,
            MaximumIdleTimeInSeconds: 1800,
            IdleTimeoutStrategy: "PAUSE"
          }
        },
        Environment: {
          Variables: this.buildGitArchiveVars()
        },
        Description: "SCF Sandbox for conversation (Image-based)"
      };
      await app3.commonService("scf").call({
        Action: "CreateFunction",
        Param: createParams
      });
    } catch (error) {
      if (error.message?.includes("already exists") || error.code === "ResourceInUse") {
        console.warn(`[ScfSandbox] Function already exists: ${functionName}`);
        return;
      }
      throw error;
    }
  }
  async createGatewayApi(functionName) {
    const envConfig = this.getEnvConfig();
    try {
      const app3 = new CloudBase2({
        secretId: envConfig.secretId,
        secretKey: envConfig.secretKey,
        token: envConfig.token,
        envId: envConfig.envId
      });
      const domain = `${envConfig.envId}.ap-shanghai.app.tcloudbase.com`;
      await app3.commonService().call({
        Action: "CreateCloudBaseGWAPI",
        Param: {
          ServiceId: envConfig.envId,
          Name: functionName,
          Path: `/${functionName}/preview`,
          Type: 6,
          EnableUnion: true,
          AuthSwitch: 2,
          PathTransmission: 1,
          EnableRegion: true,
          Domain: domain
        }
      });
    } catch (error) {
      if (error.message?.includes("already exists") || error.message?.includes("ResourceInUse") || error.code === "ResourceInUse") {
        console.warn(`[ScfSandbox] Gateway API already exists: ${functionName}`);
        return;
      }
      throw error;
    }
  }
  async checkFunctionExists(functionName) {
    const envConfig = this.getEnvConfig();
    try {
      const app3 = new CloudBase2({
        secretId: envConfig.secretId,
        secretKey: envConfig.secretKey,
        token: envConfig.token,
        envId: envConfig.envId
      });
      const result = await app3.commonService().call({
        Action: "GetFunction",
        Param: {
          FunctionName: functionName,
          EnvId: envConfig.envId,
          Namespace: envConfig.envId,
          ShowCode: "TRUE"
        }
      });
      if (!result || result.Status === void 0) {
        return { exists: false };
      }
      const currentImageUri = result.ImageConfig?.ImageUri;
      return { exists: true, currentImageUri };
    } catch {
      return { exists: false };
    }
  }
  async waitForFunctionReady(functionName, maxRetries = 120, retryInterval = 3e3) {
    const envConfig = this.getEnvConfig();
    const app3 = new CloudBase2({
      secretId: envConfig.secretId,
      secretKey: envConfig.secretKey,
      token: envConfig.token,
      envId: envConfig.envId
    });
    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await app3.commonService().call({
          Action: "GetFunction",
          Param: {
            FunctionName: functionName,
            EnvId: envConfig.envId,
            Namespace: envConfig.envId,
            ShowCode: "TRUE"
          }
        });
        const status = result?.Status;
        if (status === "Active" || status === "active" || status === "Running" || status === "running") {
          return;
        }
      } catch (error) {
        if (error.code === "ResourceNotFound" || error.message?.includes("ResourceNotFound") || error.message?.includes("not exist") || error.message?.includes("not found")) {
          throw new Error(`Function ${functionName} does not exist`);
        }
        if (i < 5) {
          console.warn(`[ScfSandbox] Check function status error: ${error.message}`);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, retryInterval));
    }
    throw new Error(
      `Function ${functionName} not ready after ${maxRetries} retries (${maxRetries * retryInterval / 1e3}s)`
    );
  }
  buildGitArchiveVars() {
    const repo = process.env.GIT_ARCHIVE_REPO;
    const token = process.env.GIT_ARCHIVE_TOKEN;
    const user = process.env.GIT_ARCHIVE_USER;
    if (!repo || !token) return [];
    return [
      { Key: "GIT_ARCHIVE_REPO", Value: repo },
      { Key: "GIT_ARCHIVE_TOKEN", Value: token },
      { Key: "GIT_ARCHIVE_USER", Value: user || "" }
    ];
  }
  async deleteFunction(functionName) {
    const envConfig = this.getEnvConfig();
    try {
      const app3 = new CloudBase2({
        secretId: envConfig.secretId,
        secretKey: envConfig.secretKey,
        token: envConfig.token,
        envId: envConfig.envId
      });
      await app3.commonService().call({
        Action: "DeleteFunction",
        Param: {
          FunctionName: functionName,
          Namespace: envConfig.envId
        }
      });
    } catch (error) {
      console.warn(`[ScfSandbox] Delete function error: ${error.message}`);
    }
  }
};
var scfSandboxManager = new ScfSandboxManager();

// src/sandbox/sandbox-mcp-proxy.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { z } from "zod";
var AuthRequiredError = class extends Error {
  constructor(status) {
    super(`MCP_AUTH_REQUIRED: gateway returned ${status}`);
    this.name = "AuthRequiredError";
  }
};
function jsonSchemaToZodRawShape(schema) {
  if (!schema || schema.type !== "object" || !schema.properties) {
    return {};
  }
  const shape = {};
  const required = new Set(schema.required || []);
  for (const [key, propSchema] of Object.entries(schema.properties)) {
    let zodType = jsonSchemaPropertyToZod(propSchema);
    if (!required.has(key)) {
      zodType = zodType.optional();
    }
    shape[key] = zodType;
  }
  return shape;
}
function jsonSchemaPropertyToZod(propSchema) {
  if (!propSchema) return z.any();
  const { type, description, enum: enumValues, items, properties, required } = propSchema;
  let zodType;
  if (enumValues && Array.isArray(enumValues)) {
    zodType = z.enum(enumValues);
  } else if (type === "string") {
    zodType = z.string();
  } else if (type === "number" || type === "integer") {
    zodType = z.number();
  } else if (type === "boolean") {
    zodType = z.boolean();
  } else if (type === "array") {
    const itemType = items ? jsonSchemaPropertyToZod(items) : z.any();
    zodType = z.array(itemType);
  } else if (type === "object") {
    if (properties) {
      const shape = {};
      const reqSet = new Set(required || []);
      for (const [k, v] of Object.entries(properties)) {
        let propType = jsonSchemaPropertyToZod(v);
        if (!reqSet.has(k)) propType = propType.optional();
        shape[k] = propType;
      }
      zodType = z.object(shape);
    } else {
      zodType = z.record(z.string(), z.any());
    }
  } else {
    zodType = z.any();
  }
  if (description) {
    zodType = zodType.describe(description);
  }
  return zodType;
}
async function createSandboxMcpClient(deps) {
  const {
    baseUrl,
    sessionId,
    getAccessToken,
    getCredentials,
    bashTimeoutMs = 3e4,
    workspaceFolderPaths = "",
    log = (msg) => console.log(msg)
  } = deps;
  async function buildHeaders() {
    const token = await getAccessToken();
    return {
      "Content-Type": "application/json",
      ...SandboxInstance.buildAuthHeaders(token, sessionId)
    };
  }
  async function apiCall(tool2, body, timeoutMs = bashTimeoutMs) {
    const headers = await buildHeaders();
    const res = await fetch(`${baseUrl}/api/tools/${tool2}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (res.status === 401 || res.status === 403) {
      throw new AuthRequiredError(res.status);
    }
    const data = await res.json();
    if (!data.success) throw new Error(data.error ?? `${tool2} call failed`);
    return data.result;
  }
  async function bashCall(command, timeoutMs = bashTimeoutMs) {
    return apiCall("bash", { command, timeout: timeoutMs }, timeoutMs);
  }
  async function injectCredentials() {
    const creds = await getCredentials();
    const headers = await buildHeaders();
    const res = await fetch(`${baseUrl}/api/session/env`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        CLOUDBASE_ENV_ID: creds.cloudbaseEnvId,
        TENCENTCLOUD_SECRETID: creds.secretId,
        TENCENTCLOUD_SECRETKEY: creds.secretKey,
        TENCENTCLOUD_SESSIONTOKEN: creds.sessionToken ?? "",
        INTEGRATION_IDE: "codebuddy",
        WORKSPACE_FOLDER_PATHS: workspaceFolderPaths
      })
    });
    if (res.status === 401 || res.status === 403) throw new AuthRequiredError(res.status);
    const data = await res.json();
    if (!data.success) throw new Error(`Failed to inject credentials: ${data.error}`);
  }
  async function fetchCloudbaseSchema() {
    const tmpPath = `.mcporter-schema.json`;
    await bashCall(`mcporter list cloudbase --schema --output json > ${tmpPath} 2>&1`, 2e4);
    const headers = await buildHeaders();
    const res = await fetch(`${baseUrl}/e2b-compatible/files?path=${encodeURIComponent(tmpPath)}`, {
      headers
    });
    if (!res.ok) throw new Error(`Failed to read schema file: ${res.status}`);
    const parsed = await res.json();
    if (!Array.isArray(parsed.tools)) throw new Error("No tools array in schema response");
    return parsed.tools;
  }
  function serializeFnCall(toolName, args) {
    if (!args || Object.keys(args).length === 0) return `cloudbase.${toolName}()`;
    const parts = Object.entries(args).map(([k, v]) => {
      if (v === void 0 || v === null) return null;
      if (typeof v === "string") return `${k}: ${JSON.stringify(v)}`;
      if (typeof v === "boolean" || typeof v === "number") return `${k}: ${v}`;
      return `${k}: ${JSON.stringify(v)}`;
    }).filter(Boolean).join(", ");
    return `cloudbase.${toolName}(${parts})`;
  }
  async function mcporterCall(toolName, args) {
    const expr = serializeFnCall(toolName, args);
    const escaped = expr.replace(/'/g, "'\\''");
    const cmd = `mcporter call '${escaped}' 2>&1`;
    log(`[sandbox-mcp] bash cmd: ${cmd}
`);
    return bashCall(cmd, 6e4);
  }
  function isCredentialError(output) {
    return output.includes("AUTH_REQUIRED") || output.includes("The SecretId is not found") || output.includes("SecretId is not found") || output.includes("InvalidParameter.SecretIdNotFound") || output.includes("AuthFailure");
  }
  let cloudbaseTools = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      cloudbaseTools = await fetchCloudbaseSchema();
      log(`[sandbox-mcp] Discovered ${cloudbaseTools.length} CloudBase tools (attempt ${attempt})
`);
      break;
    } catch (e) {
      log(`[sandbox-mcp] Schema fetch failed (attempt ${attempt}/3): ${e.message}
`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 3e3));
      else log(`[sandbox-mcp] Starting in degraded mode (workspace tools only)
`);
    }
  }
  const server = new McpServer({ name: "cloudbase-sandbox-proxy", version: "2.0.0" });
  const SKIP = /* @__PURE__ */ new Set(["logout"]);
  for (const tool2 of cloudbaseTools) {
    if (SKIP.has(tool2.name)) continue;
    if (tool2.name === "login") {
      server.tool(
        "login",
        "Re-authenticate CloudBase credentials for this workspace session. No parameters needed.",
        {},
        async () => {
          try {
            await injectCredentials();
            return { content: [{ type: "text", text: JSON.stringify({ ok: true }) }] };
          } catch (e) {
            return {
              content: [{ type: "text", text: JSON.stringify({ ok: false, message: e.message }) }],
              isError: true
            };
          }
        }
      );
      continue;
    }
    const zodShape = jsonSchemaToZodRawShape(tool2.inputSchema);
    server.tool(
      tool2.name,
      (tool2.description ?? `CloudBase tool: ${tool2.name}`) + "\n\nNOTE: localPath refers to paths inside the container workspace.",
      zodShape,
      async (args) => {
        if (tool2.name === "downloadTemplate") args = { ...args, ide: "codebuddy" };
        const attemptCall = async () => {
          const result = await mcporterCall(tool2.name, args);
          return result.output ?? "";
        };
        try {
          let output = await attemptCall();
          if (isCredentialError(output)) {
            log(`[sandbox-mcp] Credential error for ${tool2.name}, re-injecting...
`);
            await injectCredentials();
            output = await attemptCall();
            if (isCredentialError(output)) {
              return {
                content: [
                  {
                    type: "text",
                    text: output + "\n\nCredential re-injection attempted but error persists."
                  }
                ],
                isError: true
              };
            }
          }
          return { content: [{ type: "text", text: output }] };
        } catch (e) {
          return {
            content: [{ type: "text", text: `Error: ${e.message}` }],
            isError: true
          };
        }
      }
    );
  }
  if (cloudbaseTools.length === 0) {
    server.tool("__noop__", "Placeholder tool. CloudBase tools are unavailable in degraded mode.", {}, async () => ({
      content: [{ type: "text", text: "CloudBase tools unavailable (degraded mode)" }],
      isError: true
    }));
  }
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "cloudbase-agent", version: "1.0.0" });
  await client.connect(clientTransport);
  log(`[sandbox-mcp] Ready. baseUrl=${baseUrl} session=${sessionId} tools=${cloudbaseTools.length}
`);
  return {
    client,
    close: async () => {
      try {
        await client.close();
      } catch {
      }
      try {
        await server.close();
      } catch {
      }
    }
  };
}

// src/sandbox/git-archive.ts
function getConfig() {
  const repo = process.env.GIT_ARCHIVE_REPO;
  const token = process.env.GIT_ARCHIVE_TOKEN;
  const user = process.env.GIT_ARCHIVE_USER;
  if (!repo || !token) {
    return null;
  }
  let apiDomain = "https://api.cnb.cool";
  try {
    const url = new URL(repo);
    apiDomain = `https://api.${url.hostname}`;
  } catch {
  }
  return { repo, token, user, apiDomain };
}
async function archiveToGit(sandbox, conversationId, prompt) {
  if (!conversationId) return;
  const config = getConfig();
  if (!config) {
    console.log("[GitArchive] Not configured, skipping archive");
    return;
  }
  try {
    const promptSummary = prompt.slice(0, 50).replace(/\n/g, " ");
    const commitMessage = `${conversationId}: ${promptSummary}`;
    const gitPushRes = await sandbox.request("/api/tools/git_push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: commitMessage }),
      signal: AbortSignal.timeout(3e4)
    });
    if (gitPushRes.ok) {
      console.log("[GitArchive] Push completed");
    } else {
      console.warn(`[GitArchive] Push failed: status=${gitPushRes.status}`);
    }
  } catch (err) {
    console.error("[GitArchive] Error:", err?.message);
  }
}

// src/agent/cloudbase-agent.service.ts
var MODEL = "kimi-k2.5";
var OAUTH_TOKEN_ENDPOINT = "https://copilot.tencent.com/oauth2/token";
var CONNECT_TIMEOUT_MS = 6e4;
var ITERATION_TIMEOUT_MS = 30 * 1e3;
var cachedToken = null;
async function getOAuthToken() {
  if (cachedToken && Date.now() < cachedToken.expiry) {
    return cachedToken.token;
  }
  const clientId = process.env.CODEBUDDY_CLIENT_ID;
  const clientSecret = process.env.CODEBUDDY_CLIENT_SECRET;
  const endpoint = process.env.CODEBUDDY_OAUTH_ENDPOINT || OAUTH_TOKEN_ENDPOINT;
  if (!clientId || !clientSecret) {
    throw new Error("Missing CODEBUDDY_CLIENT_ID or CODEBUDDY_CLIENT_SECRET environment variables");
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret
    }).toString()
  });
  if (!response.ok) {
    throw new Error(`OAuth token request failed: ${response.status}`);
  }
  const data = await response.json();
  if (!data.access_token) {
    throw new Error("OAuth2 response missing access_token");
  }
  const token = data.access_token;
  const expiresIn = data.expires_in || 3600;
  const expiry = Date.now() + expiresIn * 1e3 - 6e4;
  cachedToken = { token, expiry };
  return token;
}
function getUserContext() {
  const config = loadConfig();
  return {
    envId: config.cloudbase?.envId || process.env.TCB_ENV_ID || "",
    ownerUin: "coder-user",
    userId: "coder-user"
  };
}
function createToolCallTracker() {
  return {
    pendingToolCalls: /* @__PURE__ */ new Map(),
    blockIndexToToolId: /* @__PURE__ */ new Map(),
    toolInputJsonBuffers: /* @__PURE__ */ new Map()
  };
}
function buildAppendPrompt(sandboxCwd, conversationId, envId) {
  const base = `\u4F60\u662F\u4E00\u4E2A\u901A\u7528 AI \u7F16\u7A0B\u52A9\u624B\uFF0C\u540C\u65F6\u5177\u5907\u817E\u8BAF\u4E91\u5F00\u53D1\uFF08CloudBase\uFF09\u80FD\u529B\uFF0C\u53EF\u901A\u8FC7\u5DE5\u5177\u64CD\u4F5C\u4E91\u51FD\u6570\u3001\u6570\u636E\u5E93\u3001\u5B58\u50A8\u3001\u4E91\u6258\u7BA1\u7B49\u8D44\u6E90\u3002
\u4F18\u5148\u4F7F\u7528\u5DE5\u5177\u5B8C\u6210\u4EFB\u52A1\uFF1B\u5220\u9664\u7B49\u7834\u574F\u6027\u64CD\u4F5C\u9700\u786E\u8BA4\u7528\u6237\u610F\u56FE\u3002
\u9ED8\u8BA4\u4F7F\u7528\u4E2D\u6587\u4E0E\u7528\u6237\u6C9F\u901A\u3002

Bash \u8D85\u65F6\u5904\u7406\u7B56\u7565\uFF1A\u5BF9\u4E8E\u8017\u65F6\u8F83\u957F\u7684\u547D\u4EE4\uFF08\u5982 npm install\u3001yarn install\u3001\u5927\u578B\u9879\u76EE\u6784\u5EFA\u7B49\uFF09\uFF0C\u5982\u679C\u6267\u884C\u8D85\u65F6\uFF1A
1. \u6539\u4E3A\u540E\u53F0\u6267\u884C, \u6DFB\u52A0 run_in_background\uFF0C\u53EF\u4EE5\u83B7\u53D6 pid
2. \u5B9A\u671F\u68C0\u67E5\u8FDB\u7A0B\u72B6\u6001\uFF1Aps aux | grep '<\u5173\u952E\u8BCD>' | grep -v grep
3. \u901A\u8FC7 BashOutput \u7ED3\u5408 pid \u67E5\u770B\u8F93\u51FA\u7ED3\u679C
4. \u4E5F\u53EF\u4EE5\u901A\u8FC7 KillShell \u5173\u95ED\u540E\u53F0\u6267\u884C\u7684\u4EFB\u52A1

\u5C0F\u7A0B\u5E8F\u5F00\u53D1\u89C4\u5219\uFF1A
\u5F53\u7528\u6237\u7684\u9700\u6C42\u6D89\u53CA\u5FAE\u4FE1\u5C0F\u7A0B\u5E8F\u5F00\u53D1\uFF08\u521B\u5EFA\u3001\u4FEE\u6539\u3001\u90E8\u7F72\u5C0F\u7A0B\u5E8F\u9879\u76EE\uFF09\u65F6\uFF1A
1. \u5FC5\u987B\u5148\u4F7F\u7528 AskUserQuestion \u5DE5\u5177\u83B7\u53D6\u7528\u6237\u7684\u5FAE\u4FE1\u5C0F\u7A0B\u5E8F appId
   - options \u7684\u7B2C\u4E00\u4E2A\u9009\u9879\u7684 label \u5FC5\u987B\u56FA\u5B9A\u4E3A "ask:miniprogram_appid"\uFF08\u7CFB\u7EDF\u636E\u6B64\u8BC6\u522B\u95EE\u9898\u7C7B\u522B\u5E76\u66FF\u6362\u4E3A\u9884\u7F6E\u5185\u5BB9\uFF09
   - \u5176\u4F59\u5B57\u6BB5\u53EF\u4EFB\u610F\u586B\u5199\uFF0C\u7CFB\u7EDF\u4F1A\u81EA\u52A8\u66FF\u6362\u4E3A\u6807\u51C6\u95EE\u9898
   - \u793A\u4F8B: AskUserQuestion({ questions: [{ question: "\u9009\u62E9\u5C0F\u7A0B\u5E8F", header: "AppId", options: [{ label: "ask:miniprogram_appid", description: "\u9009\u62E9\u5C0F\u7A0B\u5E8F" }, { label: "\u8DF3\u8FC7", description: "\u8DF3\u8FC7" }], multiSelect: false }] })
2. \u83B7\u53D6\u5230 appId \u540E\uFF0C\u5728\u751F\u6210 project.config.json \u65F6\u4F7F\u7528\u8BE5 appId
3. \u5728\u8C03\u7528 publishMiniprogram \u90E8\u7F72\u524D\uFF0C\u786E\u4FDD\u5DF2\u83B7\u53D6\u5230\u6709\u6548\u7684 appId`;
  if (sandboxCwd) {
    return `${base}

\u5F53\u524D\u7528\u6237\u7684\u9879\u76EE\u5DE5\u4F5C\u76EE\u5F55\u4E3A: ${sandboxCwd}
\u5F53\u524D\u4F7F\u7528\u7684\u4E91\u5F00\u53D1\u73AF\u5883\u4E3A: ${envId}
\u8BF7\u6CE8\u610F\uFF1A
- \u6240\u6709\u6587\u4EF6\u8BFB\u5199\u3001\u7EC8\u7AEF\u547D\u4EE4\u90FD\u5E94\u5728\u6B64\u76EE\u5F55\u4E0B\u6267\u884C
- \u4F7F\u7528 cloudbase_uploadFiles \u90E8\u7F72\u6587\u4EF6\u65F6\uFF0ClocalPath \u5FC5\u987B\u662F\u5BB9\u5668\u5185\u7684**\u7EDD\u5BF9\u8DEF\u5F84**\uFF08\u5373\u5F53\u524D\u5DE5\u4F5C\u76EE\u5F55 ${sandboxCwd} \u4E0B\u7684\u8DEF\u5F84\uFF09\uFF0C\u4F8B\u5982 ${sandboxCwd}/index.html
- \u5982\u7528\u6237\u6CA1\u6709\u7279\u522B\u8981\u6C42\uFF0CcloudPath \u9700\u8981\u4E3A ${conversationId}\uFF0C\u5373\u5728\u5F53\u524D\u4F1A\u8BDD\u8DEF\u5F84\u4E0B
- \u4E0D\u8981\u4F7F\u7528\u76F8\u5BF9\u8DEF\u5F84\u7ED9 cloudbase_uploadFiles`;
  }
  return base;
}
var CloudbaseAgentService = class {
  async chatStream(prompt, callback, options = {}) {
    const { conversationId = uuidv42(), envId, ownerUin, userId, maxTurns = 10, cwd } = options;
    console.log("[Agent] chatStream start, conversationId:", conversationId, "prompt:", prompt.slice(0, 50));
    const userContext = envId ? { envId, ownerUin: ownerUin || "coder-user", userId: userId || "coder-user" } : getUserContext();
    console.log("[Agent] userContext:", JSON.stringify(userContext));
    const actualCwd = cwd || `/tmp/workspace/${conversationId}`;
    mkdirSync2(actualCwd, { recursive: true });
    console.log("[Agent] cwd:", actualCwd);
    let historicalMessages = [];
    let lastRecordId = null;
    let hasHistory = false;
    if (conversationId && userContext.envId) {
      const restored = await persistenceService.restoreMessages(
        conversationId,
        userContext.ownerUin,
        userContext.envId,
        userContext.userId,
        actualCwd
      );
      historicalMessages = restored.messages;
      lastRecordId = restored.lastRecordId;
      hasHistory = historicalMessages.length > 0;
    }
    let preSavedUserRecordId = null;
    const assistantMessageId = uuidv42();
    if (conversationId && userContext.envId) {
      const preSaved = await persistenceService.preSavePendingRecords({
        conversationId,
        ownerUin: userContext.ownerUin,
        envId: userContext.envId,
        userId: userContext.userId,
        prompt,
        prevRecordId: lastRecordId,
        assistantRecordId: assistantMessageId
      });
      preSavedUserRecordId = preSaved.userRecordId;
    }
    const wrappedCallback = (msg) => callback({ ...msg, id: assistantMessageId });
    let sandboxInstance = null;
    let sandboxMcpClient = null;
    let toolOverrideConfig = null;
    const sandboxEnabled = process.env.SCF_SANDBOX_ENV_ID && process.env.SCF_SANDBOX_IMAGE_URI;
    if (sandboxEnabled) {
      try {
        sandboxInstance = await scfSandboxManager.getOrCreate(conversationId, userContext.envId, {
          ownerUin: userContext.ownerUin,
          mode: "per-conversation"
        });
        toolOverrideConfig = await sandboxInstance.getToolOverrideConfig();
        sandboxMcpClient = await createSandboxMcpClient({
          baseUrl: sandboxInstance.baseUrl,
          sessionId: conversationId,
          getAccessToken: () => sandboxInstance.getAccessToken(),
          getCredentials: async () => ({
            cloudbaseEnvId: userContext.envId,
            secretId: process.env.TCB_SECRET_ID || "",
            secretKey: process.env.TCB_SECRET_KEY || "",
            sessionToken: process.env.TCB_TOKEN
          }),
          workspaceFolderPaths: actualCwd,
          log: (msg) => console.log(msg)
        });
        console.log(`[Agent] Sandbox ready: ${sandboxInstance.functionName}`);
      } catch (err) {
        console.error("[Agent] Sandbox creation failed:", err.message);
      }
    }
    const authToken = await getOAuthToken();
    const abortController = new AbortController();
    let connectTimer;
    let iterationTimeoutTimer;
    try {
      const sessionOpts = hasHistory ? { resume: conversationId, sessionId: conversationId } : { persistSession: true, sessionId: conversationId };
      const envVars = {
        CODEBUDDY_AUTH_TOKEN: authToken
      };
      const mcpServers = {};
      if (sandboxMcpClient) {
        mcpServers.cloudbase = sandboxMcpClient.client;
      }
      const queryArgs = {
        prompt,
        options: {
          model: MODEL,
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          maxTurns,
          cwd: actualCwd,
          ...sessionOpts,
          includePartialMessages: true,
          systemPrompt: {
            append: buildAppendPrompt(actualCwd, conversationId, userContext.envId)
          },
          // mcpServers,
          abortController,
          canUseTool: async (toolName, input, _options) => {
            if (toolName === "AskUserQuestion") {
              return {
                behavior: "deny",
                message: "Waiting for user response",
                interrupt: true
              };
            }
            return { behavior: "allow", updatedInput: input };
          },
          env: envVars,
          stderr: (data) => {
            console.error("[Agent CLI stderr]", data.trim());
          }
        }
      };
      console.log("[Agent] calling query(), model:", MODEL, "sessionOpts:", JSON.stringify(sessionOpts));
      const q = query(queryArgs);
      console.log("[Agent] query() returned, entering message loop...");
      connectTimer = setTimeout(() => {
        abortController.abort();
      }, CONNECT_TIMEOUT_MS);
      let firstMessageReceived = false;
      const tracker = createToolCallTracker();
      iterationTimeoutTimer = setTimeout(() => {
        abortController.abort();
        q.cleanup?.();
      }, ITERATION_TIMEOUT_MS);
      try {
        console.log("[Agent] starting for-await loop...");
        messageLoop: for await (const message of q) {
          console.log("[Agent] message type:", message.type, JSON.stringify(message).slice(0, 300));
          if (iterationTimeoutTimer) {
            clearTimeout(iterationTimeoutTimer);
          }
          iterationTimeoutTimer = setTimeout(() => {
            abortController.abort();
            q.cleanup?.();
          }, ITERATION_TIMEOUT_MS);
          if (!firstMessageReceived) {
            firstMessageReceived = true;
            clearTimeout(connectTimer);
          }
          switch (message.type) {
            case "system": {
              const sid = message.session_id;
              if (sid) wrappedCallback({ type: "session", sessionId: sid });
              break;
            }
            case "error": {
              const errorMsg = message.error || "Unknown error";
              throw new Error(errorMsg);
            }
            case "stream_event":
              this.handleStreamEvent(message.event, tracker, wrappedCallback);
              break;
            case "user": {
              const content = message.message?.content;
              if (content) this.handleToolResults(content, tracker, wrappedCallback);
              break;
            }
            case "assistant":
              this.handleToolNotFoundErrors(message, tracker, wrappedCallback);
              break;
            case "result":
              wrappedCallback({
                type: "result",
                content: JSON.stringify({
                  subtype: message.subtype,
                  duration_ms: message.duration_ms
                })
              });
              break messageLoop;
            default:
              break;
          }
        }
      } catch (err) {
        console.error("[Agent] message loop error:", err);
        if (err instanceof ExecutionError) {
          console.log("[Agent] ExecutionError (interrupt), returning");
          return;
        }
        if (err instanceof Error && err.message === "Transport closed") {
          console.error("[Agent] CLI process exited unexpectedly");
          return;
        }
        throw err;
      }
    } finally {
      console.log("[Agent] entering finally block");
      if (connectTimer) clearTimeout(connectTimer);
      if (iterationTimeoutTimer) clearTimeout(iterationTimeoutTimer);
      if (sandboxInstance) {
        try {
          await archiveToGit(sandboxInstance, conversationId, prompt);
        } catch (err) {
          console.error("[Agent] Archive to git failed:", err.message);
        }
      }
      if (sandboxMcpClient) {
        try {
          await sandboxMcpClient.close();
        } catch {
        }
      }
      try {
        await persistenceService.syncMessages(
          conversationId,
          userContext.ownerUin,
          userContext.envId,
          userContext.userId,
          historicalMessages,
          lastRecordId,
          actualCwd,
          assistantMessageId,
          false,
          preSavedUserRecordId
        );
      } catch {
        if (preSavedUserRecordId && conversationId) {
          try {
            await persistenceService.finalizePendingRecords(assistantMessageId, "error");
          } catch {
          }
        }
      }
    }
  }
  // ─── Stream Event Handlers ──────────────────────────────────────────
  handleStreamEvent(event, tracker, callback) {
    if (!event) return;
    switch (event.type) {
      case "content_block_delta":
        this.handleContentBlockDelta(event, tracker, callback);
        break;
      case "content_block_start":
        this.handleContentBlockStart(event, tracker, callback);
        break;
      case "content_block_stop":
        this.handleContentBlockStop(event, tracker, callback);
        break;
    }
  }
  handleContentBlockStart(event, tracker, callback) {
    const block = event?.content_block;
    if (!block) return;
    if (block.type === "thinking") {
      tracker.blockIndexToToolId.set(event.index, "__thinking__");
      return;
    }
    if (block.type !== "tool_use") return;
    if (event.index !== void 0) {
      tracker.blockIndexToToolId.set(event.index, block.id);
    }
    tracker.pendingToolCalls.set(block.id, {
      name: block.name,
      input: block.input || {},
      inputJson: ""
    });
    callback({ type: "tool_use", name: block.name, input: block.input || {}, id: block.id });
  }
  handleContentBlockDelta(event, tracker, callback) {
    const delta = event?.delta;
    if (!delta) return;
    if (delta.type === "thinking_delta" && delta.thinking) {
      callback({ type: "thinking", content: delta.thinking });
    } else if (delta.type === "text_delta" && delta.text) {
      callback({ type: "text", content: delta.text });
    } else if (delta.type === "input_json_delta" && delta.partial_json !== void 0) {
      const toolId = tracker.blockIndexToToolId.get(event.index);
      if (toolId && toolId !== "__thinking__") {
        const toolInfo = tracker.pendingToolCalls.get(toolId);
        if (toolInfo) {
          toolInfo.inputJson = (toolInfo.inputJson || "") + delta.partial_json;
        }
        tracker.toolInputJsonBuffers.set(toolId, (tracker.toolInputJsonBuffers.get(toolId) || "") + delta.partial_json);
      }
    }
  }
  handleContentBlockStop(event, tracker, callback) {
    const toolId = tracker.blockIndexToToolId.get(event.index);
    if (!toolId) return;
    if (toolId === "__thinking__") {
      tracker.blockIndexToToolId.delete(event.index);
      return;
    }
    const toolInfo = tracker.pendingToolCalls.get(toolId);
    if (toolInfo?.inputJson) {
      try {
        const parsedInput = JSON.parse(toolInfo.inputJson);
        toolInfo.input = parsedInput;
        callback({ type: "tool_use", name: toolInfo.name, input: parsedInput, id: toolId });
      } catch {
      }
    }
    tracker.blockIndexToToolId.delete(event.index);
  }
  handleToolResults(content, tracker, callback) {
    if (!Array.isArray(content)) return;
    for (const block of content) {
      if (block.type !== "tool_result") continue;
      const toolUseId = block.tool_use_id;
      if (!toolUseId) continue;
      let processedContent = block.content;
      if (Array.isArray(block.content) && block.content.length > 0) {
        const firstBlock = block.content[0];
        if (firstBlock.type === "text" && typeof firstBlock.text === "string") {
          try {
            processedContent = JSON.parse(firstBlock.text);
          } catch {
            processedContent = firstBlock.text;
          }
        }
      }
      tracker.pendingToolCalls.delete(toolUseId);
      tracker.toolInputJsonBuffers.delete(toolUseId);
      callback({
        type: "tool_result",
        tool_use_id: toolUseId,
        content: typeof processedContent === "string" ? processedContent : JSON.stringify(processedContent),
        is_error: block.is_error
      });
    }
  }
  handleToolNotFoundErrors(msg, tracker, callback) {
    if (!msg.message?.content) return;
    for (const block of msg.message.content) {
      if (block.type !== "text" || typeof block.text !== "string") continue;
      const match = block.text.match(/Tool\s+(\S+)\s+not\s+found/i);
      if (!match) continue;
      const toolName = match[1];
      for (const [toolUseId, toolInfo] of tracker.pendingToolCalls.entries()) {
        if (toolInfo.name === toolName) {
          callback({
            type: "tool_result",
            tool_use_id: toolUseId,
            content: JSON.stringify({ error: block.text }),
            is_error: true
          });
          tracker.pendingToolCalls.delete(toolUseId);
          break;
        }
      }
    }
  }
};
var cloudbaseAgentService = new CloudbaseAgentService();

// src/routes/acp.ts
import { AuthSupervisor as AuthSupervisor2 } from "@cloudbase/toolbox";
var acp = new Hono2();
function rpcOk(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function rpcErr(id, code, message) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message }
  };
}
async function getUserContext2() {
  const config = loadConfig();
  const envId = process.env.TCB_ENV_ID || config.cloudbase?.envId || "";
  try {
    const auth3 = AuthSupervisor2.getInstance({});
    const loginState = await auth3.getLoginState();
    const uin = loginState?.uin || "coder-user";
    return { envId, ownerUin: uin, userId: uin };
  } catch {
    return { envId, ownerUin: "coder-user", userId: "coder-user" };
  }
}
acp.get("/health", (c) => {
  return c.json({ status: "ok", service: "acp" });
});
acp.post("/conversation", async (c) => {
  const body = await c.req.json();
  const conversationId = body?.conversationId || uuidv43();
  const { envId, ownerUin } = await getUserContext2();
  if (!envId) {
    return c.json({ error: "CloudBase environment not bound" }, 400);
  }
  const exists = await persistenceService.conversationExists(conversationId, ownerUin, envId);
  if (exists) {
    return c.json({ conversationId, exists: true });
  }
  return c.json({ conversationId });
});
acp.get("/conversations", async (c) => {
  return c.json({ total: 0, data: [] });
});
acp.get("/conversation/records", async (c) => {
  const conversationId = c.req.query("conversationId");
  const limit = parseInt(c.req.query("limit") || "10");
  const sort = c.req.query("sort") || "DESC";
  const type = c.req.query("type") || "agui";
  if (!conversationId) {
    return c.json({ error: "conversationId is required" }, 400);
  }
  const { envId, ownerUin } = await getUserContext2();
  if (!envId) {
    return c.json({ error: "CloudBase environment not bound" }, 400);
  }
  const records = await persistenceService.loadDBMessages(conversationId, ownerUin, envId, ownerUin, limit);
  const ALLOWED_CONTENT_TYPES = /* @__PURE__ */ new Set(["text", "tool_use", "tool_result", "reasoning"]);
  const filteredRecords = records.map((record) => ({
    ...record,
    parts: (record.parts || []).filter((p) => ALLOWED_CONTENT_TYPES.has(p.contentType))
  }));
  if (type === "agui") {
    const DB_TO_AGUI_CONTENT_TYPE = {
      tool_call: "tool_use"
    };
    for (const record of filteredRecords) {
      for (const part of record.parts) {
        if (DB_TO_AGUI_CONTENT_TYPE[part.contentType]) {
          part.contentType = DB_TO_AGUI_CONTENT_TYPE[part.contentType];
        }
        if (part.contentType === "tool_result" && typeof part.content === "string") {
          try {
            const contents = JSON.parse(part.content);
            const arr = Array.isArray(contents) ? contents : [contents];
            part.content = arr.filter((c2) => c2.type === "text").map((c2) => c2.text || "").join("");
          } catch {
          }
        }
      }
    }
  }
  return c.json({ total: records.length, data: filteredRecords });
});
acp.get("/conversation/:conversationId/messages", async (c) => {
  const conversationId = c.req.param("conversationId");
  const limit = parseInt(c.req.query("limit") || "50");
  const sort = c.req.query("sort") || "DESC";
  const { envId, ownerUin } = await getUserContext2();
  if (!envId) {
    return c.json({ error: "CloudBase environment not bound" }, 400);
  }
  const records = await persistenceService.loadDBMessages(conversationId, ownerUin, envId, ownerUin, limit);
  const data = records.map((r) => ({
    recordId: r.recordId,
    conversationId: r.conversationId,
    role: r.role,
    parts: r.parts,
    createTime: r.createTime
  }));
  if (sort === "DESC") {
    data.reverse();
  }
  return c.json({ total: data.length, data });
});
acp.delete("/conversation/:conversationId", async (c) => {
  return c.json({ status: "success" });
});
acp.post("/chat", async (c) => {
  const body = await c.req.json();
  const { prompt, conversationId } = body;
  const { envId, ownerUin } = await getUserContext2();
  if (!envId) {
    return c.json({ error: "CloudBase environment not bound" }, 400);
  }
  const actualConversationId = conversationId || uuidv43();
  const cwd = `/tmp/workspace/${actualConversationId}`;
  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      data: JSON.stringify({
        type: "session",
        conversationId: actualConversationId
      })
    });
    let fullContent = "";
    let stopReason = "end_turn";
    const callback = async (msg) => {
      if (msg.type === "text" && msg.content) {
        fullContent += msg.content;
        await stream.writeSSE({
          data: JSON.stringify({
            type: "text",
            content: msg.content
          })
        });
      } else if (msg.type === "thinking" && msg.content) {
        await stream.writeSSE({
          data: JSON.stringify({
            type: "thinking",
            content: msg.content
          })
        });
      } else if (msg.type === "tool_use") {
        await stream.writeSSE({
          data: JSON.stringify({
            type: "tool_use",
            name: msg.name,
            input: msg.input,
            id: msg.id
          })
        });
      } else if (msg.type === "tool_result") {
        await stream.writeSSE({
          data: JSON.stringify({
            type: "tool_result",
            tool_use_id: msg.tool_use_id,
            content: msg.content,
            is_error: msg.is_error
          })
        });
      } else if (msg.type === "error") {
        stopReason = "error";
        await stream.writeSSE({
          data: JSON.stringify({
            type: "error",
            content: msg.content
          })
        });
      } else if (msg.type === "result") {
        await stream.writeSSE({
          data: JSON.stringify({
            type: "result"
          })
        });
      }
    };
    try {
      await cloudbaseAgentService.chatStream(prompt, callback, {
        conversationId: actualConversationId,
        envId,
        ownerUin,
        userId: ownerUin,
        cwd
      });
    } catch (error) {
      stopReason = "error";
      await stream.writeSSE({
        data: JSON.stringify({
          type: "error",
          content: error instanceof Error ? error.message : String(error)
        })
      });
    }
    await stream.writeSSE({ data: "[DONE]" });
  });
});
acp.post("/acp", async (c) => {
  const body = await c.req.json();
  if (!body || body.jsonrpc !== "2.0" || !body.method) {
    return c.json(rpcErr(body?.id ?? null, JSON_RPC_ERRORS.INVALID_REQUEST, "Invalid JSON-RPC 2.0 request"), 400);
  }
  const { id, method, params } = body;
  const isNotification = id === void 0 || id === null;
  switch (method) {
    case "initialize":
      return handleInitialize(c, id);
    case "session/new":
      return handleSessionNew(c, id, params);
    case "session/load":
      return handleSessionLoad(c, id, params);
    case "session/prompt":
      return handleSessionPrompt(c, id, params);
    case "session/cancel":
      return handleSessionCancel(c, id ?? null, params, isNotification);
    default:
      if (isNotification) {
        return c.text("", 200);
      }
      return c.json(rpcErr(id, JSON_RPC_ERRORS.METHOD_NOT_FOUND, `Method '${method}' not found`));
  }
});
async function handleInitialize(c, id) {
  const result = {
    protocolVersion: ACP_PROTOCOL_VERSION,
    agentCapabilities: {
      loadSession: true,
      promptCapabilities: {
        image: false,
        audio: false,
        embeddedContext: false
      }
    },
    agentInfo: NEX_AGENT_INFO,
    authMethods: []
  };
  return c.json(rpcOk(id, result));
}
async function handleSessionNew(c, id, params) {
  const conversationId = params?.conversationId || uuidv43();
  const sessionId = conversationId;
  const { envId, ownerUin } = await getUserContext2();
  if (!envId) {
    return c.json(rpcErr(id, JSON_RPC_ERRORS.INTERNAL, "CloudBase environment not bound"));
  }
  try {
    const exists = await persistenceService.conversationExists(conversationId, ownerUin, envId);
    let hasHistory = false;
    if (exists) {
      const messages = await persistenceService.loadDBMessages(conversationId, ownerUin, envId, ownerUin, 1);
      hasHistory = messages.length > 0;
    }
    const result = { sessionId, hasHistory };
    return c.json(rpcOk(id, result));
  } catch (error) {
    return c.json(rpcErr(id, JSON_RPC_ERRORS.INTERNAL, error.message));
  }
}
async function handleSessionLoad(c, id, params) {
  const sessionId = params?.sessionId;
  if (!sessionId) {
    return c.json(rpcErr(id, JSON_RPC_ERRORS.INVALID_PARAMS, "sessionId is required"));
  }
  const { envId, ownerUin } = await getUserContext2();
  if (!envId) {
    return c.json(rpcErr(id, JSON_RPC_ERRORS.INTERNAL, "CloudBase environment not bound"));
  }
  const exists = await persistenceService.conversationExists(sessionId, ownerUin, envId);
  if (!exists) {
    return c.json(rpcErr(id, JSON_RPC_ERRORS.INVALID_PARAMS, `Session '${sessionId}' not found`));
  }
  return c.json(rpcOk(id, { sessionId }));
}
async function handleSessionPrompt(c, id, params) {
  const sessionId = params?.sessionId;
  const { envId, ownerUin } = await getUserContext2();
  if (!envId) {
    return c.json(rpcErr(id, JSON_RPC_ERRORS.INTERNAL, "CloudBase environment not bound"));
  }
  const exists = await persistenceService.conversationExists(sessionId, ownerUin, envId);
  const latestStatus = await persistenceService.getLatestRecordStatus(sessionId, ownerUin, envId);
  if (latestStatus && (latestStatus.status === "pending" || latestStatus.status === "streaming")) {
    return c.json(rpcErr(id, JSON_RPC_ERRORS.INVALID_REQUEST, "A prompt turn is already in progress"));
  }
  const prompt = (params?.prompt ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
  if (!prompt.trim()) {
    return c.json(rpcErr(id, JSON_RPC_ERRORS.INVALID_PARAMS, "prompt must contain at least one text block"));
  }
  const cwd = `/tmp/workspace/${sessionId}`;
  return streamSSE(c, async (stream) => {
    let fullContent = "";
    let stopReason = "end_turn";
    const notify = async (method, notifParams) => {
      await stream.writeSSE({
        data: JSON.stringify({
          jsonrpc: "2.0",
          method,
          params: notifParams
        })
      });
    };
    const callback = async (msg) => {
      if (msg.type === "text" && msg.content) {
        fullContent += msg.content;
        await notify("session/update", {
          sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: msg.content }
          }
        });
      } else if (msg.type === "thinking" && msg.content) {
        await notify("session/update", {
          sessionId,
          update: {
            sessionUpdate: "thinking",
            content: msg.content
          }
        });
      } else if (msg.type === "tool_use") {
        await notify("session/update", {
          sessionId,
          update: {
            sessionUpdate: "tool_call",
            toolCallId: msg.id || uuidv43(),
            title: msg.name || "tool",
            kind: "function",
            status: "in_progress",
            input: msg.input
          }
        });
      } else if (msg.type === "tool_result") {
        await notify("session/update", {
          sessionId,
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId: msg.tool_use_id || "",
            status: msg.is_error ? "failed" : "completed",
            result: msg.content
          }
        });
      } else if (msg.type === "error") {
        stopReason = "error";
        await notify("session/update", {
          sessionId,
          update: {
            sessionUpdate: "log",
            level: "error",
            message: msg.content || "Unknown error",
            timestamp: Date.now()
          }
        });
      }
    };
    try {
      await cloudbaseAgentService.chatStream(prompt, callback, {
        conversationId: sessionId,
        envId,
        ownerUin,
        userId: ownerUin,
        cwd
      });
    } catch (error) {
      stopReason = "error";
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error("[ACP] chatStream error:", errMsg);
      await notify("session/update", {
        sessionId,
        update: {
          sessionUpdate: "log",
          level: "error",
          message: errMsg,
          timestamp: Date.now()
        }
      });
    }
    await stream.writeSSE({
      data: JSON.stringify(rpcOk(id, { stopReason }))
    });
    await stream.writeSSE({ data: "[DONE]" });
  });
}
async function handleSessionCancel(c, id, params, isNotification) {
  const sessionId = params?.sessionId;
  const { envId, ownerUin } = await getUserContext2();
  if (sessionId && envId) {
    const latestStatus = await persistenceService.getLatestRecordStatus(sessionId, ownerUin, envId);
    if (latestStatus && (latestStatus.status === "pending" || latestStatus.status === "streaming")) {
      await persistenceService.updateRecordStatus(latestStatus.recordId, "cancel");
    }
  }
  if (isNotification) {
    return c.text("", 200);
  }
  return c.json(rpcOk(id ?? "", null));
}
acp.get("/config", (c) => {
  const config = loadConfig();
  return c.json({
    configured: !!(config.llm?.apiKey && config.llm?.endpoint),
    model: config.llm?.model || "claude-3-5-sonnet-20241022"
  });
});
var acp_default = acp;

// src/routes/tasks.ts
import { Hono as Hono3 } from "hono";
import { eq as eq3, desc, and as and2, isNull } from "drizzle-orm";
import { nanoid as nanoid2 } from "nanoid";

// src/lib/task-logger.ts
import { eq as eq2 } from "drizzle-orm";
var TaskLogger = class {
  taskId;
  acpNotify;
  constructor(taskId) {
    this.taskId = taskId;
  }
  registerACPNotifier(notify) {
    this.acpNotify = notify;
  }
  async appendLog(level, message) {
    const entry = { type: level, message, timestamp: Date.now() };
    try {
      const [task] = await db.select({ logs: tasks.logs }).from(tasks).where(eq2(tasks.id, this.taskId)).limit(1);
      const existingLogs = task?.logs ? JSON.parse(task.logs) : [];
      const newLogs = [...existingLogs, entry];
      await db.update(tasks).set({ logs: JSON.stringify(newLogs), updatedAt: Date.now() }).where(eq2(tasks.id, this.taskId));
    } catch {
    }
    if (this.acpNotify) {
      this.acpNotify({ sessionUpdate: "log", level, message, timestamp: entry.timestamp });
    }
  }
  async info(message) {
    await this.appendLog("info", message);
  }
  async error(message) {
    await this.appendLog("error", message);
  }
  async success(message) {
    await this.appendLog("success", message);
  }
  async command(message) {
    await this.appendLog("command", message);
  }
  async updateProgress(progress, message) {
    try {
      if (message) {
        const entry = { type: "info", message, timestamp: Date.now() };
        const [task] = await db.select({ logs: tasks.logs }).from(tasks).where(eq2(tasks.id, this.taskId)).limit(1);
        const existingLogs = task?.logs ? JSON.parse(task.logs) : [];
        const newLogs = [...existingLogs, entry];
        await db.update(tasks).set({ progress, logs: JSON.stringify(newLogs), updatedAt: Date.now() }).where(eq2(tasks.id, this.taskId));
      } else {
        await db.update(tasks).set({ progress, updatedAt: Date.now() }).where(eq2(tasks.id, this.taskId));
      }
    } catch {
    }
    if (this.acpNotify) {
      const [task] = await db.select({ status: tasks.status }).from(tasks).where(eq2(tasks.id, this.taskId)).limit(1).catch(() => [void 0]);
      this.acpNotify({
        sessionUpdate: "task_progress",
        progress,
        status: task?.status ?? "processing"
      });
    }
  }
  async updateStatus(status, error) {
    try {
      const updateData = { status, updatedAt: Date.now() };
      if (status === "completed") updateData.completedAt = Date.now();
      if (error) updateData.error = error;
      await db.update(tasks).set(updateData).where(eq2(tasks.id, this.taskId));
    } catch {
    }
  }
};
function createTaskLogger(taskId) {
  return new TaskLogger(taskId);
}

// src/routes/tasks.ts
var tasksRouter = new Hono3();
tasksRouter.get("/", async (c) => {
  const authErr = requireAuth(c);
  if (authErr) return authErr;
  const session = c.get("session");
  const userTasks = await db.select().from(tasks).where(and2(eq3(tasks.userId, session.user.id), isNull(tasks.deletedAt))).orderBy(desc(tasks.createdAt));
  const parsedTasks = userTasks.map((t) => ({
    ...t,
    logs: t.logs ? JSON.parse(t.logs) : [],
    mcpServerIds: t.mcpServerIds ? JSON.parse(t.mcpServerIds) : null
  }));
  return c.json({ tasks: parsedTasks });
});
tasksRouter.post("/", async (c) => {
  const authErr = requireAuth(c);
  if (authErr) return authErr;
  const session = c.get("session");
  const body = await c.req.json();
  const {
    prompt,
    repoUrl,
    selectedAgent = "claude",
    selectedModel,
    installDependencies = false,
    maxDuration = 300,
    keepAlive = false,
    enableBrowser = false
  } = body;
  if (!prompt || typeof prompt !== "string") {
    return c.json({ error: "prompt is required" }, 400);
  }
  const taskId = body.id || nanoid2(12);
  const now2 = Date.now();
  await db.insert(tasks).values({
    id: taskId,
    userId: session.user.id,
    prompt,
    repoUrl: repoUrl || null,
    selectedAgent,
    selectedModel: selectedModel || null,
    installDependencies,
    maxDuration,
    keepAlive,
    enableBrowser,
    status: "pending",
    progress: 0,
    logs: "[]",
    createdAt: now2,
    updatedAt: now2
  });
  await db.insert(taskMessages).values({
    id: nanoid2(12),
    taskId,
    role: "user",
    content: prompt,
    createdAt: now2
  });
  const [newTask] = await db.select().from(tasks).where(eq3(tasks.id, taskId)).limit(1);
  return c.json({
    task: {
      ...newTask,
      logs: [],
      mcpServerIds: null
    }
  });
});
tasksRouter.get("/:taskId", async (c) => {
  const authErr = requireAuth(c);
  if (authErr) return authErr;
  const session = c.get("session");
  const { taskId } = c.req.param();
  const [task] = await db.select().from(tasks).where(and2(eq3(tasks.id, taskId), eq3(tasks.userId, session.user.id), isNull(tasks.deletedAt))).limit(1);
  if (!task) {
    return c.json({ error: "Task not found" }, 404);
  }
  return c.json({
    task: {
      ...task,
      logs: task.logs ? JSON.parse(task.logs) : [],
      mcpServerIds: task.mcpServerIds ? JSON.parse(task.mcpServerIds) : null
    }
  });
});
tasksRouter.patch("/:taskId", async (c) => {
  const authErr = requireAuth(c);
  if (authErr) return authErr;
  const session = c.get("session");
  const { taskId } = c.req.param();
  const body = await c.req.json();
  const [existing] = await db.select().from(tasks).where(and2(eq3(tasks.id, taskId), eq3(tasks.userId, session.user.id), isNull(tasks.deletedAt))).limit(1);
  if (!existing) {
    return c.json({ error: "Task not found" }, 404);
  }
  if (body.action === "stop") {
    if (existing.status !== "processing") {
      return c.json({ error: "Can only stop processing tasks" }, 400);
    }
    const logger = createTaskLogger(taskId);
    await logger.info("Task stopped by user");
    await logger.updateStatus("stopped", "Task was stopped by user");
    const [updated] = await db.select().from(tasks).where(eq3(tasks.id, taskId)).limit(1);
    return c.json({ message: "Task stopped", task: updated });
  }
  return c.json({ error: "Invalid action" }, 400);
});
tasksRouter.delete("/:taskId", async (c) => {
  const authErr = requireAuth(c);
  if (authErr) return authErr;
  const session = c.get("session");
  const { taskId } = c.req.param();
  const [existing] = await db.select().from(tasks).where(and2(eq3(tasks.id, taskId), eq3(tasks.userId, session.user.id), isNull(tasks.deletedAt))).limit(1);
  if (!existing) {
    return c.json({ error: "Task not found" }, 404);
  }
  await db.update(tasks).set({ deletedAt: Date.now() }).where(eq3(tasks.id, taskId));
  return c.json({ message: "Task deleted" });
});
tasksRouter.get("/:taskId/messages", async (c) => {
  const authErr = requireAuth(c);
  if (authErr) return authErr;
  const session = c.get("session");
  const { taskId } = c.req.param();
  const [task] = await db.select().from(tasks).where(and2(eq3(tasks.id, taskId), eq3(tasks.userId, session.user.id), isNull(tasks.deletedAt))).limit(1);
  if (!task) {
    return c.json({ error: "Task not found" }, 404);
  }
  const messages = await db.select().from(taskMessages).where(eq3(taskMessages.taskId, taskId)).orderBy(taskMessages.createdAt);
  return c.json({ messages });
});
tasksRouter.post("/:taskId/continue", async (c) => {
  const authErr = requireAuth(c);
  if (authErr) return authErr;
  const session = c.get("session");
  const { taskId } = c.req.param();
  const body = await c.req.json();
  const { prompt } = body;
  if (!prompt) {
    return c.json({ error: "prompt is required" }, 400);
  }
  const [task] = await db.select().from(tasks).where(and2(eq3(tasks.id, taskId), eq3(tasks.userId, session.user.id), isNull(tasks.deletedAt))).limit(1);
  if (!task) {
    return c.json({ error: "Task not found" }, 404);
  }
  const messageId = nanoid2(12);
  const now2 = Date.now();
  await db.insert(taskMessages).values({
    id: messageId,
    taskId,
    role: "user",
    content: prompt,
    createdAt: now2
  });
  await db.update(tasks).set({ status: "processing", updatedAt: now2 }).where(eq3(tasks.id, taskId));
  return c.json({
    message: "Message sent",
    messageId
  });
});
var tasks_default = tasksRouter;

// src/routes/connectors.ts
import { Hono as Hono4 } from "hono";
import { nanoid as nanoid3 } from "nanoid";
import { eq as eq4, and as and3 } from "drizzle-orm";

// src/lib/crypto.ts
import crypto from "crypto";
var ALGORITHM = "aes-256-cbc";
var IV_LENGTH = 16;
var getEncryptionKey = () => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    return null;
  }
  const keyBuffer = Buffer.from(key, "hex");
  if (keyBuffer.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY must be a 32-byte hex string (64 characters). Generate one with: openssl rand -hex 32"
    );
  }
  return keyBuffer;
};
var encrypt = (text2) => {
  if (!text2) return text2;
  const ENCRYPTION_KEY = getEncryptionKey();
  if (!ENCRYPTION_KEY) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is required for MCP encryption. Generate one with: openssl rand -hex 32"
    );
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text2, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
};
var decrypt = (encryptedText) => {
  if (!encryptedText) return encryptedText;
  const ENCRYPTION_KEY = getEncryptionKey();
  if (!ENCRYPTION_KEY) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is required for MCP decryption. Generate one with: openssl rand -hex 32"
    );
  }
  if (!encryptedText.includes(":")) {
    throw new Error("Invalid encrypted text format");
  }
  try {
    const [ivHex, encryptedHex] = encryptedText.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (error) {
    throw new Error("Failed to decrypt: " + (error instanceof Error ? error.message : "unknown error"));
  }
};

// src/routes/connectors.ts
var app = new Hono4();
app.get("/", async (c) => {
  try {
    const authErr = requireAuth(c);
    if (authErr) return authErr;
    const session = c.get("session");
    const userId = session.user.id;
    const userConnectors = await db.select().from(connectors).where(eq4(connectors.userId, userId));
    const decryptedConnectors = userConnectors.map((connector) => ({
      ...connector,
      oauthClientSecret: connector.oauthClientSecret ? decrypt(connector.oauthClientSecret) : null,
      env: connector.env ? JSON.parse(decrypt(connector.env)) : null
    }));
    return c.json({
      success: true,
      data: decryptedConnectors
    });
  } catch (error) {
    console.error("Error fetching connectors:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch connectors",
        data: []
      },
      { status: 500 }
    );
  }
});
app.post("/", async (c) => {
  try {
    const authErr = requireAuth(c);
    if (authErr) return authErr;
    const session = c.get("session");
    const userId = session.user.id;
    const body = await c.req.json();
    const connectorData = {
      id: nanoid3(),
      userId,
      name: body.name,
      description: body.description?.trim() || void 0,
      type: body.type || "remote",
      baseUrl: body.baseUrl?.trim() || void 0,
      oauthClientId: body.oauthClientId?.trim() || void 0,
      oauthClientSecret: body.oauthClientSecret?.trim() || void 0,
      command: body.command?.trim() || void 0,
      env: body.env,
      status: "connected"
    };
    await db.insert(connectors).values({
      id: connectorData.id,
      userId: connectorData.userId,
      name: connectorData.name,
      description: connectorData.description || null,
      type: connectorData.type,
      baseUrl: connectorData.baseUrl || null,
      oauthClientId: connectorData.oauthClientId || null,
      oauthClientSecret: connectorData.oauthClientSecret ? encrypt(connectorData.oauthClientSecret) : null,
      command: connectorData.command || null,
      env: connectorData.env ? encrypt(JSON.stringify(connectorData.env)) : null,
      status: connectorData.status
    });
    return c.json({
      success: true,
      message: "Connector created successfully",
      data: { id: connectorData.id }
    });
  } catch (error) {
    console.error("Error creating connector:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create connector"
      },
      { status: 500 }
    );
  }
});
app.patch("/:id", async (c) => {
  try {
    const authErr = requireAuth(c);
    if (authErr) return authErr;
    const session = c.get("session");
    const userId = session.user.id;
    const id = c.req.param("id");
    const body = await c.req.json();
    const connectorData = {
      userId,
      name: body.name,
      description: body.description?.trim() || void 0,
      type: body.type || "remote",
      baseUrl: body.baseUrl?.trim() || void 0,
      oauthClientId: body.oauthClientId?.trim() || void 0,
      oauthClientSecret: body.oauthClientSecret?.trim() || void 0,
      command: body.command?.trim() || void 0,
      env: body.env,
      status: body.status || "connected"
    };
    const validatedData = connectorData;
    await db.update(connectors).set({
      name: validatedData.name,
      description: validatedData.description || null,
      type: validatedData.type,
      baseUrl: validatedData.baseUrl || null,
      oauthClientId: validatedData.oauthClientId || null,
      oauthClientSecret: validatedData.oauthClientSecret ? encrypt(validatedData.oauthClientSecret) : null,
      command: validatedData.command || null,
      env: validatedData.env ? encrypt(JSON.stringify(validatedData.env)) : null,
      status: validatedData.status,
      updatedAt: Date.now()
    }).where(and3(eq4(connectors.id, id), eq4(connectors.userId, userId)));
    return c.json({
      success: true,
      message: "Connector updated successfully"
    });
  } catch (error) {
    console.error("Error updating connector:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update connector"
      },
      { status: 500 }
    );
  }
});
app.delete("/:id", async (c) => {
  try {
    const authErr = requireAuth(c);
    if (authErr) return authErr;
    const session = c.get("session");
    const userId = session.user.id;
    const id = c.req.param("id");
    await db.delete(connectors).where(and3(eq4(connectors.id, id), eq4(connectors.userId, userId)));
    return c.json({
      success: true,
      message: "Connector deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting connector:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete connector"
      },
      { status: 500 }
    );
  }
});
app.patch("/:id/status", async (c) => {
  try {
    const authErr = requireAuth(c);
    if (authErr) return authErr;
    const session = c.get("session");
    const userId = session.user.id;
    const id = c.req.param("id");
    const body = await c.req.json();
    const status = body.status;
    if (!["connected", "disconnected"].includes(status)) {
      return c.json(
        {
          success: false,
          error: "Invalid status"
        },
        { status: 400 }
      );
    }
    await db.update(connectors).set({ status }).where(and3(eq4(connectors.id, id), eq4(connectors.userId, userId)));
    return c.json({
      success: true,
      message: `Connector ${status === "connected" ? "connected" : "disconnected"} successfully`
    });
  } catch (error) {
    console.error("Error toggling connector status:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update connector status"
      },
      { status: 500 }
    );
  }
});
var connectors_default = app;

// src/routes/database.ts
import { Hono as Hono5 } from "hono";

// src/cloudbase/database.ts
import CloudBase3 from "@cloudbase/manager-node";
import { AuthSupervisor as AuthSupervisor3 } from "@cloudbase/toolbox";
var auth2 = AuthSupervisor3.getInstance({});
async function getManager() {
  if (process.env.TCB_SECRET_ID && process.env.TCB_ENV_ID) {
    return new CloudBase3({
      secretId: process.env.TCB_SECRET_ID,
      secretKey: process.env.TCB_SECRET_KEY || "",
      token: process.env.TCB_TOKEN || "",
      envId: process.env.TCB_ENV_ID,
      proxy: process.env.http_proxy
    });
  }
  const loginState = await auth2.getLoginState();
  if (!loginState) throw new Error("\u672A\u767B\u5F55");
  const config = loadConfig();
  if (!config.cloudbase?.envId) throw new Error("\u672A\u7ED1\u5B9A\u73AF\u5883");
  return new CloudBase3({
    secretId: loginState.secretId,
    secretKey: loginState.secretKey,
    token: loginState.token,
    envId: config.cloudbase.envId,
    proxy: process.env.http_proxy,
    region: config.cloudbase.region
  });
}
async function getDatabaseInstanceId(manager) {
  const { EnvInfo } = await manager.env.getEnvInfo();
  if (!EnvInfo?.Databases?.[0]?.InstanceId) {
    throw new Error("\u65E0\u6CD5\u83B7\u53D6\u6570\u636E\u5E93\u5B9E\u4F8BID");
  }
  return EnvInfo.Databases[0].InstanceId;
}
async function listCollections() {
  const manager = await getManager();
  const result = await manager.database.listCollections({
    MgoOffset: 0,
    MgoLimit: 1e3
  });
  const collections = (result.Collections || []).map((c) => ({
    CollectionName: c.CollectionName,
    Count: c.Count,
    Size: c.Size,
    IndexCount: c.IndexCount,
    IndexSize: c.IndexSize
  }));
  return {
    collections,
    total: result.Pager?.Total ?? collections.length
  };
}
async function createCollection(name) {
  const manager = await getManager();
  await manager.database.createCollection(name);
  await waitForCollectionReady(manager, name);
}
async function deleteCollection(name) {
  const manager = await getManager();
  await manager.database.deleteCollection(name);
}
async function queryDocuments(collection, page = 1, pageSize = 50, where) {
  const manager = await getManager();
  const instanceId = await getDatabaseInstanceId(manager);
  const offset = (page - 1) * pageSize;
  const mgoQuery = where && Object.keys(where).length > 0 ? JSON.stringify(where) : "{}";
  const result = await manager.commonService("tcb", "2018-06-08").call({
    Action: "QueryRecords",
    Param: {
      TableName: collection,
      MgoQuery: mgoQuery,
      MgoLimit: pageSize,
      MgoOffset: offset,
      Tag: instanceId
    }
  });
  const documents = (result.Data || []).map((item) => {
    if (typeof item === "string") {
      try {
        const parsed = JSON.parse(item);
        return typeof parsed === "object" && parsed !== null ? parsed : item;
      } catch {
        return item;
      }
    }
    return item;
  });
  return {
    documents,
    total: result.Pager?.Total ?? documents.length,
    page,
    pageSize
  };
}
async function insertDocument(collection, data) {
  const manager = await getManager();
  const instanceId = await getDatabaseInstanceId(manager);
  const result = await manager.commonService("tcb", "2018-06-08").call({
    Action: "PutItem",
    Param: {
      TableName: collection,
      MgoDocs: [JSON.stringify(data)],
      Tag: instanceId
    }
  });
  return result.InsertedIds?.[0] ?? "";
}
async function updateDocument(collection, docId, data) {
  const manager = await getManager();
  const instanceId = await getDatabaseInstanceId(manager);
  const { _id, ...updateData } = data;
  await manager.commonService("tcb", "2018-06-08").call({
    Action: "UpdateItem",
    Param: {
      TableName: collection,
      MgoQuery: JSON.stringify({ _id: docId }),
      MgoUpdate: JSON.stringify({ $set: updateData }),
      MgoIsMulti: false,
      MgoUpsert: false,
      Tag: instanceId
    }
  });
}
async function deleteDocument(collection, docId) {
  const manager = await getManager();
  const instanceId = await getDatabaseInstanceId(manager);
  await manager.commonService("tcb", "2018-06-08").call({
    Action: "DeleteItem",
    Param: {
      TableName: collection,
      MgoQuery: JSON.stringify({ _id: docId }),
      MgoIsMulti: false,
      Tag: instanceId
    }
  });
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function waitForCollectionReady(manager, name, timeoutMs = 1e4, intervalMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    try {
      const result = await manager.database.checkCollectionExists(name);
      if (result.Exists) return;
    } catch {
    }
    if (Date.now() + intervalMs > deadline) break;
    await delay(intervalMs);
  }
  throw new Error(`Collection ${name} creation timed out`);
}

// src/routes/database.ts
var router = new Hono5();
router.get("/collections", async (c) => {
  try {
    const result = await listCollections();
    return c.json(result.collections);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});
router.post("/collections", async (c) => {
  try {
    const { name } = await c.req.json();
    await createCollection(name);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});
router.delete("/collections/:name", async (c) => {
  try {
    await deleteCollection(c.req.param("name"));
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});
router.get("/collections/:name/documents", async (c) => {
  try {
    const name = c.req.param("name");
    const page = Number(c.req.query("page") || "1");
    const pageSize = Number(c.req.query("pageSize") || "50");
    const search = c.req.query("search")?.trim();
    let where;
    if (search) {
      if (search.includes(":")) {
        const [field, ...rest] = search.split(":");
        const val = rest.join(":");
        where = { [field.trim()]: val.trim() };
      } else {
        where = { _id: search };
      }
    }
    const result = await queryDocuments(name, page, pageSize, where);
    return c.json(result);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});
router.post("/collections/:name/documents", async (c) => {
  try {
    const data = await c.req.json();
    const id = await insertDocument(c.req.param("name"), data);
    return c.json({ _id: id });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});
router.put("/collections/:name/documents/:id", async (c) => {
  try {
    const data = await c.req.json();
    await updateDocument(c.req.param("name"), c.req.param("id"), data);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});
router.delete("/collections/:name/documents/:id", async (c) => {
  try {
    await deleteDocument(c.req.param("name"), c.req.param("id"));
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});
var database_default = router;

// src/routes/storage.ts
import { Hono as Hono6 } from "hono";

// src/cloudbase/storage.ts
async function getBuckets() {
  const manager = await getManager();
  const { EnvInfo } = await manager.env.getEnvInfo();
  const envId = process.env.TCB_ENV_ID || "";
  const buckets = [];
  const storage = EnvInfo?.Storages?.[0];
  if (storage) {
    buckets.push({
      type: "storage",
      name: storage.Bucket ?? "",
      label: "\u4E91\u5B58\u50A8",
      bucket: storage.Bucket ?? "",
      region: storage.Region ?? "",
      cdnDomain: storage.CdnDomain || "",
      isPublic: false
    });
  }
  try {
    const hostingInfo = await manager.hosting.getInfo();
    const hosting = hostingInfo?.[0];
    if (hosting) {
      buckets.push({
        type: "static",
        name: hosting.Bucket || "static",
        label: "\u9759\u6001\u6258\u7BA1",
        bucket: hosting.Bucket || "",
        region: hosting.Regoin || storage?.Region || "ap-shanghai",
        cdnDomain: hosting.CdnDomain || "",
        isPublic: true
      });
    }
  } catch {
    const staticStore = EnvInfo?.StaticStorages?.[0];
    if (staticStore) {
      buckets.push({
        type: "static",
        name: staticStore.Bucket || "static",
        label: "\u9759\u6001\u6258\u7BA1",
        bucket: staticStore.Bucket || "",
        region: staticStore.Region || storage?.Region || "ap-shanghai",
        cdnDomain: staticStore.CdnDomain || "",
        isPublic: true
      });
    }
  }
  return buckets;
}
async function listStorageFiles(prefix = "") {
  const manager = await getManager();
  const envId = process.env.TCB_ENV_ID || "";
  const files = await manager.storage.walkCloudDir(prefix);
  const fileMap = /* @__PURE__ */ new Map();
  for (const f of files) {
    const key = f.Key;
    if (!key) continue;
    const rel = prefix ? key.slice(prefix.length) : key;
    if (!rel) continue;
    const slashIdx = rel.indexOf("/");
    if (slashIdx !== -1 && slashIdx < rel.length - 1) {
      const dirName = rel.slice(0, slashIdx + 1);
      const dirKey = prefix + dirName;
      if (!fileMap.has(dirKey)) {
        fileMap.set(dirKey, {
          key: dirKey,
          name: dirName.replace(/\/$/, ""),
          size: 0,
          lastModified: f.LastModified,
          isDir: true
        });
      }
    } else {
      fileMap.set(key, {
        key,
        name: rel.replace(/\/$/, ""),
        size: Number(f.Size) || 0,
        lastModified: f.LastModified,
        isDir: false,
        fileId: `cloud://${envId}/${key}`
      });
    }
  }
  return Array.from(fileMap.values());
}
async function listHostingFiles(prefix = "", cdnDomain = "") {
  const manager = await getManager();
  const result = await manager.hosting.listFiles();
  const fileMap = /* @__PURE__ */ new Map();
  for (const f of result || []) {
    const key = f.Key || "";
    if (!key) continue;
    if (prefix && !key.startsWith(prefix)) continue;
    const rel = prefix ? key.slice(prefix.length) : key;
    if (!rel) continue;
    const slashIdx = rel.indexOf("/");
    if (slashIdx !== -1 && slashIdx < rel.length - 1) {
      const dirName = rel.slice(0, slashIdx + 1);
      const dirKey = prefix + dirName;
      if (!fileMap.has(dirKey)) {
        fileMap.set(dirKey, {
          key: dirKey,
          name: dirName.replace(/\/$/, ""),
          size: 0,
          lastModified: f.LastModified || "",
          isDir: true
        });
      }
    } else {
      const publicUrl = cdnDomain ? `https://${cdnDomain}/${key}` : "";
      fileMap.set(key, {
        key,
        name: rel.replace(/\/$/, ""),
        size: Number(f.Size) || 0,
        lastModified: f.LastModified || "",
        isDir: false,
        publicUrl
      });
    }
  }
  return Array.from(fileMap.values());
}
async function getDownloadUrl(cloudPath) {
  const manager = await getManager();
  const result = await manager.storage.getTemporaryUrl([{ cloudPath, maxAge: 3600 }]);
  return result?.[0]?.url || "";
}
async function deleteFile(cloudPath) {
  const manager = await getManager();
  await manager.storage.deleteFile([cloudPath]);
}
async function deleteHostingFile(cloudPath) {
  const manager = await getManager();
  await manager.hosting.deleteFiles({ cloudPath, isDir: false });
}

// src/routes/storage.ts
var router2 = new Hono6();
router2.get("/buckets", async (c) => {
  try {
    return c.json(await getBuckets());
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});
router2.get("/files", async (c) => {
  try {
    const prefix = c.req.query("prefix") || "";
    const bucketType = c.req.query("bucketType") || "storage";
    const cdnDomain = c.req.query("cdnDomain") || "";
    const files = bucketType === "static" ? await listHostingFiles(prefix, cdnDomain) : await listStorageFiles(prefix);
    return c.json(files);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});
router2.get("/url", async (c) => {
  try {
    const path5 = c.req.query("path") || "";
    if (!path5) return c.json({ error: "\u7F3A\u5C11 path \u53C2\u6570" }, 400);
    return c.json({ url: await getDownloadUrl(path5) });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});
router2.delete("/files", async (c) => {
  try {
    const { path: path5, bucketType } = await c.req.json();
    if (!path5) return c.json({ error: "\u7F3A\u5C11 path \u53C2\u6570" }, 400);
    if (bucketType === "static") {
      await deleteHostingFile(path5);
    } else {
      await deleteFile(path5);
    }
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});
var storage_default = router2;

// src/routes/functions.ts
import { Hono as Hono7 } from "hono";
var router3 = new Hono7();
router3.get("/", async (c) => {
  try {
    const manager = await getManager();
    const result = await manager.functions.getFunctionList(100, 0);
    const functions = (result.Functions || []).map((f) => ({
      name: f.FunctionName,
      runtime: f.Runtime,
      status: f.Status,
      codeSize: f.CodeSize,
      description: f.Description,
      addTime: f.AddTime,
      modTime: f.ModTime,
      memSize: f.MemorySize,
      timeout: f.Timeout,
      type: f.Type
    }));
    return c.json(functions);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});
router3.post("/:name/invoke", async (c) => {
  try {
    const manager = await getManager();
    const name = c.req.param("name");
    const body = await c.req.json();
    const result = await manager.functions.invokeFunction(name, body);
    return c.json({ result: result.RetMsg });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});
var functions_default = router3;

// src/routes/sql.ts
import { Hono as Hono8 } from "hono";
var router4 = new Hono8();
router4.post("/query", async (c) => {
  return c.json({ error: "\u8BF7\u5148\u914D\u7F6E SQL \u6570\u636E\u5E93\u8FDE\u63A5\uFF08MySQL/PostgreSQL\uFF09" }, 501);
});
var sql_default = router4;

// src/routes/capi.ts
import { Hono as Hono9 } from "hono";
import CloudBase4 from "@cloudbase/manager-node";
var router5 = new Hono9();
router5.post("/", async (c) => {
  const authError = requireAuth(c);
  if (authError) return authError;
  const secretId = process.env.TCB_SECRET_ID;
  const secretKey = process.env.TCB_SECRET_KEY;
  const envId = process.env.TCB_ENV_ID;
  if (!secretId || !secretKey || !envId) {
    return c.json({ error: "\u670D\u52A1\u7AEF\u672A\u914D\u7F6E\u5BC6\u94A5" }, 500);
  }
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "\u65E0\u6548\u7684\u8BF7\u6C42\u4F53" }, 400);
  }
  const { service, action, params = {} } = body;
  if (!service || !action) {
    return c.json({ error: "\u7F3A\u5C11 service / action \u53C2\u6570" }, 400);
  }
  try {
    const app3 = new CloudBase4({
      secretId,
      secretKey,
      envId
    });
    const result = await app3.commonService(service).call({
      Action: action,
      Param: params
    });
    return c.json({ result });
  } catch (e) {
    return c.json({ error: e.message, code: e.code }, 500);
  }
});
var capi_default = router5;

// src/index.ts
process.on("unhandledRejection", (err) => {
  console.error("[Server] Unhandled rejection:", err);
});
var app2 = new Hono10();
app2.use(
  "*",
  cors({
    origin: (origin) => origin || "*",
    credentials: true
  })
);
app2.use("*", authMiddleware);
app2.get("/health", (c) => c.json({ status: "ok" }));
app2.route("/api/auth", auth_default);
app2.route("/api/agent", acp_default);
app2.route("/api/tasks", tasks_default);
app2.route("/api/connectors", connectors_default);
app2.route("/api/database", database_default);
app2.route("/api/storage", storage_default);
app2.route("/api/functions", functions_default);
app2.route("/api/sql", sql_default);
app2.route("/api/capi", capi_default);
var PORT = Number(process.env.PORT) || 3001;
serve({ fetch: app2.fetch, port: PORT }, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
var index_default = app2;
export {
  index_default as default
};
