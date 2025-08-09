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

  // Create roles for organizer and a referee
  await prisma.userRole.upsert({
    where: { userId_role: { userId: organizer.id, role: 'ORGANIZER' } },
    update: {},
    create: { userId: organizer.id, role: 'ORGANIZER' },
  })
  const referee = await prisma.user.upsert({
    where: { email: 'referee@procomp.app' },
    update: {},
    create: {
      email: 'referee@procomp.app',
      firstName: 'Referee',
      lastName: 'User',
      isActive: true,
    },
  })
  await prisma.userRole.upsert({
    where: { userId_role: { userId: referee.id, role: 'REFEREE' } },
    update: {},
    create: { userId: referee.id, role: 'REFEREE' },
  })

  // Create competitor users
  const competitor1 = await prisma.user.upsert({
    where: { email: 'competitor1@procomp.app' },
    update: {},
    create: {
      email: 'competitor1@procomp.app',
      firstName: 'Competitor',
      lastName: 'One',
      isActive: true,
    },
  })
  const competitor2 = await prisma.user.upsert({
    where: { email: 'competitor2@procomp.app' },
    update: {},
    create: {
      email: 'competitor2@procomp.app',
      firstName: 'Competitor',
      lastName: 'Two',
      isActive: true,
    },
  })

  // Pick a category and create participants
  const category = await prisma.category.findFirst({ where: { tournamentId: tournament.id } })
  if (!category) throw new Error('No category created')

  const participant1 = await prisma.participant.create({
    data: {
      userId: competitor1.id,
      tournamentId: tournament.id,
      categoryId: category.id,
      weight: new Prisma.Decimal(76.0),
      status: 'REGISTERED',
    },
  })
  const participant2 = await prisma.participant.create({
    data: {
      userId: competitor2.id,
      tournamentId: tournament.id,
      categoryId: category.id,
      weight: new Prisma.Decimal(74.0),
      status: 'REGISTERED',
    },
  })

  // Create a bracket and a match
  const bracket = await prisma.bracket.create({
    data: {
      name: 'Main Bracket',
      type: 'SINGLE_ELIMINATION',
      tournamentId: tournament.id,
      categoryId: category.id,
    },
  })

  await prisma.match.create({
    data: {
      round: 1,
      position: 1,
      participant1Id: participant1.id,
      participant2Id: participant2.id,
      tournamentId: tournament.id,
      bracketId: bracket.id,
      status: 'SCHEDULED',
      notes: 'Seeded match',
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