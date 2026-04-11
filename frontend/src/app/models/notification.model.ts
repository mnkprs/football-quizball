export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  icon: string;
  route: string;
  read: boolean;
  createdAt: string;
  source: 'backend' | 'frontend';
}

export interface NotificationGroup {
  label: string;
  notifications: AppNotification[];
}
