-- Hotel library gains a phone number; PackageHotel gets the matching frozen-copy column
-- (Hotel/PackageHotel field parity is the contract — see schema.prisma comment on Hotel).
ALTER TABLE "Hotel" ADD COLUMN "phone" TEXT;
ALTER TABLE "PackageHotel" ADD COLUMN "hotelPhone" TEXT;
