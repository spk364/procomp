import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const organizer = await prisma.user.upsert({
    where: { email: 'organizer@procomp.app' },
    update: {},
    create: {
      email: 'organizer@procomp.app',
      firstName: 'Organizer',
      lastName: 'User',
      isActive: true,
    },
  })

  const tournament = await prisma.tournament.create({
    data: {
      name: 'ProComp Staging Open',
      description: 'Seeded staging tournament',
      discipline: 'BJJ',
      ruleset: '{}',
      venue: 'Staging Arena',
      address: '123 Main St',
      city: 'Metropolis',
      country: 'US',
      startDate: new Date(),
      endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      registrationOpen: new Date(),
      registrationClose: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      organizerId: organizer.id,
      categories: {
        create: [
          { name: 'Adult Male -76kg', gender: 'MALE', isGi: true },
          { name: 'Adult Female -64kg', gender: 'FEMALE', isGi: true },
        ],
      },
    },
  })

  console.log('Seeded tournament', tournament.id)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })