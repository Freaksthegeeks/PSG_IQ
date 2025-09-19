// Main Application Logic
class SimpleConfer {
    constructor() {
        this.socket = io();
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.networkMonitor = null;
        this.isLowDataMode = false;
        this.isAudioMuted = false;
        this.isVideoStopped = false;
        
        this.init();
    }

    async init() {
        console.log('🚀 Initializing SimpleConfer...');
        
        this.setupSocketListeners();
        this.setupUIEventListeners();
        
        try {
            // Get user media
            await this.getUserMedia();
            console.log('✅ Camera and microphone access granted');
        } catch (error) {
            console.error('❌ Error accessing media devices:', error);
            this.showStatus('Camera/microphone access denied. Please allow access and refresh.', 'error');
        }
    }

    setupSocketListeners() {
        this.socket.on('connected', (data) => {
            console.log('✅ Connected to signaling server');
            this.showStatus('Connected to server', 'success');
        });

        this.socket.on('user_joined', (data) => {
            this.showStatus(`${data.username} joined the room (${data.participants} participants)`, 'info');
        });

        this.socket.on('user_left', (data) => {
            this.showStatus('User left the room', 'info');
        });

        this.socket.on('offer', async (data) => {
            console.log('📞 Received call offer');
            await this.handleOffer(data);
        });

        this.socket.on('answer', async (data) => {
            console.log('📞 Received call answer');
            await this.handleAnswer(data);
        });

        this.socket.on('ice_candidate', async (data) => {
            await this.handleIceCandidate(data);
        });

        this.socket.on('low_data_mode_update', (data) => {
            this.showStatus(data.message, 'info');
        });
    }

    setupUIEventListeners() {
        // Call controls
        document.getElementById('startCall').onclick = () => this.startCall();
        document.getElementById('endCall').onclick = () => this.endCall();
        
        // Media controls
        document.getElementById('toggleAudio').onclick = () => this.toggleAudio();
        document.getElementById('toggleVideo').onclick = () => this.toggleVideo();
        
        // Low data mode (YOUR HANDWRITTEN REQUIREMENT!)
        document.getElementById('lowDataMode').onclick = () => this.toggleLowDataMode();
        
        // Room management
        document.getElementById('roomInput').addEventListener('change', () => {
            this.joinRoom();
        });
    }

    async getUserMedia() {
        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        };

        this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
        document.getElementById('localVideo').srcObject = this.localStream;
        
        this.showStatus('Ready to start call', 'success');
    }

    joinRoom() {
        const room = document.getElementById('roomInput').value || 'default';
        const username = document.getElementById('usernameInput').value || 'Anonymous';
        
        this.socket.emit('join_room', { room, username });
    }

    async startCall() {
        try {
            console.log('📞 Starting call...');
            this.showStatus('Starting call...', 'info');
            
            // Join room first
            this.joinRoom();
            
            // Create peer connection
            await this.createPeerConnection();
            
            // Start network monitoring
            this.startNetworkMonitoring();
            
            // Create and send offer
            const offer = await this.peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            
            await this.peerConnection.setLocalDescription(offer);
            
            this.socket.emit('offer', {
                room: this.getCurrentRoom(),
                offer: offer
            });
            
            this.showStatus('Calling...', 'info');
            console.log('📤 Sent call offer');
            
        } catch (error) {
            console.error('❌ Error starting call:', error);
            this.showStatus('Error starting call', 'error');
        }
    }

    async createPeerConnection() {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };

        this.peerConnection = new RTCPeerConnection(configuration);

        // Add local stream tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
        }

        // Handle remote stream
        this.peerConnection.ontrack = (event) => {
            console.log('📹 Received remote stream');
            this.remoteStream = event.streams;
            document.getElementById('remoteVideo').srcObject = this.remoteStream;
            this.showStatus('Call connected!', 'success');
        };

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('ice_candidate', {
                    room: this.getCurrentRoom(),
                    candidate: event.candidate
                });
            }
        };

        // Handle connection state changes
        this.peerConnection.onconnectionstatechange = () => {
            console.log('🔄 Connection state:', this.peerConnection.connectionState);
            
            if (this.peerConnection.connectionState === 'connected') {
                this.showStatus('Call connected successfully!', 'success');
            } else if (this.peerConnection.connectionState === 'failed') {
                this.showStatus('Connection failed. Please try again.', 'error');
            }
        };
    }

    startNetworkMonitoring() {
        if (!this.networkMonitor && this.peerConnection) {
            this.networkMonitor = new NetworkQualityMonitor(this.peerConnection, this.socket);
            this.networkMonitor.startMonitoring();
            console.log('📊 Network monitoring started');
        }
    }

    async handleOffer(data) {
        try {
            await this.createPeerConnection();
            this.startNetworkMonitoring();
            
            await this.peerConnection.setRemoteDescription(data.offer);
            
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            
            this.socket.emit('answer', {
                room: this.getCurrentRoom(),
                answer: answer
            });
            
            console.log('📤 Sent call answer');
            
        } catch (error) {
            console.error('❌ Error handling offer:', error);
        }
    }

    async handleAnswer(data) {
        try {
            await this.peerConnection.setRemoteDescription(data.answer);
            console.log('✅ Call answer processed');
        } catch (error) {
            console.error('❌ Error handling answer:', error);
        }
    }

    async handleIceCandidate(data) {
        try {
            if (data.candidate && this.peerConnection) {
                await this.peerConnection.addIceCandidate(data.candidate);
            }
        } catch (error) {
            console.error('❌ Error handling ICE candidate:', error);
        }
    }

    endCall() {
        console.log('📞 Ending call...');
        
        // Stop network monitoring
        if (this.networkMonitor) {
            this.networkMonitor.stopMonitoring();
            this.networkMonitor = null;
        }
        
        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        // Clear remote video
        document.getElementById('remoteVideo').srcObject = null;
        
        // Reset UI
        this.resetLowDataMode();
        
        this.showStatus('Call ended', 'info');
        console.log('✅ Call ended');
    }

    // Low Data Mode (YOUR HANDWRITTEN REQUIREMENT!)
    toggleLowDataMode() {
        const button = document.getElementById('lowDataMode');
        const localOverlay = document.getElementById('localVideoOverlay');
        
        if (!this.isLowDataMode) {
            // Enable low data mode
            this.enableLowDataMode();
            button.textContent = '📹 Enable Video';
            button.classList.remove('btn-warning');
            button.classList.add('btn-primary');
            localOverlay.classList.remove('hidden');
            
            this.showStatus('Low data mode enabled - Video disabled', 'info');
            console.log('📱 Low data mode ENABLED');
            
        } else {
            // Disable low data mode
            this.disableLowDataMode();
            button.textContent = '📱 Low Data Mode';
            button.classList.remove('btn-primary');
            button.classList.add('btn-warning');
            localOverlay.classList.add('hidden');
            
            this.showStatus('Video enabled - Normal mode', 'success');
            console.log('📹 Low data mode DISABLED');
        }
        
        this.isLowDataMode = !this.isLowDataMode;
        
        // Notify other participants
        this.socket.emit('low_data_mode', {
            room: this.getCurrentRoom(),
            username: document.getElementById('usernameInput').value || 'User',
            enabled: this.isLowDataMode
        });
    }

    enableLowDataMode() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks();
            if (videoTrack) {
                videoTrack.enabled = false;
            }
        }
    }

    disableLowDataMode() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks();
            if (videoTrack) {
                videoTrack.enabled = true;
            }
        }
    }

    resetLowDataMode() {
        if (this.isLowDataMode) {
            this.toggleLowDataMode();
        }
    }

    toggleAudio() {
        const button = document.getElementById('toggleAudio');
        
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks();
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                this.isAudioMuted = !audioTrack.enabled;
                
                button.textContent = this.isAudioMuted ? '🔇 Unmute' : '🎤 Mute';
                this.showStatus(this.isAudioMuted ? 'Audio muted' : 'Audio unmuted', 'info');
            }
        }
    }

    toggleVideo() {
        const button = document.getElementById('toggleVideo');
        
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks();
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                this.isVideoStopped = !videoTrack.enabled;
                
                button.textContent = this.isVideoStopped ? '📹 Start Video' : '📹 Stop Video';
                this.showStatus(this.isVideoStopped ? 'Video stopped' : 'Video started', 'info');
            }
        }
    }

    getCurrentRoom() {
        return document.getElementById('roomInput').value || 'default';
    }

    showStatus(message, type = 'info') {
        const statusMessages = document.getElementById('statusMessages');
        const timestamp = new Date().toLocaleTimeString();
        const typeEmojis = {
            success: '✅',
            error: '❌',
            info: 'ℹ️',
            warning: '⚠️'
        };
        
        const statusElement = document.createElement('div');
        statusElement.innerHTML = `[${timestamp}] ${typeEmojis[type]} ${message}`;
        statusElement.style.color = type === 'error' ? '#dc3545' : 
                                   type === 'success' ? '#28a745' : 
                                   type === 'warning' ? '#ffc107' : '#6c757d';
        
        statusMessages.appendChild(statusElement);
        statusMessages.scrollTop = statusMessages.scrollHeight;
        
        // Keep only last 10 messages
        while (statusMessages.children.length > 10) {
            statusMessages.removeChild(statusMessages.firstChild);
        }
        
        console.log(`${typeEmojis[type]} ${message}`);
    }
}

// Initialize app when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.app = new SimpleConfer();
    console.log('🎥 SimpleConfer initialized successfully!');
});

// Speech Recognition Setup (continuous transcription)
let recognition;
let isTranscribing = false;
let transcriptText = "";

// Start transcription
function startTranscription() {
    if (!('webkitSpeechRecognition' in window)) {
        console.warn("Speech Recognition not supported");
        return;
    }
    recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = function(event) {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                transcriptText += transcript + ' ';
            } else {
                interimTranscript += transcript;
            }
        }

        // Send latest finalized transcript to backend
        if (transcriptText.trim().length > 0) {
            socket.emit('audio_transcript', {
                room: getCurrentRoom(),
                username: document.getElementById('usernameInput').value || 'Anonymous',
                text: transcriptText
            });
        }

        // Optionally, show transcripts live on UI
        document.getElementById('liveTranscript').innerText = transcriptText + interimTranscript;
    };

    recognition.onerror = (event) => {
        console.error("Speech recognition error", event.error);
    };

    recognition.onend = () => {
        if (isTranscribing) recognition.start();  // Restart on end for continuous
    };

    recognition.start();
    isTranscribing = true;
}

// Stop transcription
function stopTranscription() {
    if (recognition) {
        recognition.stop();
        isTranscribing = false;
    }
}
