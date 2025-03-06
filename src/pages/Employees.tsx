import { useState, useEffect, useRef } from "react";
import { UserPlus, Users, Camera, RefreshCw, Upload } from "lucide-react";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";

interface Employee {
  employee_id: string;
  name: string;
  department: string;
  designation: string;
  face_encoding: Uint8Array;
}

interface AttendanceLog {
  log_id: string;
  employee_id: string;
  employee_name: string;
  timestamp: string;
  gesture_detected: string;
}

interface Camera {
  camera_id: string;
  name: string;
  rtsp_url: string;
}
function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState("");
  const [showLiveFeed, setShowLiveFeed] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [faceDetectedImage, setFaceDetectedImage] = useState<string | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: "",
    department: "",
    designation: "",
    face_encoding: "",
  });

  useEffect(() => {
    fetchEmployees();
    fetchAttendanceLogs();
    fetchCameras();
    const channel = supabase
      .channel("attendance-logs")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance_logs",
        },
        (payload) => {
          const newLog = payload.new as AttendanceLog;
          toast.success(
            `${newLog.employee_name} ${
              newLog.gesture_detected === "thumb_up"
                ? "checked in"
                : "checked out"
            }`
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchEmployees = async () => {
    const { data, error } = await supabase.from("employees").select("*");

    if (error) {
      toast.error("Failed to fetch employees");
      return;
    }

    if (data) {
      setEmployees(data);
    }
  };

  const fetchAttendanceLogs = async () => {
    const { data, error } = await supabase
      .from("attendance_logs")
      .select(
        `
        log_id,
        employee_id,
        timestamp,
        gesture_detected,
        employees (name, department, designation)
      `
      )
      .order("timestamp", { ascending: false });

    if (error) {
      toast.error("Failed to fetch attendance logs");
      return;
    }

    if (data) {
      const formattedLogs = data.map((log: any) => ({
        log_id: log.log_id,
        employee_id: log.employee_id,
        employee_name: log.employees?.name || "Unknown",
        timestamp: new Date(log.timestamp).toLocaleString(),
        gesture_detected: log.gesture_detected,
      }));
      setAttendanceLogs(formattedLogs);
    }
  };

  const fetchCameras = async () => {
    const { data, error } = await supabase
      .from("cameras")
      .select("camera_id, name, rtsp_url");

    if (error) {
      toast.error("Failed to fetch cameras");
      return;
    }

    if (data) {
      setCameras(data);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCameraSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCamera(e.target.value);
    if (e.target.value) {
      setShowLiveFeed(true);
      setCapturedImage(null);
      setFaceDetectedImage(null);
      setFormData((prev) => ({
        ...prev,
        face_encoding: "",
      }));
    } else {
      setShowLiveFeed(false);
    }
  };

  const handleCaptureImage = async () => {
    try {
      // Make an API call to your backend to capture the frame
      const response = await fetch(
        `http://localhost:8000/capture_frame/${selectedCamera}`
      );
      if (!response.ok) {
        throw new Error("Failed to capture image");
      }

      const imageBlob = await response.blob();
      const imageUrl = URL.createObjectURL(imageBlob);

      setCapturedImage(imageUrl);
      setShowLiveFeed(false);
      setFaceDetectedImage(null);
      setFormData((prev) => ({
        ...prev,
        face_encoding: "",
      }));

      toast.success("Image captured successfully");
    } catch (error) {
      toast.error("Failed to capture image");
      console.error("Error capturing image:", error);
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setFaceDetectedImage(null);
    setFormData((prev) => ({
      ...prev,
      face_encoding: "",
    }));
    setShowLiveFeed(true);
  };

  const handleConvertToEncoding = async () => {
    try {
      setIsProcessing(true);
      if (!capturedImage) {
        throw new Error("No captured image available");
      }

      const blob = await fetch(capturedImage).then((r) => r.blob());
      const formData = new FormData();
      formData.append("image", blob, "face.jpg");

      const response = await fetch(
        "http://localhost:8000/generate_face_encoding",
        {
          method: "POST",
          body: formData,
        }
      );

      // Use response.json() directly instead of response.text()
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Face encoding failed");
      }

      // Convert base64 to Uint8Array
      const base64Data = data.face_encoding;
      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      setFormData((prev) => ({
        ...prev,
        face_encoding: Array.from(bytes).join(","),
      }));

      toast.success("Face encoding generated successfully");
    } catch (error) {
      console.error("Error generating face encoding:", error);
      toast.error(
        error instanceof Error ? error.message : "Unknown error occurred"
      );
    } finally {
      setIsProcessing(false);
    }
  };
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size exceeds 5MB limit");
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are allowed");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setCapturedImage(event.target.result as string);
        setShowLiveFeed(false);
        setFaceDetectedImage(null);
        setFormData((prev) => ({
          ...prev,
          face_encoding: "",
        }));
      }
    };
    reader.readAsDataURL(file);
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('employee-images')
      .upload(`${formData.name}-${Date.now()}.jpg`, fileInputRef.current?.files?.[0]!);

    if (uploadError) {
      toast.error('Image upload failed');
      return;
    }
    const { data: urlData } = supabase.storage
      .from('employee-images')
      .getPublicUrl(uploadData.path);

    if (
      !formData.name ||
      !formData.department ||
      !formData.designation ||
      formData.face_encoding.length === 0
    ) {
      toast.error("Please fill all required fields and generate face encoding");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.from("employees").insert({
        ...formData,
        image_url: urlData.publicUrl,
        face_encoding: formData.face_encoding,
      });

      if (error) throw error;

      toast.success("Employee added successfully");
      setShowAddForm(false);
      setFormData({
        name: "",
        department: "",
        designation: "",
        face_encoding: "",
      });
      setCapturedImage(null);
      fetchEmployees();
    } catch (error) {
      toast.error("Failed to add employee");
      console.error("Error adding employee:", error);
    } finally {
      setIsSubmitting(false);
    }
  };
  const getAttendanceStatus = (employeeId: string) => {
    const today = new Date().toDateString();
    const todayLogs = attendanceLogs.filter(
      (log) =>
        log.employee_id === employeeId &&
        new Date(log.timestamp).toDateString() === today
    );

    if (todayLogs.length === 0) return "Absent";

    const checkIn = todayLogs.find(
      (log) => log.gesture_detected === "thumb_up"
    );
    const checkOut = todayLogs.find(
      (log) => log.gesture_detected === "thumb_down"
    );

    if (checkIn && checkOut) return "Checked Out";
    if (checkIn) return "Present";

    return "Absent";
  };

  const triggerFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <Users className="h-7 w-7 text-blue-500" />
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center space-x-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <UserPlus className="h-5 w-5" />
          <span>Add Employee</span>
        </button>
      </div>

      {showAddForm && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Add New Employee</h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Department
                  </label>
                  <input
                    type="text"
                    name="department"
                    value={formData.department}
                    onChange={handleInputChange}
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Designation
                  </label>
                  <input
                    type="text"
                    name="designation"
                    value={formData.designation}
                    onChange={handleInputChange}
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Face Encoding
                  </label>
                  <textarea
                    name="face_encoding"
                    value={formData.face_encoding}
                    onChange={handleInputChange}
                    required
                    readOnly
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Select Camera
                  </label>
                  <select
                    value={selectedCamera}
                    onChange={handleCameraSelect}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">Select a camera</option>
                    {cameras.map((camera) => (
                      <option key={camera.camera_id} value={camera.camera_id}>
                        {camera.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex space-x-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={triggerFileUpload}
                    className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-2 rounded flex items-center space-x-1"
                  >
                    <Upload className="h-4 w-4" />
                    <span>Upload Image</span>
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {showLiveFeed && selectedCamera && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <h3 className="text-md font-medium text-gray-700">
                        Live Feed
                      </h3>
                      <button
                        type="button"
                        onClick={handleCaptureImage}
                        className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded flex items-center space-x-1"
                      >
                        <Camera className="h-4 w-4" />
                        <span>Capture Image</span>
                      </button>
                    </div>
                    <div className="aspect-video bg-gray-200 rounded-lg overflow-hidden">
                      <img
                        src={`http://localhost:8000/video_feed/${selectedCamera}`}
                        alt="Camera Feed"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = "/placeholder-camera.png"; // Add a placeholder image
                          console.log(
                            `Failed to load camera feed: ${selectedCamera}`
                          );
                        }}
                      />
                    </div>
                  </div>
                )}

                {capturedImage && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <h3 className="text-md font-medium text-gray-700">
                        Captured Image
                      </h3>
                      <div className="flex space-x-2">
                        <button
                          type="button"
                          onClick={handleRetake}
                          className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded flex items-center space-x-1"
                        >
                          <RefreshCw className="h-4 w-4" />
                          <span>Retake</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleConvertToEncoding}
                          disabled={isProcessing}
                          className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded flex items-center space-x-1 disabled:bg-blue-300 disabled:cursor-not-allowed"
                        >
                          <span>
                            {isProcessing
                              ? "Processing..."
                              : "Generate Encoding"}
                          </span>
                        </button>
                      </div>
                    </div>
                    <div className="aspect-video bg-gray-200 rounded-lg overflow-hidden">
                      <img
                        src={capturedImage}
                        alt="Captured"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                )}

                {faceDetectedImage && (
                  <div className="space-y-2 mt-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-md font-medium text-gray-700">
                        Face Detected
                      </h3>
                      <div className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                        Face Encoding Generated
                      </div>
                    </div>
                    <div className="aspect-video bg-gray-200 rounded-lg overflow-hidden">
                      <img
                        src={faceDetectedImage}
                        alt="Face Detected"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                )}

                {!capturedImage && !showLiveFeed && selectedCamera && (
                  <div className="flex flex-col items-center justify-center h-48 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300">
                    <p className="text-gray-500">
                      Please capture an image or upload a photo
                    </p>
                    <div className="flex space-x-2 mt-4">
                      <button
                        type="button"
                        onClick={() => setShowLiveFeed(true)}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded flex items-center space-x-1"
                      >
                        <Camera className="h-4 w-4" />
                        <span>Show Camera Feed</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end space-x-4 pt-4 border-t">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !formData.face_encoding}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Adding Employee..." : "Add Employee"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Employee List</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Department
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Designation
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {employees.length > 0 ? (
                employees.map((employee) => (
                  <tr key={employee.employee_id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {employee.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {employee.department}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {employee.designation}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${
                          getAttendanceStatus(employee.employee_id) ===
                          "Present"
                            ? "bg-green-100 text-green-800"
                            : getAttendanceStatus(employee.employee_id) ===
                              "Checked Out"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {getAttendanceStatus(employee.employee_id)}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-4 text-center text-sm text-gray-500"
                  >
                    No employees found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">
            Attendance Logs
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Employee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {attendanceLogs.length > 0 ? (
                attendanceLogs.map((log) => (
                  <tr key={log.log_id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {log.employee_name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {log.timestamp}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${
                          log.gesture_detected == "thumb_up"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {log.gesture_detected == "thumb_up"
                          ? "Check In"
                          : "Check Out"}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={3}
                    className="px-6 py-4 text-center text-sm text-gray-500"
                  >
                    No attendance logs found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Employees;
