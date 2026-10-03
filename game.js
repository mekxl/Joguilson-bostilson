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

// ==========================================
// SISTEMA DE MENU, MÚSICA E MOBILE (MATADOR DE BOLAS)
// ==========================================

let isMobileMode = false;
let gamePausadoNoMenu = true; 

const bgMusic = new Audio('assets/music/jogobosta.mp3');
bgMusic.loop = true;
bgMusic.volume = 0.4;

const joyLeft = { active: false, id: null, x: 0, y: 0 };
const joyRight = { active: false, id: null, x: 0, y: 0 };

document.getElementById('btn-computador').addEventListener('click', () => iniciarJogo(false));
document.getElementById('btn-celular').addEventListener('click', () => iniciarJogo(true));

function iniciarJogo(mobile) {
    isMobileMode = mobile;
    gamePausadoNoMenu = false;
    
    gameStartTime = performance.now();
    lastFrameTime = performance.now();
    
    document.getElementById('main-menu').style.display = 'none';
    
    if (isMobileMode) {
        document.getElementById('mobile-controls').style.display = 'block';
        setupJoystick('base-left', 'stick-left', joyLeft);
        setupJoystick('base-right', 'stick-right', joyRight);
    }
    
    bgMusic.play().catch(e => console.warn("Erro ao tocar música:", e));
}

function setupJoystick(baseId, stickId, joyData) {
    const base = document.getElementById(baseId);
    const stick = document.getElementById(stickId);
    const maxRadius = 50; 

    const onTouchStart = (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        joyData.id = touch.identifier;
        joyData.active = true;
        updateStick(touch, base, stick, joyData, maxRadius);
    };

    const onTouchMove = (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === joyData.id) {
                updateStick(e.changedTouches[i], base, stick, joyData, maxRadius);
            }
        }
    };

    const onTouchEnd = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === joyData.id) {
                joyData.active = false;
                joyData.id = null;
                joyData.x = 0;
                joyData.y = 0;
                stick.style.transform = `translate(-50%, -50%)`; 
            }
        }
    };

    base.addEventListener('touchstart', onTouchStart, { passive: false });
    base.addEventListener('touchmove', onTouchMove, { passive: false });
    base.addEventListener('touchend', onTouchEnd);
    base.addEventListener('touchcancel', onTouchEnd);
}

function updateStick(touch, base, stick, joyData, maxRadius) {
    const rect = base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let dx = touch.clientX - centerX;
    let dy = touch.clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > maxRadius) {
        dx = (dx / distance) * maxRadius;
        dy = (dy / distance) * maxRadius;
    }

    joyData.x = dx / maxRadius;
    joyData.y = dy / maxRadius;
    stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}

// ==========================================
// ESTADO DO JOGO E ENTIDADES
// ==========================================
let isGameOver = false;
let isPaused = false;
let gameStartTime = 0;
let survivalTime = 0; 
let lastFrameTime = 0;
let spawnTimer = 0;
let currentSpawnRate = 1000; 
let nextBossTime = 40; 

let player;
let enemies = [];
let projectiles = [];
let enemyProjectiles = [];
let xpGems = [];
let bombs = [];
let explosions = [];

const SKILLS_DB = {
    piercing: { name: "Bala Perfurante", desc: "Seu tiro atravessa até 2 inimigos. +2 acertos por stack." },
    fireRate: { name: "Velocidade de Tiro", desc: "Aumenta a velocidade de disparo em +15% por stack." },
    shotgun:  { name: "Escopeta", desc: "Dispara tiros extras simultâneos em formato de cone." },
    fireball: { name: "Bola de Fogo", desc: "Lança uma bola de fogo a cada X disparos." },
    doubleXp: { name: "XP em Dobro", desc: "Dobra a quantidade de XP deixada pelos inimigos." },
    heal:     { name: "Recuperar Vida", desc: "Recupera 10% da vida máxima imediatamente." },
    bombRain: { name: "Chuva de Bombas", desc: "Cai uma bomba periodicamente, causando dano em área." },
    dragon:   { name: "Dragão (Pet)", desc: "Um ajudante que persegue e atira nos inimigos." },
    bazooka:  { name: "Bazuca", desc: "Seus projéteis causam explosões em área ao acertar." }
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
        
        this.level = 0;
        this.xp = 0;
        this.xpNextLevel = 25;
        this.pendingLevelUps = 0;
        
        this.damage = 10;
        this.lastShotTime = 0;
        this.shotCount = 0;
        this.lastBombTime = 0;
        this.invulnTimer = 0;
        
        // Habilidades
        this.skills = { piercing: 0, fireRate: 0, shotgun: 0, fireball: 0, doubleXp: 0, heal: 0, bombRain: 0, dragon: 0, bazooka: 0 };
        this.pet = null;
    }

    draw() {
        if (this.invulnTimer > 0 && Math.floor(performance.now() / 100) % 2 === 0) {
            // Pisca invulnerável
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

        let dx = 0, dy = 0;
        if (isMobileMode) {
            dx = joyLeft.x; dy = joyLeft.y;
        } else {
            if (keys.w || keys.ArrowUp) dy -= 1;
            if (keys.s || keys.ArrowDown) dy += 1;
            if (keys.a || keys.ArrowLeft) dx -= 1;
            if (keys.d || keys.ArrowRight) dx += 1;
            if (dx !== 0 && dy !== 0) {
                const length = Math.sqrt(dx * dx + dy * dy);
                dx /= length; dy /= length;
            }
        }

        this.x += dx * this.speed;
        this.y += dy * this.speed;
        this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y));

        // Velocidade de disparo controlada rigorosamente aqui
        let baseCooldown = 1000;
        let currentCooldown = baseCooldown / (1 + (this.skills.fireRate * 0.15)); 
        let isShooting = false;
        let anguloTiro = 0;

        if (isMobileMode) {
            if (joyRight.active) {
                isShooting = true;
                anguloTiro = Math.atan2(joyRight.y, joyRight.x);
            }
        } else {
            if (isMouseDown) {
                isShooting = true;
                anguloTiro = Math.atan2(mouseY - this.y, mouseX - this.x);
            }
        }

        if (isShooting && performance.now() - this.lastShotTime >= currentCooldown) {
            this.fireWeapon(anguloTiro);
            this.lastShotTime = performance.now();
        }

        // Habilidade: Chuva de Bombas
        if (this.skills.bombRain > 0) {
            let bombInterval = Math.max(2000, 7000 - ((this.skills.bombRain - 1) * 1000));
            if (performance.now() - this.lastBombTime >= bombInterval) {
                let bx = this.x + (Math.random() - 0.5) * 300;
                let by = this.y + (Math.random() - 0.5) * 300;
                bombs.push(new Bomb(bx, by));
                this.lastBombTime = performance.now();
            }
        }

        // Habilidade: Dragão Pet
        if (this.skills.dragon > 0) {
            if (!this.pet) this.pet = new Dragon(this.x, this.y);
            this.pet.update(dt);
        }
    }

    fireWeapon(baseAngle) {
        this.shotCount++;
        
        // Habilidade: Escopeta
        let projCount = 1 + this.skills.shotgun; 
        let spread = 0.25; 
        
        for (let i = 0; i < projCount; i++) {
            let angleOffset = 0;
            if (projCount > 1) {
                angleOffset = - (spread * (projCount - 1)) / 2 + (i * spread);
            }
            projectiles.push(new Projectile(this.x, this.y, baseAngle + angleOffset, true));
        }

        // Habilidade: Bola de Fogo (Gera uma aleatória sem depender da direção escolhida)
        if (this.skills.fireball > 0) {
            let fireballRequirement = Math.max(1, 8 - this.skills.fireball);
            if (this.shotCount % fireballRequirement === 0) {
                let randomAngle = Math.random() * Math.PI * 2;
                projectiles.push(new Fireball(this.x, this.y, randomAngle));
            }
        }
    }

    takeDamage(amount) {
        if (this.invulnTimer > 0) return; 
        this.health -= amount;
        this.invulnTimer = 300; 
        updateUI();
        if (this.health <= 0) endGame();
    }

    addXp(amount) {
        // Multiplicador do XP em Dobro (0 stacks = 1x, 1 = 2x, 2 = 4x...)
        let multiplier = Math.pow(2, this.skills.doubleXp);
        this.xp += (amount * multiplier);
        
        while (this.xp >= this.xpNextLevel) {
            this.xp -= this.xpNextLevel;
            this.level++;
            this.xpNextLevel = Math.round(this.xpNextLevel * 1.1);
            this.pendingLevelUps++;
        }
        if (this.pendingLevelUps > 0 && !isPaused) triggerLevelUp();
        updateUI();
    }
}

// O Pet Dragão
class Dragon {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.size = 12;
        this.color = '#ffeb3b';
        this.lastShot = 0;
    }
    update(dt) {
        // Segue o jogador (com leve atraso/inércia para ficar charmoso)
        this.x += (player.x - this.x) * 0.05;
        this.y += (player.y - this.y) * 0.05;

        // Ataca o inimigo mais próximo
        let attackSpeedMod = 1 + ((player.skills.dragon - 1) * 0.25);
        let currentCooldown = 2000 / attackSpeedMod;

        if (performance.now() - this.lastShot >= currentCooldown) {
            let target = this.getNearestEnemy();
            if (target) {
                let angle = Math.atan2(target.y - this.y, target.x - this.x);
                projectiles.push(new DragonProjectile(this.x, this.y, angle));
                this.lastShot = performance.now();
            }
        }
    }
    getNearestEnemy() {
        let nearest = null;
        let minDist = Infinity;
        enemies.forEach(e => {
            let d = Math.hypot(this.x - e.x, this.y - e.y);
            if (d < minDist) { minDist = d; nearest = e; }
        });
        return nearest;
    }
    draw() {
        // Por enquanto usando um quadrado distinto para o Dragão
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - this.size/2, this.y - this.size/2, this.size, this.size);
    }
}

class Projectile {
    constructor(x, y, angle, isPlayerWeapon = false) {
        this.x = x; this.y = y;
        this.radius = 5;
        this.speed = 7;
        this.color = '#fff';
        this.markedForDeletion = false;
        
        this.velX = Math.cos(angle) * this.speed;
        this.velY = Math.sin(angle) * this.speed;
        
        // Habilidade: Bala Perfurante (0 stacks = 1 hit, 1 stack = 2 hits, 2 stacks = 4 hits)
        this.hitsLeft = player.skills.piercing > 0 ? player.skills.piercing * 2 : 1;
        this.hitEnemies = new Set(); 
        this.isPlayerWeapon = isPlayerWeapon;
        this.isDragon = false;
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

class DragonProjectile extends Projectile {
    constructor(x, y, angle) {
        super(x, y, angle);
        this.color = '#ffeb3b';
        this.speed = 8;
        this.isDragon = true;
        this.hitsLeft = 1; // Tiro do dragão não fura alvo por padrão
    }
}

class Fireball extends Projectile {
    constructor(x, y, angle) {
        super(x, y, angle, true);
        this.radius = 12;
        this.speed = 5;
        this.color = '#ff5722';
        this.hitsLeft = 999; 
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
            player.takeDamage(12); 
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
        this.hp = 10;
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

// O Tanque Lento
class GreenBall extends Enemy {
    constructor(x, y) {
        super(x, y);
        this.radius = 30; // Bem maior
        this.speed = 0.5; // Muito lento (fácil de fugir)
        this.color = '#4caf50'; 
        // Aguenta exatamente 10 tiros básicos (10 de dano * 10 tiros)
        this.hp = 10 * 10; 
        this.xpDrop = 10;
    }
}

class Boss extends Enemy {
    constructor(x, y) {
        super(x, y);
        this.radius = 15; 
        this.speed = 1.3;
        this.color = '#b71c1c';
        this.damage = 15; 
        this.maxHp = 60; 
        this.hp = this.maxHp;
        this.xpDrop = 25;
    }
    draw() {
        super.draw();
        ctx.fillStyle = '#000';
        ctx.fillRect(this.x - 15, this.y - 22, 30, 4);
        ctx.fillStyle = '#f44336';
        ctx.fillRect(this.x - 15, this.y - 22, 30 * (this.hp / this.maxHp), 4);
    }
}

class MiniBoss extends Enemy {
    constructor(x, y) {
        super(x, y);
        this.radius = 12; 
        this.speed = 0; 
        this.color = '#9c27b0';
        this.hp = 20; 
        this.xpDrop = 15;
        this.shootTimer = 0;
    }
    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
    }
    update(dt) {
        this.shootTimer += dt;
        if (this.shootTimer >= 2000) { 
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
        this.timer = 1500; 
        this.radius = 70; 
        this.markedForDeletion = false;
    }
    draw() {
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 0, 0, 0.15)'; ctx.fill();
        ctx.strokeStyle = '#f44336'; ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(2, this.timer/100), 0, Math.PI * 2);
        ctx.fillStyle = '#ff9800'; ctx.fill();
    }
    update(dt) {
        this.timer -= dt;
        if (this.timer <= 0) {
            enemies.forEach(e => {
                if (Math.hypot(e.x - this.x, e.y - this.y) <= this.radius + e.radius) {
                    e.takeDamage(50);
                }
            });
            this.markedForDeletion = true;
        }
    }
}

// Explosões geradas pela Bazuca
class Explosion {
    constructor(x, y, radius) {
        this.x = x; this.y = y;
        this.radius = radius;
        this.timer = 150; 
        this.maxTimer = 150;
        this.markedForDeletion = false;
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * (1 - this.timer/this.maxTimer), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 152, 0, 0.4)';
        ctx.fill();
        ctx.closePath();
    }
    update(dt) {
        this.timer -= dt;
        if (this.timer <= 0) this.markedForDeletion = true;
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

    if (survivalTime >= 80 && Math.random() < 0.10) {
        enemies.push(new MiniBoss(x, y));
    } else if (Math.random() < 0.10) { 
        // 10% de chance de spawnar a Bola Verde
        enemies.push(new GreenBall(x, y));
    } else {
        enemies.push(new Enemy(x, y));
    }
}

function updateUI() {
    const m = Math.floor(survivalTime / 60).toString().padStart(2, '0');
    const s = Math.floor(survivalTime % 60).toString().padStart(2, '0');
    timerElement.innerText = `${m}:${s}`;
    levelDisplay.innerText = `Nível: ${player.level}`;

    const hpPercent = Math.max(0, (player.health / player.maxHealth) * 100);
    healthBar.style.width = hpPercent + '%';
    
    const xpPercent = Math.min(100, (player.xp / player.xpNextLevel) * 100);
    xpBar.style.width = xpPercent + '%';
    
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
    
    // Recuperar Vida recupera exatamente 10% do HP Máximo Imediatamente a cada escolha
    if (key === 'heal') {
        player.health = Math.min(player.maxHealth, player.health + (player.maxHealth * 0.10));
    }

    player.pendingLevelUps--;
    
    if (player.pendingLevelUps > 0) {
        triggerLevelUp(); 
    } else {
        levelUpScreen.classList.add('hidden');
        isPaused = false;
        lastFrameTime = performance.now(); 
    }
    updateUI();
}

// ================= LOOP DO JOGO =================

function gameLoop(timestamp) {
    if (gamePausadoNoMenu) {
        requestAnimationFrame(gameLoop);
        return;
    }

    if (isGameOver) return;
    
    if (isPaused) {
        requestAnimationFrame(gameLoop);
        return;
    }

    const dt = timestamp - lastFrameTime;
    lastFrameTime = timestamp;
    survivalTime = (timestamp - gameStartTime) / 1000;
    updateUI();

    currentSpawnRate = Math.max(300, 1000 - survivalTime * 8); 
    spawnTimer += dt;
    if (spawnTimer > currentSpawnRate) {
        spawnEnemy();
        spawnTimer = 0;
    }

    if (survivalTime >= nextBossTime) {
        enemies.push(new Boss(canvas.width + 50, canvas.height / 2));
        nextBossTime += 40;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    xpGems.forEach(xp => { xp.update(); xp.draw(); });
    bombs.forEach(b => { b.update(dt); b.draw(); });
    explosions.forEach(exp => { exp.update(dt); exp.draw(); });
    
    player.update(dt);
    player.draw();
    if (player.pet) player.pet.draw();

    projectiles.forEach(p => { p.update(); p.draw(); });
    enemyProjectiles.forEach(ep => { ep.update(); ep.draw(); });

    enemies.forEach(enemy => {
        enemy.update(dt);
        enemy.draw();

        projectiles.forEach(proj => {
            if (proj.markedForDeletion || enemy.markedForDeletion) return;
            if (proj.hitEnemies.has(enemy)) return; 
            
            const dist = Math.hypot(proj.x - enemy.x, proj.y - enemy.y);
            if (dist < enemy.radius + proj.radius) {
                proj.hitEnemies.add(enemy); // Garante que a mesma bala só atinja esse inimigo 1x
                
                // Dano direto da bala (Bola de fogo tem dano extra)
                let dmg = proj instanceof Fireball ? player.damage * 3 : player.damage;
                enemy.takeDamage(dmg);

                // Habilidade: Bazuca (Gatilho da Explosão em Área)
                if (proj.isPlayerWeapon && player.skills.bazooka > 0 && !(proj instanceof Fireball)) {
                    let aoeRadius = 40 + (player.skills.bazooka - 1) * 15;
                    let aoeDamage = player.damage * 0.5; // Dano em área menor que o disparo direto
                    
                    explosions.push(new Explosion(enemy.x, enemy.y, aoeRadius));
                    
                    enemies.forEach(otherEnemy => {
                        if (otherEnemy !== enemy) {
                            let distAoE = Math.hypot(otherEnemy.x - enemy.x, otherEnemy.y - enemy.y);
                            if (distAoE <= aoeRadius + otherEnemy.radius) {
                                otherEnemy.takeDamage(aoeDamage);
                            }
                        }
                    });
                }

                // Desconta furos disponíveis da bala
                proj.hitsLeft--;
                if (proj.hitsLeft <= 0) {
                    proj.markedForDeletion = true;
                }
            }
        });
    });

    enemies = enemies.filter(e => !e.markedForDeletion);
    projectiles = projectiles.filter(p => !p.markedForDeletion);
    enemyProjectiles = enemyProjectiles.filter(p => !p.markedForDeletion);
    xpGems = xpGems.filter(x => !x.markedForDeletion);
    bombs = bombs.filter(b => !b.markedForDeletion);
    explosions = explosions.filter(exp => !exp.markedForDeletion);

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
canvas.addEventListener('mouseleave', () => isMouseDown = false); 

function endGame() {
    isGameOver = true;
    gameOverScreen.classList.remove('hidden');
}

restartBtn.addEventListener('click', () => {
    location.reload(); 
});

requestAnimationFrame(gameLoop);
