import { useState } from 'react';
import { Camera } from 'lucide-react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

interface CameraFormData {
  name: string;
  location: string;
  rtsp_url: string;
  brand: string;
  model: string;
  resolution: string;
  frame_rate: number;
  lens_type: string;
  night_vision: boolean;
  viewing_angle: number;
  ip_address: string;
  mac_address: string;
  port: number;
  protocol: string;
  connection_type: string;
  storage_type: string;
  storage_capacity: string;
  recording_mode: string;
  retention_period: number;
  installation_date: string;
  last_maintenance_date: string;
  status: string;
  firmware_version: string;
  username: string;
  password_hash: string;
  access_level: string;
}

function AddCamera() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<CameraFormData>({
    name: '',
    location: '',
    rtsp_url: '',
    brand: '',
    model: '',
    resolution: '',
    frame_rate: 30,
    lens_type: '',
    night_vision: false,
    viewing_angle: 90,
    ip_address: '',
    mac_address: '',
    port: 554,
    protocol: 'RTSP',
    connection_type: 'Wired',
    storage_type: 'Local',
    storage_capacity: '',
    recording_mode: 'Continuous',
    retention_period: 30,
    installation_date: new Date().toISOString().split('T')[0],
    last_maintenance_date: new Date().toISOString().split('T')[0],
    status: 'Active',
    firmware_version: '',
    username: '',
    password_hash: '',
    access_level: 'Admin'
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: checked
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { error } = await supabase.from('cameras').insert([{
        ...formData,
        password_hash: formData.password_hash // In a real app, hash the password
      }]);

      if (error) throw error;

      toast.success('Camera added successfully');
      navigate('/camera-grid');
    } catch (error) {
      toast.error('Failed to add camera');
      console.error('Error adding camera:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      <div className="flex items-center space-x-4">
        <Camera className="h-8 w-8 text-blue-500" />
        <h1 className="text-2xl font-bold text-gray-900">Add New Camera</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white shadow-md rounded-lg p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-700">Basic Information</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700">Camera Name</label>
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
              <label className="block text-sm font-medium text-gray-700">Location</label>
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">RTSP URL</label>
              <input
                type="text"
                name="rtsp_url"
                value={formData.rtsp_url}
                onChange={handleInputChange}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Camera Specifications */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-700">Camera Specifications</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700">Brand</label>
              <input
                type="text"
                name="brand"
                value={formData.brand}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Model</label>
              <input
                type="text"
                name="model"
                value={formData.model}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Resolution</label>
              <input
                type="text"
                name="resolution"
                value={formData.resolution}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Network Configuration */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-700">Network Configuration</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700">IP Address</label>
              <input
                type="text"
                name="ip_address"
                value={formData.ip_address}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Port</label>
              <input
                type="number"
                name="port"
                value={formData.port}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Username</label>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Additional Features */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-700">Additional Features</h2>
            <div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  name="night_vision"
                  checked={formData.night_vision}
                  onChange={handleCheckboxChange}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Night Vision</span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Viewing Angle (degrees)</label>
              <input
                type="number"
                name="viewing_angle"
                value={formData.viewing_angle}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Storage Type</label>
              <select
                name="storage_type"
                value={formData.storage_type}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="Local">Local</option>
                <option value="Cloud">Cloud</option>
                <option value="NAS">NAS</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-4 pt-4 border-t">
          <button
            type="button"
            onClick={() => navigate('/camera-grid')}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            {isSubmitting ? 'Adding Camera...' : 'Add Camera'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default AddCamera;