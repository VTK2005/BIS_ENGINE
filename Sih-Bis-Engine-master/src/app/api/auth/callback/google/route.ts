import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { signToken, setAuthCookieOnResponse } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Google OAuth Authorization Code callback handler.
 * Google redirects here after the user approves access.
 * We exchange the code for an access token, get the user profile,
 * create/update the user, issue a JWT session, and redirect to /assistant.
 */
export async function GET(req: NextRequest) {
    const { searchParams, origin } = req.nextUrl;
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const redirectTo = searchParams.get("state") || "/assistant";

    if (error || !code) {
        const msg = encodeURIComponent(error || "Google sign-in was cancelled or failed.");
        return NextResponse.redirect(`${origin}/login?error=${msg}`);
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        console.error("Google OAuth credentials are not configured");
        return NextResponse.redirect(
            `${origin}/login?error=${encodeURIComponent("Server configuration error: Google OAuth credentials are missing.")}`
        );
    }

    try {
        const redirectUri = `${origin}/api/auth/callback/google`;

        // Exchange authorization code for access token
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: "authorization_code",
            }),
        });

        if (!tokenRes.ok) {
            const err = await tokenRes.text();
            console.error("OAuth token exchange failed:", err);
            return NextResponse.redirect(
                `${origin}/login?error=${encodeURIComponent("Failed to authenticate with Google. Please try again.")}`
            );
        }

        const tokenData = await tokenRes.json();

        // Get user profile from Google
        const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });

        if (!userinfoRes.ok) {
            return NextResponse.redirect(
                `${origin}/login?error=${encodeURIComponent("Failed to retrieve your Google profile. Please try again.")}`
            );
        }

        const profile = await userinfoRes.json();
        const email: string = (profile.email || "").toLowerCase().trim();
        const name: string = profile.name || profile.given_name || email.split("@")[0];
        const image: string = profile.picture || "";
        const googleId: string = profile.sub || "";

        if (!email) {
            return NextResponse.redirect(
                `${origin}/login?error=${encodeURIComponent("Your Google account does not have a verified email address.")}`
            );
        }

        await connectDB();

        let user = await User.findOne({ $or: [{ email }, { googleId }] });

        if (!user) {
            user = await User.create({ name, email, image, googleId });
        } else {
            let updated = false;
            if (!user.googleId && googleId) { user.googleId = googleId; updated = true; }
            if (!user.image && image) { user.image = image; updated = true; }
            if (updated) await user.save();
        }

        const token = signToken({
            id: user._id.toString(),
            email: user.email,
            name: user.name,
        });

        const response = NextResponse.redirect(`${origin}${redirectTo}`);
        setAuthCookieOnResponse(response, token);
        return response;
    } catch (err) {
        console.error("Google OAuth callback error:", err);
        return NextResponse.redirect(
            `${origin}/login?error=${encodeURIComponent("An unexpected error occurred during Google sign-in. Please try again.")}`
        );
    }
}
