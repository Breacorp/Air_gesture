# Skill: AutoGitCommit

> **Estado:** Activa (Invocar cuando se requiera persistencia atómica de cambios)
> Esta skill obliga al agente a realizar un commit de Git después de cada modificación exitosa de archivos.

---

## Instrucciones para el Agente

Cada vez que realices un cambio en el sistema de archivos (crear, modificar o eliminar), debes seguir este flujo inmediatamente después de que la herramienta de edición retorne éxito:

### 1. Verificación de Cambios
Ejecutar `git status --porcelain` para confirmar qué archivos han cambiado.

### 2. Formateo del Mensaje (Conventional Commits)
El mensaje debe seguir este formato: `<tipo>(<scope>): <descripción>`

**Tipos permitidos:**
- `feat`: Nueva funcionalidad
- `fix`: Corrección de errores
- `refactor`: Cambio de código que no añade funcionalidad ni corrige errores
- `style`: Cambios que no afectan el significado del código (espacios, formato, punto y coma)
- `docs`: Cambios en la documentación
- `chore`: Tareas de mantenimiento, actualización de dependencias, etc.
- `perf`: Cambios para mejorar el rendimiento

**Scope sugerido:**
- `frontend`: Cambios en la carpeta frontend
- `backend`: Cambios en la carpeta backend
- `root`: Cambios en la raíz
- `config`: Cambios en configuraciones (vite, tailwind, tsconfig)
- `skill`: Cambios en la carpeta Skills

### 3. Ejecución del Commit
Si hay cambios, ejecutar:
```bash
git add .
git commit -m "<tipo>(<scope>): <descripción>"
```

### 4. Reporte
Informar al usuario del commit realizado al final de la respuesta.

---

## Reglas de Oro
1. **Atómico:** Un commit por cada bloque lógico de cambios. Si una tarea implica modificar el frontend y el backend por razones separadas, realizar dos commits.
2. **Descriptivo:** El mensaje debe explicar brevemente el "por qué" o el "qué", no solo el "cómo".
3. **Silencioso:** No preguntes antes de hacer el commit si esta skill está activa, simplemente ejecútalo y repórtalo.
4. **Fallback:** Si no hay un repositorio Git inicializado, omite el commit e informa al usuario.
