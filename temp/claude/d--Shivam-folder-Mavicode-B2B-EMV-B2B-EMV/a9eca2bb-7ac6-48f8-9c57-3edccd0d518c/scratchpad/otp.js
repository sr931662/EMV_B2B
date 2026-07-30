// Reads the pending OTP straight from the DB. With EMAIL_TRANSPORT=console the code is only
// printed to the server's stdout, so this is the reliable way to fetch it.
const BACKEND = 'd:/Shivam folder/Mavicode/B2B_EMV/B2B_EMV/backend';
const { PrismaClient } = require(BACKEND + '/node_modules/@prisma/client');
const prisma = new PrismaClient();

const email = process.argv[2];

(async () => {
  const t0 = Date.now();
  const users = await prisma.user.findMany({
    where: email ? { email } : { otpCode: { not: null } },
    select: { email: true, otpCode: true, otpExpiresAt: true, isVerified: true, role: true },
    orderBy: { updatedAt: 'desc' },
    take: 5,
  });
  console.log(`DB reachable in ${Date.now() - t0}ms\n`);

  if (users.length === 0) {
    console.log('No matching user / no pending OTP.');
  }

  for (const u of users) {
    const expired = !u.otpExpiresAt || u.otpExpiresAt.getTime() < Date.now();
    const minsLeft = u.otpExpiresAt ? Math.round((u.otpExpiresAt - Date.now()) / 60000) : null;
    console.log(`email      : ${u.email}`);
    console.log(`role       : ${u.role}`);
    console.log(`verified   : ${u.isVerified}`);
    console.log(`otp        : ${u.otpCode ?? '(none)'}`);
    console.log(`status     : ${u.otpCode ? (expired ? 'EXPIRED — hit Resend' : `valid ~${minsLeft} min`) : 'n/a'}`);
    console.log('');
  }

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('DB ERROR:', e.code ?? '', e.message?.split('\n')[0]);
  await prisma.$disconnect();
  process.exit(1);
});
