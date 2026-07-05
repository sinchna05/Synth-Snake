/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX, 
  Trophy, 
  Clock, 
  Gamepad2, 
  Sparkles, 
  Zap, 
  Volume1,
  RotateCcw,
  Music
} from 'lucide-react';
import { audioEngine, PLAYLIST, Track } from './audioEngine';

// Grid Constants for Snake Game
const COLS = 25;
const ROWS = 20;
const CELL_SIZE = 20; // 500px / 25 = 20px, 400px / 20 = 20px

interface Point {
  x: number;
  y: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

export default function App() {
  // Sound Engine state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track>(audioEngine.getCurrentTrack());
  const [volume, setVolume] = useState(0.4);
  const [isMuted, setIsMuted] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  // Snake Game State
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('synth_snake_high_score');
    return saved ? parseInt(saved, 10) : 48250; // High score default
  });
  const [isGameOver, setIsGameOver] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [hasStartedPlayingGame, setHasStartedPlayingGame] = useState(false);
  const [multiplier, setMultiplier] = useState(1.0);
  const [streak, setStreak] = useState(0);

  // References
  const gameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const visualizerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Snake position and game states kept in refs for real-time tick access
  const snakeRef = useRef<Point[]>([
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
    { x: 7, y: 10 },
    { x: 6, y: 10 },
  ]);
  const foodRef = useRef<Point>({ x: 18, y: 10 });
  const directionRef = useRef<'UP' | 'DOWN' | 'LEFT' | 'RIGHT'>('RIGHT');
  const nextDirectionRef = useRef<'UP' | 'DOWN' | 'LEFT' | 'RIGHT'>('RIGHT');
  const streakTimerRef = useRef<number>(0);

  // Particles container
  const particlesRef = useRef<Particle[]>([]);

  // Timer States
  const [sessionTime, setSessionTime] = useState(0);
  const [elapsedTimeStr, setElapsedTimeStr] = useState("00:00");

  // Track elapsed progress time inside the 32-step musical loop
  const progressPercent = (currentStep / 32) * 100;

  // Initialize AudioEngine on first click/interaction
  const unlockAudio = useCallback(() => {
    if (!audioUnlocked) {
      audioEngine.init();
      audioEngine.setVolume(isMuted ? 0 : volume);
      setAudioUnlocked(true);
    }
  }, [audioUnlocked, volume, isMuted]);

  // Handle Play/Pause of Music
  const handlePlayPause = useCallback(() => {
    unlockAudio();
    const playingState = audioEngine.togglePlay();
    setIsPlaying(playingState);
  }, [unlockAudio]);

  // Handle skipping tracks
  const handleNextTrack = useCallback(() => {
    unlockAudio();
    audioEngine.nextTrack();
    setCurrentTrack(audioEngine.getCurrentTrack());
    setIsPlaying(audioEngine.getIsPlaying());
  }, [unlockAudio]);

  const handlePrevTrack = useCallback(() => {
    unlockAudio();
    audioEngine.prevTrack();
    setCurrentTrack(audioEngine.getCurrentTrack());
    setIsPlaying(audioEngine.getIsPlaying());
  }, [unlockAudio]);

  const handleSelectTrack = useCallback((index: number) => {
    unlockAudio();
    audioEngine.setTrackIndex(index);
    setCurrentTrack(audioEngine.getCurrentTrack());
    setIsPlaying(audioEngine.getIsPlaying());
  }, [unlockAudio]);

  // Handle Volume
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    setIsMuted(vol === 0);
    audioEngine.setVolume(vol);
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    audioEngine.setVolume(nextMuted ? 0 : volume);
  };

  // Sound effects helper
  const triggerSfx = (type: 'eat' | 'gameover' | 'start') => {
    if (audioUnlocked) {
      audioEngine.playSfx(type);
    }
  };

  // Calculate current multiplier based on track and eating streak
  // Faster tracks give slightly larger score boosts!
  const calculateMultiplier = useCallback(() => {
    let baseMult = 1.0;
    if (currentTrack.id === 'neon-drift') baseMult = 2.0;
    else if (currentTrack.id === 'cyber-skyline') baseMult = 1.5;
    else if (currentTrack.id === 'infinite-void') baseMult = 2.5;

    // Add multiplier based on eat streak (up to +1.5x)
    const streakBonus = Math.min(1.5, streak * 0.25);
    return parseFloat((baseMult + streakBonus).toFixed(1));
  }, [currentTrack, streak]);

  useEffect(() => {
    setMultiplier(calculateMultiplier());
  }, [currentTrack, streak, calculateMultiplier]);

  // Spawn food at valid empty coordinates
  const spawnFood = useCallback(() => {
    let valid = false;
    let newFood: Point = { x: 0, y: 0 };
    
    while (!valid) {
      newFood = {
        x: Math.floor(Math.random() * COLS),
        y: Math.floor(Math.random() * ROWS)
      };
      
      // Ensure food doesn't spawn on the snake
      const onSnake = snakeRef.current.some(
        segment => segment.x === newFood.x && segment.y === newFood.y
      );
      if (!onSnake) {
        valid = true;
      }
    }
    foodRef.current = newFood;
  }, []);

  // Spawn particle effects when snake eats food
  const spawnParticles = (x: number, y: number, color: string) => {
    const count = 20;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4.5;
      particlesRef.current.push({
        x: x * CELL_SIZE + CELL_SIZE / 2,
        y: y * CELL_SIZE + CELL_SIZE / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: color,
        size: 2 + Math.random() * 4,
        life: 1.0,
        maxLife: 20 + Math.floor(Math.random() * 20)
      });
    }
  };

  // Reset the Snake game
  const resetGame = useCallback(() => {
    unlockAudio();
    snakeRef.current = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
      { x: 7, y: 10 },
      { x: 6, y: 10 },
    ];
    directionRef.current = 'RIGHT';
    nextDirectionRef.current = 'RIGHT';
    setScore(0);
    setStreak(0);
    setIsGameOver(false);
    setIsPaused(false);
    setHasStartedPlayingGame(true);
    spawnFood();
    particlesRef.current = [];
    triggerSfx('start');
  }, [unlockAudio, spawnFood]);

  // Game Speed: Dynamically maps to the current active track's BPM.
  // Neon Drift (125 BPM): Fast-paced ~130ms.
  // Cyber Skyline (100 BPM): Relaxed outrun ~170ms.
  // Infinite Void (142 BPM): Blazing darksynth speed ~105ms.
  const getTickInterval = useCallback(() => {
    const currentBpm = currentTrack.bpm;
    // Base formula so speed scales with track tempo
    return Math.floor(15000 / currentBpm);
  }, [currentTrack]);

  // Core Game Tick Logic
  const tickGame = useCallback(() => {
    if (isGameOver || isPaused || !hasStartedPlayingGame) return;

    directionRef.current = nextDirectionRef.current;
    const head = snakeRef.current[0];
    let nextHead: Point = { ...head };

    switch (directionRef.current) {
      case 'UP': nextHead.y -= 1; break;
      case 'DOWN': nextHead.y += 1; break;
      case 'LEFT': nextHead.x -= 1; break;
      case 'RIGHT': nextHead.x += 1; break;
    }

    // Wall collision (Lethal)
    if (nextHead.x < 0 || nextHead.x >= COLS || nextHead.y < 0 || nextHead.y >= ROWS) {
      setIsGameOver(true);
      triggerSfx('gameover');
      return;
    }

    // Self collision
    const hitSelf = snakeRef.current.some(
      (segment, idx) => idx > 0 && segment.x === nextHead.x && segment.y === nextHead.y
    );
    if (hitSelf) {
      setIsGameOver(true);
      triggerSfx('gameover');
      return;
    }

    // Create new snake array
    const nextSnake = [nextHead, ...snakeRef.current];

    // Check if food eaten
    if (nextHead.x === foodRef.current.x && nextHead.y === foodRef.current.y) {
      // Eat success!
      triggerSfx('eat');
      
      // Multiplier bump
      const currentMult = calculateMultiplier();
      const pointsEaten = Math.round(100 * currentMult);
      
      setScore(prev => {
        const nextScore = prev + pointsEaten;
        if (nextScore > highScore) {
          setHighScore(nextScore);
          localStorage.setItem('synth_snake_high_score', nextScore.toString());
        }
        return nextScore;
      });

      // Spawn particle effect
      const trackColors = [currentTrack.primaryColor, currentTrack.secondaryColor, '#d946ef'];
      const randomColor = trackColors[Math.floor(Math.random() * trackColors.length)];
      spawnParticles(foodRef.current.x, foodRef.current.y, randomColor);

      // Increase streak, reset timer window for streak
      setStreak(prev => prev + 1);
      streakTimerRef.current = 40; // ~40 frames to eat the next fruit to keep streak

      spawnFood();
    } else {
      // Simple movement - pop tail
      nextSnake.pop();
    }

    snakeRef.current = nextSnake;

    // Decay streak timer
    if (streakTimerRef.current > 0) {
      streakTimerRef.current -= 1;
      if (streakTimerRef.current === 0) {
        setStreak(0);
      }
    }
  }, [isGameOver, isPaused, hasStartedPlayingGame, highScore, spawnFood, currentTrack, calculateMultiplier]);

  // Audio Sequencer Step sync listener
  useEffect(() => {
    const unsub = audioEngine.onStep((step) => {
      setCurrentStep(step);
    });
    return () => {
      unsub();
    };
  }, []);

  // Input controller - Keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Unlock Web Audio on key down if not unlocked
      if (!audioUnlocked) {
        unlockAudio();
      }

      const key = e.key.toUpperCase();
      const curDir = directionRef.current;

      if (['ARROWUP', 'W'].includes(key)) {
        e.preventDefault();
        if (curDir !== 'DOWN') nextDirectionRef.current = 'UP';
      } else if (['ARROWDOWN', 'S'].includes(key)) {
        e.preventDefault();
        if (curDir !== 'UP') nextDirectionRef.current = 'DOWN';
      } else if (['ARROWLEFT', 'A'].includes(key)) {
        e.preventDefault();
        if (curDir !== 'RIGHT') nextDirectionRef.current = 'LEFT';
      } else if (['ARROWRIGHT', 'D'].includes(key)) {
        e.preventDefault();
        if (curDir !== 'LEFT') nextDirectionRef.current = 'RIGHT';
      } else if (e.key === ' ') {
        e.preventDefault();
        if (isGameOver) {
          resetGame();
        } else if (hasStartedPlayingGame) {
          setIsPaused(prev => !prev);
        } else {
          resetGame();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [audioUnlocked, unlockAudio, isGameOver, hasStartedPlayingGame, resetGame]);

  // Game loops (Tick and Draw)
  useEffect(() => {
    let timerId: number | null = null;

    const runGameTimer = () => {
      tickGame();
      timerId = window.setTimeout(runGameTimer, getTickInterval());
    };

    if (hasStartedPlayingGame && !isPaused && !isGameOver) {
      timerId = window.setTimeout(runGameTimer, getTickInterval());
    }

    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [hasStartedPlayingGame, isPaused, isGameOver, tickGame, getTickInterval]);

  // Session timer incrementer (updates every second)
  useEffect(() => {
    const interval = setInterval(() => {
      setSessionTime(prev => {
        const nextTime = prev + 1;
        const mins = Math.floor(nextTime / 60).toString().padStart(2, '0');
        const secs = (nextTime % 60).toString().padStart(2, '0');
        setElapsedTimeStr(`${mins}:${secs}`);
        return nextTime;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // High-performance canvas drawing loop for the central game grid (60 FPS particles & animations)
  useEffect(() => {
    let animationId: number;
    
    const draw = () => {
      const canvas = gameCanvasRef.current;
      if (!canvas) {
        animationId = requestAnimationFrame(draw);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const width = 500;
      const height = 400;

      // Reset width/height for High-DPI screen clarity
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
      }

      // Clear Screen
      ctx.fillStyle = '#0c0c14';
      ctx.fillRect(0, 0, width, height);

      // Draw beautiful dynamic grid background matching the active track color
      const gridColor = currentTrack.primaryColor;
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      
      // Vertical grid lines
      for (let c = 0; c <= COLS; c++) {
        ctx.beginPath();
        ctx.moveTo(c * CELL_SIZE, 0);
        ctx.lineTo(c * CELL_SIZE, height);
        ctx.stroke();
      }
      
      // Horizontal grid lines
      for (let r = 0; r <= ROWS; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * CELL_SIZE);
        ctx.lineTo(width, r * CELL_SIZE);
        ctx.stroke();
      }
      ctx.restore();

      // Render the glowing Food (pulsating)
      const pulseFactor = 0.8 + Math.sin(Date.now() / 100) * 0.2;
      const foodX = foodRef.current.x * CELL_SIZE + CELL_SIZE / 2;
      const foodY = foodRef.current.y * CELL_SIZE + CELL_SIZE / 2;
      const foodRadius = (CELL_SIZE / 2 - 2) * pulseFactor;

      ctx.save();
      // Neon glow setup
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#d946ef'; // fuchsia pulse glow
      ctx.fillStyle = '#d946ef';
      ctx.beginPath();
      ctx.arc(foodX, foodY, foodRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Render the glowing Synthwave Snake
      const snake = snakeRef.current;
      snake.forEach((segment, idx) => {
        const x = segment.x * CELL_SIZE;
        const y = segment.y * CELL_SIZE;
        const size = CELL_SIZE;

        ctx.save();
        
        // Fades trailing sections
        const alpha = Math.max(0.3, 1.0 - (idx / snake.length) * 0.6);
        ctx.globalAlpha = alpha;

        // Colors the snake using the current active track gradient
        if (idx === 0) {
          // Head gets primary neon glowing look
          ctx.shadowBlur = 12;
          ctx.shadowColor = currentTrack.primaryColor;
          ctx.fillStyle = currentTrack.primaryColor;
        } else {
          // Tail transitions towards secondary color
          ctx.fillStyle = currentTrack.secondaryColor;
        }

        // Render rounded snake block
        const radius = idx === 0 ? 6 : 3;
        ctx.beginPath();
        ctx.roundRect(x + 1, y + 1, size - 2, size - 2, radius);
        ctx.fill();

        // Draw cute retro glowing eyes on the head
        if (idx === 0) {
          ctx.fillStyle = '#ffffff';
          ctx.shadowBlur = 0;
          const eyeSize = 3;
          let leftEyeX = 0, leftEyeY = 0, rightEyeX = 0, rightEyeY = 0;

          switch (directionRef.current) {
            case 'RIGHT':
              leftEyeX = x + size - 6; leftEyeY = y + 5;
              rightEyeX = x + size - 6; rightEyeY = y + size - 8;
              break;
            case 'LEFT':
              leftEyeX = x + 6; leftEyeY = y + 5;
              rightEyeX = x + 6; rightEyeY = y + size - 8;
              break;
            case 'UP':
              leftEyeX = x + 5; leftEyeY = y + 6;
              rightEyeX = x + size - 8; rightEyeY = y + 6;
              break;
            case 'DOWN':
              leftEyeX = x + 5; leftEyeY = y + size - 6;
              rightEyeX = x + size - 8; rightEyeY = y + size - 6;
              break;
          }

          ctx.beginPath();
          ctx.arc(leftEyeX, leftEyeY, eyeSize, 0, Math.PI * 2);
          ctx.arc(rightEyeX, rightEyeY, eyeSize, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      });

      // Update and Draw Particles
      const particles = particlesRef.current;
      ctx.save();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 1 / p.maxLife;

        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.globalAlpha = p.life;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      animationId = requestAnimationFrame(draw);
    };

    animationId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationId);
  }, [currentTrack]);

  // High-performance canvas drawing loop for the right audio visualizer
  useEffect(() => {
    let animationId: number;

    const drawVisualizer = () => {
      const canvas = visualizerCanvasRef.current;
      if (!canvas) {
        animationId = requestAnimationFrame(drawVisualizer);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const width = 280;
      const height = 80;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
      }

      ctx.clearRect(0, 0, width, height);

      // Get real data from our procedural synthesizer
      const data = audioEngine.getByteFrequencyData();
      const numBars = 18;
      const barWidth = Math.floor(width / numBars) - 2;

      // Set beautiful neon gradient coloring depending on current track
      const gradient = ctx.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, currentTrack.secondaryColor);
      gradient.addColorStop(0.5, currentTrack.primaryColor);
      gradient.addColorStop(1, '#d946ef'); // fuchsia top cap

      // Draw columns
      for (let i = 0; i < numBars; i++) {
        // Map data indices so we read the most active bass/mid frequencies primarily
        const dataIndex = Math.floor((i / numBars) * (data.length * 0.7));
        const val = data[dataIndex] || 0;
        
        // Base idle jitter if music is paused to keep the visualizer looking alive
        const idleJitter = isPlaying ? 0 : Math.sin(Date.now() / 200 + i * 0.5) * 4 + 4;
        const normalizedVal = Math.max(3, (val / 255) * height + idleJitter);
        
        const x = i * (barWidth + 2);
        const y = height - normalizedVal;

        ctx.save();
        ctx.shadowBlur = isPlaying ? 8 : 2;
        ctx.shadowColor = currentTrack.primaryColor;
        ctx.fillStyle = gradient;

        // Rounded bar columns
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, normalizedVal, [2, 2, 0, 0]);
        ctx.fill();
        ctx.restore();
      }

      animationId = requestAnimationFrame(drawVisualizer);
    };

    animationId = requestAnimationFrame(drawVisualizer);
    return () => cancelAnimationFrame(animationId);
  }, [currentTrack, isPlaying]);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#050507] text-gray-100 font-sans overflow-hidden">
      
      {/* Top Navigation / Header */}
      <header className="h-16 border-b border-cyan-950 bg-[#0a0a0f] flex items-center justify-between px-8 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-cyan-500 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.6)]">
            <svg className="w-5 h-5 text-black" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
            </svg>
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-bold tracking-tighter uppercase italic text-cyan-400 leading-tight">
              Synth<span className="text-fuchsia-500">Snake</span> <span className="text-xs font-mono not-italic text-gray-500 ml-1">v2.0</span>
            </h1>
          </div>
        </div>

        {/* Stats Panel */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5 bg-zinc-900/60 border border-zinc-800/80 px-4 py-1.5 rounded-lg">
            <Trophy className="w-4 h-4 text-amber-400" />
            <div className="text-right">
              <p className="text-[9px] text-gray-500 uppercase tracking-widest leading-none font-bold">High Score</p>
              <p className="text-fuchsia-400 font-mono font-bold text-base leading-tight">
                {highScore.toLocaleString()}
              </p>
            </div>
          </div>
          
          <div className="h-8 w-px bg-zinc-800"></div>

          <div className="flex items-center gap-2.5 bg-zinc-900/60 border border-zinc-800/80 px-4 py-1.5 rounded-lg">
            <Clock className="w-4 h-4 text-cyan-400" />
            <div className="text-right">
              <p className="text-[9px] text-gray-500 uppercase tracking-widest leading-none font-bold">Session Time</p>
              <p className="text-cyan-400 font-mono text-base font-bold leading-tight">
                {elapsedTimeStr}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* Sidebar Left: Playlist */}
        <aside className="w-72 bg-[#08080c] border-r border-zinc-900/40 flex flex-col p-6 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Playlist Queue</h2>
            <Music className="w-3.5 h-3.5 text-cyan-500" />
          </div>

          <div className="space-y-3 overflow-y-auto max-h-[340px] pr-1">
            {PLAYLIST.map((track, idx) => {
              const isActive = track.id === currentTrack.id;
              return (
                <div 
                  id={`track-item-${track.id}`}
                  key={track.id}
                  onClick={() => handleSelectTrack(idx)}
                  className={`p-3 rounded-lg transition-all duration-300 cursor-pointer flex items-center gap-3 border ${
                    isActive 
                      ? 'bg-cyan-950/20 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.15)]' 
                      : 'hover:bg-zinc-900/40 border-transparent hover:border-zinc-800/40'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-md flex items-center justify-center font-bold ${
                    isActive 
                      ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-black shadow-[0_0_10px_rgba(6,182,212,0.4)]' 
                      : 'bg-zinc-850 text-gray-400'
                  }`}>
                    {isActive && isPlaying ? (
                      <div className="flex items-end gap-0.5 h-4">
                        <div className="w-0.5 bg-black h-2 animate-bounce"></div>
                        <div className="w-0.5 bg-black h-3.5 animate-bounce [animation-delay:0.15s]"></div>
                        <div className="w-0.5 bg-black h-1.5 animate-bounce [animation-delay:0.3s]"></div>
                      </div>
                    ) : (
                      <span className="text-xs font-mono">0{idx + 1}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${isActive ? 'text-cyan-300' : 'text-gray-300'}`}>
                      {track.title}
                    </p>
                    <p className="text-[11px] text-gray-500 truncate">{track.artist}</p>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-600">{track.bpm} BPM</span>
                </div>
              );
            })}
          </div>

          {/* Pro Tip Callout Card */}
          <div className="mt-auto">
            <div className="bg-fuchsia-950/15 border border-fuchsia-500/15 rounded-xl p-4 shadow-[0_4px_20px_rgba(217,70,239,0.02)]">
              <div className="flex items-center gap-2 mb-1.5">
                <Zap className="w-3.5 h-3.5 text-fuchsia-400 fill-fuchsia-400" />
                <p className="text-[10px] text-fuchsia-400 font-bold uppercase tracking-wider">Gameplay Multiplier</p>
              </div>
              <p className="text-xs text-gray-400 italic leading-relaxed">
                The snake moves faster as the song BPM intensifies. Switch tracks to alter difficulty and boost your score multiplier!
              </p>
            </div>
          </div>
        </aside>

        {/* Center Section: Snake Game */}
        <section className="flex-1 flex flex-col items-center justify-center relative p-8">
          
          {/* Top Multiplier and Score Banner */}
          <div className="flex items-center justify-between w-full max-w-[500px] mb-6">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Current Score</span>
              <span className="text-4xl font-mono font-extrabold text-white tracking-tight">
                {score.toLocaleString()}
              </span>
            </div>
            
            {/* Streak indicator */}
            {streak > 0 && (
              <div className="flex items-center gap-1.5 bg-fuchsia-950/30 border border-fuchsia-500/30 px-3 py-1 rounded-full animate-bounce">
                <Sparkles className="w-3 h-3 text-fuchsia-400" />
                <span className="text-xs font-mono font-bold text-fuchsia-300">Streak x{streak}</span>
              </div>
            )}

            <div className="text-right flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Multiplier</span>
              <span className="text-4xl font-mono font-extrabold text-lime-400 drop-shadow-[0_0_10px_rgba(163,230,53,0.5)]">
                x{multiplier.toFixed(1)}
              </span>
            </div>
          </div>

          {/* Central Game Window */}
          <div 
            id="synthwave-game-board"
            className="relative w-[500px] h-[400px] border border-cyan-500/30 rounded-lg overflow-hidden shadow-[0_0_40px_rgba(6,182,212,0.12)] bg-[#0c0c14]"
          >
            {/* The Hardware accelerated HTML5 Canvas */}
            <canvas 
              ref={gameCanvasRef} 
              className="absolute inset-0 w-full h-full block"
            />

            {/* OVERLAY: Play / Pause State Screen */}
            {!hasStartedPlayingGame && (
              <div className="absolute inset-0 z-10 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center animate-fade-in">
                <div className="w-16 h-16 rounded-full bg-cyan-500 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.6)] mb-6 animate-pulse">
                  <Gamepad2 className="w-8 h-8 text-black" />
                </div>
                <h3 className="text-2xl font-bold uppercase tracking-wide text-cyan-400 italic mb-2">
                  SynthSnake Arcade
                </h3>
                <p className="text-sm text-zinc-400 max-w-sm mb-6 leading-relaxed">
                  Navigate the cyber grid, consume glowing power-ups, and enjoy dynamic synthwave tracks created live on your browser!
                </p>
                <button
                  id="btn-play-arcade"
                  onClick={resetGame}
                  className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-black font-bold uppercase tracking-wider rounded shadow-[0_0_25px_rgba(6,182,212,0.4)] hover:scale-105 transition-all duration-300 cursor-pointer"
                >
                  Insert Coin / Start Game
                </button>
              </div>
            )}

            {/* OVERLAY: Game Over Screen */}
            {isGameOver && (
              <div className="absolute inset-0 z-10 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-fuchsia-500/20 border-2 border-fuchsia-500 flex items-center justify-center shadow-[0_0_20px_rgba(217,70,239,0.5)] mb-4">
                  <RotateCcw className="w-8 h-8 text-fuchsia-400 animate-spin" style={{ animationDuration: '4s' }} />
                </div>
                <h3 className="text-3xl font-extrabold uppercase tracking-widest text-fuchsia-500 italic mb-2">
                  SYSTEM FAILURE
                </h3>
                <p className="text-xs text-zinc-500 uppercase tracking-widest mb-4">Collision Detected</p>
                
                <div className="bg-zinc-900/80 border border-zinc-800/80 px-6 py-4 rounded-xl mb-6 flex gap-8">
                  <div>
                    <span className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-0.5">Final Score</span>
                    <span className="text-2xl font-mono font-bold text-white">{score}</span>
                  </div>
                  <div className="w-px bg-zinc-800"></div>
                  <div>
                    <span className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-0.5">High Score</span>
                    <span className="text-2xl font-mono font-bold text-fuchsia-400">{highScore}</span>
                  </div>
                </div>

                <button
                  id="btn-restart-game"
                  onClick={resetGame}
                  className="px-8 py-3 bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white font-bold uppercase tracking-wider rounded shadow-[0_0_25px_rgba(217,70,239,0.4)] hover:scale-105 transition-all duration-300 cursor-pointer"
                >
                  Reboot / Play Again
                </button>
              </div>
            )}

            {/* OVERLAY: Paused Screen */}
            {isPaused && (
              <div className="absolute inset-0 z-10 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center text-center">
                <div className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center mb-4">
                  <Pause className="w-6 h-6 text-cyan-400" />
                </div>
                <h3 className="text-xl font-bold uppercase tracking-widest text-cyan-400">
                  Grid Suspended
                </h3>
                <p className="text-xs text-zinc-500 mt-1 uppercase tracking-widest mb-6">Press Space to Resume</p>
                <button
                  id="btn-resume-game"
                  onClick={() => setIsPaused(false)}
                  className="px-6 py-2 bg-cyan-500 text-black font-semibold uppercase tracking-wider text-xs rounded hover:bg-cyan-400 transition-colors cursor-pointer"
                >
                  Resume Gameplay
                </button>
              </div>
            )}

            {/* Game Overlay Labels inside board borders */}
            <div className="absolute bottom-4 left-4 text-[9px] font-mono text-cyan-700 uppercase tracking-widest select-none">
              Hardware_Acceleration: ACTIVE
            </div>
            <div className="absolute bottom-4 right-4 text-[9px] font-mono text-cyan-700 uppercase tracking-widest select-none">
              Latency: 2ms
            </div>
          </div>
          
          <p className="mt-6 text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-medium flex items-center gap-2">
            <span>Use <strong className="text-zinc-400 font-bold">[W][A][S][D]</strong> or <strong className="text-zinc-400 font-bold">[ARROWS]</strong> to Navigate</span>
            <span className="text-zinc-700">•</span>
            <span>Press <strong className="text-zinc-400 font-bold">[SPACEBAR]</strong> to Pause/Start</span>
          </p>
        </section>

        {/* Right Sidebar: Album Cover Art & Live Audio Visualizer */}
        <aside className="w-80 bg-[#08080c] border-l border-zinc-900/40 flex flex-col p-6 shrink-0">
          <div className="flex-1 flex flex-col">
            
            {/* Hologram cover art */}
            <div className="aspect-square w-full rounded-xl bg-gradient-to-tr from-zinc-950 to-zinc-900 border border-zinc-800/40 flex flex-col items-center justify-center mb-6 overflow-hidden relative shadow-[inset_0_4px_30px_rgba(0,0,0,0.8)]">
              {/* Spinning Neon Record */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div 
                  className={`w-40 h-40 rounded-full border-[10px] border-zinc-950 relative flex items-center justify-center shadow-[0_0_30px_rgba(0,0,0,0.8)] transition-transform ease-out`}
                  style={{
                    backgroundImage: `radial-gradient(circle, #18181b 30%, #09090b 70%)`,
                    transform: isPlaying ? `rotate(${Date.now() / 15 % 360}deg)` : 'none'
                  }}
                >
                  {/* Record groove lines */}
                  <div className="absolute inset-3 rounded-full border border-zinc-850 opacity-40"></div>
                  <div className="absolute inset-6 rounded-full border border-zinc-850 opacity-40"></div>
                  <div className="absolute inset-10 rounded-full border border-zinc-850 opacity-40"></div>
                  
                  {/* Vinyl label matching active track */}
                  <div 
                    className="w-14 h-14 rounded-full flex items-center justify-center text-center transition-colors duration-500"
                    style={{
                      backgroundImage: `linear-gradient(135deg, ${currentTrack.primaryColor}22, ${currentTrack.secondaryColor}44)`
                    }}
                  >
                    <div className="w-4 h-4 rounded-full bg-zinc-950 border-2 border-zinc-800"></div>
                  </div>
                </div>
              </div>

              {/* Cover Text Overlaid */}
              <div className="text-center z-10 pointer-events-none mt-auto pb-4 pt-16 bg-gradient-to-t from-zinc-950 to-transparent w-full">
                <p className="text-[10px] text-fuchsia-400 uppercase font-bold tracking-[0.2em] mb-0.5">Now Playing</p>
                <h3 className="text-xl font-bold text-white tracking-tight leading-tight px-3 truncate">
                  {currentTrack.title}
                </h3>
                <p className="text-xs text-zinc-400 italic mt-0.5 truncate">
                  by {currentTrack.artist}
                </p>
              </div>
            </div>

            {/* Interactive Sound Analyzer */}
            <div className="bg-zinc-950/60 border border-zinc-900/60 p-4 rounded-xl flex flex-col gap-3 mt-auto">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">Spectrum Visualizer</span>
                <span className="text-[10px] text-cyan-500 uppercase font-mono tracking-wider">LIVE FEED</span>
              </div>
              
              {/* Visualizer Canvas */}
              <div className="w-full h-20 bg-black/40 rounded-lg flex items-center justify-center overflow-hidden">
                <canvas 
                  ref={visualizerCanvasRef} 
                  className="w-full h-full block"
                />
              </div>

              <p className="text-center text-[9px] text-zinc-600 font-mono tracking-widest">
                AI FREQUENCY SPECTRUM v2.0.4
              </p>
            </div>

          </div>
        </aside>
      </main>

      {/* Bottom Footer: Player Controls */}
      <footer className="h-20 bg-[#0a0a0f] border-t border-zinc-900/60 flex items-center px-10 shrink-0 gap-10">
        
        {/* Playback Buttons */}
        <div className="flex items-center gap-4 shrink-0">
          <button 
            id="btn-prev-track"
            onClick={handlePrevTrack}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-full transition-all cursor-pointer"
            title="Previous Track"
          >
            <SkipBack className="w-5 h-5 fill-current" />
          </button>
          
          <button 
            id="btn-play-pause"
            onClick={handlePlayPause}
            className="w-12 h-12 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 transition-all shadow-[0_0_15px_rgba(255,255,255,0.25)] hover:shadow-cyan-500/20 cursor-pointer"
            title={isPlaying ? "Pause Music" : "Play Music"}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-current text-black" />
            ) : (
              <Play className="w-5 h-5 fill-current text-black ml-0.5" />
            )}
          </button>
          
          <button 
            id="btn-next-track"
            onClick={handleNextTrack}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-full transition-all cursor-pointer"
            title="Next Track"
          >
            <SkipForward className="w-5 h-5 fill-current" />
          </button>
        </div>

        {/* Progress scrub bar & description */}
        <div className="flex-1 flex flex-col gap-1.5 min-w-0">
          <div className="flex justify-between items-center text-[10px] font-mono text-gray-500 select-none">
            <span>00:{currentStep.toString().padStart(2, '0')}</span>
            <span className="text-cyan-400 truncate font-semibold uppercase tracking-wider mx-4">
              {currentTrack.title} ({currentTrack.genre}) — {currentTrack.bpm} BPM
            </span>
            <span>00:32</span>
          </div>
          
          {/* Progress timeline bar */}
          <div 
            className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden relative cursor-pointer group"
            title="Beat Loop Progress"
          >
            <div 
              className="h-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 shadow-[0_0_10px_rgba(6,182,212,0.6)] transition-all duration-100 ease-linear"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>

        {/* Volume Controllers */}
        <div className="flex items-center gap-3 w-44 shrink-0 bg-zinc-900/40 border border-zinc-800/20 px-4 py-2 rounded-lg">
          <button 
            id="btn-volume-toggle"
            onClick={handleToggleMute}
            className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-fuchsia-400" />
            ) : volume > 0.5 ? (
              <Volume2 className="w-4 h-4 text-cyan-400" />
            ) : (
              <Volume1 className="w-4 h-4 text-cyan-400" />
            )}
          </button>
          
          <input 
            id="slider-volume"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="flex-1 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-400 hover:accent-cyan-300 focus:outline-none"
            style={{
              backgroundImage: `linear-gradient(to right, rgb(6, 182, 212) 0%, rgb(6, 182, 212) ${(isMuted ? 0 : volume) * 100}%, rgb(63, 63, 70) ${(isMuted ? 0 : volume) * 100}%, rgb(63, 63, 70) 100%)`
            }}
          />
        </div>

      </footer>
    </div>
  );
}
