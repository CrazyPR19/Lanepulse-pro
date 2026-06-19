// LanePulse Pro - NextAuth config (Credentials provider + JWT + role)

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { JWT } from "next-auth";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/helpers";
import type { Role } from "@/lib/types";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      fullName: string;
      email: string;
      role: Role;
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
        const user = await db.user.findUnique({
          where: { username: credentials.username },
        });
        if (!user) return null;
        if (!user.isActive) return null;
        const ok = await verifyPassword(credentials.password, user.passwordHash);
        if (!ok) return null;
        // stamp last login
        await db.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
        return {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          email: user.email,
          role: user.role as Role,
          isActive: user.isActive,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as any;
        token.uid = u.id;
        token.username = u.username;
        token.fullName = u.fullName;
        token.email = u.email;
        token.role = u.role;
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
        session.user.isActive = (token.isActive ?? true) as boolean;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || "lanepulse-pro-dev-secret-change-me",
};
