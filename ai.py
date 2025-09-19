# Speech-to-text processing
import speech_recognition as sr
import openai
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    # Receive audio from frontend
    audio_file = request.files['audio']
    
    # Process with SpeechRecognition
    recognizer = sr.Recognizer()
    with sr.AudioFile(audio_file) as source:
        audio = recognizer.record(source)
        text = recognizer.recognize_google(audio)
    
    return jsonify({'transcript': text})

@app.route('/generate_summary', methods=['POST'])
def generate_summary():
    transcript = request.json['transcript']
    
    # Use OpenAI for meeting summary
    response = openai.Completion.create(
        model="gpt-3.5-turbo",
        messages=[{
            "role": "user", 
            "content": f"Summarize this meeting: {transcript}"
        }]
    )
    
    return jsonify({'summary': response.choices.message.content})
