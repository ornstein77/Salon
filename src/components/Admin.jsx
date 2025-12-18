import React, { useEffect, useMemo, useState } from 'react';

import styles from '../styles/Admin.module.css';

// Импортируем НОВЫЕ функции для работы с БД
import { 
    getMasters, getOrders, updateOrderStatus, 
    getServices, createService, updateService, deleteService, 
    getSchedules, updateSchedule 
} from '../utils/api'; 

// Константы для localStorage (только для устаревших записей/очистки)
const APPT_KEY = 'simple_appointments'; 

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (Работают с данными, но не с хранилищем) ===

// соответствия дней
const RU_TO_KEY = { 'Пн':'Mon','Вт':'Tue','Ср':'Wed','Чт':'Thu','Пп':'Fri','Сб':'Sat','Вс':'Sun' };
const KEY_TO_RU = { Mon:'Пн', Tue:'Вт', Wed:'Ср', Thu:'Чт', Fri:'Пт', Sat:'Сб', Sun:'Вс' };
const VALID_KEYS = new Set(['Mon','Tue','Wed','Thu','Fri','Sat','Sun']);

// вспомогательное для времени
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function toHHMM(h, m) {
  const hh = String(clamp(h, 0, 23)).padStart(2, '0');
  const mm = String(clamp(m, 0, 59)).padStart(2, '0');
  return `${hh}:${mm}`;
}
function parseHHMM(str) {
  const m = String(str).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return { h: clamp(Number(m[1]) || 0, 0, 23), m: clamp(Number(m[2]) || 0, 0, 59) };
}
function normalizeTime(t) {
  const m = String(t).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  const hh = clamp(Number(m[1]) || 0, 0, 23);
  const mm = clamp(Number(m[2]) || 0, 0, 59);
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}

// нормализация расписания (для локального стейта, где workDays - массив)
function normalizeSchedule(s) {
  const rawDays = Array.isArray(s.workDays) ? s.workDays : [];
  const dayKeys = rawDays
    .map(d => (VALID_KEYS.has(d) ? d : RU_TO_KEY[d] || null))
    .filter(Boolean);
  const uniqueDays = Array.from(new Set(dayKeys)).filter(k => VALID_KEYS.has(k));
  
  // Используем start/end time из объекта s или дефолтные значения
  const start = normalizeTime(s.startTime || s.start_of_shift || '09:00') || '09:00';
  const end = normalizeTime(s.endTime || s.end_of_shift || '18:00') || '18:00';
  
  // barberId или master, если пришло из БД
  return { 
    barberId: s.barberId || s.master, 
    workDays: uniqueDays, 
    startTime: start, 
    endTime: end 
  };
}

// компонент ввода времени
function TimeInput({ value, onChange, placeholder = '00:00', className }) {
  const [text, setText] = useState(value || '');

  useEffect(() => { setText(value || ''); }, [value]);

  const commit = (raw) => {
    const norm = normalizeTime(raw) || '';
    setText(norm);
    onChange?.(norm);
  };

  const handleInput = (e) => {
    let v = e.target.value.replace(/[^\d:]/g, '');
    if (/^\d{3,}$/.test(v)) v = v.slice(0, 4);
    if (/^\d{2}$/.test(v)) v = v + ':';
    const parts = v.split(':');
    const hh = parts[0]?.slice(0, 2) || '';
    const mm = (parts[1] || '').slice(0, 2);
    v = parts.length > 1 ? `${hh}:${mm}` : hh;
    setText(v);
  };

  const handleBlur = () => commit(text);

  const handleKeyDown = (e) => {
    const cur = parseHHMM(text) || parseHHMM(value) || { h: 0, m: 0 };
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = e.ctrlKey ? 10 : 1;
      let h = cur.h;
      let m = cur.m;
      if (e.key === 'ArrowUp') {
        if (e.shiftKey) h = (h + 1) % 24;
        else {
          m += step;
          while (m > 59) { m -= 60; h = (h + 1) % 24; }
        }
      } else {
        if (e.shiftKey) h = (h - 1 + 24) % 24;
        else {
          m -= step;
          while (m < 0) { m += 60; h = (h - 1 + 24) % 24; }
        }
      }
      const next = toHHMM(h, m);
      setText(next);
      onChange?.(next);
    }
  };

  return (
    <input
      className={className}
      inputMode="numeric"
      placeholder={placeholder}
      value={text}
      onChange={handleInput}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      aria-label="Время ЧЧ:ММ"
      title="Введите время в формате ЧЧ:ММ"
    />
  );
}

function formatHours(start, end) {
  const s = start || '';
  const e = end || '';
  if (!s && !e) return 'часы не заданы';
  if (s && e) return `${s}–${e}`;
  return s ? `${s}–?` : `?–${e}`; 
}
// === КОНЕЦ ВСПОМОГАТЕЛЬНЫХ ФУНКЦИЙ ===

export default function Admin() {
  const navigate = (path = '/') => { window.location.href = path; };

  // мастера (предполагаем, что они все еще загружаются из заглушки или отдельного API)
  const [barbers, setBarbers] = useState([]);
  useEffect(() => {
    let mounted = true;
    getMasters().then(list => { if (mounted) setBarbers(list || []); });
    return () => { mounted = false; };
  }, []);

  const [tab, setTab] = useState('records');
  const [items, setItems] = useState([]); // Список записей/заказов
  const [services, setServices] = useState([]); // Список услуг из БД
  const [schedules, setSchedules] = useState({}); // Расписания из БД
  const [query, setQuery] = useState('');

  // toast
  const [toast, setToast] = useState('');

  // auth
  const [passInput, setPassInput] = useState('');
  const expectedPass = process.env.REACT_APP_ADMIN_PASS || 'admin123';
  const [authorized, setAuthorized] = useState(sessionStorage.getItem('admin_ok') === '1');
  const [error, setError] = useState('');


  // === ФУНКЦИИ ЗАГРУЗКИ ДАННЫХ ИЗ API ===

  // Загрузка услуг из БД
  const fetchServices = () => {
    getServices().then(list => {
      if (list) {
        setServices(list.map(s => ({
          id: s.id,
          name: s.name,
          price: s.price, // Цена теперь число!
        })));
      }
    }).catch(console.error);
  };
    
  // Загрузка расписаний из БД
  const fetchSchedules = () => {
    getSchedules().then(arr => {
      const obj = {};
      (Array.isArray(arr) ? arr : []).forEach(s => {
        // Преобразование из Schedule model в формат { barberId: schedule }
        obj[s.master] = { 
          barberId: s.master, 
          workDays: s.work_days || [], 
          startTime: s.start_of_shift || '09:00', 
          endTime: s.end_of_shift || '18:00' 
        };
      });
      // Добавляем дефолтные значения для мастеров без расписания
      for (const b of barbers) {
        if (!obj[b.id]) {
          obj[b.id] = { barberId: b.id, workDays: [], startTime: '09:00', endTime: '18:00' };
        }
      }
      setSchedules(obj);
    }).catch(console.error);
  };

  // Загрузка записей из API (использует стейт barbers и services)
  const fetchOrders = () => {
    getOrders().then(orders => {
        const normalizedList = orders.map(order => {
            // Ищем имя мастера по ID (master хранится в order.master)
            const master = barbers.find(m => String(m.id) === String(order.master));
            
            return {
                id: order.id,
                name: order.name || '',
                phone: order.number_phone || '',
                status: order.status || 'new', 
                
                barberId: order.master,
                barberName: master?.name || `Мастер ID: ${order.master}`, 
                serviceId: order.serviceId,
                
                // Используем name_service и price_service из БД Order
                serviceName: order.name_service || 'Услуга (не указана)',
                totalPrice: order.price_service || 0, 
                
                // schedule_date - это объект Date, schedule_time - строка
                dateStr: order.schedule_date ? new Date(order.schedule_date).toLocaleDateString() : '—', 
                timeStr: order.schedule_time || '—',
                
                note: '', // Заметки (если не хранятся в БД)
            };
        });
        setItems(normalizedList);
    }).catch(console.error);
  }
  // === КОНЕЦ ФУНКЦИЙ ЗАГРУЗКИ ===


  // Основная загрузка данных после авторизации
  useEffect(() => {
    if (!authorized) return;

    // Загружаем услуги и расписания, они нужны для отображения
    fetchServices();
    // Расписания должны загружаться после мастеров, чтобы заполнить дефолты
    if (barbers.length > 0) {
        fetchSchedules();
    }
    
    // Загружаем записи (зависит от услуг и мастеров)
    fetchOrders(); 
    
  }, [authorized, barbers.length, services.length]); 


  // sync по storage: удаляем логику для services и schedules
  useEffect(() => {
    const onStorage = (e) => {
      if (!authorized) return;
      if (e.key === APPT_KEY) { 
        // Если вы использовали APPT_KEY для локального кеша, можно просто перезагрузить 
        // основной список, чтобы убедиться, что он синхронизирован с БД.
        fetchOrders();
      } 
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [authorized]);

  // вход/выход
  const submitPass = (e) => { 
    e && e.preventDefault();
    if (passInput === expectedPass) {
      sessionStorage.setItem('admin_ok', '1');
      setAuthorized(true);
      setError('');
      setPassInput('');
    } else {
      setError('Неверный пароль');
    }
  };
  const logout = () => { 
    sessionStorage.removeItem('admin_ok');
    setAuthorized(false);
    setItems([]);
    setServices([]);
    setSchedules({});
    setQuery('');
    setPassInput('');
    setError('');
    navigate('/');
  };

  // фильтр записей
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(x =>
      (x.name || '').toLowerCase().includes(q) ||
      (x.barberName || '').toLowerCase().includes(q) ||
      (x.serviceName || '').toLowerCase().includes(q) ||
      (x.dateStr || '').toLowerCase().includes(q) ||
      (x.timeStr || '').toLowerCase().includes(q)
    );
  }, [items, query]);

  // === ЛОГИКА ОБРАБОТКИ ЗАПИСЕЙ ===
  
  const setStatus = (id, status) => {
    updateOrderStatus(id, status).then(updatedOrder => {
        if (updatedOrder) {
            // Обновляем локальный стейт, используя данные с сервера
            setItems(prevItems => prevItems.map(x => 
                x.id === updatedOrder.id ? { ...x, status: updatedOrder.status } : x
            ));
            setToast(`Заказ ${id} обновлен до: ${updatedOrder.status}`);
            clearTimeout(window.__admin_toast_timer);
            window.__admin_toast_timer = setTimeout(() => setToast(''), 2500);
            
        } else {
            setToast('Ошибка обновления статуса!');
            clearTimeout(window.__admin_toast_timer);
            window.__admin_toast_timer = setTimeout(() => setToast(''), 2500);
        }
    });
  };

  const removeItem = (id) => {
    if (!window.confirm('Пометить как Отменено?')) return;
    setStatus(id, 'cancelled'); 
  };
  
  const markDone = (id) => {
    if (!window.confirm('Пометить как Выполнено?')) return;
    setStatus(id, 'completed');
  };
  
  const updateNote = (id, note) => {
    // TODO: В идеале, нужно создать PATCH /api/orders/:id/note для сохранения в БД
    const list = items.map(x => x.id === id ? { ...x, note } : x);
    setItems(list);
  };
  
  const clearAll = () => {
    if (!window.confirm('Очистить локальный кеш записей? (Это не удалит записи из БД)')) return;
    // Очистка только локального legacy кеша
    localStorage.removeItem(APPT_KEY);
    fetchOrders(); // Обновляем с сервера
  };
  // === КОНЕЦ ЛОГИКИ ОБРАБОТКИ ЗАПИСЕЙ ===


  // === ЛОГИКА УПРАВЛЕНИЯ УСЛУГАМИ (Через API) ===
  
  const reloadServices = fetchServices; // <-- Используем API-загрузчик
  
  const addService = async (svc) => {
    // Вызываем API для создания услуги
    const newService = await createService({ name: svc.name, price: Number(svc.price) });
    if (newService) {
      setToast(`Услуга "${newService.name}" добавлена.`);
      reloadServices(); 
    } else {
      setToast('Ошибка добавления услуги.');
    }
    clearTimeout(window.__admin_toast_timer);
    window.__admin_toast_timer = setTimeout(() => setToast(''), 2500);
  };
  
  const updateServiceLogic = async (id, patch) => {
    const patchData = { 
      name: patch.name, 
      price: patch.price != null ? Number(patch.price) : undefined 
    };
    const updated = await updateService(id, patchData);
    if (updated) {
      setToast(`Услуга "${updated.name}" обновлена.`);
      reloadServices(); 
    } else {
      setToast('Ошибка обновления услуги.');
    }
    clearTimeout(window.__admin_toast_timer);
    window.__admin_toast_timer = setTimeout(() => setToast(''), 2500);
  };
  
  const deleteServiceLogic = async (id) => {
    if (!window.confirm('Удалить услугу?')) return;
    const success = await deleteService(id);
    if (success) {
      setToast('Услуга удалена.');
      reloadServices(); 
    } else {
      setToast('Ошибка удаления услуги.');
    }
    clearTimeout(window.__admin_toast_timer);
    window.__admin_toast_timer = setTimeout(() => setToast(''), 2500);
  };

  // === ЛОГИКА УПРАВЛЕНИЯ РАСПИСАНИЯМИ (Через API) ===

  const updateScheduleFor = async (barberId, patch) => {
    const cur = schedules[barberId] || { barberId, workDays: [], startTime: '09:00', endTime: '18:00' };
    const next = normalizeSchedule({ ...cur, ...patch, barberId });
    
    // Подготавливаем данные для API (имена полей из Schedule model)
    const apiPatch = {
      work_days: next.workDays,
      start_of_shift: next.startTime,
      end_of_shift: next.endTime,
    };

    const updated = await updateSchedule(barberId, apiPatch); 

    if (updated) {
      // Обновляем локальный стейт только после успешного ответа API
      const obj = { 
        ...schedules, 
        [updated.master]: { 
          barberId: updated.master, 
          workDays: updated.work_days, 
          startTime: updated.start_of_shift, 
          endTime: updated.end_of_shift
        } 
      };
      setSchedules(obj);
      setToast(`Расписание мастера ${barberId} обновлено`);
    } else {
      setToast('Ошибка сохранения расписания');
    }

    clearTimeout(window.__admin_toast_timer);
    window.__admin_toast_timer = setTimeout(() => setToast(''), 2500);
  };
  
  const setStartFor = (barberId, val) => updateScheduleFor(barberId, { startTime: normalizeTime(val) || '09:00' });
  const setEndFor = (barberId, val) => updateScheduleFor(barberId, { endTime: normalizeTime(val) || '18:00' });
  
  const toggleWorkDay = (barberId, dayKeyOrRu) => { 
    const key = VALID_KEYS.has(dayKeyOrRu) ? dayKeyOrRu : (RU_TO_KEY[dayKeyOrRu] || dayKeyOrRu);
    const cur = schedules[barberId] || { barberId, workDays: [], startTime: '09:00', endTime: '18:00' };
    const set = new Set(cur.workDays || []);
    if (set.has(key)) set.delete(key); else set.add(key);
    updateScheduleFor(barberId, { workDays: Array.from(set) });
  };


  // форма услуг
  const [svcForm, setSvcForm] = useState({ id: null, name: '', price: '' });
  const startAddService = () => setSvcForm({ id: null, name: '', price: '' });
  const startEditService = (s) => setSvcForm({ id: s.id, name: s.name || '', price: String(s.price ?? '') });
  const submitServiceForm = (e) => { 
    e.preventDefault();
    const name = (svcForm.name || '').trim();
    const price = Number(svcForm.price); // Цена теперь Number!
    if (!name) return;
    if (!Number.isFinite(price) || price < 0) return;

    if (svcForm.id == null) addService({ id: Date.now(), name, price });
    else updateServiceLogic(svcForm.id, { name, price });

    setSvcForm({ id: null, name: '', price: '' });
  };

  // дни недели
  const daysOfWeek = [
    { key: 'Mon', label: KEY_TO_RU.Mon },
    { key: 'Tue', label: KEY_TO_RU.Tue },
    { key: 'Wed', label: KEY_TO_RU.Wed },
    { key: 'Thu', label: KEY_TO_RU.Thu },
    { key: 'Fri', label: KEY_TO_RU.Fri },
    { key: 'Sat', label: KEY_TO_RU.Sat },
    { key: 'Sun', label: KEY_TO_RU.Sun },
  ];

  // render
  if (!authorized) {
    return (
      <main className={styles.container}>
        {/* ВОССТАНОВЛЕННАЯ ЛОГИКА ВХОДА */}
        <div className={styles.authContainer}> 
          <form className={styles.authBox} onSubmit={submitPass}>
            <h2 className={styles.authTitle}>Вход в Админ панель</h2>
            {error && <div className={styles.authError}>{error}</div>}
            <input
              className={styles.input}
              type="password"
              placeholder="Пароль администратора"
              value={passInput}
              onChange={(e) => setPassInput(e.target.value)}
            />
            <button className={styles.btn} type="submit">Войти</button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title} onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>Админ панель</h1>

        <div className={styles.tabRow}>
          <button className={`${styles.tabBtn} ${tab === 'records' ? styles.activeTab : ''}`} onClick={() => setTab('records')}>Записи</button>
          <button className={`${styles.tabBtn} ${tab === 'inbox' ? styles.activeTab : ''}`} onClick={() => setTab('inbox')}>Входящие</button>
          <button className={`${styles.tabBtn} ${tab === 'services' ? styles.activeTab : ''}`} onClick={() => setTab('services')}>Услуги</button>
          <button className={`${styles.tabBtn} ${tab === 'schedules' ? styles.activeTab : ''}`} onClick={() => setTab('schedules')}>Расписания</button>
        </div>

        <div className={styles.headerActions}>
          <input
            className={styles.search}
            placeholder="Поиск: клиент, парикмахер, услуга, дата…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className={styles.btn} onClick={logout}>Выйти</button>
          <button className={styles.btnDanger} onClick={clearAll}>Очистить локальный кеш</button>
        </div>
      </header>

      <section className={styles.content}>
        {/* ТАБ ЗАПИСИ */}
        {tab === 'records' && (
          <section className={styles.list}>
            {/* Логика отображения записей */}
            {filtered.length === 0 ? (
              <div className={styles.empty}><p>Нет записей.</p></div>
            ) : (
              filtered.map(item => (
                <article key={item.id} className={styles.card}>
                  <div className={styles.rowTop}>
                    <div className={styles.kv}>
                      {item.dateStr && <div className={styles.tag}>{item.dateStr}</div>}
                      {item.timeStr && <div className={styles.tag}>{item.timeStr}</div>}
                      {item.status && <div className={styles.statusTag}>{item.status}</div>}
                    </div>
                    <div className={styles.mainInfo}>
                      <div className={styles.line}><span className={styles.label}>Клиент:</span><span className={styles.value}>{item.name || '-'}</span></div>
                      <div className={styles.line}><span className={styles.label}>Телефон:</span><span className={styles.value}>{item.phone || '-'}</span></div>
                      <div className={styles.line}>
                        <span className={styles.label}>Парикмахер:</span>
                        <span className={styles.value}>
                          {item.barberName} 
                          <span style={{ fontSize: '0.8em', color: '#888', marginLeft: '8px' }}>
                            (ID: {item.barberId})
                          </span>
                        </span>
                      </div>
                      <div className={styles.line}><span className={styles.label}>Услуга:</span><span className={styles.value}>{item.serviceName || '-'}</span></div>
                    </div>
                    <div className={styles.priceBox}><div className={styles.price}>{item.totalPrice ? `${item.totalPrice} ₽` : '-'}</div></div>
                  </div>

                  <div className={styles.noteRow}>
                    <label className={styles.noteLabel}>Заметка</label>
                    <textarea className={styles.note} rows={2} value={item.note || ''} onChange={(e) => updateNote(item.id, e.target.value)} />
                  </div>

                  <div className={styles.actions}>
                    <button className={styles.btn} onClick={() => setStatus(item.id, 'confirmed')}>Подтвердить</button>
                    <button className={styles.btn} onClick={() => markDone(item.id)}>Услуга оказана</button>
                    <button className={styles.btnDanger} onClick={() => removeItem(item.id)}>Отменить</button>
                  </div>
                </article>
              ))
            )}
          </section>
        )}

        {/* ТАБ ВХОДЯЩИЕ */}
        {tab === 'inbox' && (
          <section className={styles.list}>
            {/* Логика отображения входящих */}
            {items.filter(i => !i.status || i.status === 'new').length === 0 ? (
              <div className={styles.empty}><p>Нет входящих заявок.</p></div>
            ) : (
              items.filter(i => !i.status || i.status === 'new').map(item => (
                <article key={item.id} className={styles.card}>
                  <div className={styles.rowTop}>
                    <div className={styles.kv}>
                      {item.dateStr && <div className={styles.tag}>{item.dateStr}</div>}
                      {item.timeStr && <div className={styles.tag}>{item.timeStr}</div>}
                    </div>
                    <div className={styles.mainInfo}>
                      <div className={styles.line}><span className={styles.label}>Клиент:</span><span className={styles.value}>{item.name}</span></div>
                      <div className={styles.line}><span className={styles.label}>Телефон:</span><span className={styles.value}>{item.phone}</span></div>
                      <div className={styles.line}><span className={styles.label}>Парикмахер:</span><span className={styles.value}>{item.barberName}</span></div>
                      <div className={styles.line}><span className={styles.label}>Услуга:</span><span className={styles.value}>{item.serviceName}</span></div>
                    </div>
                    <div className={styles.priceBox}><div className={styles.price}>{item.totalPrice ? `${item.totalPrice} ₽` : '-'}</div></div>
                  </div>

                  <div className={styles.actions}>
                    <button className={styles.btn} onClick={() => setStatus(item.id, 'confirmed')}>Подтвердить</button>
                    <button className={styles.btnDanger} onClick={() => setStatus(item.id, 'cancelled')}>Отклонить</button>
                  </div>
                </article>
              ))
            )}
          </section>
        )}

        {/* ТАБ УСЛУГИ (Service) */}
        {tab === 'services' && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Услуги</h2>
            </div>

            <form className={styles.serviceForm} onSubmit={submitServiceForm}>
              <input
                placeholder="Название"
                value={svcForm.name}
                onChange={e => setSvcForm({ ...svcForm, name: e.target.value })}
                className={styles.input}
              />
              <input
                type="number"
                placeholder="Цена"
                value={svcForm.price}
                onChange={e => setSvcForm({ ...svcForm, price: e.target.value })}
                className={styles.input}
                min="0"
                step="1"
              />
              <div className={styles.actions}>
                <button className={styles.btn} type="submit">{svcForm.id ? 'Сохранить' : 'Добавить'}</button>
                {svcForm.id && (
                  <button
                    className={styles.btnDanger}
                    type="button"
                    onClick={() => setSvcForm({ id: null, name: '', price: '' })}
                  >
                    Отмена
                  </button>
                )}
              </div>
            </form>

            <div className={styles.servicesList}>
              {services.length === 0 ? (
                <div className={styles.empty}><p>Список услуг пуст. Добавьте услуги.</p></div>
              ) : (
                services.map(s => (
                  <div key={s.id} className={styles.serviceRow}>
                    <div>
                      <div className={styles.value}>{s.name}</div>
                      <div className={styles.label}>{s.price} ₽</div>
                    </div>
                    <div className={styles.serviceActions}>
                      <button className={styles.btn} onClick={() => startEditService(s)}>Изменить</button>
                      <button className={styles.btnDanger} onClick={() => deleteServiceLogic(s.id)}>Удалить</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* ТАБ РАСПИСАНИЯ (Schedule) */}
        {tab === 'schedules' && (
          <section className={styles.panel}>
            <h2>Расписания мастеров</h2>
            <p className={styles.noteSmall}>Отметьте рабочие дни и рабочее время</p>
            <div className={styles.schedulesList}>
              {barbers.map(b => {
                const cur = schedules[b.id] || { barberId: b.id, workDays: [], startTime: '09:00', endTime: '18:00' };
                return (
                  <div key={b.id} className={styles.scheduleCard}>
                    <div className={styles.rowTop}>
                      <div className={styles.mainInfo}>
                        <div className={styles.line}>
                          <span className={styles.label}>Мастер:</span>
                          <span className={styles.value}>
                            {b.name} <small style={{ opacity: 0.6 }}>#{b.id}</small>
                          </span>
                        </div>
                        <div className={styles.line}><span className={styles.label}>Рабочие дни:</span>
                          <div className={styles.daysRow}>
                            {daysOfWeek.map(d => (
                              <button
                                key={d.key}
                                type="button"
                                className={`${styles.dayBtn} ${cur.workDays?.includes(d.key) ? styles.dayActive : styles.dayInactive}`}
                                onClick={() => toggleWorkDay(b.id, d.key)}
                                aria-pressed={cur.workDays?.includes(d.key)}
                                title={d.label}
                              >
                                {d.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className={styles.line}>
                          <span className={styles.label}>Начало:</span>
                          <TimeInput
                            className={styles.input}
                            placeholder="09:00"
                            value={cur.startTime || ''}
                            onChange={(v) => setStartFor(b.id, v)}
                          />
                        </div>
                        <div className={styles.line}>
                          <span className={styles.label}>Конец:</span>
                          <TimeInput
                            className={styles.input}
                            placeholder="18:00"
                            value={cur.endTime || ''}
                            onChange={(v) => setEndFor(b.id, v)}
                          />
                        </div>
                      </div>
                      <div className={styles.priceBox}>
                        <div className={styles.priceSmall}>
                          {formatHours(cur.startTime, cur.endTime)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Кнопка "Сохранить все" больше не нужна, так как сохранение происходит при каждом изменении поля */}
          </section>
        )}
      </section>

      {toast && <div className={styles.toast}>{toast}</div>}
    </main>
  );
}