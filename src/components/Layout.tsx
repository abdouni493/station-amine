import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { useAppState } from "../store/AppContext";

const Layout = ({ children, onRouteChange, onLogout }: { children: React.ReactNode; onRouteChange?: (route: string) => void; onLogout?: () => void }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUserRole, currentUserId, currentUserPermissions } = useAppState();

  // Save the current route whenever it changes
  useEffect(() => {
    if (onRouteChange) {
      onRouteChange(location.pathname);
    }
  }, [location.pathname, onRouteChange]);

  const sidebarProps = {
    activePath: location.pathname,
    onNavigate: (path: string) => navigate(path),
    onLogout: onLogout,
    userRole: currentUserRole,
    userId: currentUserId,
    userPermissions: currentUserPermissions,
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-surface)" }}>
      {/* Sidebar — always visible on lg+, pinned and never scrolls with content */}
      <div className="hidden lg:block flex-shrink-0 h-screen" style={{ width: "var(--sidebar-width)" }}>
        <Sidebar
          isOpen={true}
          onClose={() => {}}
          {...sidebarProps}
        />
      </div>

      {/* Mobile Sidebar */}
      <div className="lg:hidden">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          {...sidebarProps}
        />
      </div>

      {/* Main Content — scrolls independently, sidebar stays pinned */}
      <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden">
        <Navbar
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
          sidebarOpen={sidebarOpen}
          activePath={location.pathname}
        />
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto custom-scrollbar">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
