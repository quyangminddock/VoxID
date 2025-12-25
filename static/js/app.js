// 全局组件实例
let avatar;
let visualizer;
let ws;
let audioContext;
let scriptProcessor;
let mediaStream;

// 状态变量
let isConnected = false;
let isAudioInitialized = false;
let lastSpeakerCheckTime = 0;
let accumulatedPcmData = []; // 用于声纹识别的音频缓冲
const SPEAKER_CHECK_INTERVAL = 3000; // 每3秒检查一次声纹
let currentSpeakerName = null;

// 配置
const SAMPLE_RATE = 16000;
const BUFFER_SIZE = 4096;

document.addEventListener('DOMContentLoaded', init);

async function init() {
    // 1. 初始化 UI 组件
    avatar = new Avatar('avatar-canvas');
    visualizer = new Visualizer('visualizer-canvas');

    // 2. 绑定按钮事件
    const startBtn = document.getElementById('start-btn');
    if (startBtn) startBtn.addEventListener('click', startExperience);

    const debugBtn = document.getElementById('toggle-debug-btn');
    if (debugBtn) debugBtn.addEventListener('click', toggleDebugPanel);

    const regConfirmBtn = document.getElementById('register-confirm-btn');
    if (regConfirmBtn) regConfirmBtn.addEventListener('click', registerCurrentSpeaker);

    // 3. 连接 WebSocket
    connectWebSocket();

    // 4. 加载说话人列表
    if (window.loadSpeakerList) window.loadSpeakerList();
}

// 启动体验
async function startExperience() {
    try {
        // 请求摄像头和麦克风权限
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: {
                sampleRate: SAMPLE_RATE,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        // 设置视频源
        const videoEl = document.getElementById('camera-feed');
        videoEl.srcObject = mediaStream;
        videoEl.play();

        // 初始化音频处理
        initAudioProcessing(mediaStream);

        // 更新 UI
        document.getElementById('start-btn').style.display = 'none'; // 隐藏开始按钮
        document.getElementById('intro-overlay').style.display = 'none';
        avatar.setState('LISTENING');
        updateStatus('active', '正在监听...');

    } catch (err) {
        console.error('Camera/Mic access denied:', err);
        alert('需要摄像头和麦克风权限才能运行此体验！');
        updateStatus('error', '权限被拒绝');
    }
}

// 初始化音频处理 pipeline
function initAudioProcessing(stream) {
    audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    const source = audioContext.createMediaStreamSource(stream);

    // 1. 连接到 Visualizer
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    visualizer.setAnalyser(analyser);

    // 2. 连接到 ASR 处理节点
    scriptProcessor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
    source.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination); // 必需，否则不工作

    scriptProcessor.onaudioprocess = processAudio;

    isAudioInitialized = true;

    // 启动口型同步循环
    setInterval(() => {
        if (visualizer) {
            const vol = visualizer.getAverageVolume();
            avatar.updateAudioLevel(vol * 5); // 放大一点
        }
    }, 50);
}

// 音频处理回调
function processAudio(e) {
    const inputData = e.inputBuffer.getChannelData(0);

    // 1. 转换 PCM 16bit
    const pcmData = new Int16Array(inputData.length);
    for (let i = 0; i < inputData.length; i++) {
        let s = Math.max(-1, Math.min(1, inputData[i]));
        pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    // 2. 发送给 ASR WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(pcmData.buffer);
    }

    // 3. 收集用于声纹识别的数据
    accumulatedPcmData.push(...inputData);

    // 保持 buffer 不会无限增长，只保留最近 5 秒以防万一
    const maxSamples = SAMPLE_RATE * 5;
    if (accumulatedPcmData.length > maxSamples) {
        accumulatedPcmData = accumulatedPcmData.slice(accumulatedPcmData.length - maxSamples);
    }

    // 4. 定期触发声纹检查
    const now = Date.now();
    if (now - lastSpeakerCheckTime > SPEAKER_CHECK_INTERVAL) {
        // 只有当前有一定音量时才检查
        if (visualizer && visualizer.getAverageVolume() > 0.05) {
            checkSpeakerIdentity();
            lastSpeakerCheckTime = now;
        }
    }
}

// WebSocket 连接
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
        isConnected = true;
        updateStatus('active', '系统在线');
        document.getElementById('ws-status-dot').className = 'status-dot active';
    };

    ws.onclose = () => {
        isConnected = false;
        updateStatus('error', '连接断开');
        document.getElementById('ws-status-dot').className = 'status-dot error';
        setTimeout(connectWebSocket, 3000);
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleServerMessage(data);
        } catch (err) {
            console.error(err);
        }
    };
}

// 处理服务器消息
function handleServerMessage(data) {
    if (data.type === 'final' && data.text) {
        addChatLog(data.text, 'user');

        if (data.text.includes('你好') || data.text.includes('小强')) {
            avatar.setState('HAPPY');
            setTimeout(() => avatar.setState('LISTENING'), 2000);
        }
    }
}

// 声纹识别检查
async function checkSpeakerIdentity() {
    const samplesNeeded = SAMPLE_RATE * 3;
    if (accumulatedPcmData.length < samplesNeeded) return;

    const audioSlice = accumulatedPcmData.slice(accumulatedPcmData.length - samplesNeeded);
    const wavBlob = createWavBlob(audioSlice, SAMPLE_RATE);

    const formData = new FormData();
    formData.append('audio', wavBlob, 'check.wav');

    const siDot = document.getElementById('si-status-dot');
    if (siDot) siDot.className = 'status-dot processing';

    try {
        const resp = await fetch('/api/v1/speaker/identify', { method: 'POST', body: formData });
        const result = await resp.json();

        if (siDot) siDot.className = 'status-dot active';

        if (result.identified && result.confidence > 0.5) {
            if (currentSpeakerName !== result.speaker_name) {
                currentSpeakerName = result.speaker_name;
                addChatLog(`识别到身份: ${currentSpeakerName}`, 'system');

                avatar.setState('HAPPY');
                updateStatus('active', `服务对象: ${currentSpeakerName}`);
            }
        } else {
            if (currentSpeakerName !== '陌生人') {
                currentSpeakerName = '陌生人';
                avatar.setState('ALERT');
                updateStatus('active', '陌生人检测');
            }
        }
    } catch (err) {
        console.error('Speaker Check Failed:', err);
        if (siDot) siDot.className = 'status-dot error';
    }
}

// 注册当前说话人
async function registerCurrentSpeaker() {
    const nameInput = document.getElementById('debug-name-input');
    const name = nameInput.value;
    if (!name) return alert('请输入名字');

    const wavBlob = createWavBlob(accumulatedPcmData, SAMPLE_RATE);
    const formData = new FormData();
    formData.append('audio', wavBlob, 'register.wav');
    formData.append('speaker_name', name);
    formData.append('speaker_id', 'user_' + Date.now());

    try {
        const resp = await fetch('/api/v1/speaker/register', { method: 'POST', body: formData });
        if (resp.ok) {
            alert(`注册成功！已添加: ${name}`);
            nameInput.value = '';
            loadSpeakerList();
        } else {
            alert('注册失败');
        }
    } catch (err) {
        alert('错误: ' + err.message);
    }
}

// 辅助函数：PCM to WAV Blob
function createWavBlob(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (view, offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
        let s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
}

// UI 辅助函数
function toggleDebugPanel() {
    document.getElementById('debug-panel').classList.toggle('visible');
}

function updateStatus(state, text) {
    const el = document.getElementById('system-status-text');
    if (el) el.innerText = text;
}

// 辅助：解析 SenseVoice 标签
function parseSenseVoiceTags(rawText) {
    const langMap = {
        '<|zh|>': '🇨🇳', '<|en|>': '🇺🇸', '<|ja|>': '🇯🇵',
        '<|ko|>': '🇰🇷', '<|yue|>': '🇭🇰'
    };
    const emoMap = {
        '<|HAPPY|>': { icon: '😊', state: 'HAPPY' },
        '<|SAD|>': { icon: '😢', state: 'IDLE' },
        '<|ANGRY|>': { icon: '😠', state: 'ALERT' },
        '<|NEUTRAL|>': { icon: '😐', state: 'LISTENING' },
        '<|FEAR|>': { icon: '😱', state: 'ALERT' },
        '<|DISGUST|>': { icon: '🤢', state: 'IDLE' },
        '<|SURPRISE|>': { icon: '😲', state: 'HAPPY' }
    };

    let text = rawText || "";
    let lang = '';
    let emo = null;

    // 提取语言
    for (const [tag, flag] of Object.entries(langMap)) {
        if (text.includes(tag)) {
            lang = flag;
            text = text.replace(tag, '');
        }
    }

    // 提取情感
    for (const [tag, info] of Object.entries(emoMap)) {
        if (text.includes(tag)) {
            emo = info;
            text = text.replace(tag, '');
        }
    }

    text = text.replace(/<\|[\w\s]+\|>/g, '').trim();

    return { text, lang, emo };
}

function addChatLog(rawText, type) {
    const container = document.getElementById('chat-list');
    if (!container) return;

    const { text, lang, emo } = parseSenseVoiceTags(rawText);

    // 驱动 Avatar
    if (type === 'user' && emo && emo.state) {
        if (avatar) avatar.setState(emo.state);
        // 自动恢复
        if (emo.state !== 'LISTENING' && emo.state !== 'IDLE') {
            setTimeout(() => {
                if (avatar) avatar.setState('LISTENING');
            }, 2500);
        }
    }

    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg';

    let name = '未知用户';
    let nameClass = '';

    if (type === 'ai') {
        name = '小强一号';
        nameClass = 'ai';
    } else if (type === 'system') {
        name = '系统通知';
        nameClass = 'system';
    } else {
        name = currentSpeakerName || '检测中...';
        if (name === '陌生人') nameClass = 'stranger';
    }

    const time = new Date().toLocaleTimeString();

    let metaHTML = `<span class="name ${nameClass}">${name}</span>`;
    if (lang) metaHTML += `<span style="margin-left:8px; font-size:14px;">${lang}</span>`;
    if (emo) metaHTML += `<span style="margin-left:6px; font-size:16px;">${emo.icon}</span>`;
    metaHTML += `<span class="time" style="flex-grow:1; text-align:right;">${time}</span>`;

    msgDiv.innerHTML = `
        <div class="chat-meta">
            ${metaHTML}
        </div>
        <div class="chat-content">${text || rawText}</div>
    `;

    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

// Speaker Management
window.loadSpeakerList = async function () {
    const listEl = document.getElementById('speaker-list');
    if (!listEl) return;
    listEl.innerHTML = '<div style="text-align:center;color:#666;font-size:12px">加载中...</div>';
    try {
        const resp = await fetch('/api/v1/speaker/list');
        const data = await resp.json();
        renderSpeakerList(data.speakers || []);
    } catch (e) {
        console.error(e);
        listEl.innerHTML = '<div style="text-align:center;color:red;font-size:12px">加载失败</div>';
    }
};

window.deleteSpeaker = async function (id, name) {
    if (!confirm(`确定要删除 "${name}" 吗?`)) return;
    try {
        await fetch(`/api/v1/speaker/${id}`, { method: 'DELETE' });
        loadSpeakerList();
        if (currentSpeakerName === name) {
            currentSpeakerName = null;
        }
    } catch (e) {
        alert('删除失败');
    }
};

function renderSpeakerList(speakers) {
    const listEl = document.getElementById('speaker-list');
    if (speakers.length === 0) {
        listEl.innerHTML = '<div style="text-align:center;color:#666;font-size:12px">暂无已注册用户</div>';
        return;
    }

    listEl.innerHTML = speakers.map(s => `
        <div class="speaker-row">
            <span class="name">${s.name}</span>
            <span class="delete-btn" onclick="deleteSpeaker('${s.id}', '${s.name}')">
                <i class="fa-solid fa-trash"></i>
            </span>
        </div>
    `).join('');
}
