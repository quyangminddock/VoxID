class Avatar {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        
        // 状态定义
        this.state = 'IDLE'; // IDLE, LISTENING, PROCESSING, HAPPY, ALERT
        this.color = '#00f3ff'; // 主色调
        
        // 动画参数
        this.time = 0;
        this.blinkTimer = 0;
        this.isBlinking = false;
        this.mouthOpenness = 0; // 0-1, 受音频控制
        
        // 绑定 resize 事件
        window.addEventListener('resize', () => this.resize());
        
        // 启动动画循环
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }
    
    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.centerX = this.canvas.width / 2;
        this.centerY = this.canvas.height / 2;
        this.scale = Math.min(this.canvas.width, this.canvas.height) / 400; // 基准尺寸 400
    }
    
    updateAudioLevel(level) {
        // level 0-1
        // 平滑处理
        this.mouthOpenness += (level - this.mouthOpenness) * 0.2;
    }
    
    setState(newState) {
        this.state = newState;
        switch(newState) {
            case 'IDLE':
            case 'LISTENING':
                this.targetColor = '#00f3ff'; // 蓝
                break;
            case 'PROCESSING':
                this.targetColor = '#ffffff'; // 白
                break;
            case 'HAPPY':
                this.targetColor = '#bc13fe'; // 紫/粉
                break;
            case 'ALERT':
                this.targetColor = '#ff0055'; // 红
                break;
        }
    }
    
    // 颜色插值
    lerpColor(a, b, amount) {
        // 简化版颜色过渡，实际可以用更复杂的 HEX 解析
        return this.targetColor || this.color; 
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();
        this.ctx.translate(this.centerX, this.centerY);
        this.ctx.scale(this.scale, this.scale);
        
        this.time += 0.05;
        this.color = this.targetColor || '#00f3ff';
        
        // 绘制光环 (呼吸效果)
        const breathe = Math.sin(this.time) * 5 + 10;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 120 + this.mouthOpenness * 20, 0, Math.PI * 2);
        this.ctx.strokeStyle = this.color;
        this.ctx.lineWidth = 2;
        this.ctx.shadowBlur = 20 + breathe;
        this.ctx.shadowColor = this.color;
        this.ctx.stroke();
        
        // 绘制内圈
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 100, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
        this.ctx.fill();
        this.ctx.lineWidth = 4;
        this.ctx.stroke();
        
        // 眼睛逻辑
        this.drawEyes();
        
        // 嘴巴逻辑
        this.drawMouth();

        this.ctx.restore();
    }
    
    drawEyes() {
        // 眨眼逻辑
        this.blinkTimer++;
        if (this.blinkTimer > 200) {
            this.isBlinking = true;
            if (this.blinkTimer > 210) {
                this.isBlinking = false;
                this.blinkTimer = 0;
            }
        }
        
        let eyeHeight = this.isBlinking ? 2 : 20;
        let eyeWidth = 40;
        let eyeY = -20;
        let eyeSpread = 50;
        
        this.ctx.fillStyle = this.color;
        this.ctx.shadowBlur = 10;
        
        if (this.state === 'HAPPY') {
            // 笑眼 ^ ^
            this.ctx.lineWidth = 5;
            this.ctx.beginPath();
            // 左眼
            this.ctx.moveTo(-eyeSpread - 20, eyeY);
            this.ctx.quadraticCurveTo(-eyeSpread, eyeY - 20, -eyeSpread + 20, eyeY);
            // 右眼
            this.ctx.moveTo(eyeSpread - 20, eyeY);
            this.ctx.quadraticCurveTo(eyeSpread, eyeY - 20, eyeSpread + 20, eyeY);
            this.ctx.stroke();
        } else if (this.state === 'ALERT') {
            // 怒眼 > <
            this.ctx.beginPath();
            // 左眼
            this.ctx.save();
            this.ctx.translate(-eyeSpread, eyeY);
            this.ctx.rotate(Math.PI / 6);
            this.ctx.rect(-20, -5, 40, 10);
            this.ctx.restore();
            // 右眼
            this.ctx.save();
            this.ctx.translate(eyeSpread, eyeY);
            this.ctx.rotate(-Math.PI / 6);
            this.ctx.rect(-20, -5, 40, 10);
            this.ctx.restore();
            this.ctx.fill();
        } else {
            // 正常眼睛 O O
            this.ctx.beginPath();
            this.ctx.ellipse(-eyeSpread, eyeY, eyeWidth/2, eyeHeight/2, 0, 0, Math.PI * 2);
            this.ctx.ellipse(eyeSpread, eyeY, eyeWidth/2, eyeHeight/2, 0, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }
    
    drawMouth() {
        const mouthY = 40;
        const width = 60;
        
        this.ctx.beginPath();
        this.ctx.strokeStyle = this.color;
        this.ctx.lineWidth = 3;
        
        // 简单的波形嘴巴
        if (this.mouthOpenness > 0.1) {
            this.ctx.moveTo(-width/2, mouthY);
            // 模拟声波震动
            for(let x = -width/2; x <= width/2; x+=5) {
                let y = mouthY + Math.sin(x * 0.5 + this.time * 10) * (this.mouthOpenness * 20);
                this.ctx.lineTo(x, y);
            }
        } else {
            // 微笑弧度
            this.ctx.moveTo(-width/2, mouthY);
            this.ctx.quadraticCurveTo(0, mouthY + 10, width/2, mouthY);
        }
        this.ctx.stroke();
    }
    
    animate() {
        this.draw();
        requestAnimationFrame(this.animate);
    }
}
