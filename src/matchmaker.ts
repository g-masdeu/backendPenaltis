/**
 * matchmaker.ts
 */
import { Server as IOServer, Socket } from 'socket.io';
import { SupabaseClient } from '@supabase/supabase-js';

interface PlayerChoice {
    height: 'low' | 'mid' | 'high';
    side: 'left' | 'center' | 'right';
}

interface PlayerData {
    socket?: Socket;
    userId: string;
    displayName: string;
    role: 'shooter' | 'goalkeeper';
    currentChoice?: Partial<PlayerChoice>;
    score: number;
}

interface Match {
    id: string;
    players: PlayerData[];
    currentRound: number;
    maxRounds: number;
    phase: 'waiting' | 'playing' | 'finished';
    // ⚠️ CAMBIO CLAVE: Usamos 'any' para evitar conflicto entre Node y Navegador
    timeout?: any; 
}

export class MatchMaker {
    private io: IOServer;
    private supabase: SupabaseClient;
    private queue: Socket[] = [];
    private matches: Map<string, Match> = new Map();
    private readonly MATCH_TIMEOUT = 10000;
    private readonly BOT_DELAY = 1500;

    constructor(io: IOServer, supabase: SupabaseClient) {
        this.io = io;
        this.supabase = supabase;
    }

    joinQueue(socket: Socket) {
        // Evitar duplicados
        if (this.queue.find(s => s.id === socket.id)) return;

        console.log(`Jugador ${socket.id} esperando partida...`);
        this.queue.push(socket);

        if (this.queue.length >= 2) {
            const player1 = this.queue.shift();
            const player2 = this.queue.shift();
            if (player1 && player2) {
                this.createMatch([player1, player2]);
            }
        } else {
            setTimeout(() => {
                const stillWaiting = this.queue.find((s) => s.id === socket.id);
                if (stillWaiting) {
                    this.queue = this.queue.filter((s) => s.id !== socket.id);
                    console.log(`Timeout alcanzado: creando partida contra bot.`);
                    this.createMatch([socket], true);
                }
            }, this.MATCH_TIMEOUT);
        }
    }

    private createMatch(sockets: Socket[], vsBot: boolean = false) {
        const matchId = `match_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const players: PlayerData[] = [];

        const getSafeData = (s: Socket) => ({
            userId: s.data.userId || s.id,
            displayName: s.data.displayName || 'Anon'
        });

        if (vsBot) {
            const human = sockets[0];
            if (!human) return;
            const hData = getSafeData(human);

            players.push({
                socket: human,
                userId: hData.userId,
                displayName: hData.displayName,
                role: 'shooter',
                score: 0,
            });

            players.push({
                userId: 'BOT',
                displayName: 'ChatBot',
                role: 'goalkeeper',
                score: 0,
            });
        } else {
            const [s1, s2] = sockets;
            if (!s1 || !s2) return;
            const d1 = getSafeData(s1);
            const d2 = getSafeData(s2);

            players.push({
                socket: s1,
                userId: d1.userId,
                displayName: d1.displayName,
                role: 'shooter',
                score: 0,
            });
            players.push({
                socket: s2,
                userId: d2.userId,
                displayName: d2.displayName,
                role: 'goalkeeper',
                score: 0,
            });
        }

        const match: Match = {
            id: matchId,
            players,
            currentRound: 1,
            maxRounds: 5,
            phase: 'playing',
        };

        this.matches.set(matchId, match);

        for (const p of players) {
            if (p.socket) {
                p.socket.join(matchId);
                p.socket.emit('match_start', {
                    matchId,
                    role: p.role,
                    opponent: players.find((o) => o.userId !== p.userId)?.displayName,
                });
            }
        }

        console.log(`Partida ${matchId} iniciada (${vsBot ? 'vs BOT' : '2 jugadores'})`);
        this.startRound(match);
    }

    private startRound(match: Match) {
        if (!this.matches.has(match.id)) return;

        const { players, currentRound } = match;
        console.log(`Iniciando ronda ${currentRound} para ${match.id}`);

        for (const p of players) {
            p.currentChoice = {};
        }

        for (const p of players) {
            if (p.socket) {
                p.socket.emit('round_start', {
                    round: currentRound,
                    role: p.role,
                });
            }
        }

        const bot = players.find((p) => p.userId === 'BOT');
        if (bot) {
            setTimeout(() => {
                if (match.phase !== 'playing') return;
                bot.currentChoice = this.botChoice();
                this.checkRoundCompletion(match);
            }, this.BOT_DELAY);
        }

        // Limpiar timeout previo si existe
        if (match.timeout) clearTimeout(match.timeout);
        
        match.timeout = setTimeout(() => {
            if (match.phase !== 'playing') return;
            let forced = false;
            for (const p of match.players) {
                if (!p.currentChoice || !p.currentChoice.height || !p.currentChoice.side) {
                    p.currentChoice = this.botChoice();
                    forced = true;
                }
            }
            if (forced) this.checkRoundCompletion(match);
        }, 10000);
    }

    registerChoice(matchId: string, playerId: string, choice: Partial<PlayerChoice>) {
        const match = this.matches.get(matchId);
        if (!match || match.phase !== 'playing') return;

        const player = match.players.find((p) => p.userId === playerId);
        if (!player) return;

        if (!player.currentChoice) player.currentChoice = {};
        if (choice.height) player.currentChoice.height = choice.height;
        if (choice.side) player.currentChoice.side = choice.side;

        if (player.currentChoice.height && player.currentChoice.side) {
            this.checkRoundCompletion(match);
        }
    }

    private checkRoundCompletion(match: Match) {
        const allReady = match.players.every(
            (p) => p.currentChoice && p.currentChoice.height && p.currentChoice.side
        );

        if (allReady) {
            if (match.timeout) {
                clearTimeout(match.timeout);
                match.timeout = undefined;
            }
            this.resolveRound(match);
        }
    }

    private resolveRound(match: Match) {
        if (match.players.length < 2) return;

        const p1 = match.players[0];
        const p2 = match.players[1];

        if (!p1 || !p2) return;

        const shooter = p1.role === 'shooter' ? p1 : p2;
        const keeper = p1.role === 'goalkeeper' ? p1 : p2;

        const sChoice = shooter.currentChoice as PlayerChoice;
        const kChoice = keeper.currentChoice as PlayerChoice;

        const result = this.calculatePoints(sChoice, kChoice);
        shooter.score += result.shooterPoints;
        keeper.score += result.keeperPoints;

        for (const p of match.players) {
            if (p.socket) {
                p.socket.emit('round_result', {
                    round: match.currentRound,
                    shooterChoice: sChoice,
                    keeperChoice: kChoice,
                    result,
                    scores: {
                        shooter: shooter.score,
                        keeper: keeper.score,
                    },
                });
            }
        }

        [shooter.role, keeper.role] = [keeper.role, shooter.role];

        if (match.currentRound >= match.maxRounds) {
            this.finishMatch(match);
        } else {
            match.currentRound += 1;
            setTimeout(() => this.startRound(match), 2000);
        }
    }

    private calculatePoints(shoot: PlayerChoice, save: PlayerChoice) {
        let keeperPoints = 0;
        if (shoot.height === save.height) keeperPoints++;
        if (shoot.side === save.side) keeperPoints++;
        const kFinal = keeperPoints === 2 ? 1 : 0;
        const sFinal = keeperPoints === 2 ? 0 : 1;
        return { shooterPoints: sFinal, keeperPoints: kFinal };
    }

    private async finishMatch(match: Match, forcedWinner?: PlayerData) {
        match.phase = 'finished';
        if (match.timeout) clearTimeout(match.timeout);

        if (match.players.length < 2 && !forcedWinner) {
            this.matches.delete(match.id);
            return;
        }

        let p1, p2;
        let winnerName = 'Empate';

        if (forcedWinner) {
            winnerName = forcedWinner.displayName;
            p1 = forcedWinner;
            p2 = { displayName: 'Desconectado', score: 0 } as PlayerData;
        } else {
            const [pl1, pl2] = match.players;
            if (!pl1 || !pl2) return;
            p1 = pl1;
            p2 = pl2;
            winnerName = p1.score > p2.score ? p1.displayName : p2.score > p1.score ? p2.displayName : 'Empate';
        }

        console.log(`Partida ${match.id} finalizada. Ganador: ${winnerName}`);

        for (const p of match.players) {
            if (p.socket) {
                p.socket.emit('match_end', {
                    matchId: match.id,
                    winner: winnerName,
                    reason: forcedWinner ? 'opponent_disconnected' : 'normal',
                    finalScores: match.players.map((x) => ({ player: x.displayName, score: x.score })),
                });
            }
        }

        try {
            await this.supabase.from('matches').insert([
                {
                    match_id: match.id,
                    player1: p1.displayName,
                    player2: p2.displayName,
                    player1_score: p1.score,
                    player2_score: p2.score,
                    winner: winnerName,
                    created_at: new Date().toISOString(),
                },
            ]);
        } catch (err) {
            console.error('Error guardando partida en Supabase:', err);
        }

        this.matches.delete(match.id);
    }

    // ⚠️ CAMBIO CLAVE: 'as const' hace que el array sea fijo y soluciona el error de tipo
private botChoice(): PlayerChoice {
        const heights = ['low', 'mid', 'high'];
        const sides = ['left', 'center', 'right'];
        
        return {
            // Forzamos a TypeScript a entender que esto es válido usando 'as ...'
            height: heights[Math.floor(Math.random() * heights.length)] as 'low' | 'mid' | 'high',
            side: sides[Math.floor(Math.random() * sides.length)] as 'left' | 'center' | 'right',
        };
    }
    removeSocket(socket: Socket) {
        this.queue = this.queue.filter((s) => s.id !== socket.id);

        for (const match of this.matches.values()) {
            const wasInMatch = match.players.some(p => p.socket?.id === socket.id);

            if (wasInMatch) {
                match.players = match.players.filter((p) => p.socket?.id !== socket.id);
                if (match.players.length === 1) {
                    const winner = match.players[0];
                    this.finishMatch(match, winner);
                } else if (match.players.length === 0) {
                    this.matches.delete(match.id);
                }
            }
        }
    }
}