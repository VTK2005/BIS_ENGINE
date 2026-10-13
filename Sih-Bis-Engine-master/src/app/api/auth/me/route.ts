import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { getAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const authUser = await getAuthUser(req);

        if (!authUser) {
            return NextResponse.json(
                { authenticated: false, user: null },
                { status: 401 }
            );
        }

        await connectDB();
        const user = await User.findById(authUser.id);

        if (!user) {
            return NextResponse.json(
                { authenticated: false, user: null },
                { status: 401 }
            );
        }

        return NextResponse.json(
            {
                authenticated: true,
                user: {
                    id: user._id.toString(),
                    name: user.name,
                    email: user.email,
                    image: user.image || "",
                },
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("Auth check error:", error);
        return NextResponse.json(
            { authenticated: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}
