"use client";

import { useEffect, useRef, useState, useId } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Bell,
  BellRing,
  Check,
  CheckCheck,
  CheckSquare,
  Clock,
  FolderKanban,
  Inbox,
  Receipt,
  Trash2,
  X,
} from "lucide-react";
import {
  type NotificationType,
  type WorkspaceNotification,
  clearAllNotifications,
  dismissNotification,
  markAllNotificationsRead,
  markNotificationRead,
  readNotifications, refreshNotifications, resetNotifications,
} from "@/lib/notifications";

import { useWorkspaceAuth } from "@/lib/workspace-auth";
function formatRelativeTime(isoString: string): string {
  try {
    const then = new Date(isoString).getTime();
    const now = Date.now();
    const diffSec = Math.floor((now - then) / 1000);

    if (diffSec < 60) return "Just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(isoString).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case "LEAD":
      return <Inbox size={15} />;
    case "TASK":
      return <CheckSquare size={15} />;

    case "PROJECT":
      return <FolderKanban size={15} />;

    default:
      return <Bell size={15} />;
  }
}

export function NotificationCenter() {
  const router = useRouter();
  const { user } = useWorkspaceAuth();
  const [notificationError,setNotificationError]=useState("");
  function run(action:Promise<unknown>) { void action.catch(()=>setNotificationError("Notifications could not be updated. Please retry.")); }
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "UNREAD">("ALL");
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const [position,setPosition] = useState({left:12,top:82,maxHeight:400});
  const [portalRoot,setPortalRoot] = useState<HTMLElement|null>(null);
  useEffect(()=>setPortalRoot(document.querySelector<HTMLElement>(".app-shell")),[]);
  useEffect(()=>{
    if(!isOpen)return;
    const place=()=>{
      const rect=triggerRef.current?.getBoundingClientRect();if(!rect)return;
      const viewport=window.visualViewport;
      const width=viewport?.width??window.innerWidth,height=viewport?.height??window.innerHeight;
      const offsetLeft=viewport?.offsetLeft??0,offsetTop=viewport?.offsetTop??0;
      const panelWidth=Math.min(390,width-24);
      const top=Math.min(rect.bottom+18,offsetTop+height-160);
      const bottomSpace=width<=700?106:12;
      setPosition({left:Math.max(offsetLeft+12,Math.min(rect.right-panelWidth,offsetLeft+width-panelWidth-12)),top:Math.max(offsetTop+12,top),maxHeight:Math.max(120,offsetTop+height-top-bottomSpace)});
    };
    place();window.addEventListener("resize",place);window.visualViewport?.addEventListener("resize",place);window.visualViewport?.addEventListener("scroll",place);
    return ()=>{window.removeEventListener("resize",place);window.visualViewport?.removeEventListener("resize",place);window.visualViewport?.removeEventListener("scroll",place);};
  },[isOpen]);
  function close(){setIsOpen(false);triggerRef.current?.focus();}

  useEffect(() => {
    resetNotifications(); setNotifications([]);
    const sync=()=>setNotifications(readNotifications());
    const refresh=()=>{ void refreshNotifications().then(()=>setNotificationError("")).catch(()=>setNotificationError("Notifications are temporarily unavailable.")); };
    window.addEventListener("evecture:notifications-updated",sync);
    if(user)refresh();
    const timer=window.setInterval(()=>{if(user)refresh();},10000);
    window.addEventListener("focus",refresh);
    return ()=>{window.clearInterval(timer);window.removeEventListener("focus",refresh);window.removeEventListener("evecture:notifications-updated",sync);resetNotifications();};
  },[user?.id]);
  useEffect(() => {
    function handleClickOutside(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node) && !panelRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    if (isOpen) {
      document.addEventListener("pointerdown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("pointerdown", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isOpen]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const filteredNotifications = notifications.filter((n) => (filter === "UNREAD" ? !n.read : true));

  function handleItemClick(item: WorkspaceNotification) {
    run(markNotificationRead(item.id));
    setIsOpen(false);
    if (item.link) {
      router.push(item.link);
    }
  }

  function handleDismiss(event: React.MouseEvent, id: string) {
    event.stopPropagation();
    run(dismissNotification(id));
  }

  function handleToggleRead(event: React.MouseEvent, id: string, currentRead: boolean) {
    event.stopPropagation();
    if (!currentRead) {
      run(markNotificationRead(id));
    }
  }

  return (
    <div className="notification-center-container" ref={containerRef}>
      <button
        type="button"
        ref={triggerRef}
        aria-controls={isOpen?panelId:undefined}
        aria-haspopup="dialog"
        className={`icon-button notification-button ${isOpen ? "active" : ""}`}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        title={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}` : "Notifications"}
      >
        <BellRing size={19} strokeWidth={1.8} />
        {unreadCount > 0 && (
          <span className="notification-badge" aria-label={`${unreadCount} unread`}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && portalRoot && createPortal(
        <div ref={panelRef} id={panelId} className="notification-popover" style={{left:position.left,top:position.top,maxHeight:position.maxHeight}} role="dialog" aria-label="Workspace notifications">
          {/* Header */}
          <div className="notification-popover-header">
            <div className="notification-popover-title">
              <h3>Notifications</h3>
              {unreadCount > 0 && (
                <span className="notification-pill-badge">{unreadCount} new</span>
              )}
            </div>
            <div className="notification-header-actions">
              <button type="button" className="notification-close-btn" aria-label="Close notifications" onClick={close}><X size={18}/></button>
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="notification-quiet-btn"
                  onClick={() => run(markAllNotificationsRead())}
                  title="Mark all as read"
                  aria-label="Mark all notifications as read"
                >
                  <CheckCheck size={14} />
                  <span>Mark all read</span>
                </button>
              )}
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="notification-tabs">
            <button
              type="button"
              className={`notification-tab-btn ${filter === "ALL" ? "selected" : ""}`}
              onClick={() => setFilter("ALL")}
            >
              All <span>{notifications.length}</span>
            </button>
            <button
              type="button"
              className={`notification-tab-btn ${filter === "UNREAD" ? "selected" : ""}`}
              onClick={() => setFilter("UNREAD")}
            >
              Unread <span>{unreadCount}</span>
            </button>
          </div>

          {notificationError && <p role="alert">{notificationError}</p>}
          {/* Notifications List */}
          <div className="notification-list-scroll">
            {filteredNotifications.length === 0 ? (
              <div className="notification-empty">
                <div className="notification-empty-icon">
                  <Check size={22} />
                </div>
                <strong>All caught up!</strong>
                <p>
                  {filter === "UNREAD"
                    ? "You have no unread notifications."
                    : "No notifications recorded yet."}
                </p>
              </div>
            ) : (
              <div className="notification-items-wrap">
                {filteredNotifications.map((item) => (
                  <div
                    key={item.id}
                    className={`notification-item ${!item.read ? "unread" : ""}`}
                    onClick={() => handleItemClick(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleItemClick(item);
                      }
                    }}
                  >
                    <div className={`notification-item-icon notif-${item.type.toLowerCase()}`}>
                      {getNotificationIcon(item.type)}
                    </div>
                    <div className="notification-item-content">
                      <div className="notification-item-top">
                        <span className="notification-item-title">{item.title}</span>
                        <span className="notification-item-time">
                          <Clock size={11} />
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </div>
                      <p className="notification-item-message">{item.message}</p>
                    </div>
                    <div className="notification-item-actions">
                      {!item.read && (
                        <button
                          type="button"
                          aria-label="Mark notification as read"
                          className="notification-unread-dot"
                          title="Unread"
                          onClick={(e) => handleToggleRead(e, item.id, item.read)}
                        />
                      )}
                      <button
                        type="button"
                        className="notification-dismiss-btn"
                        onClick={(e) => handleDismiss(e, item.id)}
                        title="Dismiss notification"
                        aria-label="Dismiss"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="notification-popover-footer">
              <button
                type="button"
                className="notification-footer-clear-btn"
                onClick={() => run(clearAllNotifications())}
              >
                <Trash2 size={13} /> Clear all
              </button>
              <span className="notification-footer-note">
                {unreadCount === 0 ? "All caught up" : `${unreadCount} unread items`}
              </span>
            </div>
          )}
        </div>, portalRoot
      )}
    </div>
  );
}
