-- Run in pgAdmin on the Render database (apnabasket_db) AFTER placing a new test order.
-- This is read-only. It verifies the ORDER_PLACED event and the corresponding admin alert.

SELECT
    o.order_number,
    oe.event_type,
    oe.new_status,
    oe.created_at AS order_event_created_at
FROM public.order_events oe
JOIN public.orders o ON o.id = oe.order_id
WHERE oe.event_type = 'ORDER_PLACED'
ORDER BY oe.created_at DESC
LIMIT 10;

SELECT
    n.created_at,
    n.type,
    n.title,
    n.body,
    o.order_number,
    u.full_name AS admin_name,
    u.phone AS admin_phone,
    u.role AS admin_role,
    u.status AS admin_status
FROM public.notifications n
JOIN public.users u ON u.id = n.recipient_user_id
LEFT JOIN public.orders o ON o.id = n.related_order_id
WHERE n.type = 'ADMIN_ALERT'
  AND u.role = 'ADMIN'
ORDER BY n.created_at DESC
LIMIT 20;
