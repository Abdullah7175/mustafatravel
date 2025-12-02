import React from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  Calendar, 
  MessageSquare, 
  Users, 
  LogOut,
  ChevronRight,

} from 'lucide-react';

interface User {
  name?: string;
  role?: string;
}

interface SidebarProps {
  activeSection: string;
  setActiveSection: (section: string) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  user: User | null;
}

const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  setActiveSection,
  isSidebarOpen,
  setIsSidebarOpen,
  user,
}) => {
  const { logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  
  const adminMenuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'bookings', label: 'Bookings', icon: Calendar },
  
    { id: 'inquiries', label: 'Inquiries', icon: MessageSquare },
    { id: 'sale-agents', label: 'Sale Agents', icon: Users },
    // { id: 'admin-panel', label: 'Admin Panel', icon: Shield },
  ];

  const agentMenuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'bookings', label: 'My Bookings', icon: Calendar },
  
    { id: 'inquiries', label: 'My Inquiries', icon: MessageSquare },
  ];

  const menuItems = isAdmin ? adminMenuItems : agentMenuItems;

  const handleItemClick = (id: string) => {
    setActiveSection(id);
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  };

  return (
    <>
      <aside
        className={`fixed top-0 left-0 z-50 w-64 h-full bg-slate-800 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center space-x-3 px-6 py-6 border-b border-slate-700">
          <div className="w-15 h-15 rounded-xl flex items-center justify-center p-2 bg-white shadow-lg">
            <img src="/mustafa.png" alt="Mustafa Travel" className="w-full h-full object-contain" />
          </div>
          <div>
            {/* <h1 className="text-white font-semibold text-lg">MARWAH TRAVELS</h1> */}
            {/* <p className="text-slate-400 text-sm">UMRAH</p> */}
          </div>
        </div>

        {/* User Info */}
        <div className="px-6 py-4 border-b border-slate-700">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">
                {user?.name?.charAt(0) || 'U'}
              </span>
            </div>
            <div>
              <p className="text-white text-sm font-medium">{user?.name || 'User'}</p>
              <p className="text-slate-400 text-xs">{user?.role || 'User'}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 flex flex-col">
          <div className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              
              return (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-left transition-all duration-300 group ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25 transform scale-105'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className="h-5 w-5" />
                    <span className="font-medium">{item.label}</span>
                  </div>
                  {isActive && (
                    <ChevronRight className="h-4 w-4 opacity-60" />
                  )}
                </button>
              );
            })}
          </div>
          
          {/* Logout - Moved to bottom */}
          <div className="mt-auto pt-6 border-t border-slate-700">
            <button 
              onClick={logout}
              className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition-all duration-300 group"
            >
              <LogOut className="h-5 w-5" />
              <span className="font-medium">Logout</span>
            </button>
          </div>
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
