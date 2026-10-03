const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const timerElement = document.getElementById('timer');
const levelDisplay = document.getElementById('level-display');
const healthBar = document.getElementById('health-bar');
const xpBar = document.getElementById('xp-bar');
const skillsListUI = document.getElementById('skills-list');
const gameOverScreen = document.getElementById('game-over-screen');
const levelUpScreen = document.getElementById('level-up-screen');
const cardsContainer = document.getElementById('cards-container');
const restartBtn = document.getElementById('restart-btn');

// Inputs
const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false };
let mouseX = canvas.width / 2, mouseY = canvas.height / 2;
let isMouseDown = false;

// Estado do Jogo
let isGameOver = false;
let isPaused = false;
let gameStartTime = 0;
let survivalTime = 0; // em segundos
let lastFrameTime = 0;

let spawnTimer = 0;
let currentSpawnRate = 1000; 
let nextBossTime = 40; // Chefes normais a cada 40s

// Entidades
let player;
let enemies = [];
let projectiles = [];
let enemyProjectiles = [];
let xpGems = [];
let bombs = [];

// ================= DADOS DE HABILIDADES =================
const SKILLS_DB = {
    piercing: { name: "Bala Perfurante", desc: "Seu tiro atravessa inimigos. Mais stacks = mais perfurações." },
    fireRate: { name: "Velocidade de Tiro", desc: "Aumenta a velocidade de disparo em 15% por stack." },
    shotgun:  { name: "Escopeta", desc: "Dispara tiros extras num formato de cone." },
    fireball: { name: "Bola de Fogo", desc: "Lança uma bola de fogo a cada X disparos. Diminui o intervalo por stack." },
    doubleXp: { name: "XP em Dobro", desc: "Dobra a quantidade de XP coletado no chão." },
    heal:     { name: "Recuperar Vida", desc: "Recupera 10% da vida máxima instantaneamente." },
    bombRain: { name: "Chuva de Bombas", desc: "Cai uma bomba no mapa a cada X segundos." }
};

// ================= CLASSES =================

class Player {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.radius = 15;
        this.speed = 3.5;
        this.maxHealth = 100;
        this.health = 100;
        this.color = '#4fc3f7';
        
        // Progressão
        this.level = 0;
        this.xp = 0;
        this.xpNextLevel = 25;
        this.pendingLevelUps = 0;
        
        // Combate
        this.damage = 10;
        this.lastShotTime = 0;
        this.shotCount = 0;
        this.lastBombTime = 0;
        this.invulnTimer = 0; // Cooldown de dano para não morrer instataneamente num frame
        
        // Habilidades (Stacks)
        this.skills = { piercing: 0, fireRate: 0, shotgun: 0, fireball: 0, doubleXp: 0, heal: 0, bombRain: 0 };
    }

    draw() {
        if (this.invulnTimer > 0 && Math.floor(performance.now() / 100) % 2 === 0) {
            // Pisca quando invulnerável
        } else {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
            ctx.closePath();
        }
    }

    update(dt) {
        if (this.invulnTimer > 0) this.invulnTimer -= dt;

        // Movimentação
        let dx = 0, dy = 0;
        if (keys.w || keys.ArrowUp) dy -= 1;
        if (keys.s || keys.ArrowDown) dy += 1;
        if (keys.a || keys.ArrowLeft) dx -= 1;
        if (keys.d || keys.ArrowRight) dx += 1;

        if (dx !== 0 && dy !== 0) {
            const length = Math.sqrt(dx * dx + dy * dy);
            dx /= length; dy /= length;
        }

        this.x += dx * this.speed;
        this.y += dy * this.speed;
        this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y));

        // Tiro restrito por cooldown (Ignora autoclicker)
        let baseCooldown = 1000;
        // Velocidade aumentada em 15% por stack
        let currentCooldown = baseCooldown / (1 + (this.skills.fireRate * 0.15)); 
        
        if (isMouseDown && performance.now() - this.lastShotTime >= currentCooldown) {
            this.fireWeapon();
            this.lastShotTime = performance.now();
        }

        // Habilidade: Chuva de Bombas
        if (this.skills.bombRain > 0) {
            let bombInterval = Math.max(2000, 7000 - ((this.skills.bombRain - 1) * 1000));
            if (performance.now() - this.lastBombTime >= bombInterval) {
                // Cai perto do jogador
                let bx = this.x + (Math.random() - 0.5) * 300;
                let by = this.y + (Math.random() - 0.5) * 300;
                bombs.push(new Bomb(bx, by));
                this.lastBombTime = performance.now();
            }
        }
    }

    fireWeapon() {
        this.shotCount++;
        
        // Habilidade: Escopeta
        let projCount = 1 + this.skills.shotgun; 
        let spread = 0.25; // Ângulo em radianos
        let baseAngle = Math.atan2(mouseY - this.y, mouseX - this.x);
        
        for (let i = 0; i < projCount; i++) {
            let angleOffset = 0;
            if (projCount > 1) {
                angleOffset = - (spread * (projCount - 1)) / 2 + (i * spread);
            }
            projectiles.push(new Projectile(this.x, this.y, baseAngle + angleOffset));
        }

        // Habilidade: Bola de Fogo
        if (this.skills.fireball > 0) {
            let fireballRequirement = Math.max(1, 7 - (this.skills.fireball - 1));
            if (this.shotCount % fireballRequirement === 0) {
                let randomAngle = Math.random() * Math.PI * 2;
                projectiles.push(new Fireball(this.x, this.y, randomAngle));
            }
        }
    }

    takeDamage(amount) {
        if (this.invulnTimer > 0) return; // iframes
        
        this.health -= amount;
        this.invulnTimer = 300; // 300ms de invulnerabilidade
        updateUI();

        if (this.health <= 0) endGame();
    }

    addXp(amount) {
        // Habilidade: XP em Dobro (aplica no momento da coleta)
        let multiplier = Math.pow(2, this.skills.doubleXp);
        this.xp += (amount * multiplier);
        
        while (this.xp >= this.xpNextLevel) {
            this.xp -= this.xpNextLevel;
            this.level++;
            this.xpNextLevel = Math.round(this.xpNextLevel * 1.1);
            this.pendingLevelUps++;
        }

        if (this.pendingLevelUps > 0 && !isPaused) {
            triggerLevelUp();
        }
        updateUI();
    }
}

class Projectile {
    constructor(x, y, angle) {
        this.x = x; this.y = y;
        this.radius = 5;
        this.speed = 7;
        this.color = '#fff';
        this.markedForDeletion = false;
        
        this.velX = Math.cos(angle) * this.speed;
        this.velY = Math.sin(angle) * this.speed;
        
        // Habilidade: Bala Perfurante
        this.piercesLeft = player.skills.piercing * 2; // Lv 1 = 2 atravessamentos, etc.
        this.hitEnemies = new Set(); // Evita bater no mesmo inimigo várias vezes no mesmo frame
    }

    draw() {
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color; ctx.fill(); ctx.closePath();
    }

    update() {
        this.x += this.velX; this.y += this.velY;
        if (this.x < -50 || this.x > canvas.width + 50 || this.y < -50 || this.y > canvas.height + 50) {
            this.markedForDeletion = true;
        }
    }
}

class Fireball extends Projectile {
    constructor(x, y, angle) {
        super(x, y, angle);
        this.radius = 12;
        this.speed = 5;
        this.color = '#ff5722';
        this.damageMultiplier = 3; 
        this.piercesLeft = 999; // Bola de fogo atravessa tudo
    }
}

class EnemyProjectile {
    constructor(x, y, targetX, targetY) {
        this.x = x; this.y = y;
        this.radius = 8;
        this.speed = 3;
        this.color = '#f44336';
        this.markedForDeletion = false;
        let angle = Math.atan2(targetY - y, targetX - x);
        this.velX = Math.cos(angle) * this.speed;
        this.velY = Math.sin(angle) * this.speed;
    }
    draw() {
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color; ctx.fill(); ctx.closePath();
    }
    update() {
        this.x += this.velX; this.y += this.velY;
        if (Math.hypot(this.x - player.x, this.y - player.y) < this.radius + player.radius) {
            player.takeDamage(12); // Causa 20% mais que inimigo normal
            this.markedForDeletion = true;
        }
        if (this.x < -50 || this.x > canvas.width + 50 || this.y < -50 || this.y > canvas.height + 50) this.markedForDeletion = true;
    }
}

class Enemy {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.radius = 12;
        this.speed = 1.2 + Math.random() * 0.8;
        this.color = '#e57373';
        this.damage = 10;
        this.hp = 10; // Morre com 1 tiro normal do player
        this.xpDrop = 5;
        this.markedForDeletion = false;
    }

    draw() {
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color; ctx.fill(); ctx.closePath();
    }

    update(dt) {
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const angle = Math.atan2(dy, dx);
        this.x += Math.cos(angle) * this.speed;
        this.y += Math.sin(angle) * this.speed;

        if (Math.hypot(player.x - this.x, player.y - this.y) < this.radius + player.radius) {
            player.takeDamage(this.damage);
        }
    }
    
    takeDamage(amount) {
        this.hp -= amount;
        if (this.hp <= 0 && !this.markedForDeletion) {
            this.markedForDeletion = true;
            xpGems.push(new XPGem(this.x, this.y, this.xpDrop));
        }
    }
}

class Boss extends Enemy {
    constructor(x, y) {
        super(x, y);
        this.radius = 15; // 25% maior
        this.speed = 1.3;
        this.color = '#b71c1c';
        this.damage = 15; // 50% mais dano
        this.maxHp = 60; // Precisa de vários tiros
        this.hp = this.maxHp;
        this.xpDrop = 25;
    }

    draw() {
        super.draw();
        // Barra de Vida do Chefe
        ctx.fillStyle = '#000';
        ctx.fillRect(this.x - 15, this.y - 22, 30, 4);
        ctx.fillStyle = '#f44336';
        ctx.fillRect(this.x - 15, this.y - 22, 30 * (this.hp / this.maxHp), 4);
    }
}

class MiniBoss extends Enemy {
    constructor(x, y) {
        super(x, y);
        this.radius = 12; // Será desenhado como quadrado
        this.speed = 0; // Fica parado
        this.color = '#9c27b0';
        this.hp = 20; // Exatamente 2 tiros (dano do player = 10)
        this.xpDrop = 15;
        this.shootTimer = 0;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
    }

    update(dt) {
        // Não persegue, apenas atira
        this.shootTimer += dt;
        if (this.shootTimer >= 2000) { // A cada 2s
            this.shootTimer = 0;
            enemyProjectiles.push(new EnemyProjectile(this.x, this.y, player.x, player.y));
        }
    }
}

class XPGem {
    constructor(x, y, amount) {
        this.x = x; this.y = y;
        this.amount = amount;
        this.radius = 4;
        this.markedForDeletion = false;
    }
    draw() {
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#03a9f4'; ctx.fill(); ctx.closePath();
    }
    update() {
        if (Math.hypot(player.x - this.x, player.y - this.y) < this.radius + player.radius) {
            player.addXp(this.amount);
            this.markedForDeletion = true;
        }
    }
}

class Bomb {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.timer = 1500; // Demora 1.5s pra cair
        this.radius = 70; // Área de dano
        this.markedForDeletion = false;
    }
    draw() {
        // Retícula no chão
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 0, 0, 0.15)'; ctx.fill();
        ctx.strokeStyle = '#f44336'; ctx.stroke();
        
        // Indicador caindo
        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(2, this.timer/100), 0, Math.PI * 2);
        ctx.fillStyle = '#ff9800'; ctx.fill();
    }
    update(dt) {
        this.timer -= dt;
        if (this.timer <= 0) {
            // Explosão (Dano em Área)
            enemies.forEach(e => {
                if (Math.hypot(e.x - this.x, e.y - this.y) <= this.radius + e.radius) {
                    e.takeDamage(50);
                }
            });
            this.markedForDeletion = true;
        }
    }
}

// ================= SISTEMAS CORE =================

function spawnEnemy() {
    let x, y;
    if (Math.random() < 0.5) {
        x = Math.random() < 0.5 ? -30 : canvas.width + 30;
        y = Math.random() * canvas.height;
    } else {
        x = Math.random() * canvas.width;
        y = Math.random() < 0.5 ? -30 : canvas.height + 30;
    }

    // Chance de Mini-chefe após 1:20 (80 segundos)
    if (survivalTime >= 80 && Math.random() < 0.10) {
        enemies.push(new MiniBoss(x, y));
    } else {
        enemies.push(new Enemy(x, y));
    }
}

function updateUI() {
    // Tempo e Nível
    const m = Math.floor(survivalTime / 60).toString().padStart(2, '0');
    const s = Math.floor(survivalTime % 60).toString().padStart(2, '0');
    timerElement.innerText = `${m}:${s}`;
    levelDisplay.innerText = `Nível: ${player.level}`;

    // Barras
    const hpPercent = Math.max(0, (player.health / player.maxHealth) * 100);
    healthBar.style.width = hpPercent + '%';
    
    const xpPercent = Math.min(100, (player.xp / player.xpNextLevel) * 100);
    xpBar.style.width = xpPercent + '%';
    
    // Lista de Habilidades Adquiridas
    skillsListUI.innerHTML = '';
    for (let key in player.skills) {
        if (player.skills[key] > 0) {
            let p = document.createElement('div');
            p.innerText = `${SKILLS_DB[key].name} Lv.${player.skills[key]}`;
            skillsListUI.appendChild(p);
        }
    }
}

function triggerLevelUp() {
    isPaused = true;
    levelUpScreen.classList.remove('hidden');
    cardsContainer.innerHTML = '';

    // Sorteia 3 habilidades distintas
    let keys = Object.keys(SKILLS_DB).sort(() => 0.5 - Math.random());
    let choices = keys.slice(0, 3);

    choices.forEach(key => {
        const skill = SKILLS_DB[key];
        const currentLvl = player.skills[key];
        
        let card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <h3>${skill.name}</h3>
            <p>${skill.desc}</p>
            <span>Lv Atual: ${currentLvl}</span>
        `;
        card.onclick = () => { selectSkill(key); };
        cardsContainer.appendChild(card);
    });
}

function selectSkill(key) {
    player.skills[key]++;
    
    // Efeito imediato de Cura
    if (key === 'heal') {
        player.health = Math.min(player.maxHealth, player.health + (player.maxHealth * 0.10));
    }

    player.pendingLevelUps--;
    
    if (player.pendingLevelUps > 0) {
        triggerLevelUp(); // Roda de novo se passou mais de um nível de uma vez
    } else {
        levelUpScreen.classList.add('hidden');
        isPaused = false;
        lastFrameTime = performance.now(); // Evita pulo no delta time
    }
    updateUI();
}

// ================= LOOP DO JOGO =================

function gameLoop(timestamp) {
    if (isGameOver) return;
    
    if (isPaused) {
        requestAnimationFrame(gameLoop);
        return;
    }

    const dt = timestamp - lastFrameTime;
    lastFrameTime = timestamp;
    survivalTime = (timestamp - gameStartTime) / 1000;
    updateUI();

    // Spawn Inimigos Normais e Mini-chefes
    currentSpawnRate = Math.max(300, 1000 - survivalTime * 8); 
    spawnTimer += dt;
    if (spawnTimer > currentSpawnRate) {
        spawnEnemy();
        spawnTimer = 0;
    }

    // Spawn Chefe Normal (A cada 40s)
    if (survivalTime >= nextBossTime) {
        // Nasce um pouco mais longe
        enemies.push(new Boss(canvas.width + 50, canvas.height / 2));
        nextBossTime += 40;
    }

    // Limpeza de Tela
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Atualização e Desenho das Entidades
    xpGems.forEach(xp => { xp.update(); xp.draw(); });
    bombs.forEach(b => { b.update(dt); b.draw(); });
    
    player.update(dt);
    player.draw();

    projectiles.forEach(p => { p.update(); p.draw(); });
    enemyProjectiles.forEach(ep => { ep.update(); ep.draw(); });

    enemies.forEach(enemy => {
        enemy.update(dt);
        enemy.draw();

        projectiles.forEach(proj => {
            if (proj.markedForDeletion || enemy.markedForDeletion) return;
            if (proj.hitEnemies.has(enemy)) return; // Já bateu neste frame/tiro
            
            const dist = Math.hypot(proj.x - enemy.x, proj.y - enemy.y);
            if (dist < enemy.radius + proj.radius) {
                proj.hitEnemies.add(enemy);
                
                let dmg = proj instanceof Fireball ? player.damage * 3 : player.damage;
                enemy.takeDamage(dmg);

                if (proj.piercesLeft > 0) {
                    proj.piercesLeft--;
                } else {
                    proj.markedForDeletion = true;
                }
            }
        });
    });

    // Limpeza de arrays (remove objetos mortos)
    enemies = enemies.filter(e => !e.markedForDeletion);
    projectiles = projectiles.filter(p => !p.markedForDeletion);
    enemyProjectiles = enemyProjectiles.filter(p => !p.markedForDeletion);
    xpGems = xpGems.filter(x => !x.markedForDeletion);
    bombs = bombs.filter(b => !b.markedForDeletion);

    requestAnimationFrame(gameLoop);
}

// ================= CONTROLES E EVENTOS =================

window.addEventListener('keydown', (e) => { if(keys.hasOwnProperty(e.key)) keys[e.key] = true; });
window.addEventListener('keyup', (e) => { if(keys.hasOwnProperty(e.key)) keys[e.key] = false; });
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
});
canvas.addEventListener('mousedown', () => isMouseDown = true);
canvas.addEventListener('mouseup', () => isMouseDown = false);
canvas.addEventListener('mouseleave', () => isMouseDown = false); // Evita atirar sozinho se sair da tela

// ================= FLUXO GERAL =================

function initGame() {
    player = new Player(canvas.width / 2, canvas.height / 2);
    enemies = [];
    projectiles = [];
    enemyProjectiles = [];
    xpGems = [];
    bombs = [];
    
    isGameOver = false;
    isPaused = false;
    spawnTimer = 0;
    currentSpawnRate = 1000;
    nextBossTime = 40;
    
    gameOverScreen.classList.add('hidden');
    levelUpScreen.classList.add('hidden');
    
    gameStartTime = performance.now();
    lastFrameTime = performance.now();
    updateUI();
    requestAnimationFrame(gameLoop);
}

function endGame() {
    isGameOver = true;
    gameOverScreen.classList.remove('hidden');
    document.getElementById('final-time').innerText = timerElement.innerText;
    document.getElementById('final-level').innerText = player.level;
}

restartBtn.addEventListener('click', initGame);

// Inicia o jogo
initGame();
