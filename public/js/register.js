/*REVISA SI YA SALIÓ EL CAPITULO #3*/

document.addEventListener('DOMContentLoaded', function() {
    const form = document.querySelector('.form-register');
    const alertaError = form.querySelector('.alerta-error');
    const alertaExito = form.querySelector('.alerta-exito');

    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Obtener los valores del formulario
        const formData = new FormData(form);
        const data = {
            nombre: formData.get('nombre'),
            email: formData.get('email'),
            password: formData.get('password'),
            telefono: formData.get('telefono')
        };

        // Validar que los campos requeridos no estén vacíos
        if (!data.nombre || !data.email || !data.password) {
            alertaError.textContent = 'Todos los campos son obligatorios';
            alertaError.classList.add('alertaError');
            alertaExito.classList.remove('alertaExito');
            return;
        }

        try {
            console.log('Enviando datos:', data);
            const response = await fetch('/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            console.log('Respuesta del servidor:', result);

            if (result.success) {
                // Mostrar mensaje de éxito
                alertaExito.textContent = result.message;
                alertaExito.classList.add('alertaExito');
                alertaError.classList.remove('alertaError');
                
                // Limpiar el formulario
                form.reset();
                
                // Redirigir al login después de 2 segundos
                setTimeout(() => {
                    document.getElementById('sign-in').click();
                }, 2000);
            } else {
                // Mostrar mensaje de error
                alertaError.textContent = result.message;
                alertaError.classList.add('alertaError');
                alertaExito.classList.remove('alertaExito');
            }
        } catch (error) {
            console.error('Error:', error);
            alertaError.textContent = 'Error al registrar el usuario';
            alertaError.classList.add('alertaError');
            alertaExito.classList.remove('alertaExito');
        }
    });

    // Tooltip de condiciones de contraseña con validación en vivo
    const passwordInput = document.getElementById('register-password');
    const passwordTooltip = document.getElementById('passwordTooltip');
    if(passwordInput && passwordTooltip) {
        passwordInput.addEventListener('focus', function() {
            passwordTooltip.style.display = 'block';
        });
        passwordInput.addEventListener('blur', function() {
            passwordTooltip.style.display = 'none';
        });
        passwordInput.addEventListener('input', function() {
            const value = passwordInput.value;
            // Validaciones
            const minLength = value.length >= 8;
            const hasUpper = /[A-Z]/.test(value);
            const hasLower = /[a-z]/.test(value);
            const hasNumber = /[0-9]/.test(value);
            const hasSpecial = /[!@#$%^&*]/.test(value);
            // Seleccionar los <li> del tooltip
            const lis = passwordTooltip.querySelectorAll('li');
            if(lis.length === 5) {
                lis[0].style.color = minLength ? '#0ca828' : '#333';
                lis[1].style.color = hasUpper ? '#0ca828' : '#333';
                lis[2].style.color = hasLower ? '#0ca828' : '#333';
                lis[3].style.color = hasNumber ? '#0ca828' : '#333';
                lis[4].style.color = hasSpecial ? '#0ca828' : '#333';
            }
        });
    }
});