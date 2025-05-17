document.addEventListener('DOMContentLoaded', () => {
    class DatePicker {
        constructor() {
            this.modal = document.getElementById('datePickerModal');
            this.modalTitle = document.getElementById('modalTitle');
            this.checkInInput = document.querySelector('.check-in');
            this.checkOutInput = document.querySelector('.check-out');
            this.calendar1 = document.getElementById('calendar1');
            this.calendar2 = document.getElementById('calendar2');
            this.closeButton = document.querySelector('.close-button');
            this.prevMonthBtn = document.querySelector('.prev-month');
            this.nextMonthBtn = document.querySelector('.next-month');

            this.currentDate = new Date();
            this.selectedCheckIn = null;
            this.selectedCheckOut = null;
            this.isSelectingCheckIn = true;

            this.initializeEventListeners();
            this.updateCalendars();
        }

        initializeEventListeners() {
            // Open modal events
            this.checkInInput.addEventListener('click', () => this.openModal('check-in'));
            this.checkOutInput.addEventListener('click', () => this.openModal('check-out'));

            // Close modal events
            this.closeButton.addEventListener('click', () => this.closeModal());
            window.addEventListener('click', (e) => {
                if (e.target === this.modal) this.closeModal();
            });

            // Navigation events
            this.prevMonthBtn.addEventListener('click', () => this.navigateMonth(-1));
            this.nextMonthBtn.addEventListener('click', () => this.navigateMonth(1));
        }

        openModal(type) {
            this.modal.classList.add('active');
            this.isSelectingCheckIn = type === 'check-in';
            this.modalTitle.textContent = `Selecciona tu fecha de ${this.isSelectingCheckIn ? 'check-in' : 'check-out'}`;
            
            if (this.isSelectingCheckIn) {
                this.selectedCheckIn = null;
                this.selectedCheckOut = null;
                this.updateCalendars();
            }
        }

        closeModal() {
            this.modal.classList.remove('active');
        }

        navigateMonth(direction) {
            this.currentDate.setMonth(this.currentDate.getMonth() + direction);
            this.updateCalendars();
        }

        updateCalendars() {
            const month1 = new Date(this.currentDate);
            const month2 = new Date(this.currentDate);
            month2.setMonth(month2.getMonth() + 1);

            this.renderCalendar(this.calendar1, month1);
            this.renderCalendar(this.calendar2, month2);
        }

        renderCalendar(calendar, date) {
            const year = date.getFullYear();
            const month = date.getMonth();
            
            // Update header
            const monthName = date.toLocaleString('es-ES', { month: 'long' });
            calendar.querySelector('.calendar-header h3').textContent = `${monthName} ${year}`;

            // Clear previous days
            const daysContainer = calendar.querySelector('.days');
            daysContainer.innerHTML = '';

            // Calculate first day of month and total days
            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            const totalDays = lastDay.getDate();
            
            // Add empty cells for days before first day of month
            let firstDayIndex = firstDay.getDay() || 7; // Convert Sunday (0) to 7
            for (let i = 1; i < firstDayIndex; i++) {
                this.createEmptyDay(daysContainer);
            }

            // Add days of month
            for (let day = 1; day <= totalDays; day++) {
                this.createDay(daysContainer, new Date(year, month, day));
            }
        }

        createEmptyDay(container) {
            const dayElement = document.createElement('div');
            dayElement.className = 'day';
            container.appendChild(dayElement);
        }

        createDay(container, date) {
            const dayElement = document.createElement('div');
            dayElement.className = 'day';
            dayElement.textContent = date.getDate();

            // Add today class
            if (this.isToday(date)) {
                dayElement.classList.add('today');
            }

            // Add selected and range classes
            if (this.selectedCheckIn && this.isSameDay(date, this.selectedCheckIn)) {
                dayElement.classList.add('selected');
            }
            if (this.selectedCheckOut && this.isSameDay(date, this.selectedCheckOut)) {
                dayElement.classList.add('selected');
            }
            if (this.isInRange(date)) {
                dayElement.classList.add('in-range');
            }

            // Disable past dates
            if (date < new Date().setHours(0, 0, 0, 0)) {
                dayElement.classList.add('disabled');
            } else {
                dayElement.addEventListener('click', () => this.handleDateSelection(date));
            }

            container.appendChild(dayElement);
        }

        handleDateSelection(date) {
            if (this.isSelectingCheckIn) {
                this.selectedCheckIn = date;
                this.selectedCheckOut = null;
                this.isSelectingCheckIn = false;
                this.modalTitle.textContent = 'Selecciona tu fecha de check-out';
            } else {
                if (date < this.selectedCheckIn) {
                    this.selectedCheckIn = date;
                } else {
                    this.selectedCheckOut = date;
                    this.updateInputs();
                    this.closeModal();
                }
            }
            this.updateCalendars();
        }

        updateInputs() {
            const formatDate = (date) => {
                const weekday = date.toLocaleString('es-ES', { weekday: 'short' });
                const day = date.getDate().toString().padStart(2, '0');
                const month = (date.getMonth() + 1).toString().padStart(2, '0');
                const year = date.getFullYear().toString().slice(-2);
                return `${weekday}, ${day}/${month}/${year}`;
            };

            if (this.selectedCheckIn) {
                this.checkInInput.querySelector('.date').textContent = formatDate(this.selectedCheckIn);
            }
            if (this.selectedCheckOut) {
                this.checkOutInput.querySelector('.date').textContent = formatDate(this.selectedCheckOut);
            }
        }

        isToday(date) {
            const today = new Date();
            return this.isSameDay(date, today);
        }

        isSameDay(date1, date2) {
            return date1.getDate() === date2.getDate() &&
                   date1.getMonth() === date2.getMonth() &&
                   date1.getFullYear() === date2.getFullYear();
        }

        isInRange(date) {
            return this.selectedCheckIn && this.selectedCheckOut &&
                   date > this.selectedCheckIn && date < this.selectedCheckOut;
        }
    }

    // Initialize the date picker
    new DatePicker();

    // Search functionality
    const searchButton = document.querySelector('.search-button');
    const searchInput = document.querySelector('.search-input input');
    const hotelCards = document.querySelector('.hotel-cards');

    async function searchHotels(ciudad) {
        try {
            const response = await fetch(`/api/hotels/search?ciudad=${encodeURIComponent(ciudad)}`);
            const data = await response.json();

            if (data.success) {
                // Limpiar resultados anteriores
                hotelCards.innerHTML = '';

                if (data.hotels.length === 0) {
                    hotelCards.innerHTML = `
                        <div class="no-results">
                            <h3>No se encontraron hoteles en ${ciudad}</h3>
                            <p>Intenta con otra ciudad o modifica tu búsqueda</p>
                        </div>
                    `;
                    return;
                }

                // Mostrar los resultados
                data.hotels.forEach(hotel => {
                    const hotelCard = document.createElement('div');
                    hotelCard.className = 'hotel-card';
                    hotelCard.innerHTML = `
                        <img src="${hotel.imagen || 'https://via.placeholder.com/300x200'}" alt="${hotel.nombre}">
                        <div class="hotel-info">
                            <h3>${hotel.nombre}</h3>
                            <p>${hotel.ciudad_nombre}</p>
                            <div class="hotel-details">
                                <span class="price">Desde $${hotel.precio_noche}/noche</span>
                                <div class="rating">
                                    <i class="fas fa-star"></i>
                                    <span>${hotel.calificacion || '4.5'}</span>
                                </div>
                            </div>
                        </div>
                    `;
                    hotelCards.appendChild(hotelCard);
                });
            } else {
                alert(data.message);
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Error al buscar hoteles. Por favor, intenta de nuevo.');
        }
    }

    searchButton.addEventListener('click', () => {
        const ciudad = searchInput.value.trim();
        if (!ciudad) {
            alert('Por favor, ingresa un destino');
            return;
        }
        searchHotels(ciudad);
    });

    // También permitir búsqueda al presionar Enter
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const ciudad = searchInput.value.trim();
            if (ciudad) {
                searchHotels(ciudad);
            }
        }
    });

    // Responsive menu button


    class GuestsRoomsSelector {
        constructor() {
            this.container = document.querySelector('.guests-rooms');
            this.modal = document.querySelector('.guests-rooms-modal');
            this.summary = document.querySelector('.guests-rooms-text');
            this.childrenAgesContainer = document.getElementById('childrenAges');
            
        // Counter elements
        this.adultsCount = document.getElementById('adultsCount');
        this.childrenCount = document.getElementById('childrenCount');
        this.roomsCount = document.getElementById('roomsCount');
            
            // Buttons
            this.resetBtn = document.querySelector('.reset-btn');
            this.applyBtn = document.querySelector('.apply-btn');
            
        // State
        this.state = {
            adults: 2,
            children: 0,
            rooms: 1,
            childrenAges: [],
            petsAllowed: false
        };

            this.initializeEventListeners();
        }

        initializeEventListeners() {
            // Toggle modal
            this.container.addEventListener('click', (e) => {
                if (!this.modal.contains(e.target) || e.target === this.applyBtn) {
                    this.toggleModal();
                }
            });
            // Close on outside click
            document.addEventListener('click', (e) => {
                if (!this.container.contains(e.target) && this.modal.classList.contains('active')) {
                    this.closeModal();
                }
            });

            // Counter buttons
            document.querySelectorAll('.counter-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const type = btn.dataset.type;
                    const isPlus = btn.classList.contains('plus');
                    this.updateCounter(type, isPlus);
                });
            });

            // Reset button
            this.resetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.resetValues();
            });

            // Apply button
            this.applyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.applyChanges();
            });

            // Pets checkbox
            document.getElementById('petsAllowed').addEventListener('change', (e) => {
                this.state.petsAllowed = e.target.checked;
            });
        }

        toggleModal() {
            this.modal.classList.toggle('active');
        }

        closeModal() {
            this.modal.classList.remove('active');
        }

        updateCounter(type, increase) {
            const limits = {
                adults: { min: 1, max: 30 },
                children: { min: 0, max: 10 },
                rooms: { min: 1, max: 30 }
            };

            const currentValue = this.state[type];
            const newValue = increase ? currentValue + 1 : currentValue - 1;

            if (newValue >= limits[type].min && newValue <= limits[type].max) {
                this.state[type] = newValue;
                this[`${type}Count`].textContent = newValue;

                if (type === 'children') {
                    this.updateChildrenAges();
                }

                this.updateButtonStates();
            }
        }

        updateChildrenAges() {
            this.childrenAgesContainer.innerHTML = '';
            
            if (this.state.children > 0) {
                this.childrenAgesContainer.classList.add('active');
                
                for (let i = 0; i < this.state.children; i++) {
                    const container = document.createElement('div');
                    container.className = 'age-select-container';
                    
                    const label = document.createElement('label');
                    label.textContent = `Edad del niño ${i + 1}`;
                    
                    const select = document.createElement('select');
                    select.className = 'age-select';
                    select.dataset.index = i;
                    
                    // Add age options (0-17)
                    for (let age = 0; age <= 17; age++) {
                        const option = document.createElement('option');
                        option.value = age;
                        option.textContent = age === 0 ? 'Menor de 1 año' : `${age} años`;
                        select.appendChild(option);
                    }
                    
                    // Set previously selected age if exists
                    if (this.state.childrenAges[i] !== undefined) {
                        select.value = this.state.childrenAges[i];
                    }
                    
                    select.addEventListener('change', (e) => {
                        this.state.childrenAges[i] = parseInt(e.target.value);
                    });
                    
                    container.appendChild(label);
                    container.appendChild(select);
                    this.childrenAgesContainer.appendChild(container);
                }
            } else {
                this.childrenAgesContainer.classList.remove('active');
                this.state.childrenAges = [];
            }
        }

        updateButtonStates() {
            // Disable/enable minus buttons based on minimum values
            document.querySelector('[data-type="adults"].minus').disabled = this.state.adults <= 1;
            document.querySelector('[data-type="children"].minus').disabled = this.state.children <= 0;
            document.querySelector('[data-type="rooms"].minus').disabled = this.state.rooms <= 1;

            // Disable/enable plus buttons based on maximum values
            document.querySelector('[data-type="adults"].plus').disabled = this.state.adults >= 30;
            document.querySelector('[data-type="children"].plus').disabled = this.state.children >= 10;
            document.querySelector('[data-type="rooms"].plus').disabled = this.state.rooms >= 30;
        }

        resetValues() {
            this.state = {
                adults: 2,
                children: 0,
                rooms: 1,
                childrenAges: [],
                petsAllowed: false
            };

            this.adultsCount.textContent = '2';
            this.childrenCount.textContent = '0';
            this.roomsCount.textContent = '1';
            document.getElementById('petsAllowed').checked = false;
            
            this.updateChildrenAges();
            this.updateButtonStates();
            this.updateSummary();
        }

        updateSummary() {
            const totalGuests = this.state.adults + this.state.children;
            const guestsText = totalGuests === 1 ? 'huésped' : 'huéspedes';
            const roomsText = this.state.rooms === 1 ? 'habitación' : 'habitaciones';
            this.summary.textContent = `${totalGuests} ${guestsText}, ${this.state.rooms} ${roomsText}`;
        }

        applyChanges() {
            this.updateSummary();
            this.closeModal();
        }
    }

    // Initialize the guests and rooms selector
    new GuestsRoomsSelector();
     // ************************************
    // AQUÍ VA EL NUEVO CÓDIGO DEL MENÚ
    // ************************************
    // Menú móvil
    const menuButton = document.getElementById('menuButton');
    const mobileMenu = document.getElementById('mobileMenu');
    const closeMenu = document.getElementById('closeMenu');
    const menuOverlay = document.getElementById('menuOverlay');
    
    menuButton.addEventListener('click', function() {
        mobileMenu.classList.add('active');
        menuOverlay.classList.add('active');
    });
    
    closeMenu.addEventListener('click', function() {
        mobileMenu.classList.remove('active');
        menuOverlay.classList.remove('active');
    });
    
    menuOverlay.addEventListener('click', function() {
        mobileMenu.classList.remove('active');
        menuOverlay.classList.remove('active');
    });
    
    // Menú desplegable de usuario
    const userMenuContainer = document.querySelector('.user-menu-container');
    const userMenuButton = document.querySelector('.user-menu-button');
    
    userMenuButton.addEventListener('click', function(e) {
        e.stopPropagation();
        userMenuContainer.classList.toggle('active');
    });
    
    // Cerrar el menú al hacer clic fuera
    document.addEventListener('click', function() {
        userMenuContainer.classList.remove('active');
    });
    
    // Evitar que el menú se cierre al hacer clic dentro
    userMenuContainer.addEventListener('click', function(e) {
        e.stopPropagation();
    });
    // ************************************
    // FIN DEL NUEVO CÓDIGO
    // ************************************
}); 