import mongoose, { Document, Model, Schema } from "mongoose";

export interface IUser extends Document {
    name: string;
    email: string;
    password?: string;
    image?: string;
    googleId?: string;
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
    {
        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true,
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        password: {
            type: String,
            select: false, // Don't return password hash by default
        },
        image: {
            type: String,
            default: "",
        },
        googleId: {
            type: String,
            sparse: true,
            index: true,
        },
    },
    {
        timestamps: true,
    }
);

export const User: Model<IUser> =
    mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
