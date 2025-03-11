import { useState, useEffect, useRef } from 'react';
import { Maximize2, Minimize2, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

interface Model {
  model_id: string;
  name: string;
  type: string;
}

interface Camera {
  camera_id: string;
  name: string;
  rtsp_url: string;
  location: string;
}

interface AttendanceLog {
  log_id: string;
  employee_id: string;
  camera_id: string;
  timestamp: string;
  gesture_detected: string;
}

interface FireDetectionLog {
  camera_id: string;
  detected: string;
  created_at: string;
}

interface HelmetViolationLog {
  camera_id: string;
  detected: string;
  created_at: string;
}

function CameraGrid() {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [fullscreenCamera, setFullscreenCamera] = useState<string | null>(null);
  const camerasRef = useRef<Camera[]>([]);

  // Keep cameras ref updated
  useEffect(() => {
    camerasRef.current = cameras;
  }, [cameras]);

  useEffect(() => {
    const fetchDataAndSubscribe = async () => {
      await fetchModels();
      await fetchCameras();

      const channel = supabase
        .channel('detections')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'attendance_logs' },
          handleAttendanceChange
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'fire_detections' },
          handleFireDetection
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'helmet_violations' },
          handleHelmetViolation
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    };

    fetchDataAndSubscribe();
  }, []);

  const handleAttendanceChange = async (payload: any) => {
    const log = payload.new as AttendanceLog;
    
    const { data: employee } = await supabase
      .from('employees')
      .select('name')
      .eq('employee_id', log.employee_id)
      .single();

    if (employee) {
      toast.success(
        `${employee.name} ${
          log.gesture_detected === 'thumb_up' ? 'checked in' : 'checked out'
        }`,
        {
          icon: log.gesture_detected === 'thumb_up' ? '👍' : '👋',
          position: 'bottom-right',
        }
      );
    }
  };

  const handleFireDetection = (payload: any) => {
    const log = payload.new as FireDetectionLog;
    const camera = camerasRef.current.find(c => c.camera_id === log.camera_id);
    
    if (log.detected === 'Fire detected' && camera) {
      toast.error(`Fire detected in ${camera.name}`, {
        icon: '🔥',
        position: 'bottom-right',
      });
    }
  };

  const handleHelmetViolation = (payload: any) => {
    const log = payload.new as HelmetViolationLog;
    const camera = camerasRef.current.find(c => c.camera_id === log.camera_id);
    
    if (log.detected === 'No helmet detected' && camera) {
      toast.error(`Helmet violation in ${camera.name}`, {
        icon: '⛑️',
        position: 'bottom-right',
      });
    }
  };

  const fetchModels = async () => {
    const { data, error } = await supabase.from('models').select('*');
    if (!error) setModels(data || []);
  };

  const fetchCameras = async () => {
    const { data, error } = await supabase
      .from('cameras')
      .select('camera_id, name, rtsp_url, location');

    if (error) {
      toast.error('Failed to fetch cameras');
      return;
    }

    if (data) {
      setCameras(data);
    }
  };

  const handleModelControl = async (action: 'start' | 'stop') => {
    try {
      setIsLoading(true);
  
      // Validate model requirements before starting
      if (action === 'start') {
        const selectedModelObj = models.find(m => m.model_id === selectedModel);
        
        // Check if this is an attendance model
        if (selectedModelObj?.type === 'attendance') {
          // Verify there are registered employees
          const { count, error } = await supabase
            .from('employees')
            .select('*', { count: 'exact', head: true });
  
          if (error) throw new Error('Failed to verify employee records');
          if (count === 0) {
            toast.error('No employees registered for attendance tracking');
            return;
          }
        }
      }
  
      const { data: { session } } = await supabase.auth.getSession();
  
      const response = await fetch('http://localhost:8000/model-control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          camera_id: selectedCamera,
          model_id: selectedModel,
          action,
        }),
      });
  
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `HTTP error! status: ${response.status}`);
      }
  
      const responseData = await response.json();
      const successMessage = responseData.message 
        ? `Model ${action}ed successfully: ${responseData.message}`
        : `Model ${action}ed successfully`;
  
      toast.success(successMessage, {
        icon: action === 'start' ? '🚀' : '🛑',
        position: 'bottom-right'
      });
  
      // Refresh camera states after successful model control
      if (action === 'stop') {
        await fetchCameras();
      }
  
    } catch (error) {
      console.error('Error controlling model:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Failed to communicate with model service';
      
      toast.error(`Model control failed: ${errorMessage}`, {
        icon: '❌',
        position: 'bottom-right'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (cameraId: string) => {
    const { error } = await supabase
      .from('cameras')
      .delete()
      .match({ camera_id: cameraId });

    if (error) {
      toast.error('Failed to delete camera');
      return;
    }

    toast.success('Camera deleted successfully');
    fetchCameras();
  };

  const toggleFullscreen = (cameraId: string) => {
    if (fullscreenCamera === cameraId) {
      setFullscreenCamera(null);
    } else {
      setFullscreenCamera(cameraId);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-lg shadow-md">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Camera</label>
            <select
              className="w-full rounded-md border-gray-300"
              value={selectedCamera}
              onChange={(e) => setSelectedCamera(e.target.value)}
            >
              <option value="">Select Camera</option>
              {cameras.map((c) => (
                <option key={c.camera_id} value={c.camera_id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Model</label>
            <select
              className="w-full rounded-md border-gray-300"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              <option value="">Select Model</option>
              {models.map((m) => (
                <option key={m.model_id} value={m.model_id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex space-x-2">
            <button
              onClick={() => handleModelControl('start')}
              disabled={!selectedCamera || !selectedModel || isLoading}
              className="bg-green-500 text-white px-4 py-2 rounded-md disabled:bg-gray-300"
            >
              {isLoading ? 'Processing...' : 'Start'}
            </button>
            <button
              onClick={() => handleModelControl('stop')}
              disabled={!selectedCamera || !selectedModel || isLoading}
              className="bg-red-500 text-white px-4 py-2 rounded-md disabled:bg-gray-300"
            >
              {isLoading ? 'Processing...' : 'Stop'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Camera Grid</h1>
        <span className="text-sm text-gray-500">
          {cameras.length} {cameras.length === 1 ? 'Camera' : 'Cameras'} Connected
        </span>
      </div>

      <div
        className={`grid ${
          fullscreenCamera
            ? 'grid-cols-1'
            : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
        } gap-6`}
      >
        {cameras.map((camera) => (
          <div
            key={camera.camera_id}
            className={`bg-white rounded-lg shadow-md overflow-hidden ${
              fullscreenCamera === camera.camera_id ? 'col-span-full' : ''
            }`}
          >
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-gray-800">{camera.name}</h3>
                <p className="text-sm text-gray-500">{camera.location}</p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleDelete(camera.camera_id)}
                  className="p-1 hover:bg-red-100 rounded-full text-red-500 transition-colors"
                  title="Delete camera"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
                <button
                  onClick={() => toggleFullscreen(camera.camera_id)}
                  className="p-1 hover:bg-blue-100 rounded-full text-blue-500 transition-colors"
                  title={
                    fullscreenCamera === camera.camera_id
                      ? 'Exit fullscreen'
                      : 'Enter fullscreen'
                  }
                >
                  {fullscreenCamera === camera.camera_id ? (
                    <Minimize2 className="h-5 w-5" />
                  ) : (
                    <Maximize2 className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
            <div
              className={`relative ${
                fullscreenCamera === camera.camera_id
                  ? 'h-[calc(100vh-12rem)]'
                  : 'aspect-video'
              }`}
            >
              <img
                src={`http://localhost:8000/video_feed/${camera.camera_id}`}
                alt={camera.name}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        ))}
      </div>

      {cameras.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">No cameras found</p>
          <p className="text-gray-400 mt-2">
            Add cameras from the "Add Camera" page
          </p>
        </div>
      )}
    </div>
  );
}

export default CameraGrid;