import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Calendar, CheckSquare, BookOpen,
  Settings, LogOut, Zap, GraduationCap
} from 'lucide-react';
import useStore from '../store/useStore';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { to: '/tests', icon: BookOpen, label: 'Tests' },
];

export default function Sidebar() {
  const { user, logout } = useStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="acadex-sidebar w-60 flex flex-col border-r shrink-0">
      {/* Logo */}
      <div className="p-5 border-b border-gray-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
            <GraduationCap size={18} className="text-white" />
          </div>
          <span className="text-lg font-bold text-white tracking-tight">Acadex</span>
          <span className="ml-auto">
            <Zap size={14} className="text-brand-400" />
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-1">AI Student Hub</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''}`
            }
          >
            <Icon size={18} />
            <span className="text-sm font-medium">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-gray-800 space-y-0.5">
        <NavLink
          to="/settings"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        >
          <Settings size={18} />
          <span className="text-sm font-medium">Settings</span>
        </NavLink>

        {user && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 mt-1">
            {user.picture ? (
              <img src={user.picture} alt={user.name} className="w-7 h-7 rounded-full" />
            ) : (
              <div className="w-7 h-7 bg-brand-500 rounded-full flex items-center justify-center text-xs font-bold text-white">
                {user.name?.[0]?.toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-200 truncate">{user.name}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
          </div>
        )}

        <button onClick={handleLogout} className="sidebar-link w-full text-red-400 hover:text-red-300 hover:bg-red-950/30">
          <LogOut size={18} />
          <span className="text-sm font-medium">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
