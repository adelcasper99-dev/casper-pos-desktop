import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
    try {
        const settings = await prisma.storeSettings.findUnique({
            where: { id: "settings" }
        });

        if (settings?.trialStartDate) {
            return NextResponse.json({ 
                success: true, 
                message: "Trial already active", 
                trialStartDate: settings.trialStartDate 
            });
        }

        const updatedSettings = await prisma.storeSettings.upsert({
            where: { id: "settings" },
            create: {
                id: "settings",
                name: "Casper Store",
                trialStartDate: new Date()
            },
            update: {
                trialStartDate: new Date()
            }
        });

        return NextResponse.json({ 
            success: true, 
            message: "Trial started successfully", 
            trialStartDate: updatedSettings.trialStartDate 
        });
    } catch (error: any) {
        console.error("[TRIAL_START] Error:", error);
        return NextResponse.json({ 
            success: false, 
            error: error.message || "Failed to start trial" 
        }, { status: 500 });
    }
}
