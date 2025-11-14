BACKEND README
===============

📌 **Proyecto Backend – Penalty Shootout Multiplayer**

Este backend gestiona la lógica del juego, empareja jugadores en tiempo real, procesa rondas, guarda resultados en Supabase y expone endpoints REST.

---

## 🚀 Tecnologías usadas

- Node.js + TypeScript  
- Express  
- Socket.IO  
- Supabase (Base de datos PostgreSQL)  
- Vite / Frontend conectado por WebSockets  
- dotenv  
- cors  

---

## 📁 Estructura del proyecto

```
backend/
│── src/
│   ├── server.ts           → Servidor Express + Socket.IO
│   ├── matchmaker.ts       → Lógica de emparejamiento y rondas
│   ├── types.ts            → Tipos para el juego (opcional)
│── package.json
│── tsconfig.json
│── .env
```

---

## ⚙️ Variables de entorno (.env)

Antes de iniciar, crea un archivo **.env** dentro de `/backend/` con:

```
PORT=4000
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOi...
```

---

## ▶️ Instalación

Desde la carpeta `backend`:

```bash
npm install
```

Compilar TypeScript:

```bash
npm run build
```

Iniciar en producción:

```bash
npm start
```

Modo desarrollo:

```bash
npm run dev
```

---

## 🔌 Endpoints REST

### **GET /health**
Comprueba el estado del servidor.

### **GET /api/leaderboard**
Devuelve el ranking (últimos 50 partidos).  
Leer datos desde la tabla `matches` en Supabase.

---

## 🔥 Socket.IO – Eventos principales

### Entrar al lobby
```
socket.emit("lobby_join", { userId, displayName });
```

### Comienza un match
```
socket.on("match_start", (data) => { ... })
```

### Enviar elección del jugador
```
socket.emit("select_choice", { matchId, playerId, height, side });
```

### Ronda iniciada
```
socket.on("round_start", (data))
```

### Resultado de ronda
```
socket.on("round_result", (data))
```

### Final de partida
```
socket.on("match_end", (data))
```

---

## 🧠 Lógica básica de MatchMaker

- Empareja jugadores en cola  
- Crea matchId  
- Alterna roles (Shooter / Keeper) por rondas  
- Recibe decisiones del jugador  
- Calcula aciertos  
- Guarda resultado en Supabase  
- Notifica al frontend  

---

## 🐛 Debug y logs

Inicia el backend y mira consola:

```bash
npm run dev
```

Si Socket.IO falla, revisa:

- CORS
- Puerto correcto (4000)
- URL del frontend (5173)
- Variables `.env` válidas

---

## ⭐ Notas finales
Este backend está optimizado para partidas rápidas, en tiempo real y sin necesidad de autenticación avanzada.  
Puedes extenderlo con:
- Auth de Supabase
- Skins / personalización
- Modo torneo
- Replay de movimientos  
