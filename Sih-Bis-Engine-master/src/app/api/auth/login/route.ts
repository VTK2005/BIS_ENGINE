import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { comparePassword, signToken, setAuthCookieOnResponse } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { email, password } = body;

        if (!email || !password) {
            return NextResponse.json(
                { message: "Email and password are required" },
                { status: 400 }
            );
        }

        await connectDB();

        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail }).select("+password");

        if (!user || !user.password) {
            return NextResponse.json(
                { message: "Invalid email or password" },
                { status: 401 }
            );
        }

        const isMatch = await comparePassword(password, user.password);
        if (!isMatch) {
            return NextResponse.json(
                { message: "Invalid email or password" },
                { status: 401 }
            );
        }

        const token = signToken({
            id: user._id.toString(),
            email: user.email,
            name: user.name,
        });

        const response = NextResponse.json(
            {
                success: true,
                message: "Login successful",
                user: {
                    id: user._id.toString(),
                    name: user.name,
                    email: user.email,
                    image: user.image || "",
                },
            },
            { status: 200 }
        );

        setAuthCookieOnResponse(response, token);
        return response;
    } catch (error) {
        console.error("Login error:", error);
        return NextResponse.json(
            { message: "Login failed. Please try again." },
            { status: 500 }
        );
    }
}
