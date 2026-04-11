export class CreateNotificationDto {
  userId: string;
  type: string;
  title: string;
  body: string;
  icon?: string;
  route?: string;
  metadata?: Record<string, unknown>;
}
