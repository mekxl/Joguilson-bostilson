const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const timerElement = document.getElementById('timer');
const healthBar = document.getElementById('health-bar');
const gameOverScreen = document.getElementById('game-over-screen');
const finalTimeElement = document.getElementById('final-time');
const restartBtn = document.getElementById('restart-btn');

// Inputs
const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false };
let mouseX = 0, mouseY = 0;

// Estado do Jogo
let isGameOver = false;
let gameStartTime = 0;
let survivalTime = 0; // em segundos
let lastFrameTime = 0;
let spawnTimer = 0;
let currentSpawnRate = 1000; // Tempo em ms entre cada inimigo

// Entidades
let player;
let enemies = [];
let projectiles = [];

// ================= CLASSES =================

class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 15;
        this.speed = 3;
        this.maxHealth = 100;
        this.health = 100;
        this.color = '#4fc3f7';
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.closePath();
    }

    update() {
        // Movimentação com suporte a setas e WASD
        let dx = 0;
        let dy = 0;

        if (keys.w || keys.ArrowUp) dy -= 1;
        if (keys.s || keys.ArrowDown) dy += 1;
        if (keys.a || keys.ArrowLeft) dx -= 1;
        if (keys.d || keys.ArrowRight) dx += 1;

        // Normaliza o vetor para não andar mais rápido na diagonal
        if (dx !== 0 && dy !== 0) {
            const length = Math.sqrt(dx * dx + dy * dy);
            dx /= length;
            dy /= length;
        }

        this.x += dx * this.speed;
        this.y += dy * this.speed;

        // Limita o jogador dentro da arena
        this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y));
    }

    takeDamage(amount) {
        this.health -= amount;
        const healthPercent = Math.max(0, (this.health / this.maxHealth) * 100);
        healthBar.style.width = healthPercent + '%';

        if (this.health <= 0) {
            endGame();
        }
    }
}

class Enemy {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 12;
        this.speed = 1.2 + Math.random() * 0.8; // Velocidade ligeiramente variável
        this.color = '#e57373';
        this.damage = 10;
        this.markedForDeletion = false;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.closePath();
    }

    update() {
        // Persegue o jogador
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const angle = Math.atan2(dy, dx);
        
        this.x += Math.cos(angle) * this.speed;
        this.y += Math.sin(angle) * this.speed;

        // Verifica colisão com o jogador
        const dist = Math.hypot(player.x - this.x, player.y - this.y);
        if (dist - this.radius - player.radius < 1) {
            player.takeDamage(this.damage);
            this.markedForDeletion = true; // Inimigo morre ao causar dano neste protótipo
        }
    }
}

class Projectile {
    constructor(x, y, targetX, targetY) {
        this.x = x;
        this.y = y;
        this.radius = 5;
        this.speed = 7;
        this.color = '#fff';
        this.markedForDeletion = false;

        const angle = Math.atan2(targetY - y, targetX - x);
        this.velocity = {
            x: Math.cos(angle) * this.speed,
            y: Math.sin(angle) * this.speed
        };
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.closePath();
    }

    update() {
        this.x += this.velocity.x;
        this.y += this.velocity.y;

        // Remove se sair da tela
        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
            this.markedForDeletion = true;
        }
    }
}

// ================= SISTEMAS CORE =================

function spawnEnemy() {
    let x, y;
    // Nasce nas bordas, fora da tela
    if (Math.random() < 0.5) {
        x = Math.random() < 0.5 ? -30 : canvas.width + 30;
        y = Math.random() * canvas.height;
    } else {
        x = Math.random() * canvas.width;
        y = Math.random() < 0.5 ? -30 : canvas.height + 30;
    }
    enemies.push(new Enemy(x, y));
}

function updateFormatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    timerElement.innerText = `${m}:${s}`;
    return `${m}:${s}`;
}

// ================= LOOP DO JOGO =================

function gameLoop(timestamp) {
    if (isGameOver) return;

    const deltaTime = timestamp - lastFrameTime;
    lastFrameTime = timestamp;

    // Atualiza tempo de sobrevivência
    survivalTime = (timestamp - gameStartTime) / 1000;
    updateFormatTime(survivalTime);

    // Sistema de Dificuldade: Diminui o tempo de spawn (aumenta a quantidade) conforme o tempo passa
    currentSpawnRate = Math.max(200, 1000 - survivalTime * 10); 

    spawnTimer += deltaTime;
    if (spawnTimer > currentSpawnRate) {
        spawnEnemy();
        spawnTimer = 0;
    }

    // Limpa tela
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Atualiza e Desenha Jogador
    player.update();
    player.draw();

    // Atualiza e Desenha Projéteis
    projectiles.forEach(p => {
        p.update();
        p.draw();
    });

    // Atualiza e Desenha Inimigos + Colisão com Projéteis
    enemies.forEach(enemy => {
        enemy.update();
        enemy.draw();

        projectiles.forEach(proj => {
            const dist = Math.hypot(proj.x - enemy.x, proj.y - enemy.y);
            if (dist - enemy.radius - proj.radius < 1) {
                enemy.markedForDeletion = true;
                proj.markedForDeletion = true;
            }
        });
    });

    // Remove entidades marcadas para deleção
    enemies = enemies.filter(e => !e.markedForDeletion);
    projectiles = projectiles.filter(p => !p.markedForDeletion);

    requestAnimationFrame(gameLoop);
}

// ================= CONTROLES E EVENTOS =================

window.addEventListener('keydown', (e) => { if(keys.hasOwnProperty(e.key)) keys[e.key] = true; });
window.addEventListener('keyup', (e) => { if(keys.hasOwnProperty(e.key)) keys[e.key] = false; });

canvas.addEventListener('mousedown', (e) => {
    if (isGameOver) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    // Dispara projétil na direção do clique
    projectiles.push(new Projectile(player.x, player.y, clickX, clickY));
});

// ================= FLUXO GERAL =================

function initGame() {
    player = new Player(canvas.width / 2, canvas.height / 2);
    enemies = [];
    projectiles = [];
    isGameOver = false;
    spawnTimer = 0;
    currentSpawnRate = 1000;
    healthBar.style.width = '100%';
    
    gameOverScreen.classList.add('hidden');
    
    // Reseta o tempo
    gameStartTime = performance.now();
    lastFrameTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function endGame() {
    isGameOver = true;
    gameOverScreen.classList.remove('hidden');
    finalTimeElement.innerText = updateFormatTime(survivalTime);
}

restartBtn.addEventListener('click', initGame);

// Inicia o jogo ao carregar
initGame();
