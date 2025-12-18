// api.js
const API_BASE = '/api';
// **1. Данные о мастерах (статическая заглушка)**
export const getMasters = () => Promise.resolve([
  { id: 1, name: 'Анна' },
  { id: 2, name: 'Ирина' },
  { id: 3, name: 'Елена' },
]);

// **2. Услуги по мастеру (УДАЛЕНА СТАТИЧЕСКАЯ ЗАГЛУШКА)**
// Хук useBooking теперь использует getServices() ниже.

// **3. Доступные слоты (статическая заглушка)**
export const getAvailableSlots = (masterId, serviceId, date = new Date()) => {
  const slots = [];
  const start = 10;
  const end = 19;
  for (let h = start; h < end; h++) {
    for (let m of [0, 30]) {
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      
      if (!((h === 12 && m === 0) || (h === 15 && m === 30))) {
        slots.push({ time: timeStr, available: true });
      }
    }
  }
  return Promise.resolve(slots);
};


// **4. [API] Получение всех записей из БД (для Admin.jsx)**
export const getOrders = async () => {
    try {
        const response = await fetch('/api/orders');
        if (!response.ok) throw new Error('Failed to fetch orders from server');
        return await response.json();
    } catch (error) {
        console.error("Error fetching orders:", error);
        return [];
    }
};

// **5. [API] Обновление статуса записи в БД (для Admin.jsx)**
export const updateOrderStatus = async (orderId, newStatus) => {
    try {
        const response = await fetch(`/api/orders/${orderId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus }),
        });
        if (!response.ok) throw new Error('Failed to update status');
        return await response.json();
    } catch (error) {
        console.error(`Error updating order ${orderId} status:`, error);
        return null;
    }
};

// **6. [API] Получение всех услуг из БД (для Admin.jsx и useBooking.js)**
export async function getServices() {
    try {
        const response = await fetch(`${API_BASE}/services`);
        if (!response.ok) throw new Error('Failed to fetch services');
        return await response.json();
    } catch (error) {
        console.error("API Error: getServices", error);
        return [];
    }
}

export async function createService(serviceData) {
    try {
        const response = await fetch(`${API_BASE}/services`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(serviceData),
        });
        if (!response.ok) throw new Error('Failed to create service');
        return await response.json();
    } catch (error) {
        console.error("API Error: createService", error);
        return null;
    }
}

export async function updateService(id, patchData) {
    try {
        const response = await fetch(`${API_BASE}/services/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patchData),
        });
        if (!response.ok) throw new Error('Failed to update service');
        return await response.json();
    } catch (error) {
        console.error("API Error: updateService", error);
        return null;
    }
}

export async function deleteService(id) {
    try {
        const response = await fetch(`${API_BASE}/services/${id}`, {
            method: 'DELETE',
        });
        if (response.status === 204) return true; // Успешное удаление
        if (!response.ok) throw new Error('Failed to delete service');
        return false;
    } catch (error) {
        console.error("API Error: deleteService", error);
        return false;
    }
}


// === НОВЫЕ ФУНКЦИИ ДЛЯ РАСПИСАНИЙ (Schedules) ===

export async function getSchedules() {
    try {
        const response = await fetch(`${API_BASE}/schedules`);
        if (!response.ok) throw new Error('Failed to fetch schedules');
        return await response.json();
    } catch (error) {
        console.error("API Error: getSchedules", error);
        return [];
    }
}

export async function updateSchedule(masterId, patchData) {
    try {
        const response = await fetch(`${API_BASE}/schedules/${masterId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patchData),
        });
        if (!response.ok) throw new Error('Failed to update schedule');
        return await response.json();
    } catch (error) {
        console.error("API Error: updateSchedule", error);
        return null;
    }
}