import { Link, useLocation } from "react-router-dom";
import logo from "../assets/TERRA_3RD_EYE-removebg-preview.png";
import { PlusCircle, Users, MonitorPlay,LayoutDashboard } from "lucide-react";

function Sidebar() {
  const location = useLocation();

  const navItems = [
    { path: "/", icon: LayoutDashboard, label: "Dashboard" },
    { path: "/employees", icon: Users, label: "Employees" },
    { path: "/add-camera", icon: PlusCircle, label: "Add Camera" },
    { path: "/camera-grid", icon: MonitorPlay, label: "Camera" },
  ];

  return (
    <div className="w-64 bg-white border-r border-gray-200 p-4 flex flex-col h-full">
      <div className="flex items-center justify-center space-x-2 mb-8">
        <img
          src={logo}
          alt="Terra Eye Logo"
          className="h-16 w-32 object-contain"
        />
      </div>

      <nav className="space-y-2 flex-1">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
              location.pathname === item.path
                ? "bg-blue-50 text-blue-600"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <item.icon className="h-5 w-5" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

export default Sidebar;
