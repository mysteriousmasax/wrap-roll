import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import useNotificationStore from '../../store/useNotificationStore';
import { AlertTriangle, CheckCircle, Info, XCircle, CheckCheck } from 'lucide-react';

const iconMap = { warning: AlertTriangle, info: Info, success: CheckCircle, error: XCircle };
const colorMap = { warning: 'text-warning bg-warning/10', info: 'text-primary bg-primary/10', success: 'text-success bg-success/10', error: 'text-error bg-error/10' };

export default function NotificationsPage() {
  const { notifications, markRead, markAllRead, getUnreadCount } = useNotificationStore();
  const notificationList = Array.isArray(notifications) ? notifications : [];
  const unread = getUnreadCount();

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Notifications" subtitle={unread + ' unread notifications'} actions={
        unread > 0 ? <Button variant="secondary" size="sm" onClick={markAllRead}><CheckCheck size={14} /> Mark All Read</Button> : null
      } />

      <div className="space-y-2">
        {notificationList.map((notif) => {
          const Icon = iconMap[notif.type] || Info;
          return (
            <Card key={notif.id} className={'flex items-start gap-4 ' + (!notif.read ? 'ring-1 ring-primary/20 bg-primary/[0.02]' : '')} onClick={() => markRead(notif.id)}>
              <div className={'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ' + colorMap[notif.type]}>
                <Icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-sm">{notif.title}</p>
                  {!notif.read && <span className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <p className="text-sm text-surface-on-variant mt-0.5">{notif.message}</p>
              </div>
              <span className="text-xs text-surface-on-variant whitespace-nowrap">{notif.time}</span>
            </Card>
          );
        })}
      </div>
    </div>
  );
}