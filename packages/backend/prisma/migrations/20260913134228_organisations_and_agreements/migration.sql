-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "isRequester" BOOLEAN NOT NULL DEFAULT false,
    "isPayer" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganisationReference" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "OrganisationReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "payerOrganisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "externalReference" TEXT,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Organisation_isActive_idx" ON "Organisation"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "OrganisationReference_organisationId_code_key" ON "OrganisationReference"("organisationId", "code");

-- CreateIndex
CREATE INDEX "Agreement_payerOrganisationId_idx" ON "Agreement"("payerOrganisationId");

-- CreateIndex
CREATE INDEX "Agreement_isActive_idx" ON "Agreement"("isActive");

-- AddForeignKey
ALTER TABLE "OrganisationReference" ADD CONSTRAINT "OrganisationReference_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_payerOrganisationId_fkey" FOREIGN KEY ("payerOrganisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
