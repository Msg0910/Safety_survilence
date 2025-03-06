import {Camera, Users, Clock, BookOpenText, Cctv,Airplay } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

interface Stats {
  totalCameras: number;
  totalEmployees: number;
  activeEmployees: number;
  totalAttendance: number;
}

function Home() {
  const [stats, setStats] = useState<Stats>({
    totalCameras: 0,
    totalEmployees: 0,
    activeEmployees: 0,
    totalAttendance: 0,
  });

  useEffect(() => {
    async function fetchStats() {
      const [camerasData, employeesData, attendanceData] = await Promise.all([
        supabase.from('cameras').select('camera_id'),
        supabase.from('employees').select('employee_id'),
        supabase.from('attendance_logs').select('log_id'),
      ]);

      const today = new Date().toISOString().split('T')[0];
      const activeEmployeesData = await supabase
        .from('attendance_logs')
        .select('employee_id')
        .gte('timestamp', today)
        .eq('gesture_detected', 'thumb_up'); // Changed from .is() to .eq()

      setStats({
        totalCameras: camerasData.data?.length || 0,
        totalEmployees: employeesData.data?.length || 0,
        activeEmployees: activeEmployeesData.data?.length || 0,
        totalAttendance: attendanceData.data?.length || 0,
      });
      const channel = supabase
        .channel('notifications')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
        }, (payload) => {
            const newNotification = payload.new as { message: string };
            toast.success(newNotification.message);
        })
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
    }

    fetchStats();
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Welcome to Employee Management System</h1>
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-500">{new Date().toLocaleDateString()}</span>
          <Airplay className="text-blue-500" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Cameras"
          value={stats.totalCameras}
          icon={<Camera className="h-6 w-6 text-blue-500" />}
          description="Connected CCTV cameras"
        />
        <StatCard
          title="Total Employees"
          value={stats.totalEmployees}
          icon={<Users className="h-6 w-6 text-green-500" />}
          description="Registered employees"
        />
        <StatCard
          title="Active Today"
          value={stats.activeEmployees}
          icon={<Clock className="h-6 w-6 text-purple-500" />}
          description="Employees checked in today"
        />
        <StatCard
          title="Total Attendance"
          value={stats.totalAttendance}
          icon={<BookOpenText className="h-6 w-6 text-orange-500" />}
          description="Total attendance records"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">System Overview</h2>
          <p className="text-gray-600 mb-4">
            Welcome to the Employee Management System. This system helps you manage employee attendance
            through facial recognition and gesture detection using CCTV cameras.
          </p>
          <ul className="space-y-2 text-gray-600">
            <li>• Real-time attendance tracking</li>
            <li>• Facial recognition for employee identification</li>
            <li>• Gesture-based check-in/check-out</li>
            <li>• Multiple camera support</li>
            <li>• Automated attendance logging</li>
          </ul>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-4">
            <QuickActionButton
              title="Add Camera"
              description="Configure a new CCTV camera"
              href="/add-camera"
              icon={<Camera className="h-5 w-5" />}
            />
            <QuickActionButton
              title="View Cameras"
              description="Monitor camera feeds"
              href="/camera-grid"
              icon={<Cctv className="h-5 w-5" />}
            />
            <QuickActionButton
              title="Add Employee"
              description="Register new employee"
              href="/employees"
              icon={<Users className="h-5 w-5" />}
            />
            <QuickActionButton
              title="View Attendance"
              description="Check attendance logs"
              href="/employees"
              icon={<BookOpenText className="h-5 w-5" />}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  description: string;
}

function StatCard({ title, value, icon, description }: StatCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-700">{title}</h3>
        {icon}
      </div>
      <p className="text-3xl font-bold text-gray-900 mb-2">{value}</p>
      <p className="text-sm text-gray-500">{description}</p>
    </div>
  );
}

interface QuickActionButtonProps {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}

function QuickActionButton({ title, description, href, icon }: QuickActionButtonProps) {
  return (
    <a
      href={href}
      className="flex items-start space-x-4 p-4 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-colors"
    >
      <div className="rounded-full bg-blue-100 p-2">{icon}</div>
      <div>
        <h3 className="font-medium text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
    </a>
  );
}

export default Home;