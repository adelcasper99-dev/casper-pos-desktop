import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import Decimal from 'decimal.js';

describe('S1.1 lossSharePercentage migration & behavior', () => {
  beforeAll(async () => {
    await prisma.technician.deleteMany({ where: { user: { username: 'tech_loss_share_test' } } });
    await prisma.user.deleteMany({ where: { username: 'tech_loss_share_test' } });
  });

  afterAll(async () => {
    await prisma.technician.deleteMany({ where: { user: { username: 'tech_loss_share_test' } } });
    await prisma.user.deleteMany({ where: { username: 'tech_loss_share_test' } });
  });

  it('handles lossSharePercentage as Decimal', async () => {
    const user = await prisma.user.create({
      data: {
        username: 'tech_loss_share_test',
        password: 'password',
        roleStr: 'TECHNICIAN'
      }
    });

    const tech = await prisma.technician.create({
      data: {
        userId: user.id,
        name: 'Loss Share Test Tech',
        lossSharePercentage: new Decimal('0.30'), // Decimal representation
        lossRate: new Decimal('70.00'),
        commissionRate: new Decimal('0.00')
      }
    });

    const fetchedTech = await prisma.technician.findUnique({
      where: { id: tech.id }
    });

    expect(fetchedTech?.lossSharePercentage).toBeDefined();
    expect(fetchedTech?.lossSharePercentage?.toString()).toBe('0.3');
  });
});
