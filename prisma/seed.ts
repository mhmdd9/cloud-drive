import "dotenv/config";
import { z } from "zod";
import { getDb } from "../src/lib/db";
import { hashPassword } from "../src/modules/auth/password";
import { emailSchema, passwordSchema, usernameSchema } from "../src/modules/auth/identifier";

async function main() {
  const result = z.object({
    ADMIN_EMAIL: emailSchema,
    ADMIN_USERNAME: z.preprocess((value) => typeof value === "string" && value.trim() === "" ? undefined : value, usernameSchema.optional()),
    ADMIN_PASSWORD: passwordSchema.refine((value) => value.length >= 12),
    ADMIN_NAME: z.string().trim().min(1),
  }).safeParse(process.env);

  if (!result.success) {
    throw new Error("Valid administrator settings are required.");
  }

  const { ADMIN_EMAIL, ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_NAME } = result.data;
  const db = getDb();

  await db.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { email: ADMIN_EMAIL },
      include: { roles: { include: { role: true } } },
    });
    if (existing && ADMIN_USERNAME !== undefined) {
      if (!existing.roles.some(({ role }) => role.name === "admin")) {
        throw new Error("Existing account is not an administrator");
      }
      if (existing.username !== null && existing.username !== ADMIN_USERNAME) {
        throw new Error("Existing administrator has a different username");
      }
      if (existing.username === null) {
        const updated = await tx.user.updateMany({
          where: { id: existing.id, username: null, roles: { some: { role: { name: "admin" } } } },
          data: { username: ADMIN_USERNAME },
        });
        if (updated.count !== 1) throw new Error("Administrator username could not be assigned");
      }
    }
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

    if (!existing) {
      await tx.user.create({
        data: {
          email: ADMIN_EMAIL,
          username: ADMIN_USERNAME,
          name: ADMIN_NAME,
          passwordHash: await hashPassword(ADMIN_PASSWORD),
          roles: { create: { roleId: admin.id } },
        },
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
