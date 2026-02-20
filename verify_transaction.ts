
import { createPurchase } from "./src/actions/inventory";
import { safeRandomUUID } from "./src/lib/utils";

async function verify() {
    console.log("Starting large invoice verification...");
    const items = [];
    // Create 50 distinct items to test concurrency and speed
    for (let i = 0; i < 50; i++) {
        items.push({
            name: `Test Product ${Date.now()}_${i}`,
            sku: `TEST_SKU_${Date.now()}_${i}`,
            quantity: 10,
            unitCost: 10,
            sellPrice: 20
        });
    }

    const payload = {
        supplierId: "SUPPLIER_ID_PLACEHOLDER", // Need a real ID or we mock
        invoiceNumber: `TEST-INV-${Date.now()}`,
        paymentMethod: "CASH",
        paidAmount: 0,
        deliveryCharge: 0,
        items
    };

    try {
        // We can't easily run this without valid IDs (Supplier). 
        // So we will rely on code structure verification or mock if possible.
        // Actually, let's just inspect the code structure effectively since we lack a full test environment with DB seeding here.
        console.log("Verification script prepared but requires DB seeding. Skipping runtime execution.");
    } catch (e) {
        console.error("Verification failed:", e);
    }
}

verify();
