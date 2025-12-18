import React from 'react';
import useBooking from '../hooks/useBooking';

const getTodayDate = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const BookingForm = () => {
  const { 
    masters, 
    services, 
    slots, 
    formData, 
    errors, 
    status, 
    handleChange, 
    handleSubmit, 
    schedules 
  } = useBooking();

  // Получаем текущее расписание по выбранному masterId (приводим к строке)
  const currentSchedule = formData.masterId ? schedules[String(formData.masterId)] : null;
  
  // Проверка: работает ли мастер в выбранную дату
  const isWorkingDay = (() => {
    if (!formData.date || !currentSchedule) return true;
    const dayKey = new Date(formData.date).toLocaleDateString('en-US', { weekday: 'short' });
    return currentSchedule.workDays?.includes(dayKey);
  })();

  const buttonStates = {
    idle: { text: 'Записаться', className: 'bg-primary hover:bg-red-700' },
    loading: { text: 'Отправка...', className: 'bg-gray-500 cursor-not-allowed' },
    success: { text: '✅ Успешно!', className: 'bg-green-500' },
    error: { text: '❌ Ошибка', className: 'bg-red-500' },
  };
  
  const btn = !isWorkingDay 
    ? { text: 'Мастер не работает', className: 'bg-gray-400 cursor-not-allowed' } 
    : (buttonStates[status] || buttonStates.idle);

  const daysLabel = (cur) => {
    const map = { Mon: 'Пн', Tue: 'Вт', Wed: 'Ср', Thu: 'Чт', Fri: 'Пт', Sat: 'Сб', Sun: 'Вс' };
    return (cur?.workDays || []).map(k => map[k] || k).join(', ') || 'дни не заданы';
  };

  return (
    <section id="booking" className="py-16 bg-gray-50">
      <div className="container mx-auto px-4 max-w-2xl">
        <h2 className="text-3xl font-bold text-center mb-8 text-secondary">Онлайн запись</h2>

        {/* ИНФОРМАЦИЯ ИЗ БД */}
        {currentSchedule && (
          <div className="mb-6 p-4 rounded-lg bg-white shadow-sm border-l-4 border-red-600 transition-all">
            <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Информация о мастере</h4>
            <div className="text-sm text-gray-700 space-y-1">
              <div><span className="font-semibold text-gray-900">Рабочие дни:</span> {daysLabel(currentSchedule)}</div>
              <div><span className="font-semibold text-gray-900">Часы работы:</span> {currentSchedule.startTime} – {currentSchedule.endTime}</div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <select name="masterId" className="w-full border rounded p-2" value={formData.masterId || ''} onChange={handleChange}>
            <option value="">Выберите мастера</option>
            {masters.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          {errors?.masterId && <p className="text-red-600 text-sm">{errors.masterId}</p>}
          
          <input
            name="date"
            className="w-full border rounded p-2"
            type="date"
            value={formData.date}
            onChange={handleChange}
            min={getTodayDate()}
          />
          
          {formData.date && formData.masterId && !isWorkingDay && (
            <p className="text-red-500 text-sm font-bold bg-red-50 p-2 rounded">В этот день у мастера выходной</p>
          )}
          
          <select name="serviceId" className="w-full border rounded p-2" value={formData.serviceId || ''} onChange={handleChange}>
            <option value="">Выберите услугу</option>
            {services.map(s => <option key={s.id} value={s.id}>{s.name} ({s.price}₽)</option>)}
          </select>

          <select 
            name="slot" 
            className="w-full border rounded p-2" 
            value={formData.slot || ''} 
            onChange={handleChange} 
            disabled={!formData.date || !isWorkingDay || slots.length === 0}
          >
            <option value="">{slots.length > 0 ? 'Выберите время' : 'Нет доступного времени'}</option>
            {slots.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <input name="name" className="w-full border rounded p-2" type="text" placeholder="Ваше имя" value={formData.name || ''} onChange={handleChange} />
          <input name="phone" className="w-full border rounded p-2" type="tel" placeholder="Телефон" value={formData.phone || ''} onChange={handleChange} />

          {errors?.global && <p className="text-red-600 text-sm font-bold">{errors.global}</p>}

          <button 
            type="submit" 
            className={`w-full text-white rounded p-3 font-bold transition-all ${btn.className}`} 
            disabled={status === 'loading' || !isWorkingDay || !formData.slot}
          >
            {btn.text}
          </button>
        </form>
      </div>
    </section>
  );
};

export default BookingForm;