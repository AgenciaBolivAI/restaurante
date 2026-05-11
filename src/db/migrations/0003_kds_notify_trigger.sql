-- Notify on order_items changes so SSE listeners can refresh KDS in real time.

CREATE OR REPLACE FUNCTION notify_kds_change() RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id uuid;
  v_order_id uuid;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  SELECT tenant_id INTO v_tenant_id FROM orders WHERE id = v_order_id;
  IF v_tenant_id IS NOT NULL THEN
    PERFORM pg_notify(
      'kds_change',
      json_build_object('tenantId', v_tenant_id::text)::text
    );
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS order_items_kds_notify ON order_items;
--> statement-breakpoint
CREATE TRIGGER order_items_kds_notify
AFTER INSERT OR UPDATE OR DELETE
ON order_items
FOR EACH ROW
EXECUTE FUNCTION notify_kds_change();
