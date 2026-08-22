import { PrismaClient, UserRole, AuthProvider, VehicleType, InventoryItemType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { seedGeography } from './seed-geography';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@redcross.local';

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    console.log('Seed already applied — admin user exists.');
  } else {
    const passwordHash = await bcrypt.hash('Admin1234!', 12);

    await prisma.user.create({
      data: {
        email: adminEmail,
        firstName: 'Admin',
        lastName: 'RedCross',
        passwordHash,
        role: UserRole.SYSTEM_ADMIN,
        provider: AuthProvider.LOCAL,
        isActive: true,
      },
    });

    console.log('✅ Seed complete — admin@redcross.local / Admin1234!');
  }

  // ── Default Inventory Templates ──────────────────────────────────────────────

  const emergencyTemplateExists = await prisma.inventoryTemplate.findUnique({
    where: { vehicleType: VehicleType.EMERGENCY },
  });

  if (!emergencyTemplateExists) {
    await prisma.inventoryTemplate.create({
      data: {
        vehicleType: VehicleType.EMERGENCY,
        notes: 'Default template for Emergency vehicles',
        items: {
          create: [
            { name: 'First Aid Kit (Advanced)', type: InventoryItemType.COUNTABLE, recommendedQuantity: 1, unit: 'kit', order: 1 },
            { name: 'Defibrillator (AED)', type: InventoryItemType.COUNTABLE, recommendedQuantity: 1, unit: 'pcs', order: 2 },
            { name: 'Oxygen Cylinder', type: InventoryItemType.COUNTABLE, recommendedQuantity: 2, unit: 'pcs', order: 3 },
            { name: 'Oxygen Mask', type: InventoryItemType.COUNTABLE, recommendedQuantity: 4, unit: 'pcs', order: 4 },
            { name: 'Stretcher', type: InventoryItemType.COUNTABLE, recommendedQuantity: 1, unit: 'pcs', order: 5 },
            { name: 'Spine Board', type: InventoryItemType.COUNTABLE, recommendedQuantity: 1, unit: 'pcs', order: 6 },
            { name: 'Cervical Collars (set)', type: InventoryItemType.COUNTABLE, recommendedQuantity: 1, unit: 'set', order: 7 },
            { name: 'Gloves (box)', type: InventoryItemType.COUNTABLE, recommendedQuantity: 2, unit: 'box', order: 8 },
            { name: 'Bandages (assorted)', type: InventoryItemType.COUNTABLE, recommendedQuantity: 10, unit: 'pcs', order: 9 },
            { name: 'Saline Solution (500ml)', type: InventoryItemType.COUNTABLE, recommendedQuantity: 4, unit: 'pcs', order: 10 },
            { name: 'Blood Pressure Monitor', type: InventoryItemType.COUNTABLE, recommendedQuantity: 1, unit: 'pcs', order: 11 },
            { name: 'Pulse Oximeter', type: InventoryItemType.COUNTABLE, recommendedQuantity: 1, unit: 'pcs', order: 12 },
            { name: 'Radio / Communication Device', type: InventoryItemType.COUNTABLE, recommendedQuantity: 1, unit: 'pcs', order: 13 },
            { name: 'High-visibility Vest', type: InventoryItemType.COUNTABLE, recommendedQuantity: 2, unit: 'pcs', order: 14 },
            { name: 'Fire Extinguisher', type: InventoryItemType.COUNTABLE, recommendedQuantity: 1, unit: 'pcs', order: 15 },
            { name: 'Medical Waste Bag', type: InventoryItemType.UNLIMITED, recommendedQuantity: null, unit: 'pcs', order: 16 },
          ],
        },
      },
    });
    console.log('✅ Emergency inventory template created.');
  } else {
    console.log('Emergency inventory template already exists — skipping.');
  }

  const transportTemplateExists = await prisma.inventoryTemplate.findUnique({
    where: { vehicleType: VehicleType.TRANSPORT },
  });

  if (!transportTemplateExists) {
    await prisma.inventoryTemplate.create({
      data: {
        vehicleType: VehicleType.TRANSPORT,
        notes: 'Default template for Transport vehicles',
        items: {
          create: [
            { name: 'First Aid Kit (Basic)', type: InventoryItemType.COUNTABLE, recommendedQuantity: 1, unit: 'kit', order: 1 },
            { name: 'Wheelchair', type: InventoryItemType.COUNTABLE, recommendedQuantity: 1, unit: 'pcs', order: 2 },
            { name: 'Transfer Belt', type: InventoryItemType.COUNTABLE, recommendedQuantity: 2, unit: 'pcs', order: 3 },
            { name: 'Gloves (box)', type: InventoryItemType.COUNTABLE, recommendedQuantity: 1, unit: 'box', order: 4 },
            { name: 'Disposable Blanket', type: InventoryItemType.COUNTABLE, recommendedQuantity: 4, unit: 'pcs', order: 5 },
            { name: 'Reusable Blanket', type: InventoryItemType.COUNTABLE, recommendedQuantity: 2, unit: 'pcs', order: 6 },
            { name: 'Seat Belt Extender', type: InventoryItemType.COUNTABLE, recommendedQuantity: 2, unit: 'pcs', order: 7 },
            { name: 'Hand Sanitiser (500ml)', type: InventoryItemType.COUNTABLE, recommendedQuantity: 2, unit: 'pcs', order: 8 },
            { name: 'Disinfectant Spray', type: InventoryItemType.COUNTABLE, recommendedQuantity: 1, unit: 'pcs', order: 9 },
            { name: 'High-visibility Vest', type: InventoryItemType.COUNTABLE, recommendedQuantity: 2, unit: 'pcs', order: 10 },
            { name: 'Fire Extinguisher', type: InventoryItemType.COUNTABLE, recommendedQuantity: 1, unit: 'pcs', order: 11 },
            { name: 'Paper Sheets (roll)', type: InventoryItemType.UNLIMITED, recommendedQuantity: null, unit: 'roll', order: 12 },
          ],
        },
      },
    });
    console.log('✅ Transport inventory template created.');
  } else {
    console.log('Transport inventory template already exists — skipping.');
  }

  // ── Holidays ─────────────────────────────────────────────────────────────────
  // Portuguese public holidays for 2026, as a convenience starting point for the
  // availability shift pattern (a holiday follows the weekend pattern: two
  // shifts instead of one). Coordinators own this table — they can correct,
  // remove, or extend it from the Holidays screen, so treat these as a default
  // rather than authoritative.

  const holidays2026: Array<{ date: string; name: string }> = [
    { date: '2026-01-01', name: 'Ano Novo' },
    // Carnaval is widely observed but not a statutory public holiday; kept here
    // because field operations do staff it. Coordinators can remove it.
    { date: '2026-02-17', name: 'Carnaval (não obrigatório)' },
    { date: '2026-04-03', name: 'Sexta-Feira Santa' },
    { date: '2026-04-05', name: 'Páscoa' },
    { date: '2026-04-25', name: 'Dia da Liberdade' },
    { date: '2026-05-01', name: 'Dia do Trabalhador' },
    { date: '2026-06-04', name: 'Corpo de Deus' },
    { date: '2026-06-10', name: 'Dia de Portugal' },
    { date: '2026-08-15', name: 'Assunção de Nossa Senhora' },
    { date: '2026-10-05', name: 'Implantação da República' },
    { date: '2026-11-01', name: 'Todos os Santos' },
    { date: '2026-12-01', name: 'Restauração da Independência' },
    { date: '2026-12-08', name: 'Imaculada Conceição' },
    { date: '2026-12-25', name: 'Natal' },
  ];

  let holidaysCreated = 0;
  for (const holiday of holidays2026) {
    const date = new Date(`${holiday.date}T00:00:00.000Z`);
    const exists = await prisma.holiday.findUnique({ where: { date } });
    if (exists) continue;
    await prisma.holiday.create({ data: { date, name: holiday.name } });
    holidaysCreated++;
  }

  if (holidaysCreated > 0) {
    console.log(`✅ ${holidaysCreated} PT 2026 holiday(s) created.`);
  } else {
    console.log('Holidays already seeded — skipping.');
  }

  // ── Geography and hospitals ──────────────────────────────────────────────────
  // Every municipality and freguesia in Portugal, plus the hospital list a
  // report's transport destination is chosen from. Idempotent, so this runs on
  // every deployment and a refreshed dataset lands by re-seeding.
  await seedGeography(prisma);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
