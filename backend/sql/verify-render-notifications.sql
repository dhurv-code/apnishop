-- Run this in pgAdmin while connected to the Render database apnabasket_db.
SELECT
  current_database() AS database_name,
  inet_server_addr() AS server_ip,
  to_regclass('public.notifications') AS notifications_table,
  to_regclass('public.order_events') AS order_events_table;

SELECT
  t.tgname AS trigger_name,
  NOT t.tgisinternal AS is_user_trigger
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'order_events'
  AND t.tgname = 'order_events_notification_trigger';

SELECT
  e.id,
  e.event_type,
  e.new_status,
  e.created_at,
  COUNT(n.id) FILTER (WHERE n.type = 'ADMIN_ALERT') AS admin_alerts_created
FROM public.order_events e
LEFT JOIN public.notifications n ON n.related_order_id = e.order_id
WHERE e.event_type = 'ORDER_PLACED'
GROUP BY e.id, e.event_type, e.new_status, e.created_at
ORDER BY e.created_at DESC
LIMIT 10;

SELECT
  n.title,
  n.body,
  n.created_at,
  n.read_at,
  u.full_name AS recipient_name,
  u.phone AS recipient_phone,
  u.role AS recipient_role
FROM public.notifications n
JOIN public.users u ON u.id = n.recipient_user_id
WHERE n.type = 'ADMIN_ALERT'
ORDER BY n.created_at DESC
LIMIT 20;
