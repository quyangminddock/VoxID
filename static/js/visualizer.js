class Visualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.analyser = null;
        this.dataArray = null;
        this.resize();

        window.addEventListener('resize', () => this.resize());
        this.animate = this.animate.bind(this);
    }

    setAnalyser(analyser) {
        this.analyser = analyser;
        this.bufferLength = analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);
        this.animate();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = 150;
    }

    animate() {
        if (!this.analyser) return;

        requestAnimationFrame(this.animate);

        this.analyser.getByteFrequencyData(this.dataArray);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const barWidth = (this.canvas.width / this.bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        // 镜像效果，从中间向两边
        // 这里简化为普通的从左到右，或者只取低频部分
        const relevantDataLength = Math.floor(this.bufferLength / 2); // 高频部分往往没数据，忽略
        const effectiveBarWidth = this.canvas.width / relevantDataLength;

        for (let i = 0; i < relevantDataLength; i++) {
            barHeight = (this.dataArray[i] / 255) * this.canvas.height;

            // 渐变色
            const gradient = this.ctx.createLinearGradient(0, this.canvas.height, 0, this.canvas.height - barHeight);
            gradient.addColorStop(0, 'rgba(0, 243, 255, 0.2)');
            gradient.addColorStop(1, 'rgba(188, 19, 254, 0.8)');

            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(x, this.canvas.height - barHeight, effectiveBarWidth - 1, barHeight);

            x += effectiveBarWidth;
        }
    }

    getAverageVolume() {
        if (!this.dataArray) return 0;
        let sum = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
            sum += this.dataArray[i];
        }
        return sum / this.dataArray.length / 255; // 0-1
    }
}
