-- Restore receipt and transfer invoice numbers
DROP TRIGGER IF EXISTS set_receipt_invoice_trg ON public.stock_receipts;
CREATE TRIGGER set_receipt_invoice_trg
BEFORE INSERT ON public.stock_receipts
FOR EACH ROW
EXECUTE FUNCTION public.set_receipt_invoice();

DROP TRIGGER IF EXISTS set_transfer_invoice_trg ON public.transfers;
CREATE TRIGGER set_transfer_invoice_trg
BEFORE INSERT ON public.transfers
FOR EACH ROW
EXECUTE FUNCTION public.set_transfer_invoice();

-- Restore warehouse stock updates for receiving
DROP TRIGGER IF EXISTS apply_receipt_item_trg ON public.stock_receipt_items;
CREATE TRIGGER apply_receipt_item_trg
AFTER INSERT ON public.stock_receipt_items
FOR EACH ROW
EXECUTE FUNCTION public.apply_receipt_item();

DROP TRIGGER IF EXISTS reverse_receipt_item_trg ON public.stock_receipt_items;
CREATE TRIGGER reverse_receipt_item_trg
BEFORE DELETE ON public.stock_receipt_items
FOR EACH ROW
EXECUTE FUNCTION public.reverse_receipt_item();