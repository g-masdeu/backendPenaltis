/**
 * server.ts
 */
import dotenv from 'dotenv';

dotenv.config();

import express, { Request, Response } from 'express';
import http from 'http';
import { Server as IOServer, Socket } from 'socket.io';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { MatchMaker } from '../src/matchmaker'; 
import cors from 'cors';

const app = express();
app.use(cors({
  origin: 'http://localhost:5173', // frontend URL
  methods: ['GET', 'POST']
}));

const PORT = Number(process.env.PORT || 4000);
// Limpiamos espacios para evitar errores
const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Error: Falta SUPABASE_URL o SUPABASE_SERVICE_KEY en .env');
    process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const app = express();
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
    return res.json({ ok: true, ts: new Date().toISOString() });
});

app.get('/api/leaderboard', async (_req: Request, res: Response) => {
    try {
        const { data, error } = await supabase
            .from('matches')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
        if (error) throw error;
        return res.json({ leaderboard: data });
    } catch (err) {
        console.error('Error en leaderboard:', err);
        return res.status(500).json({ error: 'internal' });
    }
});

const httpServer = http.createServer(app);
const io = new IOServer(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

// MatchMaker recibe io y supabase
const matchMaker = new MatchMaker(io, supabase);

io.on('connection', (socket: Socket) => {
    console.log(`🟢 Socket conectado: ${socket.id}`);

    socket.on('lobby_join', (payload: { userId?: string; displayName?: string }) => {
        try {
            const userId = payload?.userId || socket.id;
            const displayName = payload?.displayName || `Player ${socket.id.substring(0, 4)}`;
            
            socket.data.userId = userId;
            socket.data.displayName = displayName;
            matchMaker.joinQueue(socket);
        } catch (err) {
            console.error('Error en lobby_join:', err);
        }
    });

    socket.on('create_or_join_match', (payload) => {
        try {
            const userId = payload?.userId || socket.data.userId || socket.id;
            const displayName = payload?.displayName || socket.data.displayName || 'Anon';
            socket.data.userId = userId;
            socket.data.displayName = displayName;
            matchMaker.joinQueue(socket);
        } catch (err) {
            console.error('Error en create_or_join_match:', err);
        }
    });

    socket.on('select_choice', (payload) => {
        try {
            if (!payload || !payload.matchId) return;
            const pId = socket.data.userId || payload.playerId;
            matchMaker.registerChoice(payload.matchId, pId, payload);
        } catch (err) {
            console.error('Error en select_choice:', err);
        }
    });

    socket.on('disconnect', (reason) => {
        console.log(`🔴 Socket desconectado: ${socket.id}`);
        try {
            matchMaker.removeSocket(socket);
        } catch (err) {
            console.error('Error al remover socket:', err);
        }
    });
});

httpServer.listen(PORT, () => {
    console.log(`\n🚀 Servidor listo en http://localhost:${PORT}`);
});