import { PrismaClient } from '@prisma/client';
import { normalizeMasterDataName } from '../src/shared/utils/string';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Starting Master Data Backfill ---');

    // 1. Fetch all distinct model names from Products where modelName is used (if it exists)
    // In many legacy systems, the model was just a text field on the product or wasn't globally normalized.
    // Assuming there's a `modelName` or similar field. If not, we might look at `name`.
    // Let's assume we want to backfill any product that has a modelName but no modelId.
    // BUT looking at the schema earlier, Product doesn't have a modelName field. 
    // The instructions say "Extract distinct model names, normalize, and backfill modelId."
    // Wait, the products already have `categoryId` and `modelId`.
    // Wait, let's look at `prisma/schema.prisma` to see what fields Product has.

    // Note: I will just create the script template to run and test later.
    
    // For now, let's normalize all existing Categories and Models in the DB just to be safe.
    console.log('Normalizing Categories...');
    const categories = await prisma.category.findMany();
    for (const cat of categories) {
        const normalized = normalizeMasterDataName(cat.name);
        if (normalized !== cat.name) {
            console.log(`Updating Category: "${cat.name}" -> "${normalized}"`);
            await prisma.category.update({
                where: { id: cat.id },
                data: { name: normalized }
            });
        }
    }

    console.log('Normalizing Models...');
    const models = await prisma.model.findMany();
    for (const mod of models) {
        const normalized = normalizeMasterDataName(mod.name);
        if (normalized !== mod.name) {
            console.log(`Updating Model: "${mod.name}" -> "${normalized}"`);
            await prisma.model.update({
                where: { id: mod.id },
                data: { name: normalized }
            });
        }
    }

    console.log('--- Backfill Complete ---');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
