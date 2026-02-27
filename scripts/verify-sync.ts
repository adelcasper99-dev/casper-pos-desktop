
import { prisma } from "../src/lib/prisma";
import { ensureMainBranch, syncMainBranchDetails } from "../src/lib/ensure-main-branch";

async function verifySync() {
    console.log("--- Starting Simplified Sync Verification ---");

    // --- Scenario 1: Rename ---
    console.log("\nScenario 1: MAIN-001 exists, MAIN does not");
    await prisma.branch.deleteMany({ where: { code: 'MAIN' } }).catch(() => { });
    await prisma.branch.upsert({
        where: { code: 'MAIN-001' },
        update: { name: 'Old Branch' },
        create: { name: 'Old Branch', code: 'MAIN-001', type: 'STORE' }
    });

    console.log("Running ensureMainBranch()...");
    await ensureMainBranch();

    let main = await prisma.branch.findUnique({ where: { code: 'MAIN' } });
    let legacy = await prisma.branch.findUnique({ where: { code: 'MAIN-001' } });

    if (main && !legacy) {
        console.log("✅ Scenario 1 Successful: MAIN-001 renamed to MAIN");
    } else {
        console.error("❌ Scenario 1 Failed");
    }

    // --- Scenario 2: Collision/Delete ---
    console.log("\nScenario 2: Both MAIN and MAIN-001 exist");
    // Clear cache first (simulating fresh start or sync)
    // Actually, ensure-main-branch doesn't export the cache reset, but syncMainBranchDetails does it.
    await syncMainBranchDetails({});

    await prisma.branch.upsert({
        where: { code: 'MAIN' },
        update: { name: 'Main Brand' },
        create: { name: 'Main Brand', code: 'MAIN', type: 'STORE' }
    });
    await prisma.branch.upsert({
        where: { code: 'MAIN-001' },
        update: { name: 'Old Branch' },
        create: { name: 'Old Branch', code: 'MAIN-001', type: 'STORE' }
    });

    console.log("Running ensureMainBranch()...");
    await ensureMainBranch();

    main = await prisma.branch.findUnique({ where: { code: 'MAIN' } });
    legacy = await prisma.branch.findUnique({ where: { code: 'MAIN-001' } });

    if (main && !legacy) {
        console.log("✅ Scenario 2 Successful: MAIN-001 deleted to avoid conflict");
    } else {
        console.error("❌ Scenario 2 Failed");
    }

    // 3. Test Settings Sync (including Warehouse)
    console.log("\nTesting Settings Sync (Branch + Warehouse)...");
    const testData = {
        name: "Sync Test Store",
        phone: "123456789",
        address: "123 Sync St"
    };

    // Update settings in DB
    await prisma.storeSettings.update({
        where: { id: 'settings' },
        data: testData
    });

    // Run sync function which updates branch AND clears cache
    await syncMainBranchDetails(testData);

    // Run ensureMainBranch
    await ensureMainBranch();

    const finalBranch = await prisma.branch.findUnique({
        where: { code: 'MAIN' },
        include: { warehouses: { where: { isDefault: true } } }
    });

    const defaultWarehouse = finalBranch?.warehouses[0];

    if (finalBranch &&
        finalBranch.name === testData.name &&
        finalBranch.phone === testData.phone &&
        finalBranch.address === testData.address &&
        defaultWarehouse?.name === testData.name) {
        console.log("✅ Settings Sync Successful: Branch + Warehouse info matches settings");
    } else {
        console.error("❌ Settings Sync Failed");
        console.log("Branch:", finalBranch);
        console.log("Default Warehouse:", defaultWarehouse);
    }

    console.log("\n--- Verification Finished ---");
}

verifySync().catch(console.error);
