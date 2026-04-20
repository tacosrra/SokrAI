# Guía rápida para beta testers en macOS

Esta guía explica cómo dejar SokrAI funcionando en un Mac desde cero.

Importante:

- No hace falta instalar `Node.js`, `pnpm`, `Ollama`, `PostgreSQL` ni `n8n`.
- Si ya tienes `Docker Desktop`, el alta real es casi de un solo comando.
- El script intenta arrancar `Docker Desktop` automáticamente y abre la app en el navegador al terminar.

## Flujo real

### Si ya tienes Docker Desktop instalado

Desde la raíz del proyecto:

```bash
chmod +x scripts/*.sh
./scripts/bootstrap-beta.sh
```

Eso:

- intenta arrancar `Docker Desktop` si está apagado
- levanta todo el stack
- prepara el modelo y la base de datos
- importa los workflows
- abre `http://localhost:3000` automáticamente

### Si no tienes Docker Desktop instalado

1. Instálalo siguiendo la sección siguiente.
2. Después vuelve al repo y ejecuta:

```bash
chmod +x scripts/*.sh
./scripts/bootstrap-beta.sh
```

## 1. Instalar Docker Desktop

1. Abre la página oficial:
   https://docs.docker.com/installation/mac/
2. Descarga la versión correcta para tu Mac:
   - `Mac with Apple silicon` si tu Mac usa `M1`, `M2`, `M3`, `M4`, etc.
   - `Mac with Intel chip` si tu Mac es Intel.
3. Abre `Docker.dmg`.
4. Arrastra `Docker.app` a `Applications`.
5. Abre `Docker.app`.
6. Acepta las condiciones cuando lo pida.
7. Usa `Use recommended settings` si no tienes un motivo claro para cambiarlo.
8. Espera a que Docker Desktop termine de arrancar.

Comprobación rápida:

```bash
docker --version
docker compose version
```

Si `docker` no aparece, cierra `Terminal` y vuelve a abrirlo.

Si no tienes Docker instalado, el script abrirá la guía oficial de Docker y te mostrará un mensaje para que lo instales antes de seguir.

## 2. Instalar Git

Abre `Terminal` y ejecuta:

```bash
xcode-select --install
```

Cuando termine:

```bash
git --version
```

## 3. Descargar el proyecto

Si tienes acceso al repo por Git:

```bash
git clone <URL_DEL_REPO>
cd <CARPETA_DEL_REPO>
```

Si te han pasado un `.zip`:

1. Descomprímelo.
2. Abre `Terminal`.
3. Entra en la carpeta del proyecto:

```bash
cd ~/Downloads/<CARPETA_DEL_REPO>
```

## 4. Dar permisos a los scripts

Haz esto una vez desde la raíz del proyecto:

```bash
chmod +x scripts/*.sh
```

## 5. Instalar y arrancar SokrAI

Desde la raíz del proyecto, ejecuta:

```bash
./scripts/bootstrap-beta.sh
```

Este comando hace automáticamente lo siguiente:

- crea `.env.beta`
- genera secretos locales
- arranca `Docker Desktop` si ya está instalado pero no está corriendo
- levanta `PostgreSQL`, `Ollama`, `API`, `n8n` y `web`
- descarga el modelo
- ejecuta migraciones
- importa y activa los workflows de `n8n`
- abre la aplicación en el navegador al terminar

La primera vez puede tardar varios minutos. No cierres Docker Desktop mientras corre.

## 6. Abrir la aplicación

Cuando el comando termine bien, la aplicación debería abrirse sola en el navegador.

Si no se abre sola, usa:

- App principal: `http://localhost:3000`
- n8n: `http://localhost:5678`

Si necesitas entrar en `n8n`, las credenciales por defecto suelen ser:

- usuario: `admin`
- contraseña: `admin`

Si no funcionan, están en el archivo `.env.beta`.

## 7. Uso diario

Después de la primera instalación, cuando quieras volver a usar SokrAI:

```bash
./scripts/start-beta.sh
```

Ese comando también intenta arrancar `Docker Desktop` si hace falta y abre la app al terminar.

Cuando quieras pararlo:

```bash
./scripts/stop-beta.sh
```

## 8. Problemas típicos

### `Permission denied`

Ejecuta:

```bash
chmod +x scripts/*.sh
```

### `docker: command not found`

1. Cierra `Terminal`.
2. Vuelve a abrirlo.
3. Prueba de nuevo:

```bash
docker --version
docker compose version
```

### Docker no está arrancado

El script intentará arrancarlo automáticamente. Si no puede, ábrelo manualmente, espera a que termine de iniciar y repite:

```bash
./scripts/bootstrap-beta.sh
```

### El setup falla a mitad

Pásanos el error completo que haya salido en terminal.

Si te pedimos logs, ejecuta:

```bash
SOKRAI_ENV_FILE=.env.beta docker compose --env-file .env.beta -p sokrai-beta -f docker-compose.yml -f docker-compose.beta.yml logs -f
```

## 9. Resumen mínimo

Primera vez si ya tienes Docker:

```bash
chmod +x scripts/*.sh
./scripts/bootstrap-beta.sh
```

Siguientes veces:

```bash
./scripts/start-beta.sh
./scripts/stop-beta.sh
```
