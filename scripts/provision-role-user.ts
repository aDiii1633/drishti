import "dotenv/config";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { users } from "../drizzle/schema";
import { getDb } from "../server/db";
import { hashPassword, LOCAL_PASSWORD_MIN_LENGTH } from "../server/passwordAuth";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const requestedRole = argument("--role");
const role = requestedRole === "scanner" ? "operator" : requestedRole;
const email = argument("--email")?.trim().toLowerCase();
const password = argument("--password");
const name = argument("--name")?.trim() || null;
const schoolId = argument("--school-id")?.trim() || null;

if (!role || !["operator", "evaluator", "school_admin", "admin", "student"].includes(role) || !email || !password || password.length < LOCAL_PASSWORD_MIN_LENGTH || (role === "school_admin" && !schoolId)) {
  throw new Error("Usage: pnpm auth:user -- --role admin|school_admin|scanner|evaluator|student --email EMAIL --password PASSWORD(8+ chars) [--name NAME] [--school-id SCHOOL_ID]");
}

const db = await getDb();
if (!db) throw new Error("Database unavailable. Set DATABASE_URL first.");
const existing = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
if (existing) throw new Error("An application profile already exists for this email. Use the admin workspace to manage it.");
await db.insert(users).values({
  openId: `local:${nanoid(24)}`,
  loginId: email,
  email,
  passwordHash: hashPassword(password),
  schoolId: role === "school_admin" ? schoolId : null,
  name,
  role: role as "operator" | "evaluator" | "school_admin" | "student" | "admin",
  loginMethod: "local-password",
  mustChangePassword: true,
});
console.log(`Created ${role} profile for ${email}.`);
