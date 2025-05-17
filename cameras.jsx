const CameraTerminal = () => {
    const [cameras, setCameras] = React.useState([]);
    const [filteredCameras, setFilteredCameras] = React.useState([]);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [searchType, setSearchType] = React.useState('IP');
    const [selectedCamera, setSelectedCamera] = React.useState(null);
    const [currentPage, setCurrentPage] = React.useState(1);
    const [error, setError] = React.useState('');
    const [showTools, setShowTools] = React.useState(false);
    const [isDetectionOn, setIsDetectionOn] = React.useState(false);
    const [isLaserOn, setIsLaserOn] = React.useState(false);
    const iframeRef = React.useRef(null);
    const canvasRef = React.useRef(null);
    const camerasPerPage = 10;

    React.useEffect(() => {
        const loadCameras = async () => {
            try {
                const res = await fetch('cameras.json');
                if (!res.ok) throw new Error('Ошибка загрузки данных камер');
                const data = await res.json();
                setCameras(data);
                setFilteredCameras(data);
            } catch (err) {
                setError('Не удалось загрузить камеры: ' + err.message);
            }
        };
        loadCameras();
    }, []);

    React.useEffect(() => {
        const filtered = cameras.filter(cam => 
            cam.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
            cam.id.toString().includes(searchQuery)
        );
        setFilteredCameras(filtered);
        setCurrentPage(1);
    }, [searchQuery, cameras]);

    const checkStreamAvailability = async (url) => {
        try {
            if (url.includes('ivideon.com')) {
                return true;
            }
            const res = await fetch(url, { method: 'HEAD', mode: 'no-cors' });
            return true;
        } catch (err) {
            console.error('Ошибка проверки потока:', err);
            return false;
        }
    };

    const setCamera = async (cam) => {
        if (!cam.stream || !cam.stream.startsWith('http')) {
            setError('Недопустимый URL потока');
            return;
        }
        const isAvailable = await checkStreamAvailability(cam.stream);
        if (!isAvailable) {
            setError(`Камера недоступна: проблема с потоком ${cam.stream}`);
            return;
        }
        setSelectedCamera(cam.stream);
        setError('');
    };

    // Фейковая детекция
    React.useEffect(() => {
        let animationFrameId;
        const fakeDetections = [];

        const runFakeDetection = () => {
            if (!isDetectionOn || !iframeRef.current || !canvasRef.current) return;

            const iframe = iframeRef.current;
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');

            // Синхронизируем размеры canvas с iframe
            const rect = iframe.getBoundingClientRect();
            canvas.width = rect.width;
            canvas.height = rect.height;

            // Генерируем фейковые рамки
            const generateFakeBox = () => {
                const size = Math.random() * 50 + 50; // Квадратный размер от 50 до 100px
                const x = Math.random() * (canvas.width - size);
                const y = Math.random() * (canvas.height - size);
                const type = Math.random() > 0.5 ? 'person' : 'car';
                const score = Math.random() * 0.5 + 0.5; // Уверенность от 50% до 100%
                return { x, y, size, type, score, life: 100 }; // life для анимации исчезновения
            };

            // Добавляем новую рамку каждые 2 секунды
            if (Math.random() < 0.016) { // Примерно раз в 2 секунды (60 FPS)
                fakeDetections.push(generateFakeBox());
            }

            const draw = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                fakeDetections.forEach((box, index) => {
                    box.life -= 1;
                    if (box.life <= 0) {
                        fakeDetections.splice(index, 1);
                        return;
                    }

                    const opacity = box.life / 100;
                    ctx.strokeStyle = box.type === 'person' ? `rgba(255, 0, 0, ${opacity})` : `rgba(0, 255, 0, ${opacity})`;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(box.x, box.y, box.size, box.size);
                    ctx.fillStyle = ctx.strokeStyle;
                    ctx.font = '14px Inter';
                    ctx.fillText(`${box.type} (${Math.round(box.score * 100)}%)`, box.x, box.y - 5);
                });

                animationFrameId = requestAnimationFrame(draw);
            };
            draw();
        };

        if (isDetectionOn) {
            runFakeDetection();
        }

        return () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            fakeDetections.length = 0;
        };
    }, [isDetectionOn]);

    const handleMouseMove = (e) => {
        if (!isLaserOn || !canvasRef.current || !iframeRef.current) return;

        const canvas = canvasRef.current;
        const iframe = iframeRef.current;
        const rect = iframe.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Ограничиваем координаты
        const boundedX = Math.max(0, Math.min(x, rect.width));
        const boundedY = Math.max(0, Math.min(y, rect.height));

        // Определяем ближайший край
        const edges = [
            { name: 'left', value: boundedX, startX: 0, startY: boundedY },
            { name: 'right', value: rect.width - boundedX, startX: rect.width, startY: boundedY },
            { name: 'top', value: boundedY, startX: boundedX, startY: 0 },
            { name: 'bottom', value: rect.height - boundedY, startX: boundedX, startY: rect.height }
        ];
        const closestEdge = edges.reduce((min, edge) => edge.value < min.value ? edge : min, edges[0]);

        // Вычисляем угол и длину луча
        const dx = boundedX - closestEdge.startX;
        const dy = boundedY - closestEdge.startY;
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        const length = Math.hypot(dx, dy);

        // Обновляем позицию и угол луча
        const laser = document.querySelector('.laser-beam');
        if (laser) {
            laser.style.left = `${closestEdge.startX}px`;
            laser.style.top = `${closestEdge.startY}px`;
            laser.style.transform = `rotate(${angle}deg)`;
            laser.style.height = `${length}px`;
        }

        // Рисуем точку прицела
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
        ctx.beginPath();
        ctx.arc(boundedX, boundedY, 3, 0, 2 * Math.PI);
        ctx.fill();
    };

    const handleSearch = (e) => {
        setSearchQuery(e.target.value);
    };

    const handleSearchType = (e) => {
        setSearchType(e.target.value);
    };

    const handleSearchSubmit = () => {
        setError('Функция поиска по IP/телефону/лицу в разработке');
    };

    const toggleTools = () => {
        setShowTools(!showTools);
    };

    const toggleDetection = () => {
        setIsDetectionOn(!isDetectionOn);
    };

    const toggleLaser = () => {
        setIsLaserOn(!isLaserOn);
    };

    const handlePageChange = (page) => {
        setCurrentPage(page);
    };

    const indexOfLastCamera = currentPage * camerasPerPage;
    const indexOfFirstCamera = indexOfLastCamera - camerasPerPage;
    const currentCameras = filteredCameras.slice(indexOfFirstCamera, indexOfLastCamera);
    const totalPages = Math.ceil(filteredCameras.length / camerasPerPage);

    return (
        <div className="relative min-h-screen">
            <div className="content-container">
                <header className="header animate-fade-in">
                    ⟦ MΨ ⟧ MrPsyhovan | OSINT Терминал Камер РФ
                </header>
                <main className="main-container">
                    <div className="sidebar animate-slide-up">
                        <h3 className="sidebar-title">Поиск цели</h3>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={handleSearch}
                            placeholder="IP / номер / лицо / локация"
                            className="search-input"
                        />
                        <select value={searchType} onChange={handleSearchType} className="search-select">
                            <option value="IP">Тип: IP</option>
                            <option value="Phone">Тип: Телефон</option>
                            <option value="Face">Тип: Лицо</option>
                            <option value="Location">Тип: Локация</option>
                        </select>
                        <button onClick={handleSearchSubmit} className="search-btn">
                            Начать поиск
                        </button>
                        <h3 className="sidebar-title">Доступные камеры</h3>
                        <div className="camera-list">
                            {currentCameras.length > 0 ? (
                                currentCameras.map((cam) => (
                                    <a
                                        key={cam.id}
                                        className="camera-link"
                                        onClick={() => setCamera(cam)}
                                    >
                                        Камера #{cam.id} — {cam.location}
                                    </a>
                                ))
                            ) : (
                                <p className="no-cameras">Камеры не найдены</p>
                            )}
                        </div>
                        {totalPages > 1 && (
                            <div className="pagination">
                                {Array.from({ length: totalPages }, (_, i) => (
                                    <button
                                        key={i + 1}
                                        className={`pagination-btn ${currentPage === i + 1 ? 'active' : ''}`}
                                        onClick={() => handlePageChange(i + 1)}
                                    >
                                        {i + 1}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="content animate-slide-up">
                        {!selectedCamera ? (
                            <div>
                                <h3 className="content-title">Google Карта</h3>
                                <iframe
                                    src="https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d24465.79273382098!2d37.6173!3d55.7558!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sru!2sru!4v1715765241731"
                                    className="map-frame"
                                    allowFullScreen
                                    loading="lazy"
                                ></iframe>
                            </div>
                        ) : (
                            <div>
                                <h3 className="content-title">Поток с камеры</h3>
                                <div className="camera-container">
                                    <div className="camera-wrapper">
                                        <iframe
                                            ref={iframeRef}
                                            src={selectedCamera}
                                            className="camera-frame"
                                            title="Поток камеры"
                                            allowFullScreen
                                        ></iframe>
                                        <canvas
                                            ref={canvasRef}
                                            className="camera-canvas"
                                            onMouseMove={handleMouseMove}
                                            onTouchMove={(e) => {
                                                e.preventDefault();
                                                const touch = e.touches[0];
                                                handleMouseMove(touch);
                                            }}
                                        ></canvas>
                                        <div className={`laser-beam ${isLaserOn ? 'active' : ''}`}></div>
                                    </div>
                                </div>
                                <button onClick={toggleTools} className="tools-toggle-btn">
                                    {showTools ? 'Скрыть инструменты' : 'Показать инструменты'}
                                </button>
                                {showTools && (
                                    <div className="camera-tools">
                                        <button
                                            onClick={toggleDetection}
                                            className="tool-btn"
                                        >
                                            {isDetectionOn ? 'Выкл. детекцию' : 'Вкл. детекцию'}
                                        </button>
                                        <button
                                            onClick={toggleLaser}
                                            className="tool-btn"
                                        >
                                            {isLaserOn ? 'Выкл. лазер' : 'Вкл. лазер'}
                                        </button>
                                        <button className="tool-btn">Наведение</button>
                                        <button className="tool-btn">Масштаб</button>
                                        <button className="tool-btn">Снимок</button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </main>
                {error && (
                    <div className={`error-message ${error ? 'active' : ''}`} data-error={error}></div>
                )}
            </div>
        </div>
    );
};

ReactDOM.render(<CameraTerminal />, document.getElementById('root'));