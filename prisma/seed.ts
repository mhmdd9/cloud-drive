import "dotenv/config";
import { z } from "zod";
import { getDb } from "../src/lib/db";
import { hashPassword } from "../src/modules/auth/password";

async function main() {
  const result = z.object({
    ADMIN_EMAIL: z.email().transform((email) => email.toLowerCase()),
    ADMIN_PASSWORD: z.string().min(12),
    ADMIN_NAME: z.string().trim().min(1),
  }).safeParse(process.env);

  if (!result.success) {
    throw new Error("Valid ADMIN_EMAIL, ADMIN_PASSWORD (at least 12 characters), and ADMIN_NAME are required.");
  }

  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = result.data;
  const db = getDb();
  const existing = await db.user.findUnique({ where: { email: ADMIN_EMAIL } });
  const passwordHash = existing ? undefined : await hashPassword(ADMIN_PASSWORD);

  await db.$transaction(async (tx) => {
    const admin = await tx.role.upsert({
      where: { name: "admin" },
      create: { name: "admin", permissions: ["users.manage", "groups.manage"] },
      update: { permissions: ["users.manage", "groups.manage"] },
    });

    for (const name of ["management", "deputy", "user"]) {
      await tx.role.upsert({
        where: { name },
        create: { name },
        update: {},
      });
    }

    if (passwordHash !== undefined) {
      await tx.user.upsert({
        where: { email: ADMIN_EMAIL },
        create: {
          email: ADMIN_EMAIL,
          name: ADMIN_NAME,
          passwordHash,
          roles: { create: { roleId: admin.id } },
        },
        update: {},
      });
    }
  });
}

main()
  .catch(() => {
    console.error("Seed failed. Check administrator settings and database availability.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await getDb().$disconnect();
  });
