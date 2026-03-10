import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────
type GameStatus = "start" | "playing" | "gameover";

interface Obstacle {
  lane: number; // 0 | 1 | 2
  y: number;
  type: "car" | "rock";
  color: string;
  width: number;
  height: number;
}

interface GameState {
  playerLane: number;
  lives: number;
  score: number;
  speed: number;
  obstacles: Obstacle[];
  invincible: boolean;
  invincibleTimer: number;
  lastTime: number;
  roadOffset: number;
  laneChangeTimer: number; // cooldown between lane switches
  dashOffset: number; // for animated road dashes
}

// ── Canvas constants ──────────────────────────────────────────────────────────
const CANVAS_W = 360;
const CANVAS_H = 600;
const ROAD_LEFT = 40;
const ROAD_RIGHT = CANVAS_W - 40;
const ROAD_W = ROAD_RIGHT - ROAD_LEFT;
const LANE_W = ROAD_W / 3;

// Lane center X positions
const LANE_X = [
  ROAD_LEFT + LANE_W * 0.5,
  ROAD_LEFT + LANE_W * 1.5,
  ROAD_LEFT + LANE_W * 2.5,
];

const PLAYER_W = 32;
const PLAYER_H = 56;
const PLAYER_Y = CANVAS_H - 100;

const INITIAL_SPEED = 180; // pixels/sec
const SPEED_INCREMENT = 8; // px/sec increase per second
const MAX_SPEED = 600;

const OBSTACLE_COLORS_CAR = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f59e0b", // amber
];
const OBSTACLE_COLORS_ROCK = ["#6b7280", "#9ca3af", "#4b5563"];

const HIGH_SCORE_KEY = "bikeRaceHighScore";

function getHighScore(): number {
  try {
    return (
      Number.parseInt(localStorage.getItem(HIGH_SCORE_KEY) ?? "0", 10) || 0
    );
  } catch {
    return 0;
  }
}

function setHighScore(score: number) {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, score.toString());
  } catch {
    /* ignore */
  }
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

function drawRoad(ctx: CanvasRenderingContext2D, dashOffset: number) {
  // Grass sides
  ctx.fillStyle = "#1a3a1a";
  ctx.fillRect(0, 0, ROAD_LEFT, CANVAS_H);
  ctx.fillRect(ROAD_RIGHT, 0, CANVAS_W - ROAD_RIGHT, CANVAS_H);

  // Grass texture lines
  ctx.strokeStyle = "#1e4a1e";
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 7, 0);
    ctx.lineTo(i * 7, CANVAS_H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ROAD_RIGHT + 4 + i * 7, 0);
    ctx.lineTo(ROAD_RIGHT + 4 + i * 7, CANVAS_H);
    ctx.stroke();
  }

  // Road asphalt
  ctx.fillStyle = "#1c1c24";
  ctx.fillRect(ROAD_LEFT, 0, ROAD_W, CANVAS_H);

  // Road edges (white lines)
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(ROAD_LEFT, 0);
  ctx.lineTo(ROAD_LEFT, CANVAS_H);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ROAD_RIGHT, 0);
  ctx.lineTo(ROAD_RIGHT, CANVAS_H);
  ctx.stroke();

  // Lane dashes (animated)
  ctx.setLineDash([30, 20]);
  ctx.lineDashOffset = -dashOffset;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  for (let lane = 1; lane < 3; lane++) {
    const lx = ROAD_LEFT + LANE_W * lane;
    ctx.beginPath();
    ctx.moveTo(lx, 0);
    ctx.lineTo(lx, CANVAS_H);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawBike(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  invincible: boolean,
) {
  const alpha = invincible
    ? Math.floor(Date.now() / 80) % 2 === 0
      ? 0.4
      : 1
    : 1;
  ctx.globalAlpha = alpha;

  const bx = x - PLAYER_W / 2;
  const by = y - PLAYER_H / 2;
  const w = PLAYER_W;
  const h = PLAYER_H;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(x, y + h / 2 + 4, w * 0.45, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body (orange-red fairing)
  ctx.fillStyle = "#f97316";
  ctx.beginPath();
  ctx.roundRect(bx + 4, by + 10, w - 8, h - 20, 6);
  ctx.fill();

  // Darker fairing sides
  ctx.fillStyle = "#ea580c";
  ctx.beginPath();
  ctx.roundRect(bx, by + 20, 6, h - 36, 3);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(bx + w - 6, by + 20, 6, h - 36, 3);
  ctx.fill();

  // Windshield
  ctx.fillStyle = "rgba(147,210,255,0.7)";
  ctx.beginPath();
  ctx.roundRect(bx + 7, by + 8, w - 14, 16, 4);
  ctx.fill();

  // Rider helmet
  ctx.fillStyle = "#1f2937";
  ctx.beginPath();
  ctx.arc(x, by + 6, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f97316";
  ctx.beginPath();
  ctx.arc(x, by + 6, 7, 0, Math.PI * 2);
  ctx.fill();

  // Front wheel
  ctx.fillStyle = "#111827";
  ctx.beginPath();
  ctx.roundRect(bx + 6, by + h - 16, w - 12, 18, 5);
  ctx.fill();
  ctx.strokeStyle = "#374151";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Back wheel
  ctx.fillStyle = "#111827";
  ctx.beginPath();
  ctx.roundRect(bx + 6, by + 4, w - 12, 16, 5);
  ctx.fill();
  ctx.strokeStyle = "#374151";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Exhaust glow
  ctx.fillStyle = "rgba(251,146,60,0.5)";
  ctx.beginPath();
  ctx.ellipse(x, by + h + 4, 6, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
}

function drawCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  w: number,
  h: number,
) {
  const bx = x - w / 2;
  const by = y - h / 2;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(x, y + h / 2 + 4, w * 0.45, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Car body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(bx, by + 10, w, h - 10, 5);
  ctx.fill();

  // Car roof
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(bx + 5, by, w - 10, 26, 4);
  ctx.fill();

  // Darker side strips
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(bx + 2, by + 16, 4, h - 22);
  ctx.fillRect(bx + w - 6, by + 16, 4, h - 22);

  // Windshield
  ctx.fillStyle = "rgba(147,210,255,0.6)";
  ctx.beginPath();
  ctx.roundRect(bx + 7, by + 2, w - 14, 14, 3);
  ctx.fill();

  // Rear window
  ctx.fillStyle = "rgba(100,160,210,0.5)";
  ctx.beginPath();
  ctx.roundRect(bx + 7, by + 18, w - 14, 10, 2);
  ctx.fill();

  // Headlights (red taillights since car is coming toward us)
  ctx.fillStyle = "#ef4444";
  ctx.beginPath();
  ctx.roundRect(bx + 2, by + h - 10, 8, 6, 2);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(bx + w - 10, by + h - 10, 8, 6, 2);
  ctx.fill();

  // Front lights (yellow)
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath();
  ctx.roundRect(bx + 2, by + 12, 8, 5, 2);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(bx + w - 10, by + 12, 8, 5, 2);
  ctx.fill();

  // Wheels
  ctx.fillStyle = "#111827";
  ctx.beginPath();
  ctx.roundRect(bx - 3, by + 12, 6, 14, 2);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(bx + w - 3, by + 12, 6, 14, 2);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(bx - 3, by + h - 20, 6, 14, 2);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(bx + w - 3, by + h - 20, 6, 14, 2);
  ctx.fill();
}

function drawRock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  w: number,
  h: number,
) {
  const bx = x - w / 2;
  const by = y - h / 2;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(x, y + h / 2 + 3, w * 0.4, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Rock shape
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(bx + w * 0.15, by + h);
  ctx.lineTo(bx, by + h * 0.55);
  ctx.lineTo(bx + w * 0.1, by + h * 0.2);
  ctx.lineTo(bx + w * 0.35, by);
  ctx.lineTo(bx + w * 0.65, by + h * 0.05);
  ctx.lineTo(bx + w, by + h * 0.4);
  ctx.lineTo(bx + w * 0.85, by + h);
  ctx.closePath();
  ctx.fill();

  // Rock highlight
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.beginPath();
  ctx.moveTo(bx + w * 0.2, by + h * 0.15);
  ctx.lineTo(bx + w * 0.1, by + h * 0.45);
  ctx.lineTo(bx + w * 0.35, by + h * 0.05);
  ctx.closePath();
  ctx.fill();
}

function drawHUD(
  ctx: CanvasRenderingContext2D,
  score: number,
  lives: number,
  speed: number,
) {
  // HUD background
  ctx.fillStyle = "rgba(8,8,16,0.75)";
  ctx.fillRect(0, 0, CANVAS_W, 48);

  // Score
  ctx.fillStyle = "#f4f4f5";
  ctx.font = "bold 13px 'Geist Mono', monospace";
  ctx.textAlign = "left";
  ctx.fillText("SCORE", 12, 16);
  ctx.fillStyle = "#fb923c";
  ctx.font = "bold 18px 'Geist Mono', monospace";
  ctx.fillText(score.toString().padStart(6, "0"), 12, 36);

  // Speed
  ctx.fillStyle = "#f4f4f5";
  ctx.font = "bold 13px 'Geist Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillText("SPEED", CANVAS_W / 2, 16);
  ctx.fillStyle = "#facc15";
  ctx.font = "bold 18px 'Geist Mono', monospace";
  ctx.fillText(`${Math.round(speed)} km/h`, CANVAS_W / 2, 36);

  // Lives (hearts)
  ctx.fillStyle = "#f4f4f5";
  ctx.font = "bold 13px 'Geist Mono', monospace";
  ctx.textAlign = "right";
  ctx.fillText("LIVES", CANVAS_W - 12, 16);
  for (let i = 0; i < 3; i++) {
    const hx = CANVAS_W - 16 - i * 20;
    if (i < lives) {
      ctx.fillStyle = "#ef4444";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("❤", hx, 36);
    } else {
      ctx.fillStyle = "rgba(239,68,68,0.25)";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("❤", hx, 36);
    }
  }
}

function drawStartScreen(ctx: CanvasRenderingContext2D, highScore: number) {
  // Dim overlay
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Speed lines effect
  ctx.strokeStyle = "rgba(251,146,60,0.06)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 20; i++) {
    const lx = Math.random() * CANVAS_W;
    ctx.beginPath();
    ctx.moveTo(lx, 0);
    ctx.lineTo(lx, CANVAS_H);
    ctx.stroke();
  }

  // Title glow
  ctx.shadowColor = "#fb923c";
  ctx.shadowBlur = 30;
  ctx.fillStyle = "#fb923c";
  ctx.font = "bold 58px 'Bricolage Grotesque', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("BIKE", CANVAS_W / 2, CANVAS_H / 2 - 80);
  ctx.fillStyle = "#facc15";
  ctx.fillText("RACE", CANVAS_W / 2, CANVAS_H / 2 - 20);
  ctx.shadowBlur = 0;

  // Subtitle
  ctx.fillStyle = "rgba(244,244,245,0.7)";
  ctx.font = "15px 'Geist Mono', monospace";
  ctx.fillText("DODGE • SURVIVE • SCORE", CANVAS_W / 2, CANVAS_H / 2 + 16);

  // High score
  if (highScore > 0) {
    ctx.fillStyle = "#facc15";
    ctx.font = "bold 14px 'Geist Mono', monospace";
    ctx.fillText(
      `HIGH SCORE: ${highScore.toString().padStart(6, "0")}`,
      CANVAS_W / 2,
      CANVAS_H / 2 + 50,
    );
  }

  // Start button hint
  ctx.fillStyle = "rgba(251,146,60,0.18)";
  ctx.beginPath();
  ctx.roundRect(CANVAS_W / 2 - 110, CANVAS_H / 2 + 70, 220, 46, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(251,146,60,0.5)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#fb923c";
  ctx.font = "bold 15px 'Geist Mono', monospace";
  ctx.fillText("PRESS SPACE / TAP TO START", CANVAS_W / 2, CANVAS_H / 2 + 99);

  // Controls hint
  ctx.fillStyle = "rgba(244,244,245,0.45)";
  ctx.font = "12px 'Cabinet Grotesk', sans-serif";
  ctx.fillText(
    "← → Arrow keys or A/D to dodge",
    CANVAS_W / 2,
    CANVAS_H / 2 + 135,
  );
}

function drawGameOverScreen(
  ctx: CanvasRenderingContext2D,
  score: number,
  highScore: number,
  isNewHigh: boolean,
) {
  // Dim overlay
  ctx.fillStyle = "rgba(0,0,0,0.8)";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Panel
  ctx.fillStyle = "rgba(15,15,30,0.95)";
  ctx.beginPath();
  ctx.roundRect(CANVAS_W / 2 - 140, CANVAS_H / 2 - 160, 280, 310, 12);
  ctx.fill();
  ctx.strokeStyle = "rgba(239,68,68,0.4)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // GAME OVER text
  ctx.shadowColor = "#ef4444";
  ctx.shadowBlur = 20;
  ctx.fillStyle = "#ef4444";
  ctx.font = "bold 42px 'Bricolage Grotesque', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("GAME", CANVAS_W / 2, CANVAS_H / 2 - 100);
  ctx.fillText("OVER", CANVAS_W / 2, CANVAS_H / 2 - 55);
  ctx.shadowBlur = 0;

  // Score
  ctx.fillStyle = "rgba(244,244,245,0.55)";
  ctx.font = "13px 'Geist Mono', monospace";
  ctx.fillText("YOUR SCORE", CANVAS_W / 2, CANVAS_H / 2 - 20);
  ctx.fillStyle = "#fb923c";
  ctx.font = "bold 32px 'Geist Mono', monospace";
  ctx.fillText(
    score.toString().padStart(6, "0"),
    CANVAS_W / 2,
    CANVAS_H / 2 + 12,
  );

  // New high score badge
  if (isNewHigh) {
    ctx.fillStyle = "#facc15";
    ctx.font = "bold 14px 'Bricolage Grotesque', sans-serif";
    ctx.fillText("🏆 NEW HIGH SCORE!", CANVAS_W / 2, CANVAS_H / 2 + 38);
  } else {
    ctx.fillStyle = "rgba(244,244,245,0.4)";
    ctx.font = "12px 'Geist Mono', monospace";
    ctx.fillText(
      `BEST: ${highScore.toString().padStart(6, "0")}`,
      CANVAS_W / 2,
      CANVAS_H / 2 + 38,
    );
  }

  // Play Again button
  ctx.fillStyle = "#fb923c";
  ctx.beginPath();
  ctx.roundRect(CANVAS_W / 2 - 100, CANVAS_H / 2 + 60, 200, 46, 8);
  ctx.fill();
  ctx.fillStyle = "#1c1c24";
  ctx.font = "bold 16px 'Bricolage Grotesque', sans-serif";
  ctx.fillText("PLAY AGAIN", CANVAS_W / 2, CANVAS_H / 2 + 89);
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function BikeGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number>(0);
  const gameStateRef = useRef<GameState>({
    playerLane: 1,
    lives: 3,
    score: 0,
    speed: INITIAL_SPEED,
    obstacles: [],
    invincible: false,
    invincibleTimer: 0,
    lastTime: 0,
    roadOffset: 0,
    laneChangeTimer: 0,
    dashOffset: 0,
  });
  const keysRef = useRef<Set<string>>(new Set());
  const statusRef = useRef<GameStatus>("start");
  const highScoreRef = useRef<number>(getHighScore());
  const newHighRef = useRef<boolean>(false);
  const obstacleTimerRef = useRef<number>(0);

  // React state for UI
  const [gameStatus, setGameStatus] = useState<GameStatus>("start");
  const [displayScore, setDisplayScore] = useState(0);
  const [displayLives, setDisplayLives] = useState(3);
  const [displaySpeed, setDisplaySpeed] = useState(INITIAL_SPEED);

  // ── Spawn obstacle ──────────────────────────────────────────────────────────
  const spawnObstacle = useCallback(() => {
    const lane = Math.floor(Math.random() * 3);
    const isCar = Math.random() > 0.3;
    const obstacle: Obstacle = {
      lane,
      y: -60,
      type: isCar ? "car" : "rock",
      color: isCar
        ? OBSTACLE_COLORS_CAR[
            Math.floor(Math.random() * OBSTACLE_COLORS_CAR.length)
          ]
        : OBSTACLE_COLORS_ROCK[
            Math.floor(Math.random() * OBSTACLE_COLORS_ROCK.length)
          ],
      width: isCar ? 30 : 24,
      height: isCar ? 52 : 26,
    };
    gameStateRef.current.obstacles.push(obstacle);
  }, []);

  // ── Collision detection ──────────────────────────────────────────────────────
  const checkCollision = useCallback((obstacle: Obstacle): boolean => {
    const gs = gameStateRef.current;
    if (obstacle.lane !== gs.playerLane) return false;
    const px = LANE_X[gs.playerLane];
    const py = PLAYER_Y;
    const pad = 6; // fairness padding
    const pr = {
      l: px - PLAYER_W / 2 + pad,
      r: px + PLAYER_W / 2 - pad,
      t: py - PLAYER_H / 2 + pad,
      b: py + PLAYER_H / 2 - pad,
    };
    const ox = LANE_X[obstacle.lane];
    const or = {
      l: ox - obstacle.width / 2 + pad,
      r: ox + obstacle.width / 2 - pad,
      t: obstacle.y - obstacle.height / 2 + pad,
      b: obstacle.y + obstacle.height / 2 - pad,
    };
    return pr.l < or.r && pr.r > or.l && pr.t < or.b && pr.b > or.t;
  }, []);

  // ── Game loop ────────────────────────────────────────────────────────────────
  const gameLoop = useCallback(
    (timestamp: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (statusRef.current !== "playing") return;

      const gs = gameStateRef.current;
      const dt =
        gs.lastTime === 0
          ? 0.016
          : Math.min((timestamp - gs.lastTime) / 1000, 0.05);
      gs.lastTime = timestamp;

      // ── Update speed ──
      gs.speed = Math.min(gs.speed + SPEED_INCREMENT * dt, MAX_SPEED);

      // ── Update road offset (animated dashes) ──
      gs.dashOffset = (gs.dashOffset + gs.speed * dt) % 50;

      // ── Score ──
      gs.score += Math.floor(gs.speed * dt * 0.15);

      // ── Invincibility timer ──
      if (gs.invincible) {
        gs.invincibleTimer -= dt;
        if (gs.invincibleTimer <= 0) {
          gs.invincible = false;
        }
      }

      // ── Lane change cooldown ──
      if (gs.laneChangeTimer > 0) gs.laneChangeTimer -= dt;

      // ── Handle input ──
      if (gs.laneChangeTimer <= 0) {
        const goLeft =
          keysRef.current.has("ArrowLeft") ||
          keysRef.current.has("a") ||
          keysRef.current.has("A");
        const goRight =
          keysRef.current.has("ArrowRight") ||
          keysRef.current.has("d") ||
          keysRef.current.has("D");
        if (goLeft && gs.playerLane > 0) {
          gs.playerLane--;
          gs.laneChangeTimer = 0.18;
        } else if (goRight && gs.playerLane < 2) {
          gs.playerLane++;
          gs.laneChangeTimer = 0.18;
        }
      }

      // ── Spawn obstacles ──
      obstacleTimerRef.current -= dt;
      if (obstacleTimerRef.current <= 0) {
        spawnObstacle();
        // Spawn interval decreases with speed
        obstacleTimerRef.current = Math.max(0.6, 1.8 - gs.speed / 500);
      }

      // ── Move obstacles ──
      gs.obstacles = gs.obstacles
        .map((o) => ({ ...o, y: o.y + gs.speed * dt }))
        .filter((o) => o.y < CANVAS_H + 80);

      // ── Collision check ──
      if (!gs.invincible) {
        for (const o of gs.obstacles) {
          if (checkCollision(o)) {
            gs.lives--;
            gs.invincible = true;
            gs.invincibleTimer = 2.0;
            setDisplayLives(gs.lives);
            if (gs.lives <= 0) {
              // Game over
              const finalScore = gs.score;
              const hs = highScoreRef.current;
              if (finalScore > hs) {
                highScoreRef.current = finalScore;
                setHighScore(finalScore);
                newHighRef.current = true;
              } else {
                newHighRef.current = false;
              }
              statusRef.current = "gameover";
              setGameStatus("gameover");
            }
            break;
          }
        }
      }

      // ── React state sync (throttled) ──
      setDisplayScore(gs.score);
      setDisplaySpeed(Math.round(gs.speed));

      // ── Draw ──
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // Road
      drawRoad(ctx, gs.dashOffset);

      // Obstacles
      for (const o of gs.obstacles) {
        const ox = LANE_X[o.lane];
        if (o.type === "car") {
          drawCar(ctx, ox, o.y, o.color, o.width, o.height);
        } else {
          drawRock(ctx, ox, o.y, o.color, o.width, o.height);
        }
      }

      // Player
      drawBike(ctx, LANE_X[gs.playerLane], PLAYER_Y, gs.invincible);

      // HUD
      drawHUD(ctx, gs.score, gs.lives, gs.speed);

      // Game over overlay if needed
      if (statusRef.current === "gameover") {
        drawGameOverScreen(
          ctx,
          gs.score,
          highScoreRef.current,
          newHighRef.current,
        );
        return; // stop loop
      }

      gameLoopRef.current = requestAnimationFrame(gameLoop);
    },
    [spawnObstacle, checkCollision],
  );

  // ── Draw static screens ─────────────────────────────────────────────────────
  const drawStaticScreen = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    drawRoad(ctx, 0);
    // Draw a static bike
    drawBike(ctx, LANE_X[1], PLAYER_Y, false);

    if (statusRef.current === "start") {
      drawStartScreen(ctx, highScoreRef.current);
    } else if (statusRef.current === "gameover") {
      const gs = gameStateRef.current;
      drawGameOverScreen(
        ctx,
        gs.score,
        highScoreRef.current,
        newHighRef.current,
      );
    }
  }, []);

  // ── Start game ──────────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    cancelAnimationFrame(gameLoopRef.current);
    gameStateRef.current = {
      playerLane: 1,
      lives: 3,
      score: 0,
      speed: INITIAL_SPEED,
      obstacles: [],
      invincible: false,
      invincibleTimer: 0,
      lastTime: 0,
      roadOffset: 0,
      laneChangeTimer: 0,
      dashOffset: 0,
    };
    obstacleTimerRef.current = 0.8;
    newHighRef.current = false;
    setDisplayScore(0);
    setDisplayLives(3);
    setDisplaySpeed(INITIAL_SPEED);
    statusRef.current = "playing";
    setGameStatus("playing");
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [gameLoop]);

  // ── Handle touch/click on canvas ────────────────────────────────────────────
  const handleCanvasClick = useCallback(() => {
    if (statusRef.current === "start") {
      startGame();
    } else if (statusRef.current === "gameover") {
      startGame();
    }
  }, [startGame]);

  // ── Mobile control handlers ──────────────────────────────────────────────────
  const handleMoveLeft = useCallback(() => {
    const gs = gameStateRef.current;
    if (statusRef.current !== "playing") return;
    if (gs.laneChangeTimer <= 0 && gs.playerLane > 0) {
      gs.playerLane--;
      gs.laneChangeTimer = 0.18;
    }
  }, []);

  const handleMoveRight = useCallback(() => {
    const gs = gameStateRef.current;
    if (statusRef.current !== "playing") return;
    if (gs.laneChangeTimer <= 0 && gs.playerLane < 2) {
      gs.playerLane++;
      gs.laneChangeTimer = 0.18;
    }
  }, []);

  // ── Keyboard event setup ────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
      if (e.key === " " || e.key === "Enter") {
        if (statusRef.current === "start" || statusRef.current === "gameover") {
          startGame();
        }
      }
      // Prevent page scroll on arrow keys / space
      if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)
      ) {
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [startGame]);

  // ── Initial render ──────────────────────────────────────────────────────────
  useEffect(() => {
    drawStaticScreen();
  }, [drawStaticScreen]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(gameLoopRef.current);
    };
  }, []);

  const year = new Date().getFullYear();

  return (
    <div className="game-container">
      {/* Title bar above game */}
      <div className="mb-3 text-center select-none">
        <h1 className="game-title text-3xl tracking-tight">
          <span className="text-orange-400">BIKE</span>
          <span className="text-yellow-300 ml-2">RACE</span>
        </h1>
        <p className="game-mono text-xs text-zinc-500 mt-0.5">
          HIGH SCORE:{" "}
          <span className="text-yellow-400">
            {highScoreRef.current.toString().padStart(6, "0")}
          </span>
        </p>
      </div>

      {/* Canvas */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="canvas-glow rounded-lg cursor-pointer block"
          onClick={handleCanvasClick}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") handleCanvasClick();
          }}
          data-ocid="game.canvas_target"
          tabIndex={0}
          aria-label="Bike Race Game Canvas"
          style={{ touchAction: "none" }}
        />
      </div>

      {/* HUD below canvas (React-rendered for accessibility) */}
      {gameStatus === "playing" && (
        <div className="mt-3 flex items-center justify-between w-full max-w-[360px] px-2 game-mono text-xs text-zinc-500 select-none">
          <span>
            SCORE:{" "}
            <span className="text-orange-400">
              {displayScore.toString().padStart(6, "0")}
            </span>
          </span>
          <span>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={i < displayLives ? "text-red-500" : "text-zinc-700"}
              >
                ♥
              </span>
            ))}
          </span>
          <span>
            SPEED: <span className="text-yellow-300">{displaySpeed}</span>
          </span>
        </div>
      )}

      {/* Start screen button */}
      {gameStatus === "start" && (
        <button
          type="button"
          className="mt-4 px-8 py-3 bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-lg game-title text-lg transition-all active:scale-95"
          onClick={startGame}
          data-ocid="game.primary_button"
        >
          START GAME
        </button>
      )}

      {/* Game over – play again button */}
      {gameStatus === "gameover" && (
        <button
          type="button"
          className="mt-4 px-8 py-3 bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-lg game-title text-lg transition-all active:scale-95"
          onClick={startGame}
          data-ocid="game.primary_button"
        >
          PLAY AGAIN
        </button>
      )}

      {/* Mobile controls */}
      <div className="mt-5 flex gap-6 select-none">
        <button
          type="button"
          className="ctrl-btn w-20 h-16 rounded-xl bg-zinc-800 border border-zinc-600 hover:bg-zinc-700 active:bg-zinc-600 text-white text-2xl font-bold transition-all flex items-center justify-center"
          onTouchStart={(e) => {
            e.preventDefault();
            handleMoveLeft();
          }}
          onMouseDown={handleMoveLeft}
          data-ocid="game.secondary_button"
          aria-label="Move Left"
        >
          ◀
        </button>
        <button
          type="button"
          className="ctrl-btn w-20 h-16 rounded-xl bg-zinc-800 border border-zinc-600 hover:bg-zinc-700 active:bg-zinc-600 text-white text-2xl font-bold transition-all flex items-center justify-center"
          onTouchStart={(e) => {
            e.preventDefault();
            handleMoveRight();
          }}
          onMouseDown={handleMoveRight}
          data-ocid="game.secondary_button"
          aria-label="Move Right"
        >
          ▶
        </button>
      </div>

      {/* Controls hint */}
      <p className="mt-3 game-mono text-xs text-zinc-600 text-center select-none">
        ← → Arrow keys or A/D to change lanes
      </p>

      {/* Footer */}
      <footer className="mt-6 text-center text-xs text-zinc-700 game-mono select-none pb-4">
        © {year}.{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-zinc-500 transition-colors"
        >
          Built with ♥ using caffeine.ai
        </a>
      </footer>
    </div>
  );
}
