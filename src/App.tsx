import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { DataProvider } from "./context/DataContext";
import AuthScreen from "./components/AuthScreen";
import ContactPage from "./pages/ContactPage";
import Sidebar from "./components/Sidebar";
import AdminDashboard from "./components/AdminDashboard";
import AgentDashboard from "./components/AgentDashboard";
import Bookings from "./components/Bookings";
import Inquiries from "./components/Inquiries";
import SaleAgents from "./components/SaleAgents";
import AdminPanel from "./components/AdminPanel";
import { Menu, X } from "lucide-react";




const AppContent: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const [activeSection, setActiveSection] = useState("dashboard");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => setIsSidebarOpen((v) => !v);

  const renderContent = () => {
    // Admin sections
    if (user?.role === "admin") {
      switch (activeSection) {
        case "dashboard":
          return <AdminDashboard />;
        case "bookings":
          return <Bookings />;
        case "inquiries":
          return <Inquiries />;
        case "sale-agents":
          return <SaleAgents />;
        case "admin-panel":
          return <AdminPanel />;
      
        default:
          return <AdminDashboard />;
      }
    }

    // Agent sections
    switch (activeSection) {
      case "dashboard":
        return <AgentDashboard />;
      case "bookings":
        return <Bookings />;
      case "inquiries":
        return <Inquiries />;
      /** NEW: agents can also open the Booking Editor (optional—keep if desired) */
   
      default:
        return <AgentDashboard />;
    }
  };

  // Show auth screen if not authenticated
  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Header */}
      <div className="lg:hidden bg-white shadow-sm border-b px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">M</span>
          </div>
          <h1 className="font-semibold text-gray-900 text-sm sm:text-base">
            MUSTAFA TRAVEL
          </h1>
        </div>
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-md hover:bg-gray-100 transition-colors"
          aria-label="Toggle menu"
        >
          {isSidebarOpen ? (
            <X className="h-6 w-6 text-gray-600" />
          ) : (
            <Menu className="h-6 w-6 text-gray-600" />
          )}
        </button>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <Sidebar
          activeSection={activeSection}
          setActiveSection={setActiveSection}
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          user={user}
        />

        {/* Main Content */}
        <main className="flex-1 lg:ml-64 p-3 sm:p-4 lg:p-8 min-h-screen">
          <div className="max-w-7xl mx-auto">{renderContent()}</div>
        </main>
      </div>

      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
    </div>
  );
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <DataProvider>
          <Routes>
            <Route path="/contact" element={<ContactPage />} />
            {/* Everything else goes to the authenticated shell */}
            <Route path="/*" element={<AppContent />} />
          </Routes>
        </DataProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
