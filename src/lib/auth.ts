import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { admin } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { db } from "@/lib/db";
import { SESSION_EXPIRES_IN_SECONDS, SESSION_UPDATE_AGE_SECONDS } from "@/lib/session-timeout";

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET || "local-development-secret-only-do-not-deploy",
  baseURL: process.env.BETTER_AUTH_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000",
  emailAndPassword: { enabled: true, disableSignUp: true },
  // Sessão curta, renovada pelo navegador enquanto a pessoa usa o sistema (ver SessionTimeout).
  session: { expiresIn: SESSION_EXPIRES_IN_SECONDS, updateAge: SESSION_UPDATE_AGE_SECONDS },
  plugins: [admin({ defaultRole: "attendant", adminRoles: ["admin"], roles: { admin: adminAc, attendant: userAc, user: userAc } })],
});
