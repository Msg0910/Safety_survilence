from urllib import response
from flask import Flask, Response, jsonify, request
from flask_cors import CORS
import cv2
import threading
from typing import Dict
from supabase import create_client, Client
from dotenv import load_dotenv
import os
import numpy as np
import base64
import logging
import mediapipe as mp
from datetime import datetime, time
import time
from urllib.parse import unquote
from sklearn.metrics.pairwise import cosine_similarity
import face_recognition
import pickle
import assistant
import tensorflow as tf
from flask_cors import CORS
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.schema.messages import SystemMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_community.chat_message_histories import ChatMessageHistory
from langchain_google_genai import ChatGoogleGenerativeAI

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "http://localhost:5173"}},
     allow_headers=["Content-Type", "Authorization"],
     supports_credentials=True)





# Configure logging
logging.basicConfig(level=logging.DEBUG)

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

# Initialize Supabase client with environment variables
supabase_url = os.getenv("VITE_SUPABASE_URL")
supabase_key = os.getenv("VITE_SUPABASE_ANON_KEY")
supabase: Client = create_client(supabase_url, supabase_key)


# Initialize MediaPipe Hands for gesture detection
mp_hands = mp.solutions.hands
hands = mp_hands.Hands()

# Global state to track active models
active_models = {}
class Assistant:
    def __init__(self):
        self.fire_model = self._initialize_model(os.getenv("GOOGLE_API_KEY_FIRE"))
        self.helmet_model = self._initialize_model(os.getenv("GOOGLE_API_KEY_HELMET"))
        self.fire_chain = self._create_inference_chain(self.fire_model) if self.fire_model else None
        self.helmet_chain = self._create_inference_chain(self.helmet_model) if self.helmet_model else None
        self.last_inference_time = 0
        self.inference_cooldown = 0.5

    def _initialize_model(self, api_key):
        try:
            return ChatGoogleGenerativeAI(
                google_api_key=api_key,
                model="gemini-1.5-flash-latest",
                temperature=0.1,
                timeout=2
            )
        except Exception as e:
            app.logger.error(f"Model initialization error: {e}")
            return None

    def answer(self, image, prompt, model_type):
        if model_type == "fire":
            chain = self.fire_chain
        elif model_type == "helmet":
            chain = self.helmet_chain
        else:
            return "Invalid model type"

        if not chain:
            return "Model not initialized"

        current_time = time.time()
        if current_time - self.last_inference_time < self.inference_cooldown:
            return None

        try:
            response = chain.invoke(
                {"prompt": prompt, "image_base64": image},
                config={"configurable": {"session_id": "unused"}},
            ).strip()
            self.last_inference_time = current_time
            return response
        except Exception as e:
            return f"Error: {str(e)}"

    def _create_inference_chain(self, model):
        SYSTEM_PROMPT = """You are a multi-purpose detection assistant. Analyze the provided image and respond accordingly."""

        prompt_template = ChatPromptTemplate.from_messages([
            SystemMessage(content=SYSTEM_PROMPT),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", [
                {"type": "text", "text": "{prompt}"},
                {"type": "image_url", "image_url": "data:image/jpeg;base64,{image_base64}"},
            ]),
        ])

        chain = prompt_template | model | StrOutputParser()
        return RunnableWithMessageHistory(
            chain,
            lambda _: ChatMessageHistory(),
            input_messages_key="prompt",
            history_messages_key="chat_history",
        )

# Initialize the assistant globally
assistant = Assistant()


class CameraManager:
    def __init__(self):
        self.cameras: Dict[str, cv2.VideoCapture] = {}
        self.locks: Dict[str, threading.Lock] = {}

    def get_camera(self, camera_id: str, rtsp_url: str) -> cv2.VideoCapture:
        if camera_id not in self.cameras:
            cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
            if not cap.isOpened():
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 3)
                cap.open(rtsp_url, cv2.CAP_FFMPEG)
            self.cameras[camera_id] = cap
            self.locks[camera_id] = threading.Lock()
        return self.cameras[camera_id]

    def release_camera(self, camera_id: str):
        if camera_id in self.cameras:
            self.cameras[camera_id].release()
            del self.cameras[camera_id]
            del self.locks[camera_id]

camera_manager = CameraManager()

def generate_frames(camera_id: str, rtsp_url: str):
    camera = camera_manager.get_camera(camera_id, rtsp_url)
    if not camera.isOpened():
        app.logger.error(f"Failed to open camera {camera_id} with RTSP URL: {rtsp_url}")
        return
    lock = camera_manager.locks[camera_id]
    
    while True:
        with lock:
            success, frame = camera.read()
            if not success:
                app.logger.error(f"Failed to read frame from camera {camera_id}")
                break
            ret, buffer = cv2.imencode('.jpg', frame)
            if not ret:
                app.logger.error(f"Failed to encode frame from camera {camera_id}")
                break
            frame = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

def get_rtsp_url(camera_id: str) -> str:
    response = supabase.table('cameras').select('rtsp_url').eq('camera_id', camera_id).execute()
    if response.data and len(response.data) > 0:
        return unquote(response.data[0]['rtsp_url'])
    return None

@app.route('/video_feed/<camera_id>')
def video_feed(camera_id):
    response = Response(
        generate_frames(camera_id, get_rtsp_url(camera_id)),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )
    response.headers['Access-Control-Allow-Origin'] = '*'
    return response

@app.route('/capture_frame/<camera_id>')
def capture_frame(camera_id):
    rtsp_url = get_rtsp_url(camera_id)
    if not rtsp_url:
        return {'error': 'Camera not found'}, 404
    
    camera = camera_manager.get_camera(camera_id, rtsp_url)
    lock = camera_manager.locks[camera_id]
    
    with lock:
        success, frame = camera.read()
        if not success:
            return {'error': 'Failed to capture frame'}, 500
        
        ret, buffer = cv2.imencode('.jpg', frame)
        if not ret:
            return {'error': 'Failed to encode frame'}, 500
            
        return Response(buffer.tobytes(), mimetype='image/jpeg')

@app.route('/health')
def health_check():
    return {'status': 'healthy'}


@app.route('/generate_face_encoding', methods=['POST'])
def generate_face_encoding():
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400

    image_file = request.files['image']
    image = face_recognition.load_image_file(image_file)
    face_encodings = face_recognition.face_encodings(image)
    
    if not face_encodings:
        return jsonify({'error': 'No face detected'}), 400

    # Serialize the face encoding using pickle
    face_encoding = face_encodings[0]
    serialized_encoding = base64.b64encode(pickle.dumps(face_encoding)).decode('utf-8')

    return jsonify({
        'face_encoding': serialized_encoding,
        'message': 'Face encoding generated successfully'
    })
    

@app.route('/model-control', methods=['POST'])
def handle_model_control():
    try:
        data = request.get_json()
        app.logger.info(f"Received request data: {data}")

        camera_id = data.get('camera_id')
        model_id = data.get('model_id')
        action = data.get('action')

        if not all([camera_id, model_id, action]):
            app.logger.error("Missing parameters in request")
            return jsonify({'error': 'Missing parameters'}), 400

        if action == 'start':
            if camera_id in active_models:
                app.logger.error("Model already running")
                return jsonify({'error': 'Model already running'}), 400

            active_models[camera_id] = {'running': True}
            thread = threading.Thread(
                target=run_model_inference,
                args=(camera_id, model_id)
            )
            thread.start()
            app.logger.info(f"Started model {model_id} on camera {camera_id}")

        elif action == 'stop':
            if camera_id in active_models:
                active_models[camera_id]['running'] = False
                del active_models[camera_id]
                app.logger.info(f"Stopped model {model_id} on camera {camera_id}")
            else:
                app.logger.error("Model was not running")
                return jsonify({'error': 'Model was not running'}), 400
        else:
            app.logger.error("Invalid action")
            return jsonify({'error': 'Invalid action'}), 400

        response = jsonify({
            'status': 'success',
            'camera_id': camera_id,
            'model_id': model_id,
            'action': action
        })
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:5173')
        return response

    except Exception as e:
        app.logger.error(f"Internal Server Error: {e}", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500
    
    
def get_model_details(model_id: str) -> dict:
    """
    Fetch model details from the database using the model_id.
    Returns a dictionary containing model details.
    """
    try:
        # Fetch model details from the 'models' table in Supabase
        response = supabase.table('models').select('*').eq('model_id', model_id).execute()
        
        if response.data and len(response.data) > 0:
            return response.data[0]  # Return the first matching model
        else:
            app.logger.error(f"No model found with ID: {model_id}")
            return {'error': 'Model not found'}
        
    
    except Exception as e:
        app.logger.error(f"Error fetching model details: {e}")
        return {'error': str(e)}
    

def run_model_inference(camera_id, model_id):
    rtsp_url = get_rtsp_url(camera_id)
    cap = cv2.VideoCapture(rtsp_url)
    
    while active_models.get(camera_id, {}).get('running', False):
        ret, frame = cap.read()
        if not ret: continue
        
        # Model-specific processing
        model = get_model_details(model_id)  # Implement model details fetch
        if model['type'] == 'fire':
            process_fire_model(frame, camera_id)
        elif model['type'] == 'helmet':
            process_helmet_model(frame, camera_id)
    
    cap.release()

def process_fire_model(frame, camera_id):
    encoded_frame = base64.b64encode(cv2.imencode('.jpg', frame)[1]).decode()
    response = assistant.answer(encoded_frame, 
         "You are a fire detection assistant. Analyze the provided image to determine if there is any fire. Respond with 'Fire' or 'No Fire'.",
    "fire" 
    )
    detected = 'Fire' in response if response else 'No Fire'
    supabase.table('fire_detections').insert({
        'camera_id': camera_id,
        'detected': detected,
        'confidence': 0.95 if detected == 'Fire' else 0.05
    }).execute()


def process_helmet_model(frame, camera_id):
    encoded_frame = base64.b64encode(cv2.imencode('.jpg', frame)[1]).decode()
    response = assistant.answer(encoded_frame,
       "Detect if a person is wearing a helmet. Respond with 'Helmet' or 'No Helmet'. Do not detect if the person is wearing a helmet in a photo or video. Do not respond with any other text.", "helmet"
    )
    detected = 'Helmet detected' in response if response else 'No helmet detected'
    supabase.table('helmet_violations').insert({
        'camera_id': camera_id,
        'detected': detected
    }).execute()

def process_attendance_model(frame, camera_id):
    # Face recognition logic
    face_locations = face_recognition.face_locations(frame)
    face_encodings = face_recognition.face_encodings(frame, face_locations)
    
    for encoding in face_encodings:
        employees = supabase.table('employees').select('*').execute()
        for emp in employees.data:
            stored_encoding = pickle.loads(base64.b64decode(emp['face_encoding']))
            match = face_recognition.compare_faces([stored_encoding], encoding)
            if match[0]:
                app.logger.info(f"{emp['name']} detected in camera {camera_id}")
                
    # Gesture detection
    mp_hands = mp.solutions.hands
    hands = mp_hands.Hands()
    mp_drawing = mp.solutions.drawing_utils
    results = hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    if results.multi_hand_landmarks:
        for hand in results.multi_hand_landmarks:
            # Add gesture detection logic here
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = hands.process(rgb_frame)

    if results.multi_hand_landmarks:
        for hand_landmarks in results.multi_hand_landmarks:
            mp_drawing.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS)

            thumb_tip = hand_landmarks.landmark[mp_hands.HandLandmark.THUMB_TIP]
            index_tip = hand_landmarks.landmark[mp_hands.HandLandmark.INDEX_FINGER_TIP]

            if thumb_tip.y < index_tip.y:
                return "thumb_up"
            else:
                return "thumb_down"
    return None
    pass

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def server_error(error):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)