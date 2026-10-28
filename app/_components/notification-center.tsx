"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
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
  readNotifications,
} from "@/lib/notifications";

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
    case "INVOICE":
      return <Receipt size={15} />;
    case "PROJECT":
      return <FolderKanban size={15} />;
    case "SYSTEM":
    default:
      return <Bell size={15} />;
  }
}

export function NotificationCenter() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "UNREAD">("ALL");
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => setNotifications(readNotifications());
    sync();

    window.addEventListener("evecture:notifications-updated", sync);
    window.addEventListener("evecture:leads-updated", sync);
    window.addEventListener("evecture:projects-updated", sync);
    window.addEventListener("evecture:invoices-updated", sync);
    window.addEventListener("storage", sync);

    return () => {
      window.removeEventListener("evecture:notifications-updated", sync);
      window.removeEventListener("evecture:leads-updated", sync);
      window.removeEventListener("evecture:projects-updated", sync);
      window.removeEventListener("evecture:invoices-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isOpen]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const filteredNotifications = notifications.filter((n) => (filter === "UNREAD" ? !n.read : true));

  function handleItemClick(item: WorkspaceNotification) {
    markNotificationRead(item.id);
    setIsOpen(false);
    if (item.link) {
      router.push(item.link);
    }
  }

  function handleDismiss(event: React.MouseEvent, id: string) {
    event.stopPropagation();
    dismissNotification(id);
  }

  function handleToggleRead(event: React.MouseEvent, id: string, currentRead: boolean) {
    event.stopPropagation();
    if (!currentRead) {
      markNotificationRead(id);
    }
  }

  return (
    <div className="notification-center-container" ref={containerRef}>
      <button
        type="button"
        className={`icon-button notification-button ${isOpen ? "active" : ""}`}
        aria-label="Notifications"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        title={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}` : "Notifications"}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="notification-badge" aria-label={`${unreadCount} unread`}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notification-popover" role="dialog" aria-label="Workspace notifications">
          {/* Header */}
          <div className="notification-popover-header">
            <div className="notification-popover-title">
              <h3>Notifications</h3>
              {unreadCount > 0 && (
                <span className="notification-pill-badge">{unreadCount} new</span>
              )}
            </div>
            <div className="notification-header-actions">
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="notification-quiet-btn"
                  onClick={() => markAllNotificationsRead()}
                  title="Mark all as read"
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
              All ({notifications.length})
            </button>
            <button
              type="button"
              className={`notification-tab-btn ${filter === "UNREAD" ? "selected" : ""}`}
              onClick={() => setFilter("UNREAD")}
            >
              Unread ({unreadCount})
            </button>
          </div>

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
                      if (e.key === "Enter" || e.key === " ") {
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
                        <span
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
                onClick={() => clearAllNotifications()}
              >
                <Trash2 size={13} /> Clear all
              </button>
              <span className="notification-footer-note">
                {unreadCount === 0 ? "All caught up" : `${unreadCount} unread items`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
