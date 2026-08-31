import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const users = await prisma.user.findMany({ select: { id: true, email: true, username: true, googleId: true } });
console.log("user count:", users.length);
console.table(users);
await prisma.$disconnect();
