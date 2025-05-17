document.addEventListener('DOMContentLoaded', function() {
    // Elementos del DOM
    const menuButton = document.getElementById('menuButton');
    const mobileMenu = document.getElementById('mobileMenu');
    const closeMenu = document.getElementById('closeMenu');
    const menuOverlay = document.getElementById('menuOverlay');
    const searchButton = document.getElementById('searchRestaurantes');
    const searchInput = document.getElementById('restauranteSearch');
    const restaurantesContainer = document.getElementById('restaurantes-container');
    
    // Estado de la aplicación
    let currentUser = null;
    
    // Inicialización
    init();

    async function init() {
        // Verificar autenticación al cargar
        await checkAuth();
        
        // Configurar eventos
        setupEventListeners();
    }

    async function checkAuth() {
        try {
            const response = await fetch('/api/check-auth');
            const data = await response.json();
            
            if (data.authenticated) {
                currentUser = data.user;
                updateUIForAuthenticatedUser();
            }
            return data.authenticated;
        } catch (error) {
            console.error('Error verificando autenticación:', error);
            return false;
        }
    }

    function updateUIForAuthenticatedUser() {
        // Actualizar el contador de favoritos si existe
        const favoritesCount = document.querySelector('.header-link .favorites-count');
        if (favoritesCount && currentUser.favoritesCount) {
            favoritesCount.textContent = currentUser.favoritesCount;
        }
    }

    function setupEventListeners() {
        // Menú móvil
        if (menuButton) menuButton.addEventListener('click', toggleMobileMenu);
        if (closeMenu) closeMenu.addEventListener('click', toggleMobileMenu);
        if (menuOverlay) menuOverlay.addEventListener('click', toggleMobileMenu);
        
        // Búsqueda
        if (searchButton) searchButton.addEventListener('click', handleSearch);
        if (searchInput) searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSearch();
        });

        // Selector de personas
        setupPeopleCounter();
    }

    function toggleMobileMenu() {
        mobileMenu.classList.toggle('active');
        menuOverlay.classList.toggle('active');
        document.body.classList.toggle('no-scroll');
    }

    async function handleSearch() {
        const isAuthenticated = await checkAuth();
        
        if (!isAuthenticated) {
            window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
            return;
        }

        const ubicacion = searchInput.value.trim();
        if (!ubicacion) {
            showAlert('Por favor ingresa una ubicación', 'error');
            return;
        }

        try {
            showLoading(true);
            
            const params = new URLSearchParams({
                ubicacion,
                personas: peopleCounter.value,
                cocina: document.querySelector('.cuisine-select')?.value || '',
                terraza: document.querySelector('#outdoorSeating')?.checked || false
            });

            const response = await fetch(`/api/restaurantes?${params}`);
            
            if (!response.ok) {
                throw new Error(response.statusText);
            }

            const data = await response.json();
            renderRestaurantes(data.restaurantes || [], ubicacion);
            
        } catch (error) {
            console.error('Error buscando restaurantes:', error);
            showAlert('Error al buscar restaurantes. Intenta nuevamente.', 'error');
        } finally {
            showLoading(false);
        }
    }

    function renderRestaurantes(restaurantes, ubicacion) {
        if (!restaurantesContainer) return;
        
        restaurantesContainer.innerHTML = '';

        if (restaurantes.length === 0) {
            restaurantesContainer.innerHTML = `
                <div class="no-results">
                    <h3>No se encontraron restaurantes en ${ubicacion}</h3>
                    <p>Intenta con otra ubicación o ajusta tus filtros</p>
                </div>
            `;
            return;
        }

        restaurantes.forEach(restaurante => {
            const card = document.createElement('div');
            card.className = 'hotel-card';
            card.innerHTML = `
                <div class="card-image-container">
                    <img src="${restaurante.imagen || '/img/restaurante-default.jpg'}" alt="${restaurante.nombre}" loading="lazy">
                    <button class="favorite-button ${restaurante.favorito ? 'active' : ''}" 
                            data-id="${restaurante.id}">
                        <i class="fas fa-heart"></i>
                    </button>
                </div>
                <div class="hotel-info">
                    <h3>${restaurante.nombre}</h3>
                    <p>${restaurante.ubicacion}</p>
                    <div class="hotel-details">
                        <span class="rating">${restaurante.calificacion} <i class="fas fa-star"></i></span>
                        <span>${restaurante.tipo_cocina} · ${restaurante.precio}</span>
                    </div>
                    <div class="restaurant-features">
                        ${restaurante.terraza ? '<span class="feature"><i class="fas fa-umbrella-beach"></i> Terraza</span>' : ''}
                        ${restaurante.vegetariano ? '<span class="feature"><i class="fas fa-leaf"></i> Opciones veganas</span>' : ''}
                    </div>
                </div>
            `;
            restaurantesContainer.appendChild(card);
        });

        // Agregar eventos a los botones de favoritos
        document.querySelectorAll('.favorite-button').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await toggleFavorite(btn.dataset.id, btn);
            });
        });

        // Evento click para tarjetas
        document.querySelectorAll('.hotel-card').forEach(card => {
            card.addEventListener('click', () => {
                const restaurantId = card.querySelector('.favorite-button')?.dataset.id;
                if (restaurantId) {
                    window.location.href = `/restaurantes/${restaurantId}`;
                }
            });
        });
    }

    async function toggleFavorite(restaurantId, button) {
        if (!currentUser) {
            window.location.href = '/login';
            return;
        }

        try {
            const isFavorite = button.classList.contains('active');
            const action = isFavorite ? 'remove' : 'add';
            
            const response = await fetch('/api/favoritos', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    restaurantId,
                    action
                })
            });

            if (response.ok) {
                button.classList.toggle('active');
                updateFavoritesCount();
            }
        } catch (error) {
            console.error('Error actualizando favorito:', error);
        }
    }

    function updateFavoritesCount() {
        const countElements = document.querySelectorAll('.favorites-count');
        countElements.forEach(el => {
            const currentCount = parseInt(el.textContent) || 0;
            el.textContent = button.classList.contains('active') ? currentCount + 1 : currentCount - 1;
        });
    }

    function setupPeopleCounter() {
        const peopleCounter = {
            value: 2,
            element: document.getElementById('peopleCount'),
            minusBtn: document.querySelector('[data-type="people"].minus'),
            plusBtn: document.querySelector('[data-type="people"].plus')
        };

        if (peopleCounter.minusBtn && peopleCounter.plusBtn) {
            peopleCounter.minusBtn.addEventListener('click', () => adjustPeopleCount(-1, peopleCounter));
            peopleCounter.plusBtn.addEventListener('click', () => adjustPeopleCount(1, peopleCounter));
        }
    }

    function adjustPeopleCount(change, counter) {
        const newValue = counter.value + change;
        if (newValue >= 1 && newValue <= 10) {
            counter.value = newValue;
            counter.element.textContent = newValue;
        }
    }

    function showAlert(message, type = 'success') {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type}`;
        alertDiv.textContent = message;
        
        document.body.appendChild(alertDiv);
        
        setTimeout(() => {
            alertDiv.classList.add('fade-out');
            setTimeout(() => alertDiv.remove(), 500);
        }, 3000);
    }

    function showLoading(show) {
        const loader = document.getElementById('loader') || createLoader();
        loader.style.display = show ? 'flex' : 'none';
    }

    function createLoader() {
        const loader = document.createElement('div');
        loader.id = 'loader';
        loader.innerHTML = '<div class="spinner"></div>';
        document.body.appendChild(loader);
        return loader;
    }
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

// Validación de cambio de contraseña
const changePasswordForm = document.querySelector('form[action="/cambiar-contrasena"]');
if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', function(e) {
        const newPassword = this.querySelector('input[name="newPassword"]').value;
        const confirmPassword = this.querySelector('input[name="confirmPassword"]').value;
        
        if (newPassword !== confirmPassword) {
            e.preventDefault();
            alert('Las contraseñas no coinciden');
            return false;
        }
        
        if (newPassword.length < 6) {
            e.preventDefault();
            alert('La contraseña debe tener al menos 6 caracteres');
            return false;
        }
    });
}

