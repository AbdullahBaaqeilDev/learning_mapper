class NetworkBackground {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        this.dotDensity = options.dotDensity || 0.00015;
        this.maxConnectDist = options.maxConnectDist || 140;
        this.maxConnectDistSq = this.maxConnectDist * this.maxConnectDist;
        this.dotSpeed = options.dotSpeed || 0.4;
        this.dotColor = options.dotColor || 'rgba(148, 163, 184, 0.4)'; // Slate-400
        this.lineColorRgb = options.lineColorRgb || '100, 116, 139';    // Slate-500
        
        this.dots = [];
        this.grid = new Map();
        this.cellSize = this.maxConnectDist;
        this.animationFrameId = null;
        
        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.onResize());
        this.createDots();
        this.animate();
    }

    onResize() {
        this.resize();
        this.createDots();
    }
    
    resize() {
        // Measure canvas display bounds accurately
        const rect = this.canvas.getBoundingClientRect();
        this.width = this.canvas.width = rect.width || window.innerWidth;
        this.height = this.canvas.height = rect.height || window.innerHeight;

        this.cols = Math.ceil(this.width / this.cellSize);
        this.rows = Math.ceil(this.height / this.cellSize);
    }

    createDots() {
        const targetCount = Math.floor(this.width * this.height * this.dotDensity);
        this.dots = [];
        for (let i = 0; i < targetCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            this.dots.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vx: Math.cos(angle) * this.dotSpeed,
                vy: Math.sin(angle) * this.dotSpeed,
                radius: Math.random() * 1.2 + 0.8
            });
        }
    }

    updateGrid() {
        this.grid.clear();
        for (let i = 0; i < this.dots.length; i++) {
            const dot = this.dots[i];
            const col = Math.floor(dot.x / this.cellSize);
            const row = Math.floor(dot.y / this.cellSize);
            const key = `${col},${row}`;
            if (!this.grid.has(key)) this.grid.set(key, []);
            this.grid.get(key).push(dot);
        }
    }

    updateDots() {
        for (let i = 0; i < this.dots.length; i++) {
            const dot = this.dots[i];
            dot.x += dot.vx;
            dot.y += dot.vy;

            if (dot.x < 0) dot.x = this.width;
            else if (dot.x > this.width) dot.x = 0;
            if (dot.y < 0) dot.y = this.height;
            else if (dot.y > this.height) dot.y = 0;
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctx.lineWidth = 0.75;
        
        for (let i = 0; i < this.dots.length; i++) {
            const dot = this.dots[i];
            const col = Math.floor(dot.x / this.cellSize);
            const row = Math.floor(dot.y / this.cellSize);
            
            const candidates = [];
            for (let c = col - 1; c <= col + 1; c++) {
                for (let r = row - 1; r <= row + 1; r++) {
                    const cellDots = this.grid.get(`${c},${r}`);
                    if (cellDots) {
                        for (let j = 0; j < cellDots.length; j++) {
                            if (cellDots[j] !== dot) candidates.push(cellDots[j]);
                        }
                    }
                }
            }

            const nearest = [];
            for (let j = 0; j < candidates.length; j++) {
                const neighbor = candidates[j];
                const dx = dot.x - neighbor.x;
                const dy = dot.y - neighbor.y;
                const distSq = dx * dx + dy * dy;

                if (distSq < this.maxConnectDistSq) {
                    nearest.push({ dot: neighbor, distSq });
                }
            }

            nearest.sort((a, b) => a.distSq - b.distSq);
            const top4 = nearest.slice(0, 4);

            for (let j = 0; j < top4.length; j++) {
                const neighbor = top4[j].dot;
                if (dot.x < neighbor.x || (dot.x === neighbor.x && dot.y < neighbor.y)) {
                    const opacity = (1 - Math.sqrt(top4[j].distSq) / this.maxConnectDist) * 0.35;
                    this.ctx.strokeStyle = `rgba(${this.lineColorRgb}, ${opacity})`;
                    this.ctx.beginPath();
                    this.ctx.moveTo(dot.x, dot.y);
                    this.ctx.lineTo(neighbor.x, neighbor.y);
                    this.ctx.stroke();
                }
            }
        }

        this.ctx.fillStyle = this.dotColor;
        for (let i = 0; i < this.dots.length; i++) {
            const dot = this.dots[i];
            this.ctx.beginPath();
            this.ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    animate() {
        this.updateDots();
        this.updateGrid();
        this.draw();
        requestAnimationFrame(() => this.animate());
    }
}