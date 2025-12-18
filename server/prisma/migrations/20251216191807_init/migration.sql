-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "master" TEXT NOT NULL,
    "schedule_time" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "number_phone" TEXT NOT NULL,
    "name_service" TEXT NOT NULL,
    "price_service" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "serviceId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "schedule_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "price" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "master" TEXT NOT NULL,
    "work_days" TEXT[],
    "start_of_shift" TEXT NOT NULL,
    "end_of_shift" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_phone_key" ON "Order"("number_phone");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_master_key" ON "Schedule"("master");
