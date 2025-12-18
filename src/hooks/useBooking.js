import { useEffect, useMemo, useState } from 'react';
import { getServices, getSchedules, getOrders } from '../utils/api'; 

// Важно: ID должны совпадать с теми, что в базе для расписаний
const DEFAULT_MASTERS = [
  { id: 1, name: 'Анна' },
  { id: 2, name: 'Ирина' },
  { id: 3, name: 'Елена' },
];

export default function useBooking() {
  const [masters] = useState(DEFAULT_MASTERS);
  const [services, setServices] = useState([]);
  const [schedules, setSchedules] = useState({});
  const [appointments, setAppointments] = useState([]); 
  
  const [formData, setFormData] = useState({
    masterId: '',
    date: new Date().toISOString().split('T')[0], 
    serviceId: '',
    slot: '',
    name: '',
    phone: '',
  });

  const [status, setStatus] = useState('idle');
  const [errors, setErrors] = useState({});

  // 1. Загрузка данных из БД
  useEffect(() => {
    getServices().then(setServices).catch(console.error);
    getOrders().then(setAppointments).catch(console.error);

    getSchedules().then(arr => {
        const obj = {};
        (arr || []).forEach(s => {
          // В базе master хранится как String, в селекте тоже String.
          // Используем String(s.master) для железной уверенности в совпадении ключей
          const mId = String(s.master); 
          obj[mId] = { 
            workDays: s.work_days || [], 
            startTime: s.start_of_shift || '09:00', 
            endTime: s.end_of_shift || '18:00' 
          };
        });
        setSchedules(obj);
    }).catch(console.error);
  }, []);

  // 2. Умная генерация слотов
  const slots = useMemo(() => {
    const mid = String(formData.masterId);
    const dateStr = formData.date;
    
    if (!mid || !dateStr) return [];

    const sch = schedules[mid];
    if (!sch) return [];

    const dayKey = new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' });

    // Проверка на рабочий день
    if (!sch.workDays.includes(dayKey)) return [];

    const toMin = (t) => {
      const m = String(t).match(/^(\d{2}):(\d{2})$/);
      return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    };
    
    const sMin = toMin(sch.startTime);
    const eMin = toMin(sch.endTime);
    if (sMin === null || eMin === null) return [];

    const allPossibleSlots = [];
    for (let m = sMin; m < eMin; m += 30) {
      const hh = String(Math.floor(m / 60)).padStart(2, '0');
      const mm = String(m % 60).padStart(2, '0');
      allPossibleSlots.push(`${hh}:${mm}`);
    }

    const takenSlots = appointments
      .filter(app => {
        const appDate = new Date(app.schedule_date).toISOString().split('T')[0];
        return String(app.master) === mid && 
               appDate === dateStr && 
               app.status !== 'cancelled';
      })
      .map(app => app.schedule_time);

    return allPossibleSlots.filter(s => !takenSlots.includes(s));
  }, [formData.masterId, formData.date, schedules, appointments]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
        ...prev, 
        [name]: value,
        ...( (name==='masterId' || name==='date') ? {slot: ''} : {} ) 
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('loading');
    setErrors({});

    try {
        const res = await fetch('/api/booking', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData), 
        });

        const data = await res.json();
        if (res.ok) {
            setStatus('success');
            setAppointments(prev => [...prev, data]);
            setFormData(p => ({ ...p, slot: '', name: '', phone: '' }));
        } else {
            setErrors({ global: data.error || 'Ошибка записи' });
            setStatus('error');
        }
    } catch {
        setErrors({ global: 'Ошибка сети' });
        setStatus('error');
    }
    setTimeout(() => setStatus('idle'), 3000);
  };

  return { masters, services, slots, formData, errors, status, handleChange, handleSubmit, schedules };
}