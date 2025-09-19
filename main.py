from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
import time
import json
import logging

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = 'hackathon-video-conference-2025'
socketio = SocketIO(app, cors_allowed_origins="*", logger=True, engineio_logger=True)

# Store network quality data and room information
network_stats = {}
active_rooms = {}

@app.route('/')
def index():
    """Main page route"""
    return render_template('index.html')

@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'timestamp': time.time()})

# WebRTC Signaling Handlers
@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    print(f"Client connected: {request.sid}")
    emit('connected', {'status': 'Connected to signaling server'})

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    print(f"Client disconnected: {request.sid}")

@socketio.on('join_room')
def handle_join_room(data):
    """Handle user joining a room"""
    room = data.get('room', 'default')
    username = data.get('username', 'Anonymous')
    
    join_room(room)
    
    if room not in active_rooms:
        active_rooms[room] = {'participants': [], 'created_at': time.time()}
    
    active_rooms[room]['participants'].append({
        'sid': request.sid,
        'username': username
    })
    
    emit('user_joined', {
        'username': username,
        'room': room,
        'participants': len(active_rooms[room]['participants'])
    }, room=room)
    
    print(f"User {username} joined room {room}")

@socketio.on('leave_room')
def handle_leave_room(data):
    """Handle user leaving a room"""
    room = data.get('room', 'default')
    leave_room(room)
    
    if room in active_rooms:
        active_rooms[room]['participants'] = [
            p for p in active_rooms[room]['participants'] 
            if p['sid'] != request.sid
        ]
    
    emit('user_left', {'room': room}, room=room)

# WebRTC Signaling
@socketio.on('offer')
def handle_offer(data):
    """Handle WebRTC offer"""
    room = data.get('room', 'default')
    print(f"Received offer for room {room}")
    emit('offer', data, room=room, include_self=False)

@socketio.on('answer')
def handle_answer(data):
    """Handle WebRTC answer"""
    room = data.get('room', 'default')
    print(f"Received answer for room {room}")
    emit('answer', data, room=room, include_self=False)

@socketio.on('ice_candidate')
def handle_ice_candidate(data):
    """Handle ICE candidate"""
    room = data.get('room', 'default')
    emit('ice_candidate', data, room=room, include_self=False)

# Network Quality Monitoring (Your handwritten requirements!)
@socketio.on('network_stats')
def handle_network_stats(data):
    """Handle network quality statistics"""
    room = data.get('room', 'default')
    stats = {
        'packet_loss': data.get('packet_loss', 0),
        'rtt': data.get('rtt', 0),
        'jitter': data.get('jitter', 0),
        'timestamp': time.time(),
        'user': request.sid
    }
    
    # Store stats
    if room not in network_stats:
        network_stats[room] = []
    network_stats[room].append(stats)
    
    # Keep only last 10 measurements
    if len(network_stats[room]) > 10:
        network_stats[room] = network_stats[room][-10:]
    
    # Determine quality level
    quality_level = determine_quality(stats)
    
    # Get recommendation
    recommendation = get_quality_recommendation(quality_level)
    
    print(f"Network stats - Room: {room}, Quality: {quality_level}, "
          f"Packet Loss: {stats['packet_loss']:.1f}%, RTT: {stats['rtt']:.1f}ms")
    
    # Broadcast quality update to room
    emit('quality_update', {
        'level': quality_level,
        'stats': stats,
        'recommendation': recommendation
    }, room=room)

def determine_quality(stats):
    """Determine network quality based on stats"""
    packet_loss = stats.get('packet_loss', 0)
    rtt = stats.get('rtt', 0)
    
    if packet_loss > 5 or rtt > 300:
        return 'poor'
    elif packet_loss > 2 or rtt > 150:
        return 'medium'
    else:
        return 'good'

def get_quality_recommendation(level):
    """Get recommendation based on quality level"""
    recommendations = {
        'poor': 'Consider switching to audio-only mode',
        'medium': 'Video quality automatically reduced',
        'good': 'Optimal video quality available'
    }
    return recommendations.get(level, 'Unknown quality')

# Low Data Mode Support
@socketio.on('low_data_mode')
def handle_low_data_mode(data):
    """Handle low data mode toggle"""
    room = data.get('room', 'default')
    enabled = data.get('enabled', False)
    username = data.get('username', 'User')
    
    emit('low_data_mode_update', {
        'username': username,
        'enabled': enabled,
        'message': f"{username} {'enabled' if enabled else 'disabled'} low data mode"
    }, room=room)

import datetime

# In-memory storage, keyed by room
meeting_transcripts = {}

@socketio.on('audio_transcript')
def handle_audio_transcript(data):
    room = data.get('room', 'default')
    username = data.get('username', 'Anonymous')
    text = data.get('text', '')
    timestamp = datetime.datetime.now().strftime('%H:%M:%S')

    # Save transcript in memory for the room
    if room not in meeting_transcripts:
        meeting_transcripts[room] = []
    meeting_transcripts[room].append({'username': username, 'text': text, 'timestamp': timestamp})

    # Broadcast latest transcript to all clients in room
    emit('transcript_update', {'username': username, 'text': text, 'timestamp': timestamp}, room=room)

if __name__ == '__main__':
    print("🚀 Starting Video Conference Server...")
    print("📱 Open http://localhost:5000 in your browser")
    print("🔧 For testing, open multiple tabs or browsers")
    socketio.run(app, host='0.0.0.0', port=5000)

