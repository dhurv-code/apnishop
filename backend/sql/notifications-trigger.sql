-- ApnaBasket in-app notifications trigger.
-- Run this AFTER the notifications table has been created by Drizzle.
-- Safe to execute again: function is replaced and the trigger is recreated.

CREATE OR REPLACE FUNCTION public.apnabasket_notify_order_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_customer_id uuid;
  v_order_number varchar(32);
  v_partner_user_id uuid;
  v_title varchar(160);
  v_body text;
  v_action_url text;
BEGIN
  SELECT o.customer_id, o.order_number
    INTO v_customer_id, v_order_number
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  IF v_customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Customer-facing order status notifications.
  v_title := NULL;
  v_body := NULL;
  v_action_url := '/orders/' || NEW.order_id::text;

  IF NEW.event_type = 'DELIVERY_REJECTED'
     OR NEW.event_type = 'DELIVERY_OTP_SEND_FAILED' THEN
    -- These events require operational attention and should not be presented
    -- as a normal status change to the customer.
    v_title := NULL;
  ELSIF NEW.event_type = 'SUBSTITUTION_REQUESTED' THEN
    v_title := 'Replacement approval needed';
    v_body := 'Your delivery partner suggested ' ||
      COALESCE(NEW.metadata ->> 'replacementName', 'an alternative product') ||
      '. Please review and approve or reject the replacement.';
    v_action_url := '/account/substitutions';
  ELSIF NEW.new_status IS NOT NULL
        AND NEW.new_status IS DISTINCT FROM NEW.previous_status THEN
    CASE NEW.new_status
      WHEN 'PLACED' THEN
        v_title := 'Order received';
        v_body := 'We received order ' || v_order_number || '.';
      WHEN 'CONFIRMED' THEN
        v_title := 'Order confirmed';
        v_body := 'Your order ' || v_order_number || ' has been confirmed.';
      WHEN 'ASSIGNED' THEN
        v_title := 'Delivery partner assigned';
        v_body := 'A delivery partner has been assigned to order ' || v_order_number || '.';
      WHEN 'ACCEPTED' THEN
        v_title := 'Delivery partner accepted';
        v_body := 'Your delivery partner has accepted order ' || v_order_number || '.';
      WHEN 'SHOPPING' THEN
        v_title := 'Shopping in progress';
        v_body := 'Your items for order ' || v_order_number || ' are being purchased.';
      WHEN 'AWAITING_APPROVAL' THEN
        v_title := 'Replacement approval needed';
        v_body := 'A product replacement needs your approval for order ' || v_order_number || '.';
        v_action_url := '/account/substitutions';
      WHEN 'READY_FOR_DELIVERY' THEN
        v_title := 'Shopping completed';
        v_body := 'Your order ' || v_order_number || ' is ready for delivery.';
      WHEN 'OUT_FOR_DELIVERY' THEN
        v_title := 'Your order is out for delivery';
        v_body := 'Your order ' || v_order_number || ' is on its way. Keep your delivery OTP private and share it only when your order arrives.';
      WHEN 'DELIVERED' THEN
        v_title := 'Order delivered';
        v_body := 'Order ' || v_order_number || ' has been marked delivered.';
      WHEN 'CANCELLED' THEN
        v_title := 'Order cancelled';
        v_body := 'Order ' || v_order_number || ' has been cancelled.';
      WHEN 'FAILED' THEN
        v_title := 'Delivery needs attention';
        v_body := 'There is a problem completing order ' || v_order_number || '. Please contact support.';
      ELSE
        v_title := NULL;
    END CASE;
  ELSIF NEW.event_type = 'ITEM_UNAVAILABLE' THEN
    v_title := 'An item is unavailable';
    v_body := 'A requested item in order ' || v_order_number || ' is unavailable. Your partner may suggest an alternative.';
  ELSIF NEW.event_type = 'DELIVERY_OTP_RESENT' THEN
    v_title := 'Delivery code sent again';
    v_body := 'A new delivery verification code has been sent for order ' || v_order_number || '. Never share it before receiving your order.';
  ELSIF NEW.event_type = 'COD_COLLECTED' THEN
    v_title := 'Cash payment recorded';
    v_body := 'Cash payment for order ' || v_order_number || ' has been recorded.';
  END IF;

  IF v_title IS NOT NULL THEN
    INSERT INTO public.notifications (
      recipient_user_id,
      related_order_id,
      type,
      title,
      body,
      action_url,
      metadata
    ) VALUES (
      v_customer_id,
      NEW.order_id,
      'ORDER_UPDATE',
      v_title,
      v_body,
      v_action_url,
      COALESCE(NEW.metadata, '{}'::jsonb)
    );
  END IF;

  -- Notify the assigned partner when the customer decides on a replacement.
  IF NEW.event_type IN ('SUBSTITUTION_APPROVED', 'SUBSTITUTION_REJECTED') THEN
    SELECT dp.user_id
      INTO v_partner_user_id
    FROM public.delivery_assignments da
    INNER JOIN public.delivery_partners dp
      ON dp.id = da.delivery_partner_id
    WHERE da.order_id = NEW.order_id
    ORDER BY da.assigned_at DESC
    LIMIT 1;

    IF v_partner_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        recipient_user_id,
        related_order_id,
        type,
        title,
        body,
        action_url,
        metadata
      ) VALUES (
        v_partner_user_id,
        NEW.order_id,
        'SUBSTITUTION_UPDATE',
        CASE WHEN NEW.event_type = 'SUBSTITUTION_APPROVED'
          THEN 'Replacement approved'
          ELSE 'Replacement rejected'
        END,
        CASE WHEN NEW.event_type = 'SUBSTITUTION_APPROVED'
          THEN 'The customer approved the replacement for order ' || v_order_number || '.'
          ELSE 'The customer rejected the replacement for order ' || v_order_number || '. The item must not be purchased.'
        END,
        '/delivery',
        COALESCE(NEW.metadata, '{}'::jsonb)
      );
    END IF;
  END IF;

  -- Notify the assigned partner when an order is assigned.
  IF NEW.new_status = 'ASSIGNED' THEN
    SELECT dp.user_id
      INTO v_partner_user_id
    FROM public.delivery_assignments da
    INNER JOIN public.delivery_partners dp
      ON dp.id = da.delivery_partner_id
    WHERE da.order_id = NEW.order_id
      AND da.status IN ('ASSIGNED', 'ACCEPTED')
    ORDER BY da.assigned_at DESC
    LIMIT 1;

    IF v_partner_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        recipient_user_id,
        related_order_id,
        type,
        title,
        body,
        action_url,
        metadata
      ) VALUES (
        v_partner_user_id,
        NEW.order_id,
        'DELIVERY_ASSIGNMENT',
        'New delivery assignment',
        'You have been assigned order ' || v_order_number || '. Review the details and accept or reject the assignment.',
        '/delivery',
        COALESCE(NEW.metadata, '{}'::jsonb)
      );
    END IF;
  END IF;

  -- Admin notifications for events needing operational follow-up.
  IF NEW.new_status = 'PLACED'
     OR NEW.event_type IN ('DELIVERY_REJECTED', 'DELIVERY_OTP_SEND_FAILED', 'COD_COLLECTED') THEN
    INSERT INTO public.notifications (
      recipient_user_id,
      related_order_id,
      type,
      title,
      body,
      action_url,
      metadata
    )
    SELECT
      u.id,
      NEW.order_id,
      'ADMIN_ALERT',
      CASE
        WHEN NEW.event_type = 'COD_COLLECTED' THEN 'COD payment collected'
        WHEN NEW.event_type = 'DELIVERY_REJECTED' THEN 'Delivery assignment rejected'
        WHEN NEW.event_type = 'DELIVERY_OTP_SEND_FAILED' THEN 'Delivery OTP failed to send'
        ELSE 'New order received'
      END,
      CASE
        WHEN NEW.event_type = 'COD_COLLECTED' THEN 'COD collection was recorded for order ' || v_order_number || '.'
        WHEN NEW.event_type = 'DELIVERY_REJECTED' THEN 'A delivery partner rejected order ' || v_order_number || '. Reassignment is required.'
        WHEN NEW.event_type = 'DELIVERY_OTP_SEND_FAILED' THEN 'OTP delivery failed for order ' || v_order_number || '. Check the SMS provider and retry dispatch.'
        ELSE 'Order ' || v_order_number || ' needs review and assignment.'
      END,
      '/admin',
      COALESCE(NEW.metadata, '{}'::jsonb)
    FROM public.users u
    WHERE u.role = 'ADMIN'
      AND u.status = 'ACTIVE';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_events_notification_trigger
  ON public.order_events;

CREATE TRIGGER order_events_notification_trigger
AFTER INSERT ON public.order_events
FOR EACH ROW
EXECUTE FUNCTION public.apnabasket_notify_order_event();
