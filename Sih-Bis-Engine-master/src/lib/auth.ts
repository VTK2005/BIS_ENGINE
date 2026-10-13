import "server-only";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = process.env.JWT_SECRET || "bis-engine-super-secret-jwt-key-2026";
const TOKEN_COOKIE_NAME = "bis_auth_token";

export interface TokenPayload {
    id: string;
    email: string;
    name: string;
}

export async function hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

export function signToken(payload: TokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): TokenPayload | null {
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
        return decoded;
    } catch {
        return null;
    }
}

/**
 * Extract authenticated user from cookies or Authorization header.
 */
export async function getAuthUser(req?: NextRequest | Request): Promise<TokenPayload | null> {
    // 1. Try Authorization header
    if (req) {
        const authHeader = req.headers.get("authorization");
        if (authHeader && authHeader.startsWith("Bearer ")) {
            const token = authHeader.substring(7).trim();
            const payload = verifyToken(token);
            if (payload) return payload;
        }
    }

    // 2. Try cookie from next/headers
    try {
        const cookieStore = await cookies();
        const cookieToken = cookieStore.get(TOKEN_COOKIE_NAME)?.value;
        if (cookieToken) {
            const payload = verifyToken(cookieToken);
            if (payload) return payload;
        }
    } catch {
        // Fallback for custom request without cookie store
    }

    // 3. Try Cookie header directly from request
    if (req) {
        const cookieHeader = req.headers.get("cookie");
        if (cookieHeader) {
            const match = cookieHeader.match(new RegExp(`(?:^|; )${TOKEN_COOKIE_NAME}=([^;]*)`));
            if (match && match[1]) {
                const payload = verifyToken(decodeURIComponent(match[1]));
                if (payload) return payload;
            }
        }
    }

    return null;
}

/**
 * Set HTTP-Only authentication cookie on NextResponse.
 */
export function setAuthCookieOnResponse(response: NextResponse, token: string): void {
    response.cookies.set({
        name: TOKEN_COOKIE_NAME,
        value: token,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    });
}

/**
 * Clear authentication cookie on NextResponse.
 */
export function clearAuthCookieOnResponse(response: NextResponse): void {
    response.cookies.set({
        name: TOKEN_COOKIE_NAME,
        value: "",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
    });
}
