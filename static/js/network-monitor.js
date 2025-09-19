// Network Quality Monitoring Class (Based on your handwritten notes!)
class NetworkQualityMonitor {
    constructor(peerConnection, socket) {
        this.peerConnection = peerConnection;
        this.socket = socket;
        this.isMonitoring = false;
        this.monitoringInterval = null;
        this.lastStats = null;
        
        this.setupSocketListeners();
    }

    setupSocketListeners() {
        // Listen for quality updates from server
        this.socket.on('quality_update', (data) => {
            this.updateNetworkUI(data);
            this.logNetworkEvent(data);
        });
    }

    startMonitoring() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        console.log('📊 Started network quality monitoring');
        
        // Monitor every 2 seconds
        this.monitoringInterval = setInterval(async () => {
            if (this.peerConnection && this.peerConnection.connectionState === 'connected') {
                await this.collectAndSendStats();
            }
        }, 2000);
    }

    stopMonitoring() {
        if (!this.isMonitoring) return;
        
        this.isMonitoring = false;
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        console.log('📊 Stopped network quality monitoring');
    }

    async collectAndSendStats() {
        try {
            const stats = await this.peerConnection.getStats();
            const networkMetrics = this.analyzeStats(stats);
            
            if (networkMetrics) {
                // Send stats to server for processing
                this.socket.emit('network_stats', {
                    room: getCurrentRoom(),
                    ...networkMetrics
                });
            }
        } catch (error) {
            console.error('Error collecting network stats:', error);
        }
    }

    analyzeStats(stats) {
        let packetLoss = 0;
        let rtt = 0;
        let jitter = 0;
        let bytesReceived = 0;
        let bytesSent = 0;

        stats.forEach(report => {
            // Analyze inbound RTP stats
            if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
                if (report.packetsLost !== undefined && report.packetsReceived !== undefined) {
                    const totalPackets = report.packetsReceived + report.packetsLost;
                    if (totalPackets > 0) {
                        packetLoss = (report.packetsLost / totalPackets) * 100;
                    }
                }
                
                if (report.jitter !== undefined) {
                    jitter = report.jitter * 1000; // Convert to ms
                }
                
                if (report.bytesReceived !== undefined) {
                    bytesReceived = report.bytesReceived;
                }
            }

            // Analyze outbound RTP stats
            if (report.type === 'outbound-rtp' && report.mediaType === 'video') {
                if (report.bytesSent !== undefined) {
                    bytesSent = report.bytesSent;
                }
            }

            // Analyze candidate pair for RTT
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                if (report.currentRoundTripTime !== undefined) {
                    rtt = report.currentRoundTripTime * 1000; // Convert to ms
                }
            }
        });

        return {
            packet_loss: Math.round(packetLoss * 10) / 10, // Round to 1 decimal
            rtt: Math.round(rtt),
            jitter: Math.round(jitter * 10) / 10,
            bytes_received: bytesReceived,
            bytes_sent: bytesSent
        };
    }

    updateNetworkUI(data) {
        const { level, stats, recommendation } = data;
        
        // Update status indicator
        const qualityIcon = document.getElementById('qualityIcon');
        const qualityText = document.getElementById('qualityText');
        const networkStatus = document.getElementById('networkStatus');
        const packetLossElement = document.getElementById('packetLoss');
        const rttElement = document.getElementById('rtt');
        
        // Update icon and text based on quality level
        const qualityConfig = {
            good: {
                icon: '🟢',
                text: 'Good Connection',
                class: 'quality-good'
            },
            medium: {
                icon: '🟡',
                text: 'Moderate Connection',
                class: 'quality-medium'
            },
            poor: {
                icon: '🔴',
                text: 'Poor Connection',
                class: 'quality-poor'
            }
        };

        const config = qualityConfig[level] || qualityConfig.good;
        
        qualityIcon.textContent = config.icon;
        qualityText.textContent = `${config.text} - ${recommendation}`;
        
        // Update network status class
        networkStatus.className = `network-status ${config.class}`;
        
        // Update detailed stats
        if (stats) {
            packetLossElement.textContent = `Packet Loss: ${stats.packet_loss?.toFixed(1) || 0}%`;
            rttElement.textContent = `Latency: ${stats.rtt || 0}ms`;
        }
    }

    logNetworkEvent(data) {
        const networkLog = document.getElementById('networkLog');
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] Quality: ${data.level.toUpperCase()} | ` +
                        `Packet Loss: ${data.stats.packet_loss?.toFixed(1)}% | ` +
                        `RTT: ${data.stats.rtt}ms\n`;
        
        networkLog.textContent += logEntry;
        networkLog.scrollTop = networkLog.scrollHeight;
        
        // Keep only last 50 lines
        const lines = networkLog.textContent.split('\n');
        if (lines.length > 50) {
            networkLog.textContent = lines.slice(-50).join('\n');
        }
    }
}

// Helper function to get current room
function getCurrentRoom() {
    return document.getElementById('roomInput').value || 'default';
}

// Export for use in main.js
window.NetworkQualityMonitor = NetworkQualityMonitor;
