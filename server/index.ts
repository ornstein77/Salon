import express, { Application, Request, Response } from "express";
import http,{ Server } from "http";
import path from "path";
import { PrismaClient } from "@prisma/client";

// Инициализируем Prisma Client
const prisma = new PrismaClient();

// Заглушка для списка мастеров (в идеале должна быть отдельная Master model в БД)
const DEFAULT_MASTERS = [
    { id: 1, name: 'Анна' },
    { id: 2, name: 'Ирина' },
    { id: 3, name: 'Елена' },
];

class SocketServer{
    private app: Application
    private httpServer: Server
    private readonly port: number = 3000

    constructor(port?: number){
        this.port = port || Number(process.env.PORT) || 3000;
        this.app = express()
        this.httpServer = http.createServer(this.app)
        this.configureMiddlewareAndRouter()
    }

    private configureMiddlewareAndRouter(){
        // Определяем путь к папке build
        const buildPath = path.join(__dirname, "..", "build"); 

        // 0. Middleware для обработки JSON-тела запросов (ОБЯЗАТЕЛЬНО для POST/PATCH)
        this.app.use(express.json());

        // 1. Сначала обслуживаем СТАТИЧЕСКИЕ файлы (JS, CSS и т.д.)
        this.app.use(express.static(buildPath)); 

        // 2. API-МАРШРУТЫ:

        // 2.0. GET /api/masters - Получение списка мастеров (заглушка)
        this.app.get("/api/masters", (req: Request, res: Response) => {
            return res.json(DEFAULT_MASTERS);
        });

        // 2.1. POST /api/booking (Создание новой записи)
        this.app.post("/api/booking", async (req: Request, res: Response) => {
            const { masterId, serviceId, date, slot, name, phone } = req.body; 

            if (!masterId || !serviceId || !date || !slot || !name || !phone) {
                return res.status(400).json({ error: "Не все поля заполнены." });
            }

            try {
                const scheduleDate = new Date(date);
                const dayKey = scheduleDate.toLocaleDateString('en-US', { weekday: 'short' });

                // ПРОВЕРКА 1: Работает ли мастер в этот день недели
                const masterSchedule = await prisma.schedule.findUnique({
                    where: { master: String(masterId) }
                });

                if (!masterSchedule || !masterSchedule.work_days.includes(dayKey)) {
                    return res.status(400).json({ error: "Мастер не работает в этот день." });
                }

                // ПРОВЕРКА 2: Не занято ли время
                const existingOrder = await prisma.order.findFirst({
                    where: {
                        master: String(masterId),
                        schedule_date: scheduleDate,
                        schedule_time: slot,
                        status: { in: ['new', 'confirmed', 'completed'] }
                    }
                });

                if (existingOrder) {
                    return res.status(409).json({ error: "Это время уже занято." });
                }

                // Логика создания заказа (ваша оригинальная)
                const service = await prisma.service.findUnique({ where: { id: String(serviceId) } });
                if (!service) return res.status(404).json({ error: "Услуга не найдена." });

                const newOrder = await prisma.order.create({
                    data: {
                        master: String(masterId),
                        serviceId: String(serviceId),
                        name_service: service.name,
                        price_service: service.price,
                        schedule_date: scheduleDate,
                        schedule_time: slot,
                        name: name,
                        number_phone: phone,
                        status: 'new',
                    },
                });

                return res.status(201).json(newOrder);
            } catch (error: any) {
                console.error("Error:", error);
                return res.status(500).json({ error: "Ошибка сервера." });
            }
        });
        // 2.2. GET /api/orders (Получение всех записей для админки)
        this.app.get("/api/orders", async (req: Request, res: Response) => {
            try {
                const orders = await prisma.order.findMany({
                    orderBy: { created_at: 'desc' }, 
                });
                return res.json(orders);
            } catch (error: any) {
                console.error("[DB] Failed to fetch orders:", error);
                return res.status(500).json({ error: "Не удалось загрузить записи из БД." });
            }
        });

        // 2.3. PATCH /api/orders/:id/status (Обновление статуса записи)
        this.app.patch("/api/orders/:id/status", async (req: Request, res: Response) => {
            const { id } = req.params as {id: string};
            const { status } = req.body; 

            if (!status) {
                return res.status(400).json({ error: "Требуется поле 'status'." });
            }
            
            const validStatuses = ['new', 'confirmed', 'cancelled', 'completed'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ error: "Недопустимый статус." });
            }

            try {
                const updatedOrder = await prisma.order.update({
                    where: { id: id },
                    data: { status: status },
                });

                console.log(`[DB] Order ${id} status updated to: ${status}`);
                return res.json(updatedOrder);

            } catch (error: any) {
                console.error(`[DB] Failed to update order ${id} status:`, error);
                return res.status(500).json({ error: "Не удалось обновить статус заказа." });
            }
        });

        // =================================================================
        // 3. УПРАВЛЕНИЕ УСЛУГАМИ (Service)
        // =================================================================

        // 3.1. GET /api/services - Получение всех услуг
        this.app.get("/api/services", async (req: Request, res: Response) => {
            try {
                const services = await prisma.service.findMany({
                    orderBy: { name: 'asc' },
                });
                return res.json(services);
            } catch (error: any) {
                console.error("[DB] Error fetching services:", error);
                return res.status(500).json({ error: "Не удалось загрузить услуги." });
            }
        });

        // 3.2. POST /api/services - Создание новой услуги
        this.app.post("/api/services", async (req: Request, res: Response) => {
            const { name, price } = req.body; 

            if (!name || price == null) {
                return res.status(400).json({ error: "Требуется название и цена." });
            }

            try {
                const newService = await prisma.service.create({
                    data: {
                        name: String(name),
                        price: Number(price),
                    },
                });
                console.log(`[DB] New service created: ${newService.id}`);
                return res.status(201).json(newService);
            } catch (error: any) {
                console.error("[DB] Error creating service:", error);
                return res.status(500).json({ error: "Не удалось создать услугу." });
            }
        });

        // 3.3. PATCH /api/services/:id - Обновление услуги
        this.app.patch("/api/services/:id", async (req: Request, res: Response) => {
            const { id } = req.params as { id: string };
            const { name, price } = req.body; 

            if (!id || (name === undefined && price === undefined)) {
                return res.status(400).json({ error: "Неверный запрос." });
            }

            // ИСПРАВЛЕНО: Создаем объект обновления, чтобы избежать ошибки типизации Prisma
            const dataToUpdate: any = {};
            if (name !== undefined) dataToUpdate.name = String(name);
            // Используем price !== undefined, чтобы разрешить передачу цены 0
            if (price !== undefined) dataToUpdate.price = Number(price); 

            try {
                const updatedService = await prisma.service.update({
                    where: { id: id },
                    data: dataToUpdate,
                });
                console.log(`[DB] Service ${id} updated.`);
                return res.json(updatedService);
            } catch (error: any) {
                console.error(`[DB] Error updating service ${id}:`, error);
                // Prisma выбрасывает P2025 (Record not found)
                return res.status(404).json({ error: "Услуга не найдена." });
            }
        });

        // 3.4. DELETE /api/services/:id - Удаление услуги
        this.app.delete("/api/services/:id", async (req: Request, res: Response) => {
            const { id } = req.params as { id: string };

            try {
                await prisma.service.delete({
                    where: { id: id },
                });
                console.log(`[DB] Service ${id} deleted.`);
                return res.status(204).send(); // 204 No Content
            } catch (error: any) {
                console.error(`[DB] Error deleting service ${id}:`, error);
                // Prisma выбрасывает P2025 (Record not found)
                return res.status(404).json({ error: "Услуга не найдена." });
            }
        });


        // =================================================================
        // 4. УПРАВЛЕНИЕ РАСПИСАНИЯМИ (Schedule)
        // =================================================================

        // 4.1. GET /api/schedules - Получение всех расписаний
        this.app.get("/api/schedules", async (req: Request, res: Response) => {
            try {
                const schedules = await prisma.schedule.findMany({});
                return res.json(schedules); 
            } catch (error: any) {
                console.error("[DB] Error fetching schedules:", error);
                return res.status(500).json({ error: "Не удалось загрузить расписания." });
            }
        });

        // 4.2. PATCH /api/schedules/:masterId - Обновление расписания мастера
        this.app.patch("/api/schedules/:masterId", async (req: Request, res: Response) => {
            const { masterId } = req.params as { masterId: string };
            const { work_days, start_of_shift, end_of_shift } = req.body; 

            if (!masterId) {
                return res.status(400).json({ error: "Требуется Master ID." });
            }
            
            // Подготавливаем данные для обновления:
            const dataToUpdate: any = {};
            if (work_days !== undefined) dataToUpdate.work_days = work_days;
            if (start_of_shift !== undefined) dataToUpdate.start_of_shift = String(start_of_shift);
            if (end_of_shift !== undefined) dataToUpdate.end_of_shift = String(end_of_shift);

            try {
                // Используем upsert: если расписание для мастера существует, обновить, иначе создать.
                const updatedSchedule = await prisma.schedule.upsert({
                    where: { master: masterId },
                    update: dataToUpdate,
                    create: {
                        master: masterId,
                        work_days: work_days || [],
                        start_of_shift: start_of_shift || '09:00',
                        end_of_shift: end_of_shift || '18:00',
                    },
                });
                console.log(`[DB] Schedule for master ${masterId} updated/created.`);
                return res.json(updatedSchedule);
            } catch (error: any) {
                console.error(`[DB] Error updating schedule for master ${masterId}:`, error);
                return res.status(500).json({ error: "Не удалось сохранить расписание." });
            }
        });

        // 5. УНИВЕРСАЛЬНЫЙ МАРШРУТ (Catch-all) для SPA
        this.app.get(/.*/, (req: Request, res: Response) => {
            res.sendFile(path.join(buildPath, "index.html"));
        });
    }

    public start(){
        this.httpServer.listen(
        this.port,
        () => console.log(`Listening at :${this.port}`))
    }
}

new SocketServer(3000).start();