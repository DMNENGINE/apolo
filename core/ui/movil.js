// Menú lateral en pantallas pequeñas.
'use strict';
$('#btnMenu').onclick = () => document.body.classList.toggle('menu');
$('#vista').addEventListener('click', () => document.body.classList.remove('menu'));
