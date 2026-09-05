// LanePulse Pro - NextAuth config (Credentials provider + JWT + role)

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { systemDb } from "@/lib/db";
import { verifyPassword } from "@/lib/helpers";
import type { PlatformRole, Role } from "@/lib/types";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      fullName: string;
      email: string;
      role: Role;
      academyId: string | null;
      academyName: string | null;
      academyRole: Role;
      platformRole: PlatformRole | null;
      isActive: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    username?: string;
    fullName?: string;
    email?: string;
    role?: Role;
    academyId?: string | null;
    academyName?: string | null;
    academyRole?: Role;
    platformRole?: PlatformRole | null;
    isActive?: boolean;
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;
        const login = credentials.username.trim();
        const user = await systemDb.user.findFirst({
          where: {
            OR: [
              { username: { equals: login, mode: "insensitive" } },
              { email: { equals: login, mode: "insensitive" } },
            ],
          },
          include: { academy: true },
        });
        if (!user) return null;
        if (!user.isActive) return null;
        if (user.academyId && !user.academy?.isActive) return null;
        const ok = await verifyPassword(credentials.password, user.passwordHash);
        if (!ok) return null;
        // stamp last login
        await systemDb.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
        return {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          email: user.email,
          role: user.role as Role,
          academyId: user.academyId,
          academyName: user.academy?.academyName ?? null,
          academyRole: user.role as Role,
          platformRole: user.platformRole as PlatformRole | null,
          isActive: user.isActive,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as typeof user & {
          username: string;
          fullName: string;
          role: Role;
          academyId: string | null;
          academyName: string | null;
          academyRole: Role;
          platformRole: PlatformRole | null;
          isActive: boolean;
        };
        token.uid = u.id;
        token.username = u.username;
        token.fullName = u.fullName;
        token.email = u.email ?? "";
        token.role = u.role;
        token.academyId = u.academyId;
        token.academyName = u.academyName;
        token.academyRole = u.academyRole;
        token.platformRole = u.platformRole;
        token.isActive = u.isActive;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.uid as string;
        session.user.username = token.username as string;
        session.user.fullName = token.fullName as string;
        session.user.email = token.email as string;
        session.user.role = token.role as Role;
        session.user.academyId = token.academyId ?? null;
        session.user.academyName = token.academyName ?? null;
        session.user.academyRole = (token.academyRole ?? token.role) as Role;
        session.user.platformRole = token.platformRole ?? null;
        session.user.isActive = (token.isActive ?? true) as boolean;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || "lanepulse-pro-dev-secret-change-me",
};
