-- CreateTable
CREATE TABLE "GeocodedAddress" (
    "id" TEXT NOT NULL,
    "addressHash" TEXT NOT NULL,
    "rawAddress" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeocodedAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GeocodedAddress_addressHash_key" ON "GeocodedAddress"("addressHash");
