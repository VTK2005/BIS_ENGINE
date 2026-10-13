import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { hashPassword, signToken, setAuthCookieOnResponse } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { name, email, password } = body;

        if (!name || typeof name !== "string" || !name.trim()) {
            return NextResponse.json({ message: "Name is required" }, { status: 400 });
        }

        if (!email || typeof email !== "string" || !email.includes("@")) {
            return NextResponse.json({ message: "Valid email is required" }, { status: 400 });
        }

        if (!password || typeof password !== "string" || password.length < 6) {
            return NextResponse.json(
                { message: "Password must be at least 6 characters long" },
                { status: 400 }
            );
        }

        await connectDB();

        const normalizedEmail = email.toLowerCase().trim();
        const existingUser = await User.findOne({ email: normalizedEmail });

        if (existingUser) {
            return NextResponse.json(
                { message: "An account with this email already exists" },
                { status: 409 }
            );
        }

        const hashedPassword = await hashPassword(password);

        const newUser = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            password: hashedPassword,
        });

        const token = signToken({
            id: newUser._id.toString(),
            email: newUser.email,
            name: newUser.name,
        });

        const response = NextResponse.json(
            {
                success: true,
                message: "Registration successful",
                user: {
                    id: newUser._id.toString(),
                    name: newUser.name,
                    email: newUser.email,
                },
            },
            { status: 201 }
        );

        setAuthCookieOnResponse(response, token);
        return response;
    } catch (error) {
        console.error("Registration error:", error);
        return NextResponse.json(
            { message: "Registration failed. Please try again." },
            { status: 500 }
        );
    }
}
