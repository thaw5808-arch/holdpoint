import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const communities = await prisma.community.findMany({
  select: {
    id: true,
    slug: true,
    name: true,
    isPublic: true,
    memberCount: true,
    _count: { select: { members: true, channels: true } },
  },
  orderBy: { createdAt: "asc" },
});
console.log("community count:", communities.length);
console.table(
  communities.map((c) => ({
    slug: c.slug,
    name: c.name,
    isPublic: c.isPublic,
    memberCount: c.memberCount,
    realMembers: c._count.members,
    channels: c._count.channels,
  })),
);
await prisma.$disconnect();
