import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding marketing data...');
  
  // 1. Setup Branch and Warehouse
  const branch = await prisma.branch.create({
    data: {
      name: 'Main HQ',
      code: 'HQ-01-MKTG',
    }
  });

  const warehouse = await prisma.warehouse.create({
    data: {
      name: 'Central Warehouse',
      branchId: branch.id,
      isDefault: true
    }
  });

  // 2. Setup Category
  const category = await prisma.category.create({
    data: { name: 'Electronics' }
  });

  // 2.5 Setup User and Shift for Sale compatibility
  const user = await prisma.user.create({
    data: {
      username: 'mktg_user_' + Date.now(),
      password: 'dummy_password',
      name: 'Marketing Seeder',
      roleStr: 'ADMIN',
      branchId: branch.id
    }
  });

  const shift = await prisma.shift.create({
    data: {
      userId: user.id,
      openedAt: new Date(),
      status: 'OPEN',
      cashierName: user.name,
      startCash: 100
    }
  });

  // 3. Setup Products
  const products = await Promise.all([
    prisma.product.create({ data: { sku: 'PROD-001', name: 'iPhone 15 Pro Max', costPrice: 1000, sellPrice: 1200, stock: 50, categoryId: category.id } }),
    prisma.product.create({ data: { sku: 'PROD-002', name: 'Samsung Galaxy S24 Ultra', costPrice: 950, sellPrice: 1150, stock: 30, categoryId: category.id } }),
    prisma.product.create({ data: { sku: 'PROD-003', name: 'MacBook Pro 16" M3 Max', costPrice: 2500, sellPrice: 3200, stock: 10, categoryId: category.id } }),
    prisma.product.create({ data: { sku: 'PROD-004', name: 'AirPods Pro 2', costPrice: 180, sellPrice: 249, stock: 100, categoryId: category.id } }),
    prisma.product.create({ data: { sku: 'PROD-005', name: 'iPad Pro 12.9"', costPrice: 900, sellPrice: 1099, stock: 20, categoryId: category.id } }),
  ]);

  // 4. Setup Customers
  const customers = await Promise.all([
    prisma.customer.create({ data: { name: 'Alice Smith', phone: '555-0101' } }),
    prisma.customer.create({ data: { name: 'Bob Jones', phone: '555-0102' } }),
    prisma.customer.create({ data: { name: 'Charlie Davis', phone: '555-0103' } }),
  ]);

  // 5. Setup Sales
  for (let i = 0; i < 10; i++) {
    const product = products[i % products.length];
    const customer = customers[i % customers.length];
    
    await prisma.sale.create({
      data: {
        warehouseId: warehouse.id,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        totalAmount: product.sellPrice,
        subTotal: product.sellPrice,
        paymentMethod: 'CASH',
        status: 'COMPLETED',
        syncStatus: 'SYNCED',
        branchId: branch.id,
        userId: user.id,
        shiftId: shift.id,
        items: {
          create: [{
            productId: product.id,
            quantity: 1,
            unitPrice: product.sellPrice,
            unitCost: product.costPrice
          }]
        },
        payments: {
          create: [{
            method: 'CASH',
            amount: product.sellPrice
          }]
        }
      }
    });
  }

  console.log('Marketing data seeded successfully!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
