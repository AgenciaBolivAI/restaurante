import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

export type ReceiptItem = {
  qty: number;
  name: string;
  unitPriceMinor: number;
  modifiers?: string[];
  notes?: string | null;
};

export type ReceiptPayment = {
  method: string;
  amountMinor: number;
  tipMinor: number;
};

export type ReceiptProps = {
  tenantName: string;
  tenantAddress?: string | null;
  currency: string;
  locale: string;
  orderSequenceNo: number;
  orderType: "dine_in" | "to_go" | "delivery";
  tableNumber?: number | null;
  openedAt: Date;
  closedAt?: Date | null;
  items: ReceiptItem[];
  subtotalMinor: number;
  taxMinor: number;
  tipMinor: number;
  totalMinor: number;
  payments: ReceiptPayment[];
  footer?: string | null;
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: 28,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  center: { textAlign: "center" },
  bold: { fontFamily: "Helvetica-Bold" },
  shopName: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 2,
  },
  meta: { color: "#555", textAlign: "center", marginBottom: 12, fontSize: 9 },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    borderBottomStyle: "dashed",
    marginVertical: 8,
  },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  itemRow: { flexDirection: "row", marginBottom: 2 },
  qty: { width: 24 },
  itemName: { flex: 1 },
  itemPrice: { width: 70, textAlign: "right" },
  noteRow: { color: "#555", fontSize: 9, marginLeft: 24, fontStyle: "italic" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    fontSize: 11,
  },
  grandTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
  },
  footer: {
    marginTop: 16,
    fontSize: 9,
    textAlign: "center",
    color: "#333",
  },
});

function fmtCurrency(minor: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

function fmtDate(d: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

export function Receipt(props: ReceiptProps) {
  const {
    tenantName,
    tenantAddress,
    currency,
    locale,
    orderSequenceNo,
    orderType,
    tableNumber,
    openedAt,
    closedAt,
    items,
    subtotalMinor,
    taxMinor,
    tipMinor,
    totalMinor,
    payments,
    footer,
  } = props;

  return (
    <Document>
      <Page size={[227, 800]} style={styles.page}>
        {/* Header */}
        <Text style={styles.shopName}>{tenantName}</Text>
        {tenantAddress && <Text style={styles.meta}>{tenantAddress}</Text>}

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.bold}>#{orderSequenceNo}</Text>
          <Text>
            {orderType === "to_go"
              ? "TO-GO"
              : orderType === "delivery"
                ? "DELIVERY"
                : tableNumber !== null && tableNumber !== undefined
                  ? `Mesa ${tableNumber}`
                  : "DINE-IN"}
          </Text>
        </View>
        <View style={styles.row}>
          <Text>{fmtDate(closedAt ?? openedAt, locale)}</Text>
        </View>

        <View style={styles.divider} />

        {/* Items */}
        {items.map((it, idx) => (
          <View key={idx}>
            <View style={styles.itemRow}>
              <Text style={styles.qty}>{it.qty}×</Text>
              <Text style={styles.itemName}>{it.name}</Text>
              <Text style={styles.itemPrice}>
                {fmtCurrency(it.qty * it.unitPriceMinor, currency, locale)}
              </Text>
            </View>
            {it.modifiers?.map((m, i) => (
              <Text key={i} style={styles.noteRow}>
                + {m}
              </Text>
            ))}
            {it.notes && <Text style={styles.noteRow}>* {it.notes}</Text>}
          </View>
        ))}

        <View style={styles.divider} />

        {/* Totals */}
        <View style={styles.row}>
          <Text>Subtotal</Text>
          <Text>{fmtCurrency(subtotalMinor, currency, locale)}</Text>
        </View>
        {taxMinor > 0 && (
          <View style={styles.row}>
            <Text>Impuesto</Text>
            <Text>{fmtCurrency(taxMinor, currency, locale)}</Text>
          </View>
        )}
        {tipMinor > 0 && (
          <View style={styles.row}>
            <Text>Propina</Text>
            <Text>{fmtCurrency(tipMinor, currency, locale)}</Text>
          </View>
        )}

        <View style={styles.grandTotal}>
          <Text>TOTAL</Text>
          <Text>{fmtCurrency(totalMinor + tipMinor, currency, locale)}</Text>
        </View>

        {payments.length > 0 && (
          <>
            <View style={styles.divider} />
            {payments.map((p, idx) => (
              <View key={idx} style={styles.row}>
                <Text>{p.method.toUpperCase()}</Text>
                <Text>
                  {fmtCurrency(p.amountMinor + p.tipMinor, currency, locale)}
                </Text>
              </View>
            ))}
          </>
        )}

        {footer && <Text style={styles.footer}>{footer}</Text>}
      </Page>
    </Document>
  );
}
