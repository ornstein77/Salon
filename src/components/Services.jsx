import React, { useEffect, useState } from 'react';
import { getServices } from '../utils/api'; // Проверь путь к файлу api.js

// Витринные данные для сопоставления иконок и описаний
const DEFAULT_SHOWCASE = [
  { name: 'Стрижка', desc: 'Классическая, мужская, женская, детская', icon: '✂️' },
  { name: 'Окрашивание', desc: 'Балаяж, мелирование, тонирование', icon: '🎨' },
  { name: 'Укладка', desc: 'Повседневная, вечерняя, свадебная', icon: '💇‍♀️' },
  { name: 'Визаж', desc: 'Дневной, вечерний, коррекция бровей', icon: '💄' },
];

const Services = () => {
  const [selected, setSelected] = useState(null);
  const [dbServices, setDbServices] = useState([]);
  const [loading, setLoading] = useState(true);

  // 1. Загружаем услуги из БД через API
  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await getServices();
        setDbServices(data);
      } catch (error) {
        console.error("Ошибка при загрузке услуг:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // 2. Логика объединения: ищем совпадения по имени, чтобы прикрепить иконку и описание
  const mergedServices = dbServices.map(service => {
    // Ищем в витрине объект с таким же названием (или похожим)
    const showcaseMatch = DEFAULT_SHOWCASE.find(
      item => item.name.toLowerCase() === service.name.toLowerCase()
    );

    return {
      id: service.id,
      name: service.name,
      // Если нашли совпадение в DEFAULT_SHOWCASE — берем иконку оттуда, иначе ставим дефолт
      desc: showcaseMatch?.desc || 'Профессиональное обслуживание и индивидуальный подход',
      icon: showcaseMatch?.icon || '✨',
      price: service.price
    };
  });

  // 3. Если данных еще нет (загрузка), можно показать заглушку или пустой экран
  if (loading) {
    return <section className="py-16 text-center">Загрузка услуг...</section>;
  }

  return (
    <section id="услуги" className="py-16 bg-light">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl font-bold text-center mb-12 text-secondary">Наши услуги</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {mergedServices.length > 0 ? (
            mergedServices.map(s => (
              <div
                key={s.id}
                onClick={() => setSelected(selected === s.id ? null : s.id)}
                className={`p-6 rounded-xl shadow-md cursor-pointer transition-all duration-300 transform hover:-translate-y-1 
                  ${selected === s.id ? 'ring-4 ring-primary bg-white scale-105' : 'bg-white'}`}
              >
                <div className="text-4xl mb-3">{s.icon}</div>
                <h3 className="font-bold text-lg">{s.name}</h3>
                <p className="text-gray-600 text-sm mb-2">{s.desc}</p>
                <p className="font-semibold text-primary">от {s.price} ₽</p>
              </div>
            ))
          ) : (
            <p className="text-center col-span-full">Услуги временно недоступны</p>
          )}
        </div>
      </div>
    </section>
  );
};

export default Services;