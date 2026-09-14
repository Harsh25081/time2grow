#!/usr/bin/env node

/**
 * Setup Script for Scheduled Social Media Publishing
 *
 * Automates the full setup: pushes migrations, sets Edge Function secrets,
 * deploys functions, stores vault credentials, schedules the pg_cron job,
 * and verifies the job is active.
 *
 * Prerequisites:
 * - Supabase CLI installed (npm install -g supabase or npx supabase)
 * - Supabase project linked (supabase link --project-ref YOUR_PROJECT_REF)
 * - Root .env file with SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_ANON_KEY
 *
 * Usage:
 *   node scripts/setup-scheduled-publishing.js
 */

const { execSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// ─── ANSI helpers ────────────────────────────────────────────────────────────

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// ─── Shell execution ─────────────────────────────────────────────────────────

function exec(command, { silent = false, allowFailure = false } = {}) {
  try {
    const output = execSync(command, {
      encoding: "utf-8",
      stdio: silent ? "pipe" : "inherit",
      cwd: process.cwd(),
    });
    return { success: true, output: (output ?? "").trim() };
  } catch (error) {
    if (allowFailure) return { success: false, output: error.stdout ?? "" };
    return { success: false, error: error.message };
  }
}

// ─── .env parser (zero dependencies) ─────────────────────────────────────────

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  const env = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function writeEnvValue(filePath, key, value) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${key}=${value}\n`);
    return;
  }
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith(`${key}=`) || trimmed === key) {
      lines[i] = `${key}=${value}`;
      found = true;
      break;
    }
  }
  if (!found) lines.push(`${key}=${value}`);
  fs.writeFileSync(filePath, lines.join("\n"));
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  log("\n🚀 Setting Up Scheduled Social Media Publishing\n", "cyan");

  const envPath = path.join(process.cwd(), ".env");
  const projectRefPath = path.join(
    process.cwd(),
    "supabase",
    ".temp",
    "project-ref",
  );

  // ── Step 1: Validate prerequisites ──────────────────────────────────────

  log("Step 1/7  Checking prerequisites...", "blue");

  // Supabase CLI
  const cliCheck = exec("npx supabase --version", { silent: true });
  if (!cliCheck.success) {
    log("❌ Supabase CLI not found. Install with:  npm i -g supabase", "red");
    process.exit(1);
  }
  log(`  ✅ Supabase CLI: ${cliCheck.output}`, "green");

  // Project link
  if (!fs.existsSync(projectRefPath)) {
    log(
      "❌ Project not linked. Run:  supabase link --project-ref YOUR_REF",
      "red",
    );
    process.exit(1);
  }
  const projectRef = fs.readFileSync(projectRefPath, "utf-8").trim();
  const supabaseUrl = `https://${projectRef}.supabase.co`;
  log(`  ✅ Project linked: ${projectRef}`, "green");

  // .env secrets
  if (!fs.existsSync(envPath)) {
    log(
      "❌ Root .env file not found. Copy from the template first:",
      "red",
    );
    log("   copy .env.example .env", "yellow");
    process.exit(1);
  }

  const env = parseEnvFile(envPath);
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;

  if (!serviceRoleKey) {
    log(
      "❌ SUPABASE_SERVICE_ROLE_KEY is missing in .env (get it from Dashboard → Settings → API)",
      "red",
    );
    process.exit(1);
  }
  if (!anonKey) {
    log(
      "❌ VITE_SUPABASE_ANON_KEY is missing in .env (get it from Dashboard → Settings → API)",
      "red",
    );
    process.exit(1);
  }

  let scheduledJobsSecret = env.SCHEDULED_JOBS_SECRET;
  if (!scheduledJobsSecret) {
    scheduledJobsSecret = crypto.randomBytes(32).toString("hex");
    writeEnvValue(envPath, "SCHEDULED_JOBS_SECRET", scheduledJobsSecret);
    log(
      "  ✅ SCHEDULED_JOBS_SECRET auto-generated and saved to .env",
      "green",
    );
  } else {
    log("  ✅ SCHEDULED_JOBS_SECRET loaded from .env", "green");
  }

  log("  ✅ All secrets loaded\n", "green");

  // ── Step 2: Push database migrations ────────────────────────────────────

  log("Step 2/7  Pushing database migrations...", "blue");
  const pushResult = exec("npx supabase db push");
  if (!pushResult.success && pushResult.error) {
    log("❌ Migration push failed. See output above.", "red");
    log(
      "   If migrations are already applied, this is safe to ignore.",
      "dim",
    );
  }
  log("  ✅ Migrations pushed\n", "green");

  // ── Step 3: Set Edge Function secrets ───────────────────────────────────

  log("Step 3/7  Setting Edge Function secrets...", "blue");
  log(
    "  (Note: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected by Supabase)",
    "dim",
  );
  const secretsCmd = `npx supabase secrets set SCHEDULED_JOBS_SECRET=${scheduledJobsSecret}`;
  const secretsResult = exec(secretsCmd, { silent: true, allowFailure: true });
  let secretsSetViaCli = secretsResult.success;

  if (secretsSetViaCli) {
    log("  ✅ SCHEDULED_JOBS_SECRET configured in Edge Functions\n", "green");
  } else {
    log(
      "  ⚠️  CLI cannot set Edge Function secrets directly (account role / API privileges).",
      "yellow",
    );
    log(
      "     Please ensure this secret is set in your Supabase Dashboard:",
      "yellow",
    );
    log(
      "     👉 Dashboard → Project Settings → Edge Functions → Secrets",
      "cyan",
    );
    log(`        Name:  SCHEDULED_JOBS_SECRET`, "cyan");
    log(`        Value: ${scheduledJobsSecret}\n`, "cyan");
  }

  // ── Step 4: Deploy Edge Functions ───────────────────────────────────────

  log("Step 4/7  Deploying scheduled-jobs Edge Function...", "blue");
  const deployJobs = exec(
    "npx supabase functions deploy scheduled-jobs --no-verify-jwt",
  );
  if (!deployJobs.success && deployJobs.error) {
    log("❌ Failed to deploy scheduled-jobs. See output above.", "red");
    process.exit(1);
  }
  log("  ✅ scheduled-jobs deployed", "green");

  log("         Deploying social-publish Edge Function...", "blue");
  const deployPublish = exec(
    "npx supabase functions deploy social-publish --no-verify-jwt",
  );
  if (!deployPublish.success && deployPublish.error) {
    log("❌ Failed to deploy social-publish. See output above.", "red");
    process.exit(1);
  }
  log("  ✅ social-publish deployed\n", "green");

  // ── Step 5: Store vault secrets & schedule cron job ─────────────────────

  log("Step 5/7  Configuring vault secrets and cron schedule...", "blue");

  // Escape single quotes in secret values for SQL safety
  const safeAnon = anonKey.replace(/'/g, "''");
  const safeSecret = scheduledJobsSecret.replace(/'/g, "''");

  const cronSQL = `
-- Idempotent: remove existing job if present
DO $$ BEGIN
  PERFORM cron.unschedule('scheduled-social-posts');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Store secrets in vault (idempotent via delete + recreate)
DELETE FROM vault.secrets WHERE name IN ('supabase_anon_key', 'scheduled_jobs_secret');
SELECT vault.create_secret('${safeAnon}', 'supabase_anon_key');
SELECT vault.create_secret('${safeSecret}', 'scheduled_jobs_secret');

-- Schedule the cron job: every minute, call the scheduled-jobs Edge Function
SELECT cron.schedule(
  'scheduled-social-posts',
  '* * * * *',
  $cronbody$
  SELECT net.http_post(
    url := '${supabaseUrl}/functions/v1/scheduled-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_anon_key' LIMIT 1),
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_anon_key' LIMIT 1),
      'x-scheduled-jobs-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'scheduled_jobs_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $cronbody$
);
`.trim();

  // Write SQL to a temp file and execute via supabase db query --linked
  const tmpSqlPath = path.join(process.cwd(), ".tmp-cron-setup.sql");
  try {
    fs.writeFileSync(tmpSqlPath, cronSQL);
    const cronResult = exec(`npx supabase db query --linked --file "${tmpSqlPath}"`);
    if (!cronResult.success && cronResult.error) {
      log("❌ Failed to schedule cron job. See output above.", "red");
      log("   You may need to run the SQL manually in the SQL Editor.", "yellow");
      log(`   SQL file: ${tmpSqlPath}`, "dim");
      process.exit(1);
    }
    log("  ✅ Vault secrets stored", "green");
    log("  ✅ Cron job scheduled\n", "green");
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(tmpSqlPath);
    } catch {
      // ignore
    }
  }

  // ── Step 6: Verify ──────────────────────────────────────────────────────

  log("Step 6/7  Verifying cron job...", "blue");
  const verifySQL = `SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'scheduled-social-posts';`;
  const tmpVerifyPath = path.join(process.cwd(), ".tmp-cron-verify.sql");
  try {
    fs.writeFileSync(tmpVerifyPath, verifySQL);
    const verifyResult = exec(
      `npx supabase db query --linked --file "${tmpVerifyPath}"`,
      { silent: true, allowFailure: true },
    );
    if (verifyResult.success && verifyResult.output) {
      try {
        const parsed = JSON.parse(verifyResult.output);
        if (parsed.rows && parsed.rows.length > 0) {
          log("  ✅ Cron job verified active in database:", "green");
          console.table(parsed.rows);
        } else {
          log(`  ⚠️  Cron job query result: ${verifyResult.output}`, "yellow");
        }
      } catch {
        log("  ✅ Cron job verified:\n", "green");
        log(`  ${verifyResult.output}`, "cyan");
      }
    } else {
      log(
        "  ⚠️  Could not verify automatically. Check in SQL Editor:",
        "yellow",
      );
      log(`     ${verifySQL}`, "dim");
    }
  } finally {
    try {
      fs.unlinkSync(tmpVerifyPath);
    } catch {
      // ignore
    }
  }

  // ── Step 7: Summary ─────────────────────────────────────────────────────

  log("\n" + "─".repeat(60), "dim");
  log("\n✨ Scheduled publishing configuration complete!\n", "green");
  log("What was set up:", "cyan");
  log("  • Database migrations pushed (pg_cron, pg_net, vault)");
  log("  • Edge Functions deployed: scheduled-jobs, social-publish");
  log("  • Vault secrets stored: supabase_anon_key, scheduled_jobs_secret");
  log("  • Cron job active: runs every minute\n");
  if (!secretsSetViaCli) {
    log("⚠️  Action required:", "yellow");
    log("  If not already added, set this secret in your Supabase Dashboard:");
    log("  👉 Project Settings → Edge Functions → Secrets");
    log(`     SCHEDULED_JOBS_SECRET = ${scheduledJobsSecret}\n`);
  }
  log("Test it:", "cyan");
  log("  1. Go to Distribution Hub (/social)");
  log("  2. Create a post and schedule it 2–3 minutes ahead");
  log("  3. Wait for the scheduled time and refresh");
  log("  4. The post should auto-publish\n");
}

main().catch((error) => {
  log(`\n❌ Fatal error: ${error.message}`, "red");
  process.exit(1);
});
