import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { signToken, setAuthCookieOnResponse } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { credential, code, redirectUri } = body;

        let email = "";
        let name = "";
        let image = "";
        let googleId = "";

        // Flow A: Google ID Token (from Google Identity Services credential response)
        if (credential) {
            const verifyRes = await fetch(
                `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
            );

            if (!verifyRes.ok) {
                const errData = await verifyRes.text();
                console.error("Google token verification failed:", errData);
                return NextResponse.json(
                    { message: "Invalid Google credential" },
                    { status: 401 }
                );
            }

            const payload = await verifyRes.json();
            email = payload.email?.toLowerCase().trim();
            name = payload.name || payload.given_name || email.split("@")[0];
            image = payload.picture || "";
            googleId = payload.sub || "";
        }
        // Flow B: Google OAuth Authorization Code exchange
        else if (code) {
            const clientId = process.env.GOOGLE_CLIENT_ID;
            const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

            if (!clientId || !clientSecret) {
                return NextResponse.json(
                    { message: "Google OAuth credentials are not configured on the server" },
                    { status: 500 }
                );
            }

            const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    code,
                    client_id: clientId,
                    client_secret: clientSecret,
                    redirect_uri: redirectUri || `${req.nextUrl.origin}/api/auth/callback/google`,
                    grant_type: "authorization_code",
                }),
            });

            if (!tokenRes.ok) {
                const err = await tokenRes.text();
                console.error("OAuth token exchange failed:", err);
                return NextResponse.json(
                    { message: "Failed to exchange Google OAuth code" },
                    { status: 400 }
                );
            }

            const tokenData = await tokenRes.json();
            const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                headers: { Authorization: `Bearer ${tokenData.access_token}` },
            });

            if (!userinfoRes.ok) {
                return NextResponse.json(
                    { message: "Failed to retrieve Google profile" },
                    { status: 400 }
                );
            }

            const profile = await userinfoRes.json();
            email = profile.email?.toLowerCase().trim();
            name = profile.name || profile.given_name || email.split("@")[0];
            image = profile.picture || "";
            googleId = profile.sub || "";
        } else {
            return NextResponse.json(
                { message: "Google credential or authorization code is required" },
                { status: 400 }
            );
        }

        if (!email) {
            return NextResponse.json(
                { message: "Could not retrieve email from Google" },
                { status: 400 }
            );
        }

        await connectDB();

        let user = await User.findOne({
            $or: [{ email }, { googleId }],
        });

        if (!user) {
            user = await User.create({
                name,
                email,
                image,
                googleId,
            });
        } else {
            // Update profile with Google info if missing
            let updated = false;
            if (!user.googleId && googleId) {
                user.googleId = googleId;
                updated = true;
            }
            if (!user.image && image) {
                user.image = image;
                updated = true;
            }
            if (updated) {
                await user.save();
            }
        }

        const token = signToken({
            id: user._id.toString(),
            email: user.email,
            name: user.name,
        });

        const response = NextResponse.json(
            {
                success: true,
                message: "Google authentication successful",
                user: {
                    id: user._id.toString(),
                    name: user.name,
                    email: user.email,
                    image: user.image || image,
                },
            },
            { status: 200 }
        );

        setAuthCookieOnResponse(response, token);
        return response;
    } catch (error) {
        console.error("Google authentication error:", error);
        return NextResponse.json(
            { message: "Google authentication failed. Please try again." },
            { status: 500 }
        );
    }
}
