import { PrismaClient, UserRole, AuthProvider } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@redcross.local';

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    console.log('Seed already applied — admin user exists.');
    return;
  }

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

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
