import cv2
import sys
import time
import queue
import threading
import base64
import os
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.schema.messages import SystemMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_community.chat_message_histories import ChatMessageHistory
from langchain_google_genai import ChatGoogleGenerativeAI

# Configure logging
import logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# Load environment variables (if any)
os.environ["GOOGLE_API_KEY_FIRE"] = "AIzaSyC0vmTNgsi0WaMfG9og_F1UszG0omh6RKA"
os.environ["GOOGLE_API_KEY_HELMET"] = "AIzaSyC0vmTNgsi0WaMfG9og_F1UszG0omh6RKA"

# Load the logo image
LOGO_PATH = "src/assets/TERRA_3RD_EYE-removebg-preview.png"  # Path to your logo image
logo = cv2.imread(LOGO_PATH, cv2.IMREAD_UNCHANGED)  # Load with alpha channel (if transparent)

if logo is None:
    logging.error("Failed to load logo image. Ensure the path is correct.")
    exit(1)

# Resize the logo to fit the UI (200x200)
logo = cv2.resize(logo, (200, 200))

# Load the pre-trained face detection model
prototxt_path = 'deploy.prototxt'
model_path = 'res10_300x300_ssd_iter_140000_fp16.caffemodel'
net = cv2.dnn.readNetFromCaffe(prototxt_path, model_path)

# Set model parameters
in_width = 300
in_height = 300
mean = [104, 117, 123]
conf_threshold = 0.7

# Define UI colors
BACKGROUND_COLOR = (0, 128, 0)  # Green
TEXT_COLOR = (255, 255, 255)  # White
BOX_COLOR = (255, 255, 255)  # White
FONT = cv2.FONT_HERSHEY_SIMPLEX
FONT_SCALE = 0.5
FONT_THICKNESS = 1

# Detection states
face_detection_running = False
fire_detection_running = False
helmet_detection_running = False

class WebcamStream:
    def __init__(self):
        self.stream = cv2.VideoCapture(0)  # Use default laptop webcam
        if not self.stream.isOpened():
            logging.error("Failed to open webcam.")
            exit(1)
        self.frame_queue = queue.Queue(maxsize=2)
        self.running = False
        self.lock = threading.Lock()
        self.frame_ready = threading.Event()

    def start(self):
        if self.running:
            return self
        self.running = True
        self.thread = threading.Thread(target=self._capture_frames, daemon=True)
        self.thread.start()
        return self

    def _capture_frames(self):
        while self.running:
            ret, frame = self.stream.read()
            if ret:
                with self.lock:
                    if self.frame_queue.full():
                        try:
                            self.frame_queue.get_nowait()
                        except queue.Empty:
                            pass
                    self.frame_queue.put(frame)
                    self.frame_ready.set()
            else:
                logging.warning("Failed to read frame from webcam.")
                time.sleep(0.1)
            time.sleep(0.01)

    def read(self, encode=False):
        if self.frame_queue.empty():
            self.frame_ready.wait(timeout=0.1)
            self.frame_ready.clear()

        try:
            with self.lock:
                frame = self.frame_queue.get_nowait()
                if encode and frame is not None:
                    _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                    return base64.b64encode(buffer).decode('utf-8')
                return frame
        except queue.Empty:
            return None

    def stop(self):
        self.running = False
        if hasattr(self, 'thread'):
            self.thread.join()
        self.stream.release()

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
            logging.error(f"Model initialization error: {e}")
            return None

    def answer(self, image, prompt, model_type):
        if model_type == "fire":
            model = self.fire_model
            chain = self.fire_chain
        elif model_type == "helmet":
            model = self.helmet_model
            chain = self.helmet_chain
        else:
            return "Invalid model type"

        if not model or not chain:
            return "Model not initialized"

        current_time = time.time()
        if current_time - self.last_inference_time < self.inference_cooldown:
            return None

        image_base64 = image if image else ""

        try:
            response = chain.invoke(
                {"prompt": prompt, "image_base64": image_base64},
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

def overlay_logo(frame, logo):
    """Overlay the logo on the top-left corner of the frame."""
    logo_height, logo_width = logo.shape[:2]
    frame_height, frame_width = frame.shape[:2]

    if logo_height > frame_height or logo_width > frame_width:
        logging.warning("Logo is too large for the frame.")
        return frame

    x_offset = 5  # 10 pixels from the left edge
    y_offset = 5  # 10 pixels from the top edge

    if logo.shape[2] == 4:  # RGBA (with alpha channel)
        alpha = logo[:, :, 3] / 255.0
        for c in range(0, 3):  # Iterate over RGB channels
            frame[y_offset:y_offset + logo_height, x_offset:x_offset + logo_width, c] = (
                logo[:, :, c] * alpha +  # Blend with alpha channel
                frame[y_offset:y_offset + logo_height, x_offset:x_offset + logo_width, c] * (1.0 - alpha)
            )
    else:  # RGB (no alpha channel)
        frame[y_offset:y_offset + logo_height, x_offset:x_offset + logo_width] = logo

    return frame

def draw_text_with_background(frame, text, position, font_scale=1, thickness=2, background_color=(0, 255, 0), text_color=(255, 255, 255), padding=10):
    """Draw text with a background for better visibility."""
    font = cv2.FONT_HERSHEY_SIMPLEX
    text_size, _ = cv2.getTextSize(text, font, font_scale, thickness)
    text_width, text_height = text_size

    x, y = position
    rect_start = (x - padding, y - text_height - padding)
    rect_end = (x + text_width + padding, y + padding)

    # Draw the background rectangle (green)
    cv2.rectangle(frame, rect_start, rect_end, background_color, -1)
    
    # Draw the text (white)
    cv2.putText(frame, text, (x, y), font, font_scale, text_color, thickness, lineType=cv2.LINE_AA)

def main():
    global face_detection_running, fire_detection_running, helmet_detection_running

    webcam_stream = WebcamStream().start()
    assistant = Assistant()

    last_detection_time = 0

    # Define the desired display size
    display_width = 1450  # Width of the display window
    display_height = 900  # Height of the display window

    while True:
        frame = webcam_stream.read()
        if frame is None:
            continue

        # Resize the frame to the desired display size
        frame = cv2.resize(frame, (display_width, display_height))

        # Overlay the logo on the frame (top-left corner)
        frame = overlay_logo(frame, logo)

        # Perform face detection if enabled
        face_count = 0
        if face_detection_running:
            blob = cv2.dnn.blobFromImage(frame, 1.0, (in_width, in_height), mean, swapRB=False, crop=False)
            net.setInput(blob)
            detections = net.forward()

            for i in range(detections.shape[2]):
                confidence = detections[0, 0, i, 2]
                if confidence > conf_threshold:
                    face_count += 1
                    x_left_bottom = int(detections[0, 0, i, 3] * display_width)
                    y_left_bottom = int(detections[0, 0, i, 4] * display_height)
                    x_right_top = int(detections[0, 0, i, 5] * display_width)
                    y_right_top = int(detections[0, 0, i, 6] * display_height)

                    cv2.rectangle(frame, (x_left_bottom, y_left_bottom), (x_right_top, y_right_top), BOX_COLOR, 2)
                    label = f"Face {face_count}: {confidence:.2f}"
                    draw_text_with_background(frame, label, (x_left_bottom, y_left_bottom - 10), FONT_SCALE, FONT_THICKNESS, BACKGROUND_COLOR, TEXT_COLOR)

        # Perform fire detection if enabled
        fire_detection_result = ""
        if fire_detection_running:
            current_time = time.time()
            if current_time - last_detection_time >= 0.5:
                encoded_frame = webcam_stream.read(encode=True)
                if encoded_frame is not None:
                    response = assistant.answer(encoded_frame, """You are a fire detection assistant. Analyze the provided image to determine if there is any fire. Respond with 'Fire' or 'No Fire'.""", "fire")
                    if response:
                        logging.info(f"Fire Detection Response: {response}")
                        fire_detection_result = response
                last_detection_time = current_time

        # Perform helmet detection if enabled
        helmet_detection_result = ""
        if helmet_detection_running:
            current_time = time.time()
            if current_time - last_detection_time >= 0.5:
                encoded_frame = webcam_stream.read(encode=True)
                if encoded_frame is not None:
                    response = assistant.answer(encoded_frame, "Detect if a person is wearing a helmet. Respond with 'Helmet' or 'No Helmet'. Do not detect if the person is wearing a helmet in a photo or video. Do not respond with any other text.", "helmet")
                    if response:
                        logging.info(f"Helmet Detection Response: {response}")
                        helmet_detection_result = response
                last_detection_time = current_time

        # Show detection status and results dynamically
        status_y = 50
        result_y = 100
        spacing = 200

        if not face_detection_running and not fire_detection_running and not helmet_detection_running:
            draw_text_with_background(frame, "Face Detection: OFF", (display_width - spacing * 3, status_y), FONT_SCALE, FONT_THICKNESS, BACKGROUND_COLOR, (255, 255, 255))
            draw_text_with_background(frame, "Fire Detection: OFF ", (display_width - spacing * 2, status_y), FONT_SCALE, FONT_THICKNESS, BACKGROUND_COLOR, (255, 255, 255))
            draw_text_with_background(frame, "Helmet Detection: OFF", (display_width - spacing , status_y), FONT_SCALE, FONT_THICKNESS, BACKGROUND_COLOR, (255, 255, 255))
        else:
            if face_detection_running:
                draw_text_with_background(frame, f"Face Detection: {'ON'}", (display_width - spacing * 2, status_y), FONT_SCALE, FONT_THICKNESS, BACKGROUND_COLOR, (0, 255, 0))
                draw_text_with_background(frame, f"Total Faces:      {face_count}", (display_width - spacing * 2, result_y), FONT_SCALE, FONT_THICKNESS, BACKGROUND_COLOR, TEXT_COLOR)
            if fire_detection_running:
                draw_text_with_background(frame, f"Fire Detection: {'ON '}", (display_width - spacing * 2, status_y), FONT_SCALE, FONT_THICKNESS, BACKGROUND_COLOR, (0, 255, 0))
                draw_text_with_background(frame, f"Result:     {fire_detection_result}", (display_width - spacing * 2, result_y), FONT_SCALE, FONT_THICKNESS, BACKGROUND_COLOR, TEXT_COLOR)
            if helmet_detection_running:
                draw_text_with_background(frame, f"Helmet Detection: {'ON'}", (display_width - spacing, status_y), FONT_SCALE, FONT_THICKNESS, BACKGROUND_COLOR, (0, 255, 0))
                draw_text_with_background(frame, f"Result:    {helmet_detection_result}", (display_width - spacing, result_y), FONT_SCALE, FONT_THICKNESS, BACKGROUND_COLOR, TEXT_COLOR)

      

        # Display the frame
        cv2.imshow("Multi-Detection System", frame)

        # Handle key presses
        key = cv2.waitKey(1) & 0xFF
        if key == ord('f'):  # Toggle face detection
            face_detection_running = not face_detection_running
            logging.info(f"Face Detection {'ON' if face_detection_running else 'OFF'}")
        elif key == ord('i'):  # Toggle fire detection
            fire_detection_running = not fire_detection_running
            logging.info(f"Fire Detection {'ON' if fire_detection_running else 'OFF'}")
        elif key == ord('h'):  # Toggle helmet detection
            helmet_detection_running = not helmet_detection_running
            logging.info(f"Helmet Detection {'ON' if helmet_detection_running else 'OFF'}")
        elif key == ord('q'):  # Exit
            break

    webcam_stream.stop()
    cv2.destroyAllWindows() 

if __name__ == "__main__":
    main()