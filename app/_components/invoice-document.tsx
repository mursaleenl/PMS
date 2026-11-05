import type {StoredInvoice} from "@/lib/invoices";
import {formatMoney as money} from "@/lib/currency";
export type InvoiceDocumentData = Pick<StoredInvoice,"invoiceNumber"|"operatingCompany"|"billTo"|"clientName"|"clientEmail"|"issueDate"|"dueDate"|"description"|"quantity"|"unitPrice"|"subtotal"|"contractValue"|"gstEnabled"|"gstRate"|"gstAmount"|"total"|"depositAmount"|"currency"|"paymentInstructions"|"transactionReference"|"status">;
export function InvoiceDocument({invoice:activeInvoice}:{invoice:InvoiceDocumentData}) {
 const isServnInvoice=activeInvoice.operatingCompany==="Servn";
 const invoiceLegalName=isServnInvoice?"Servn Pvt Limited":"Evecture Pvt Limited";
 const invoiceAmount=activeInvoice.subtotal??activeInvoice.contractValue??0;
 const invoiceGst=activeInvoice.gstEnabled?activeInvoice.gstAmount??0:0;
 const invoiceTotal=activeInvoice.total??activeInvoice.depositAmount;
 const SAMPLE_CONTACT="billing@vrkspace.example · +91 00000 00000";
 return (<div className={`invoice-print-area invoice-reference-layout${isServnInvoice ? " invoice-company-servn" : ""}`}>
                <div className="invoice-paper-head">
                  <div>
                    <span className={`invoice-logo-crop${isServnInvoice ? " invoice-logo-servn" : ""}`}>
                      <img
                        className={`invoice-company-logo${isServnInvoice ? " invoice-company-logo-servn" : ""}`}
                        src={isServnInvoice ? "/servn-logo.png" : "/invoice-logo.png"}
                        alt={`${activeInvoice.operatingCompany} invoice logo`}
                      />
                    </span>
                  </div>
                  <div className="invoice-title">
                    <span>INVOICE</span>
                    <h2>{activeInvoice.invoiceNumber}</h2>
                  </div>
                </div>

                <div className="invoice-paper-meta">
                  <div>
                    <small>INVOICE TO</small>
                    <strong>{activeInvoice.billTo}</strong>
                    {activeInvoice.clientName && <span>{activeInvoice.clientName}</span>}
                    {activeInvoice.clientEmail && <span>{activeInvoice.clientEmail}</span>}
                  </div>
                  <div className="invoice-meta-right">
                    <small>INVOICE DATE</small>
                    <strong>{activeInvoice.issueDate}</strong>
                    <small>COMPANY</small>
                    <strong>{invoiceLegalName}</strong>
                  </div>
                </div>

                <table className="invoice-lines">
                  <thead>
                    <tr>
                      <th>DESCRIPTION</th>
                      <th>QTY</th>
                      <th>UNIT PRICE</th>
                      <th>PRICE</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{activeInvoice.description || "Project services"}</td>
                      <td>{activeInvoice.quantity ?? 1}</td>
                      <td>{money(activeInvoice.unitPrice ?? invoiceAmount, activeInvoice.currency)}</td>
                      <td>{money(activeInvoice.subtotal ?? invoiceAmount, activeInvoice.currency)}</td>
                    </tr>
                  </tbody>
                </table>

                <div className="invoice-summary-row">
                  <div className="invoice-payment-details">
                    <strong>PAYMENT DETAILS</strong>
                    <p>
                      {activeInvoice.paymentInstructions ||
                        `Sample account: ${activeInvoice.operatingCompany} Studio · Account no. 0000 0000 0000 · IFSC: SAMPLE0001`}
                    </p>
                    {activeInvoice.transactionReference && (
                      <p style={{ marginTop: 6, color: "var(--ws-muted, #16a34a)", fontWeight: 600 }}>
                        Reference: {activeInvoice.transactionReference}
                      </p>
                    )}
                  </div>
                  <div className="invoice-totals">
                    <div>
                      <span>Sub total</span>
                      <strong>{money(invoiceAmount, activeInvoice.currency)}</strong>
                    </div>
                    {activeInvoice.gstEnabled && (
                      <div>
                        <span>GST ({activeInvoice.gstRate ?? 0}%)</span>
                        <strong>{money(invoiceGst, activeInvoice.currency)}</strong>
                      </div>
                    )}
                    <div className="invoice-grand-total">
                      <span>Total</span>
                      <strong>{money(invoiceTotal, activeInvoice.currency)}</strong>
                    </div>
                  </div>
                </div>

                <div className="invoice-sample-details">
                  <div className="invoice-sample-signature">
                    <span>Hanan Lateef</span>
                    <strong>AUTHORIZED SIGNATORY</strong>
                  </div>
                  <div>
                    <strong>CONTACT US</strong>
                    <p>{SAMPLE_CONTACT}</p>
                  </div>
                </div>
              </div>);
}
